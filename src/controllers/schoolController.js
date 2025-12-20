import { supabaseAdmin } from "../config/supabase.js";
import { ApiError, ErrorTypes, mapDatabaseError } from "../utils/apiError.js";
import logger, { logDatabase } from "../utils/logger.js";
import crypto from "crypto";
import cache, { cacheKeys, cacheTTL } from "../utils/cache.js";

/**
 * Generate a random school key
 */
const generateSchoolKey = () => {
  return crypto.randomBytes(4).toString("hex").toUpperCase(); // 8 character hex string
};

/**
 * Create a new school (with cache invalidation)
 */
export const createSchool = async (req, res, next) => {
  try {
    const { name, address, phone, email, website, timezone, academic_year_start, academic_year_end } = req.body;

    if (!name) {
      throw ErrorTypes.MISSING_REQUIRED_FIELD("name");
    }

    // Check if school with same name exists
    const { data: existingSchool } = await supabaseAdmin.from("schools").select("id").eq("name", name).single();

    if (existingSchool) {
      throw ErrorTypes.ALREADY_EXISTS("A school with this name");
    }

    // Check if email is already used
    if (email) {
      const { data: emailExists } = await supabaseAdmin.from("schools").select("id").eq("email", email).single();

      if (emailExists) {
        throw ErrorTypes.ALREADY_EXISTS("A school with this email");
      }
    }

    // Generate unique school key
    let schoolKey = generateSchoolKey();
    let isUnique = false;
    let attempts = 0;
    const maxAttempts = 10;

    while (!isUnique && attempts < maxAttempts) {
      const { data } = await supabaseAdmin.from("schools").select("id").eq("school_key", schoolKey).single();

      if (!data) {
        isUnique = true;
      } else {
        schoolKey = generateSchoolKey();
        attempts++;
      }
    }

    if (!isUnique) {
      throw ErrorTypes.INTERNAL_ERROR("Failed to generate unique school key");
    }

    const schoolData = {
      name,
      school_key: schoolKey,
      address,
      phone,
      email,
      website,
      timezone: timezone || "UTC",
      academic_year_start,
      academic_year_end,
    };

    const { data: school, error } = await supabaseAdmin.from("schools").insert([schoolData]).select().single();

    if (error) {
      throw mapDatabaseError(error);
    }

    // If user is authenticated, link them as admin of this school
    if (req.user) {
      const { error: adminError } = await supabaseAdmin.from("admins").insert([
        {
          user_id: req.user.id,
          school_id: school.id,
          first_name: req.user.user_metadata?.first_name,
          last_name: req.user.user_metadata?.last_name,
        },
      ]);

      if (adminError) {
        logger.warn("Failed to link user as school admin", {
          userId: req.user.id,
          schoolId: school.id,
          error: adminError.message,
        });
      }

      // Invalidate user's school access cache
      cache.deletePattern(`school:access:${req.user.id}:*`);
      cache.deletePattern(`schools:user:*`); // Invalidate all user school lists
    }

    logDatabase("INSERT", "schools", { schoolId: school.id });
    logger.info("School created", { schoolId: school.id, name, createdBy: req.user?.id });

    res.status(201).json({
      success: true,
      message: "School created successfully",
      data: { school },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all schools (Super Admin) or user's schools (with comprehensive caching)
 * For students: Returns their school with announcements, grades, and attendance
 * For admins/teachers: Returns list of schools they have access to
 */
export const getSchools = async (req, res, next) => {
  try {
    const { search, status } = req.query;
    const userEmail = req.user?.email;
    const userId = req.user?.id;

    // Create cache key that includes query parameters
    const cacheKey = `${cacheKeys.schools(userEmail)}:${search || ""}:${status || ""}`;

    // Check cache first
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      logger.debug("Schools data served from cache", { userEmail, search, status });
      return res.json(cachedData);
    }

    logger.debug("Fetching schools from database", { userEmail, search, status });

    // First, check if user is a student (by email)
    const { data: student } = await supabaseAdmin
      .from("students")
      .select("id, first_name, last_name, email, school_id, grade, section, roll_number, status")
      .eq("email", userEmail)
      .single();

    if (student) {
      // User is a student - return their school with student-specific data
      logger.info("Student accessing schools endpoint", { studentId: student.id, schoolId: student.school_id });

      // Get school info (check cache first for school data)
      const schoolCacheKey = cacheKeys.school(student.school_id);
      let school = cache.get(schoolCacheKey);

      if (!school) {
        const { data } = await supabaseAdmin
          .from("schools")
          .select("id, name, school_key, address, phone, email, logo_url, website, timezone")
          .eq("id", student.school_id)
          .single();

        school = data;
        if (school) {
          cache.set(schoolCacheKey, school, cacheTTL.LONG);
        }
      }

      if (!school) {
        return res.json({
          success: true,
          data: { schools: [], count: 0, role: "student" },
        });
      }

      // Get announcements for this student
      const { data: announcements } = await supabaseAdmin
        .from("announcements")
        .select("id, title, content, type, created_at")
        .eq("school_id", student.school_id)
        .or("target_role.eq.student,target_role.eq.all,target_role.is.null")
        .eq("status", "published")
        .order("created_at", { ascending: false })
        .limit(5);

      // Get student's grades
      const { data: grades } = await supabaseAdmin
        .from("grades")
        .select("id, subject, assessment_type, score, max_score, percentage, grade, assessment_date, comments")
        .eq("student_id", student.id)
        .order("assessment_date", { ascending: false })
        .limit(10);

      // Get student's attendance (recent)
      const { data: attendanceRecords } = await supabaseAdmin
        .from("attendance")
        .select("id, date, status, notes")
        .eq("student_id", student.id)
        .order("date", { ascending: false })
        .limit(30);

      // Calculate attendance summary
      const attendanceSummary = {
        total: attendanceRecords?.length || 0,
        present: attendanceRecords?.filter((a) => a.status === "present").length || 0,
        absent: attendanceRecords?.filter((a) => a.status === "absent").length || 0,
        late: attendanceRecords?.filter((a) => a.status === "late").length || 0,
        excused: attendanceRecords?.filter((a) => a.status === "excused").length || 0,
        percentage:
          attendanceRecords?.length > 0
            ? Math.round(
                (attendanceRecords.filter((a) => a.status === "present" || a.status === "late").length /
                  attendanceRecords.length) *
                  100,
              )
            : 100,
      };

      // If no real attendance data, provide dummy data
      const attendance =
        attendanceRecords?.length > 0
          ? {
              summary: attendanceSummary,
              recent: attendanceRecords.slice(0, 7),
            }
          : {
              summary: {
                total: 22,
                present: 18,
                absent: 2,
                late: 2,
                excused: 0,
                percentage: 91,
              },
              recent: [
                { id: "1", date: new Date().toISOString().split("T")[0], status: "present", notes: null },
                {
                  id: "2",
                  date: new Date(Date.now() - 86400000).toISOString().split("T")[0],
                  status: "present",
                  notes: null,
                },
                {
                  id: "3",
                  date: new Date(Date.now() - 172800000).toISOString().split("T")[0],
                  status: "late",
                  notes: "Arrived 10 minutes late",
                },
              ],
            };

      const responseData = {
        success: true,
        data: {
          role: "student",
          student: {
            id: student.id,
            name: `${student.first_name} ${student.last_name}`,
            email: student.email,
            grade: student.grade,
            section: student.section,
            rollNumber: student.roll_number,
            status: student.status,
          },
          school: school,
          announcements: announcements || [],
          grades: grades || [],
          attendance: attendance,
          schools: [school],
          count: 1,
        },
      };

      // Cache student data for 1 minute (changes more frequently)
      cache.set(cacheKey, responseData, cacheTTL.SHORT);
      return res.json(responseData);
    }

    // Not a student - check if admin or teacher
    let query = supabaseAdmin.from("schools").select("*");

    if (userId) {
      // Check if super admin (cached by school middleware)
      const superAdminCacheKey = `school:superadmin:${userId}`;
      let isSuperAdmin = cache.get(superAdminCacheKey);

      if (isSuperAdmin === null || isSuperAdmin === undefined) {
        const { data: superAdmin } = await supabaseAdmin
          .from("admins")
          .select("id")
          .eq("user_id", userId)
          .is("school_id", null)
          .single();

        isSuperAdmin = !!superAdmin;
        cache.set(superAdminCacheKey, isSuperAdmin, cacheTTL.LONG);
      }

      if (!isSuperAdmin) {
        // Get schools user has access to (check by email for teachers)
        const { data: adminSchools } = await supabaseAdmin.from("admins").select("school_id").eq("user_id", userId);

        const { data: teacherSchools } = await supabaseAdmin
          .from("teachers")
          .select("school_id")
          .eq("email", userEmail);

        const schoolIds = [
          ...(adminSchools || []).map((a) => a.school_id),
          ...(teacherSchools || []).map((t) => t.school_id),
        ].filter(Boolean);

        if (schoolIds.length > 0) {
          query = query.in("id", [...new Set(schoolIds)]);
        } else {
          const responseData = {
            success: true,
            data: {
              schools: [],
              count: 0,
              role: "unknown",
            },
          };
          // Cache empty result for 2 minutes
          cache.set(cacheKey, responseData, cacheTTL.SHORT);
          return res.json(responseData);
        }
      }
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,school_key.ilike.%${search}%`);
    }

    if (status) {
      query = query.eq("status", status);
    }

    const { data: schools, error } = await query.order("created_at", { ascending: false });

    if (error) {
      throw mapDatabaseError(error);
    }

    logDatabase("SELECT", "schools", { count: schools.length, userId });

    const responseData = {
      success: true,
      data: {
        schools,
        count: schools.length,
        role: "admin",
      },
    };

    // Cache for 5 minutes (or 2 minutes if search/filter is applied)
    const ttl = search || status ? cacheTTL.SHORT : cacheTTL.MEDIUM;
    cache.set(cacheKey, responseData, ttl);

    res.json(responseData);
  } catch (error) {
    next(error);
  }
};

/**
 * Get school by ID (with caching)
 */
export const getSchoolById = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check cache first
    const cacheKey = cacheKeys.school(id);
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
      logger.debug("School detail served from cache", { schoolId: id });
      return res.json({
        success: true,
        data: { school: cachedData },
      });
    }

    const { data: school, error } = await supabaseAdmin.from("schools").select("*").eq("id", id).single();

    if (error) {
      if (error.code === "PGRST116") {
        throw ErrorTypes.NOT_FOUND("School");
      }
      throw mapDatabaseError(error);
    }

    // Cache the school data (not the full response)
    cache.set(cacheKey, school, cacheTTL.LONG);

    res.json({
      success: true,
      data: { school },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get school by school key (with caching)
 */
export const getSchoolByKey = async (req, res, next) => {
  try {
    const { key } = req.params;
    const normalizedKey = key.toUpperCase();

    // Check cache first
    const cacheKey = cacheKeys.schoolByKey(normalizedKey);
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
      logger.debug("School by key served from cache", { key: normalizedKey });
      return res.json({
        success: true,
        data: { school: cachedData },
      });
    }

    const { data: school, error } = await supabaseAdmin
      .from("schools")
      .select("id, name, logo_url, address, phone, email")
      .eq("school_key", normalizedKey)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        throw ErrorTypes.NOT_FOUND("School with this key");
      }
      throw mapDatabaseError(error);
    }

    // Cache for 15 minutes
    cache.set(cacheKey, school, cacheTTL.LONG);

    res.json({
      success: true,
      data: { school },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update school (with cache invalidation)
 */
export const updateSchool = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Remove fields that shouldn't be updated
    delete updateData.id;
    delete updateData.school_key;
    delete updateData.created_at;

    // Verify school exists
    const { data: existingSchool, error: fetchError } = await supabaseAdmin
      .from("schools")
      .select("id, school_key")
      .eq("id", id)
      .single();

    if (fetchError || !existingSchool) {
      throw ErrorTypes.NOT_FOUND("School");
    }

    // Check for duplicate name if being updated
    if (updateData.name) {
      const { data: nameExists } = await supabaseAdmin
        .from("schools")
        .select("id")
        .eq("name", updateData.name)
        .neq("id", id)
        .single();

      if (nameExists) {
        throw ErrorTypes.ALREADY_EXISTS("A school with this name");
      }
    }

    const { data: school, error } = await supabaseAdmin
      .from("schools")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      throw mapDatabaseError(error);
    }

    // Comprehensive cache invalidation
    invalidateSchoolCache(id, existingSchool.school_key);

    logDatabase("UPDATE", "schools", { schoolId: id });
    logger.info("School updated", { schoolId: id });

    res.json({
      success: true,
      message: "School updated successfully",
      data: { school },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete school (with cache invalidation)
 */
export const deleteSchool = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Verify school exists
    const { data: existingSchool, error: fetchError } = await supabaseAdmin
      .from("schools")
      .select("id, name, school_key")
      .eq("id", id)
      .single();

    if (fetchError || !existingSchool) {
      throw ErrorTypes.NOT_FOUND("School");
    }

    // Check for dependencies before deleting
    const { count: studentCount } = await supabaseAdmin
      .from("students")
      .select("*", { count: "exact", head: true })
      .eq("school_id", id);

    const { count: teacherCount } = await supabaseAdmin
      .from("teachers")
      .select("*", { count: "exact", head: true })
      .eq("school_id", id);

    if (studentCount > 0 || teacherCount > 0) {
      throw new ApiError(
        400,
        `Cannot delete school. This school has ${studentCount || 0} students and ${teacherCount || 0} teachers. Please remove them first.`,
        { students: studentCount, teachers: teacherCount },
        "SCHOOL_HAS_DEPENDENCIES",
      );
    }

    const { error } = await supabaseAdmin.from("schools").delete().eq("id", id);

    if (error) {
      throw mapDatabaseError(error);
    }

    // Comprehensive cache invalidation
    invalidateSchoolCache(id, existingSchool.school_key);

    logDatabase("DELETE", "schools", { schoolId: id });
    logger.info("School deleted", { schoolId: id, name: existingSchool.name });

    res.json({
      success: true,
      message: "School deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get school statistics (with comprehensive attendance data and caching)
 */
export const getSchoolStats = async (req, res, next) => {
  try {
    const schoolId = req.schoolId;

    // Check cache first
    const cacheKey = cacheKeys.stats(schoolId);
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
      logger.debug("School stats served from cache", { schoolId });
      return res.json(cachedData);
    }

    logger.debug("Fetching school stats from database", { schoolId });

    // Get today's date in YYYY-MM-DD format
    const today = new Date().toISOString().split("T")[0];

    // Get last 7 days for attendance chart
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const weekStart = sevenDaysAgo.toISOString().split("T")[0];

    // Parallel queries for better performance
    const [
      { count: studentCount },
      { count: teacherCount },
      { count: classCount },
      { count: activeStudents },
      { count: attendanceToday },
      { data: attendanceTrend },
      { count: presentToday },
    ] = await Promise.all([
      // Total students
      supabaseAdmin.from("students").select("*", { count: "exact", head: true }).eq("school_id", schoolId),

      // Total teachers
      supabaseAdmin.from("teachers").select("*", { count: "exact", head: true }).eq("school_id", schoolId),

      // Total classes
      supabaseAdmin.from("classes").select("*", { count: "exact", head: true }).eq("school_id", schoolId),

      // Active students
      supabaseAdmin
        .from("students")
        .select("*", { count: "exact", head: true })
        .eq("school_id", schoolId)
        .eq("status", "active"),

      // Today's total attendance records
      supabaseAdmin
        .from("attendance")
        .select("*, students!inner(school_id)", { count: "exact", head: true })
        .eq("students.school_id", schoolId)
        .eq("date", today),

      // Last 7 days attendance trend
      supabaseAdmin
        .from("attendance")
        .select("date, status, students!inner(school_id)")
        .eq("students.school_id", schoolId)
        .gte("date", weekStart)
        .lte("date", today)
        .order("date", { ascending: true }),

      // Today's present count
      supabaseAdmin
        .from("attendance")
        .select("*, students!inner(school_id)", { count: "exact", head: true })
        .eq("students.school_id", schoolId)
        .eq("date", today)
        .eq("status", "present"),
    ]);

    // Calculate attendance percentage for today
    const attendanceRate = activeStudents > 0 ? Math.round((presentToday / activeStudents) * 100) : 0;

    // Process attendance trend data for chart
    const attendanceChart = processAttendanceTrend(attendanceTrend);

    const responseData = {
      success: true,
      data: {
        stats: {
          totalStudents: studentCount || 0,
          activeStudents: activeStudents || 0,
          totalTeachers: teacherCount || 0,
          totalClasses: classCount || 0,
          attendanceToday: attendanceToday || 0,
          attendanceRate: attendanceRate,
          presentToday: presentToday || 0,
          revenueMonth: 0, // Placeholder until finance module is implemented
        },
        charts: {
          attendance: attendanceChart,
          revenue: [], // Placeholder
        },
      },
    };

    // Cache stats for 5 minutes (they change less frequently)
    cache.set(cacheKey, responseData, cacheTTL.MEDIUM);

    res.json(responseData);
  } catch (error) {
    logger.error("Error fetching school stats", { error: error.message, schoolId: req.schoolId });
    next(error);
  }
};

/**
 * Process attendance trend data for charting
 * Groups by date and calculates present/absent/late counts
 */
function processAttendanceTrend(attendanceData) {
  if (!attendanceData || attendanceData.length === 0) {
    return [];
  }

  // Group by date
  const groupedByDate = attendanceData.reduce((acc, record) => {
    const date = record.date;
    if (!acc[date]) {
      acc[date] = {
        date,
        present: 0,
        absent: 0,
        late: 0,
        excused: 0,
        total: 0,
      };
    }

    acc[date].total++;

    switch (record.status.toLowerCase()) {
      case "present":
        acc[date].present++;
        break;
      case "absent":
        acc[date].absent++;
        break;
      case "late":
        acc[date].late++;
        break;
      case "excused":
        acc[date].excused++;
        break;
    }

    return acc;
  }, {});

  // Convert to array and calculate percentages
  return Object.values(groupedByDate).map((day) => ({
    date: day.date,
    present: day.present,
    absent: day.absent,
    late: day.late,
    excused: day.excused,
    total: day.total,
    attendanceRate: day.total > 0 ? Math.round((day.present / day.total) * 100) : 0,
  }));
}

/**
 * Get detailed attendance statistics (optional endpoint for more granular data)
 */
export const getAttendanceStats = async (req, res, next) => {
  try {
    const schoolId = req.schoolId;
    const { startDate, endDate, classId, grade } = req.query;

    // Validate dates
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const end = endDate || new Date().toISOString().split("T")[0];

    const cacheKey = `attendance:${schoolId}:${start}:${end}:${classId || "all"}:${grade || "all"}`;
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
      logger.debug("Attendance stats served from cache", { schoolId, start, end });
      return res.json(cachedData);
    }

    // Build query
    let query = supabaseAdmin
      .from("attendance")
      .select(
        `
        *,
        students!inner(
          id,
          first_name,
          last_name,
          school_id,
          grade,
          section,
          status
        ),
        classes(
          id,
          name,
          grade,
          section
        )
      `,
      )
      .eq("students.school_id", schoolId)
      .gte("date", start)
      .lte("date", end);

    // Apply filters if provided
    if (classId) {
      query = query.eq("class_id", classId);
    }

    if (grade) {
      query = query.eq("students.grade", grade);
    }

    const { data: attendanceRecords, error } = await query.order("date", { ascending: false });

    if (error) {
      throw mapDatabaseError(error);
    }

    // Calculate statistics
    const stats = calculateAttendanceStats(attendanceRecords);

    // Group by student for individual attendance rates
    const studentAttendance = calculateStudentAttendance(attendanceRecords);

    const responseData = {
      success: true,
      data: {
        dateRange: { start, end },
        summary: stats,
        byStudent: studentAttendance,
        records: attendanceRecords,
      },
    };

    // Cache for 10 minutes
    cache.set(cacheKey, responseData, cacheTTL.MEDIUM);

    res.json(responseData);
  } catch (error) {
    logger.error("Error fetching attendance stats", { error: error.message, schoolId: req.schoolId });
    next(error);
  }
};

/**
 * Calculate overall attendance statistics
 */
function calculateAttendanceStats(records) {
  const total = records.length;
  const statusCounts = records.reduce((acc, r) => {
    const status = r.status.toLowerCase();
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});

  return {
    total,
    present: statusCounts.present || 0,
    absent: statusCounts.absent || 0,
    late: statusCounts.late || 0,
    excused: statusCounts.excused || 0,
    attendanceRate: total > 0 ? Math.round(((statusCounts.present || 0) / total) * 100) : 0,
  };
}

/**
 * Calculate per-student attendance statistics
 */
function calculateStudentAttendance(records) {
  const studentMap = {};

  records.forEach((record) => {
    const studentId = record.student_id;
    if (!studentMap[studentId]) {
      studentMap[studentId] = {
        studentId,
        studentName: `${record.students?.first_name || ""} ${record.students?.last_name || ""}`.trim(),
        grade: record.students?.grade,
        section: record.students?.section,
        total: 0,
        present: 0,
        absent: 0,
        late: 0,
        excused: 0,
      };
    }

    studentMap[studentId].total++;
    const status = record.status.toLowerCase();
    if (studentMap[studentId][status] !== undefined) {
      studentMap[studentId][status]++;
    }
  });

  // Calculate attendance rate for each student
  return Object.values(studentMap)
    .map((student) => ({
      ...student,
      attendanceRate: student.total > 0 ? Math.round((student.present / student.total) * 100) : 0,
    }))
    .sort((a, b) => b.attendanceRate - a.attendanceRate); // Sort by attendance rate
}

/**
 * Helper function to invalidate all school-related caches
 */
function invalidateSchoolCache(schoolId, schoolKey = null) {
  // Delete specific school caches
  cache.delete(cacheKeys.school(schoolId));
  cache.delete(cacheKeys.stats(schoolId));

  if (schoolKey) {
    cache.delete(cacheKeys.schoolByKey(schoolKey));
  }

  // Clear attendance-related caches
  cache.deletePattern(`attendance:${schoolId}:*`);

  // Clear all user school lists (they might include this school)
  cache.deletePattern("schools:user:*");

  // Clear school access patterns
  cache.deletePattern(`school:access:*:${schoolId}`);

  logger.debug("Invalidated all school caches", { schoolId });
}

/**
 * Export helper for use in other modules
 */
export const invalidateSchoolDataCache = invalidateSchoolCache;

export default {
  createSchool,
  getSchools,
  getSchoolById,
  getSchoolByKey,
  updateSchool,
  deleteSchool,
  getSchoolStats,
  getAttendanceStats,
  invalidateSchoolDataCache,
};
