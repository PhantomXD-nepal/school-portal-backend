import { supabaseAdmin } from "../config/supabase.js";
import { ApiError, ErrorTypes, mapDatabaseError } from "../utils/apiError.js";
import logger, { logDatabase } from "../utils/logger.js";
import cache, { cacheTTL } from "../utils/cache.js";

// Enhanced cache key generators for classes
const classCacheKeys = {
  classes: (schoolId, grade = "", section = "") => `classes:school:${schoolId}:${grade}:${section}`,
  class: (id) => `class:detail:${id}`,
  classStudents: (id) => `class:students:${id}`,
  teacherClasses: (teacherId) => `classes:teacher:${teacherId}`,
  syllabus: (classId) => `syllabus:class:${classId}`,
  attendance: (classId, date) => `attendance:class:${classId}:${date}`,
  teacherAccess: (userId, classId) => `class:access:${userId}:${classId}`,
};

/**
 * Get all classes for a school (with comprehensive caching)
 * Teachers only see classes assigned to them
 */
export const getClasses = async (req, res, next) => {
  try {
    const { grade, section } = req.query;
    const schoolId = req.schoolId;
    const userRole = req.userRole || req.user?.role?.toLowerCase();
    const userId = req.user?.id;

    // Create cache key including filters
    const cacheKey = classCacheKeys.classes(schoolId, grade || "", section || "");
    let classes = cache.get(cacheKey);

    if (!classes) {
      logger.debug("Fetching classes from database", { schoolId, grade, section });

      let query = supabaseAdmin
        .from("classes")
        .select(
          `
          *,
          class_teachers(
            teacher:teachers(id, first_name, last_name)
          )
        `,
        )
        .eq("school_id", schoolId);

      if (grade) query = query.eq("grade", grade);
      if (section) query = query.eq("section", section);

      const { data, error } = await query.order("grade", { ascending: true });

      if (error) {
        throw mapDatabaseError(error);
      }

      classes = data;

      // Cache for 5 minutes
      cache.set(cacheKey, classes, cacheTTL.MEDIUM);
      logDatabase("SELECT", "classes", { schoolId, count: classes.length });
    }

    // Filter for teachers - only show their assigned classes
    if (userRole === "teacher") {
      // Try to get teacher ID from cache
      const teacherCacheKey = `teacher:user:${userId}`;
      let teacher = cache.get(teacherCacheKey);

      if (!teacher) {
        const { data } = await supabaseAdmin
          .from("teachers")
          .select("id")
          .eq("user_id", userId)
          .eq("school_id", schoolId)
          .single();

        teacher = data;
        if (teacher) {
          cache.set(teacherCacheKey, teacher, cacheTTL.MEDIUM);
        }
      }

      if (teacher) {
        classes = classes.filter((cls) => cls.class_teachers?.some((ct) => ct.teacher?.id === teacher.id));
      } else {
        classes = [];
      }
    }

    // Transform to include teacher info and student count
    const transformedClasses = await Promise.all(
      classes.map(async (cls) => {
        // Try to get student count from cache
        const studentCountKey = `class:studentcount:${cls.id}`;
        let studentCount = cache.get(studentCountKey);

        if (studentCount === null || studentCount === undefined) {
          const { count } = await supabaseAdmin
            .from("class_enrollments")
            .select("*", { count: "exact", head: true })
            .eq("class_id", cls.id)
            .eq("status", "active");

          studentCount = count || 0;
          // Cache student count for 5 minutes
          cache.set(studentCountKey, studentCount, cacheTTL.MEDIUM);
        }

        const primaryTeacher = cls.class_teachers?.find((ct) => ct.teacher)?.teacher;

        return {
          id: cls.id,
          name: cls.name,
          grade: cls.grade,
          section: cls.section,
          subject: cls.name,
          schedule: cls.room_number ? `Room ${cls.room_number}` : null,
          teacherId: primaryTeacher?.id,
          teacherName: primaryTeacher ? `${primaryTeacher.first_name} ${primaryTeacher.last_name}` : null,
          studentCount: studentCount,
          syllabusProgress: 0, // Will be calculated from syllabus if needed
          status: cls.status,
        };
      }),
    );

    res.json({
      success: true,
      data: {
        classes: transformedClasses,
        count: transformedClasses.length,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get class by ID with enrolled students (with caching)
 */
export const getClassById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const schoolId = req.schoolId;

    // Try cache first
    const cacheKey = classCacheKeys.class(id);
    let classData = cache.get(cacheKey);

    if (!classData) {
      logger.debug("Fetching class detail from database", { classId: id });

      const { data, error } = await supabaseAdmin
        .from("classes")
        .select(
          `
          *,
          enrollments:class_enrollments(
            student:students(*)
          ),
          class_teachers(
            teacher:teachers(id, first_name, last_name, email)
          )
        `,
        )
        .eq("id", id)
        .eq("school_id", schoolId)
        .single();

      if (error || !data) {
        throw ErrorTypes.NOT_FOUND("Class");
      }

      classData = data;
      cache.set(cacheKey, classData, cacheTTL.MEDIUM);
      logDatabase("SELECT", "classes", { id });
    }

    res.json({
      success: true,
      data: { class: classData },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create new class (Admin only) - with cache invalidation
 */
export const createClass = async (req, res, next) => {
  try {
    const schoolId = req.schoolId;
    const { name, grade, section, capacity, room_number, academic_year, status, teacher_id } = req.body;

    const classData = {
      school_id: schoolId,
      name,
      grade,
      section,
      capacity,
      room_number,
      academic_year,
      status: status || "active",
    };

    const { data: newClass, error } = await supabaseAdmin.from("classes").insert([classData]).select().single();

    if (error) {
      throw mapDatabaseError(error);
    }

    // Assign teacher if provided
    if (teacher_id) {
      await supabaseAdmin.from("class_teachers").insert([
        {
          class_id: newClass.id,
          teacher_id,
          is_primary: true,
        },
      ]);

      // Invalidate teacher classes cache
      cache.delete(classCacheKeys.teacherClasses(teacher_id));
      cache.deletePattern(`teacher:user:*`);
    }

    // Invalidate classes caches
    invalidateClassesCache(schoolId);

    logDatabase("INSERT", "classes", { schoolId, classId: newClass.id });
    logger.info("Class created", { classId: newClass.id, schoolId, grade });

    res.status(201).json({
      success: true,
      message: "Class created successfully",
      data: { class: newClass },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update class (Admin only) - with cache invalidation
 */
export const updateClass = async (req, res, next) => {
  try {
    const { id } = req.params;
    const schoolId = req.schoolId;
    const updateData = req.body;

    // Remove fields that shouldn't be updated
    delete updateData.id;
    delete updateData.school_id;
    delete updateData.created_at;

    const { data: updatedClass, error } = await supabaseAdmin
      .from("classes")
      .update(updateData)
      .eq("id", id)
      .eq("school_id", schoolId)
      .select()
      .single();

    if (error) {
      throw mapDatabaseError(error);
    }

    // Invalidate caches
    invalidateClassCache(id, schoolId);

    logDatabase("UPDATE", "classes", { id });

    res.json({
      success: true,
      message: "Class updated successfully",
      data: { class: updatedClass },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Assign teacher to class (Admin only) - with cache invalidation
 */
export const assignTeacher = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { teacher_id, is_primary = true } = req.body;
    const schoolId = req.schoolId;

    // Verify class exists
    const { data: classExists, error: classError } = await supabaseAdmin
      .from("classes")
      .select("id")
      .eq("id", id)
      .eq("school_id", schoolId)
      .single();

    if (classError || !classExists) {
      throw ErrorTypes.NOT_FOUND("Class");
    }

    // Remove existing primary teacher if setting new primary
    if (is_primary) {
      await supabaseAdmin
        .from("class_teachers")
        .update({ is_primary: false })
        .eq("class_id", id)
        .eq("is_primary", true);
    }

    // Upsert teacher assignment
    const { data, error } = await supabaseAdmin
      .from("class_teachers")
      .upsert(
        {
          class_id: id,
          teacher_id,
          is_primary,
        },
        { onConflict: "class_id,teacher_id" },
      )
      .select()
      .single();

    if (error) {
      throw mapDatabaseError(error);
    }

    // Comprehensive cache invalidation
    invalidateClassCache(id, schoolId);
    cache.delete(classCacheKeys.teacherClasses(teacher_id));
    cache.deletePattern(`class:access:*:${id}`);

    res.json({
      success: true,
      message: "Teacher assigned successfully",
      data: { assignment: data },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Enroll student in class (Admin only) - with cache invalidation
 */
export const enrollStudent = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { student_id } = req.body;
    const schoolId = req.schoolId;

    const { data: enrollment, error } = await supabaseAdmin
      .from("class_enrollments")
      .insert([
        {
          class_id: id,
          student_id,
        },
      ])
      .select()
      .single();

    if (error) {
      throw mapDatabaseError(error);
    }

    // Invalidate caches
    invalidateClassCache(id, schoolId);
    cache.delete(classCacheKeys.classStudents(id));
    cache.delete(`class:studentcount:${id}`);

    res.status(201).json({
      success: true,
      message: "Student enrolled successfully",
      data: { enrollment },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Bulk enroll students in class (Admin only) - with cache invalidation
 */
export const bulkEnrollStudents = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { student_ids } = req.body;
    const schoolId = req.schoolId;

    if (!Array.isArray(student_ids) || student_ids.length === 0) {
      throw new ApiError(400, "Please provide an array of student IDs", null, "INVALID_INPUT");
    }

    const enrollments = student_ids.map((student_id) => ({
      class_id: id,
      student_id,
    }));

    const { data, error } = await supabaseAdmin
      .from("class_enrollments")
      .upsert(enrollments, { onConflict: "class_id,student_id", ignoreDuplicates: true })
      .select();

    if (error) {
      throw mapDatabaseError(error);
    }

    // Invalidate caches
    invalidateClassCache(id, schoolId);
    cache.delete(classCacheKeys.classStudents(id));
    cache.delete(`class:studentcount:${id}`);

    res.status(201).json({
      success: true,
      message: `${data.length} students enrolled successfully`,
      data: { enrollments: data },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Remove student from class - with cache invalidation
 */
export const removeStudent = async (req, res, next) => {
  try {
    const { id, studentId } = req.params;
    const schoolId = req.schoolId;

    const { error } = await supabaseAdmin
      .from("class_enrollments")
      .delete()
      .eq("class_id", id)
      .eq("student_id", studentId);

    if (error) {
      throw mapDatabaseError(error);
    }

    // Invalidate caches
    invalidateClassCache(id, schoolId);
    cache.delete(classCacheKeys.classStudents(id));
    cache.delete(`class:studentcount:${id}`);

    res.json({
      success: true,
      message: "Student removed from class successfully",
    });
  } catch (error) {
    next(error);
  }
};

// =====================
// SYLLABUS MANAGEMENT
// =====================

/**
 * Get syllabus for a class (with caching)
 */
export const getSyllabus = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Try cache first
    const cacheKey = classCacheKeys.syllabus(id);
    let syllabus = cache.get(cacheKey);

    if (!syllabus) {
      logger.debug("Fetching syllabus from database", { classId: id });

      const { data, error } = await supabaseAdmin
        .from("syllabus")
        .select(
          `
          *,
          completed_by_teacher:teachers(id, first_name, last_name)
        `,
        )
        .eq("class_id", id)
        .order("chapter_order", { ascending: true });

      if (error) {
        throw mapDatabaseError(error);
      }

      syllabus = data;
      cache.set(cacheKey, syllabus, cacheTTL.MEDIUM);
      logDatabase("SELECT", "syllabus", { classId: id, count: syllabus.length });
    }

    // Calculate progress
    const total = syllabus.length;
    const completed = syllabus.filter((s) => s.is_completed).length;
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

    res.json({
      success: true,
      data: {
        syllabus,
        progress,
        total,
        completed,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create syllabus item/chapter (Teacher only) - with cache invalidation
 */
export const createSyllabusItem = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, description, chapter_order } = req.body;
    const userId = req.user?.id;
    const schoolId = req.schoolId;

    // Verify teacher has access to this class
    const hasAccess = await verifyTeacherClassAccessCached(userId, id, schoolId);
    if (!hasAccess) {
      throw ErrorTypes.FORBIDDEN("You are not assigned to this class");
    }

    // Get next order if not provided
    let order = chapter_order;
    if (order === undefined) {
      const { data: lastItem } = await supabaseAdmin
        .from("syllabus")
        .select("chapter_order")
        .eq("class_id", id)
        .order("chapter_order", { ascending: false })
        .limit(1)
        .single();

      order = (lastItem?.chapter_order || 0) + 1;
    }

    const { data, error } = await supabaseAdmin
      .from("syllabus")
      .insert([
        {
          class_id: id,
          title,
          description,
          chapter_order: order,
        },
      ])
      .select()
      .single();

    if (error) {
      throw mapDatabaseError(error);
    }

    // Invalidate cache
    cache.delete(classCacheKeys.syllabus(id));

    logger.info("Syllabus item created", { classId: id, syllabusId: data.id });

    res.status(201).json({
      success: true,
      message: "Chapter added successfully",
      data: { chapter: data },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update syllabus item (Teacher only) - with cache invalidation
 */
export const updateSyllabusItem = async (req, res, next) => {
  try {
    const { id, chapterId } = req.params;
    const { title, description, chapter_order } = req.body;
    const userId = req.user?.id;
    const schoolId = req.schoolId;

    // Verify teacher has access to this class
    const hasAccess = await verifyTeacherClassAccessCached(userId, id, schoolId);
    if (!hasAccess) {
      throw ErrorTypes.FORBIDDEN("You are not assigned to this class");
    }

    const { data, error } = await supabaseAdmin
      .from("syllabus")
      .update({ title, description, chapter_order, updated_at: new Date().toISOString() })
      .eq("id", chapterId)
      .eq("class_id", id)
      .select()
      .single();

    if (error) {
      throw mapDatabaseError(error);
    }

    // Invalidate cache
    cache.delete(classCacheKeys.syllabus(id));

    res.json({
      success: true,
      message: "Chapter updated successfully",
      data: { chapter: data },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Mark chapter as complete (Teacher only) - with cache invalidation
 */
export const markChapterComplete = async (req, res, next) => {
  try {
    const { id, chapterId } = req.params;
    const { is_completed = true } = req.body;
    const userId = req.user?.id;
    const schoolId = req.schoolId;

    // Verify teacher has access to this class
    const hasAccess = await verifyTeacherClassAccessCached(userId, id, schoolId);
    if (!hasAccess) {
      throw ErrorTypes.FORBIDDEN("You are not assigned to this class");
    }

    // Get teacher ID (cached)
    const teacherCacheKey = `teacher:user:${userId}`;
    let teacher = cache.get(teacherCacheKey);

    if (!teacher) {
      const { data } = await supabaseAdmin.from("teachers").select("id").eq("user_id", userId).single();

      teacher = data;
      if (teacher) {
        cache.set(teacherCacheKey, teacher, cacheTTL.MEDIUM);
      }
    }

    const { data, error } = await supabaseAdmin
      .from("syllabus")
      .update({
        is_completed,
        completed_at: is_completed ? new Date().toISOString() : null,
        completed_by: is_completed ? teacher?.id : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", chapterId)
      .eq("class_id", id)
      .select()
      .single();

    if (error) {
      throw mapDatabaseError(error);
    }

    // Invalidate cache
    cache.delete(classCacheKeys.syllabus(id));

    res.json({
      success: true,
      message: is_completed ? "Chapter marked as complete" : "Chapter marked as incomplete",
      data: { chapter: data },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete syllabus item (Teacher only) - with cache invalidation
 */
export const deleteSyllabusItem = async (req, res, next) => {
  try {
    const { id, chapterId } = req.params;
    const userId = req.user?.id;
    const schoolId = req.schoolId;

    // Verify teacher has access to this class
    const hasAccess = await verifyTeacherClassAccessCached(userId, id, schoolId);
    if (!hasAccess) {
      throw ErrorTypes.FORBIDDEN("You are not assigned to this class");
    }

    const { error } = await supabaseAdmin.from("syllabus").delete().eq("id", chapterId).eq("class_id", id);

    if (error) {
      throw mapDatabaseError(error);
    }

    // Invalidate cache
    cache.delete(classCacheKeys.syllabus(id));

    res.json({
      success: true,
      message: "Chapter deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};

// =====================
// ATTENDANCE MANAGEMENT
// =====================

/**
 * Get attendance for a class on a specific date (with caching)
 */
export const getAttendance = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { date } = req.query;
    const attendanceDate = date || new Date().toISOString().split("T")[0];

    // Try cache first
    const cacheKey = classCacheKeys.attendance(id, attendanceDate);
    let cachedData = cache.get(cacheKey);

    if (cachedData) {
      logger.debug("Attendance served from cache", { classId: id, date: attendanceDate });
      return res.json(cachedData);
    }

    logger.debug("Fetching attendance from database", { classId: id, date: attendanceDate });

    // Get all enrolled students
    const { data: enrollments, error: enrollError } = await supabaseAdmin
      .from("class_enrollments")
      .select(
        `
        student:students(id, first_name, last_name, roll_number)
      `,
      )
      .eq("class_id", id)
      .eq("status", "active");

    if (enrollError) {
      throw mapDatabaseError(enrollError);
    }

    // Get attendance records for this date
    const { data: records, error: attendError } = await supabaseAdmin
      .from("attendance")
      .select("*")
      .eq("class_id", id)
      .eq("date", attendanceDate);

    if (attendError) {
      throw mapDatabaseError(attendError);
    }

    // Map students with their attendance status
    const students = enrollments.map((e) => e.student);
    const attendance = students.map((student) => {
      const record = records.find((r) => r.student_id === student.id);
      return {
        studentId: student.id,
        studentName: `${student.first_name} ${student.last_name}`,
        rollNumber: student.roll_number,
        status: record?.status || null,
        notes: record?.notes || null,
        recordId: record?.id || null,
      };
    });

    // Calculate summary
    const summary = {
      total: attendance.length,
      present: attendance.filter((a) => a.status === "present").length,
      absent: attendance.filter((a) => a.status === "absent").length,
      late: attendance.filter((a) => a.status === "late").length,
      excused: attendance.filter((a) => a.status === "excused").length,
      unmarked: attendance.filter((a) => !a.status).length,
    };

    const responseData = {
      success: true,
      data: {
        date: attendanceDate,
        attendance,
        summary,
      },
    };

    // Cache for short duration (1 minute - attendance changes frequently)
    cache.set(cacheKey, responseData, cacheTTL.SHORT);
    logDatabase("SELECT", "attendance", { classId: id, date: attendanceDate });

    res.json(responseData);
  } catch (error) {
    next(error);
  }
};

/**
 * Mark attendance for students (Teacher only) - with cache invalidation
 */
export const markAttendance = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { date, records } = req.body;
    const userId = req.user?.id;
    const schoolId = req.schoolId;

    const attendanceDate = date || new Date().toISOString().split("T")[0];

    // Verify teacher has access to this class
    const hasAccess = await verifyTeacherClassAccessCached(userId, id, schoolId);
    if (!hasAccess) {
      throw ErrorTypes.FORBIDDEN("You are not assigned to this class");
    }

    // Get teacher ID (cached)
    const teacherCacheKey = `teacher:user:${userId}`;
    let teacher = cache.get(teacherCacheKey);

    if (!teacher) {
      const { data } = await supabaseAdmin.from("teachers").select("id").eq("user_id", userId).single();

      teacher = data;
      if (teacher) {
        cache.set(teacherCacheKey, teacher, cacheTTL.MEDIUM);
      }
    }

    if (!Array.isArray(records) || records.length === 0) {
      throw new ApiError(400, "Please provide attendance records", null, "INVALID_INPUT");
    }

    // Prepare attendance records
    const attendanceRecords = records.map((record) => ({
      class_id: id,
      student_id: record.student_id,
      date: attendanceDate,
      status: record.status,
      notes: record.notes || null,
      marked_by: teacher?.id,
    }));

    // Upsert attendance records
    const { data, error } = await supabaseAdmin
      .from("attendance")
      .upsert(attendanceRecords, {
        onConflict: "class_id,student_id,date",
        ignoreDuplicates: false,
      })
      .select();

    if (error) {
      throw mapDatabaseError(error);
    }

    // Invalidate cache for this date and also for student attendance patterns
    cache.delete(classCacheKeys.attendance(id, attendanceDate));
    records.forEach((record) => {
      cache.deletePattern(`attendance:student:${record.student_id}*`);
    });

    logger.info("Attendance marked", { classId: id, date: attendanceDate, count: data.length });

    res.json({
      success: true,
      message: `Attendance marked for ${data.length} students`,
      data: { records: data },
    });
  } catch (error) {
    next(error);
  }
};

// =====================
// HELPER FUNCTIONS
// =====================

/**
 * Verify if a user (teacher) has access to a class (with caching)
 */
async function verifyTeacherClassAccessCached(userId, classId, schoolId) {
  // Check cache first
  const cacheKey = classCacheKeys.teacherAccess(userId, classId);
  let hasAccess = cache.get(cacheKey);

  if (hasAccess !== null && hasAccess !== undefined) {
    return hasAccess;
  }

  // Cache miss - perform full check
  hasAccess = await verifyTeacherClassAccess(userId, classId, schoolId);

  // Cache for 5 minutes
  cache.set(cacheKey, hasAccess, cacheTTL.MEDIUM);

  return hasAccess;
}

/**
 * Verify if a user (teacher) has access to a class
 */
async function verifyTeacherClassAccess(userId, classId, schoolId) {
  // 1. Check if user is an admin (check cache first)
  const superAdminKey = `admin:super:${userId}`;
  const schoolAdminKey = `admin:school:${userId}:${schoolId}`;

  // Check super admin status first (doesn't depend on schoolId)
  const isSuperAdmin = cache.get(superAdminKey);
  if (isSuperAdmin === true) return true;

  // Check school admin status
  const isSchoolAdmin = cache.get(schoolAdminKey);
  if (isSchoolAdmin === true) return true;

  // If we don't know for sure they are NOT an admin (null means cache miss)
  if (isSuperAdmin === null || isSchoolAdmin === null) {
    const { data: adminRecord } = await supabaseAdmin
      .from("admins")
      .select("id, school_id")
      .eq("user_id", userId)
      .or(`school_id.is.null,school_id.eq.${schoolId}`)
      .maybeSingle();

    if (adminRecord) {
      if (!adminRecord.school_id) {
        cache.set(superAdminKey, true, cacheTTL.LONG); // 15 mins for super admin
        return true;
      } else {
        cache.set(schoolAdminKey, true, cacheTTL.MEDIUM); // 5 mins for school admin
        return true;
      }
    } else {
      // Cache the negative result to avoid re-checking
      // We only cache this if we know they are not a super admin AND not an admin for this school
      cache.set(superAdminKey, false, cacheTTL.MEDIUM);
      cache.set(schoolAdminKey, false, cacheTTL.MEDIUM);
    }
  }

  // 2. Not an admin, check if user is an assigned teacher
  // Get teacher record (check cache first)
  const teacherCacheKey = `teacher:user:${userId}`;
  let teacher = cache.get(teacherCacheKey);
  console.log(userId, schoolId);

  if (!teacher) {
    const { data } = await supabaseAdmin
      .from("teachers")
      .select("id")
      .eq("user_id", userId)
      .eq("school_id", schoolId)
      .maybeSingle();

    teacher = data;
    if (teacher) {
      cache.set(teacherCacheKey, teacher, cacheTTL.MEDIUM);
    }
  }

  if (!teacher) return false;

  // Check if teacher is assigned to this class
  const { data: assignment } = await supabaseAdmin
    .from("class_teachers")
    .select("id")
    .eq("class_id", classId)
    .eq("teacher_id", teacher.id)
    .single();

  return !!assignment;
}

/**
 * Helper to invalidate all caches for a specific class
 */
function invalidateClassCache(classId, schoolId) {
  cache.delete(classCacheKeys.class(classId));
  cache.delete(classCacheKeys.classStudents(classId));
  cache.delete(`class:studentcount:${classId}`);
  cache.delete(classCacheKeys.syllabus(classId));
  cache.deletePattern(`class:access:*:${classId}`);
  invalidateClassesCache(schoolId);
  logger.debug("Invalidated class cache", { classId, schoolId });
}

/**
 * Helper to invalidate all class lists for a school
 */
function invalidateClassesCache(schoolId) {
  cache.deletePattern(`classes:school:${schoolId}:*`);
  logger.debug("Invalidated classes cache", { schoolId });
}

/**
 * Export helpers for use in other modules
 */
export const invalidateClassData = invalidateClassCache;
export const invalidateSchoolClasses = invalidateClassesCache;

export default {
  getClasses,
  getClassById,
  createClass,
  updateClass,
  assignTeacher,
  enrollStudent,
  bulkEnrollStudents,
  removeStudent,
  getSyllabus,
  createSyllabusItem,
  updateSyllabusItem,
  markChapterComplete,
  deleteSyllabusItem,
  getAttendance,
  markAttendance,
  invalidateClassData,
  invalidateSchoolClasses,
};
