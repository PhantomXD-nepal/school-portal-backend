import { supabase, supabaseAdmin } from "../config/supabase.js";
import { ApiError, ErrorTypes, mapDatabaseError } from "../utils/apiError.js";
import logger, { logDatabase } from "../utils/logger.js";
import cache, { cacheTTL } from "../utils/cache.js";

// Cache key generators for teachers
const teacherCacheKeys = {
  teachers: (schoolId, filters = {}) => {
    const { department = "", status = "", search = "" } = filters;
    return `teachers:${schoolId}:${department}:${status}:${search}`;
  },
  teacher: (id) => `teacher:detail:${id}`,
  teacherClasses: (id) => `teacher:${id}:classes`,
  teacherByUser: (userId) => `teacher:user:${userId}`,
  teacherByEmail: (email) => `teacher:email:${email}`,
};

/**
 * Get all teachers for a school (with caching)
 */
export const getTeachers = async (req, res, next) => {
  try {
    const { department, search, status } = req.query;
    const schoolId = req.schoolId;

    // Create cache key with filters
    const filters = { department, search, status };
    const cacheKey = teacherCacheKeys.teachers(schoolId, filters);

    // Try cache first
    let cachedData = cache.get(cacheKey);

    if (cachedData) {
      logger.debug("Teachers served from cache", { schoolId, filters });
      return res.json(cachedData);
    }

    logger.debug("Fetching teachers from database", { schoolId, filters });

    let query = supabaseAdmin.from("teachers").select("*").eq("school_id", schoolId);

    if (department) query = query.eq("department", department);
    if (status) query = query.eq("status", status);
    if (search) {
      query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`);
    }

    const { data: teachers, error } = await query.order("created_at", { ascending: false });

    if (error) {
      throw mapDatabaseError(error);
    }

    logDatabase("SELECT", "teachers", { schoolId, count: teachers.length });

    const responseData = {
      success: true,
      data: {
        teachers,
        count: teachers.length,
      },
    };

    // Cache for 5 minutes (or 2 minutes if search is used)
    const ttl = search ? cacheTTL.SHORT : cacheTTL.MEDIUM;
    cache.set(cacheKey, responseData, ttl);

    res.json(responseData);
  } catch (error) {
    next(error);
  }
};

/**
 * Get teacher by ID (with caching)
 */
export const getTeacherById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const schoolId = req.schoolId;

    // Try cache first
    const cacheKey = teacherCacheKeys.teacher(id);
    let teacher = cache.get(cacheKey);

    if (!teacher) {
      logger.debug("Fetching teacher detail from database", { teacherId: id });

      const { data, error } = await supabaseAdmin
        .from("teachers")
        .select("*")
        .eq("id", id)
        .eq("school_id", schoolId)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          throw ErrorTypes.NOT_FOUND("Teacher");
        }
        throw mapDatabaseError(error);
      }

      teacher = data;
      // Cache for 5 minutes
      cache.set(cacheKey, teacher, cacheTTL.MEDIUM);
    }

    res.json({
      success: true,
      data: { teacher },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create new teacher (with cache invalidation)
 */
export const createTeacher = async (req, res, next) => {
  try {
    const schoolId = req.schoolId;
    const { first_name, last_name, email, phone, department, designation, qualification, hire_date, status } = req.body;

    // Check if email already exists
    const { data: existingTeacher } = await supabaseAdmin.from("teachers").select("id").eq("email", email).single();

    if (existingTeacher) {
      throw ErrorTypes.ALREADY_EXISTS("A teacher with this email");
    }

    const teacherData = {
      school_id: schoolId,
      first_name,
      last_name,
      email,
      phone,
      department,
      designation,
      qualification,
      hire_date,
      status: status || "active",
    };

    const { data: teacher, error } = await supabaseAdmin.from("teachers").insert([teacherData]).select().single();

    if (error) {
      throw mapDatabaseError(error);
    }

    // Invalidate teacher caches
    invalidateTeacherCaches(schoolId);

    logDatabase("INSERT", "teachers", { schoolId, teacherId: teacher.id });
    logger.info("Teacher created", { teacherId: teacher.id, email, schoolId });

    res.status(201).json({
      success: true,
      message: "Teacher created successfully",
      data: { teacher },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update teacher (with cache invalidation)
 */
export const updateTeacher = async (req, res, next) => {
  try {
    const { id } = req.params;
    const schoolId = req.schoolId;
    const updateData = req.body;

    // Remove fields that shouldn't be updated
    delete updateData.id;
    delete updateData.school_id;
    delete updateData.created_at;

    // Verify teacher exists and belongs to this school
    const { data: existingTeacher, error: fetchError } = await supabaseAdmin
      .from("teachers")
      .select("id, email, user_id")
      .eq("id", id)
      .eq("school_id", schoolId)
      .single();

    if (fetchError || !existingTeacher) {
      throw ErrorTypes.NOT_FOUND("Teacher");
    }

    // If email is being updated, check for duplicates
    if (updateData.email && updateData.email !== existingTeacher.email) {
      const { data: emailExists } = await supabaseAdmin
        .from("teachers")
        .select("id")
        .eq("email", updateData.email)
        .neq("id", id)
        .single();

      if (emailExists) {
        throw ErrorTypes.ALREADY_EXISTS("A teacher with this email");
      }
    }

    const { data: teacher, error } = await supabaseAdmin
      .from("teachers")
      .update(updateData)
      .eq("id", id)
      .eq("school_id", schoolId)
      .select()
      .single();

    if (error) {
      throw mapDatabaseError(error);
    }

    // Invalidate teacher caches
    invalidateTeacherCache(id, schoolId, existingTeacher.user_id, existingTeacher.email);

    logDatabase("UPDATE", "teachers", { schoolId, teacherId: id });
    logger.info("Teacher updated", { teacherId: id, schoolId });

    res.json({
      success: true,
      message: "Teacher updated successfully",
      data: { teacher },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete teacher (with cache invalidation)
 */
export const deleteTeacher = async (req, res, next) => {
  try {
    const { id } = req.params;
    const schoolId = req.schoolId;

    // Verify teacher exists and belongs to this school
    const { data: existingTeacher, error: fetchError } = await supabaseAdmin
      .from("teachers")
      .select("id, user_id, email")
      .eq("id", id)
      .eq("school_id", schoolId)
      .single();

    if (fetchError || !existingTeacher) {
      throw ErrorTypes.NOT_FOUND("Teacher");
    }

    const { error } = await supabaseAdmin.from("teachers").delete().eq("id", id).eq("school_id", schoolId);

    if (error) {
      throw mapDatabaseError(error);
    }

    // Invalidate teacher caches
    invalidateTeacherCache(id, schoolId, existingTeacher.user_id, existingTeacher.email);

    logDatabase("DELETE", "teachers", { schoolId, teacherId: id });
    logger.info("Teacher deleted", { teacherId: id, schoolId });

    res.json({
      success: true,
      message: "Teacher deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Helper to invalidate all teacher caches for a school
 */
function invalidateTeacherCaches(schoolId) {
  cache.deletePattern(`teachers:${schoolId}:*`);
  cache.delete(`stats:${schoolId}`); // School stats include teacher count
  logger.debug("Invalidated teacher caches", { schoolId });
}

/**
 * Helper to invalidate a specific teacher's cache
 */
function invalidateTeacherCache(teacherId, schoolId, userId = null, email = null) {
  cache.delete(teacherCacheKeys.teacher(teacherId));
  cache.delete(teacherCacheKeys.teacherClasses(teacherId));

  if (userId) {
    cache.delete(teacherCacheKeys.teacherByUser(userId));
  }

  if (email) {
    cache.delete(teacherCacheKeys.teacherByEmail(email));
  }

  // Also invalidate class-related caches since teacher info appears there
  cache.deletePattern(`classes:*`);
  cache.deletePattern(`class:detail:*`);

  invalidateTeacherCaches(schoolId);
  logger.debug("Invalidated teacher cache", { teacherId, schoolId });
}

/**
 * Export helpers for use in other modules
 */
export const invalidateTeacherData = invalidateTeacherCache;
export const invalidateSchoolTeachers = invalidateTeacherCaches;

export default {
  getTeachers,
  getTeacherById,
  createTeacher,
  updateTeacher,
  deleteTeacher,
  invalidateTeacherData,
  invalidateSchoolTeachers,
};
