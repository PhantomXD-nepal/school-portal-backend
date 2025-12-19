import { supabaseAdmin } from "../config/supabase.js";
import { ApiError, ErrorTypes } from "../utils/apiError.js";
import logger from "../utils/logger.js";
import cache, { cacheTTL } from "../utils/cache.js";

// Cache key generators
const schoolCacheKeys = {
  school: (schoolId) => `school:data:${schoolId}`,
  userSchoolAccess: (userId, schoolId) => `school:access:${userId}:${schoolId}`,
  userSchools: (userId) => `school:user:${userId}:all`,
  superAdmin: (userId) => `school:superadmin:${userId}`,
};

/**
 * Middleware to validate and attach school context to requests
 * Ensures that schoolId is present and the user has access to that school
 */
export const requireSchool = async (req, res, next) => {
  try {
    // Get schoolId from various sources
    const schoolId = req.headers["x-school-id"] || req.query.school_id || req.body.school_id || req.params.schoolId;

    // Validate schoolId is present
    if (!schoolId) {
      throw ErrorTypes.SCHOOL_REQUIRED();
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(schoolId)) {
      throw new ApiError(400, "Invalid school ID format. Must be a valid UUID", null, "INVALID_SCHOOL_ID");
    }

    // Try to get school from cache
    const schoolCacheKey = schoolCacheKeys.school(schoolId);
    let school = cache.get(schoolCacheKey);

    if (!school) {
      // Cache miss - fetch from database
      const { data, error } = await supabaseAdmin.from("schools").select("id, name").eq("id", schoolId).single();

      if (error || !data) {
        logger.error("School not found", { schoolId, error: error?.message });
        throw ErrorTypes.SCHOOL_NOT_FOUND();
      }

      school = data;
      // Cache school data for 15 minutes (schools don't change often)
      cache.set(schoolCacheKey, school, cacheTTL.LONG);
    }

    // If user is authenticated, verify they have access to this school
    if (req.user) {
      const hasAccess = await verifySchoolAccessCached(req.user.id, schoolId);
      if (!hasAccess) {
        throw ErrorTypes.SCHOOL_ACCESS_DENIED();
      }
    }

    // Attach school to request
    req.school = school;
    req.schoolId = schoolId;

    logger.debug(`School context set: ${school.name}`, { schoolId, userId: req.user?.id });
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Optional school middleware - attaches school if provided but doesn't require it
 */
export const optionalSchool = async (req, res, next) => {
  try {
    const schoolId = req.headers["x-school-id"] || req.query.school_id || req.body.school_id;

    if (schoolId) {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(schoolId)) {
        throw new ApiError(400, "Invalid school ID format", null, "INVALID_SCHOOL_ID");
      }

      // Try cache first
      const schoolCacheKey = schoolCacheKeys.school(schoolId);
      let school = cache.get(schoolCacheKey);

      if (!school) {
        const { data, error } = await supabaseAdmin.from("schools").select("id, name").eq("id", schoolId).single();

        if (!error && data) {
          school = data;
          cache.set(schoolCacheKey, school, cacheTTL.LONG);
        }
      }

      if (school) {
        req.school = school;
        req.schoolId = schoolId;
      }
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Verify if a user has access to a specific school (with caching)
 */
async function verifySchoolAccessCached(userId, schoolId) {
  // Check cache first
  const accessCacheKey = schoolCacheKeys.userSchoolAccess(userId, schoolId);
  const cachedAccess = cache.get(accessCacheKey);

  if (cachedAccess !== null) {
    return cachedAccess;
  }

  // Cache miss - perform full check
  const hasAccess = await verifySchoolAccess(userId, schoolId);

  // Cache the result for 5 minutes
  cache.set(accessCacheKey, hasAccess, cacheTTL.MEDIUM);

  return hasAccess;
}

/**
 * Verify if a user has access to a specific school
 * This is the actual database check function
 */
async function verifySchoolAccess(userId, schoolId) {
  // Check if user is a super admin (cached separately for 15 min)
  const superAdminCacheKey = schoolCacheKeys.superAdmin(userId);
  let isSuperAdmin = cache.get(superAdminCacheKey);

  if (isSuperAdmin === null) {
    const { data: superAdmin } = await supabaseAdmin
      .from("admins")
      .select("id")
      .eq("user_id", userId)
      .is("school_id", null)
      .single();

    isSuperAdmin = !!superAdmin;
    cache.set(superAdminCacheKey, isSuperAdmin, cacheTTL.LONG);
  }

  if (isSuperAdmin) {
    return true; // Super admins have access to all schools
  }

  // For non-super admins, check school-specific access
  // We'll use a single optimized query instead of 4 separate queries

  // Check admins table
  const { data: admin } = await supabaseAdmin
    .from("admins")
    .select("id")
    .eq("user_id", userId)
    .eq("school_id", schoolId)
    .maybeSingle();

  if (admin) return true;

  // Check teachers table
  const { data: teacher } = await supabaseAdmin
    .from("teachers")
    .select("id")
    .eq("user_id", userId)
    .eq("school_id", schoolId)
    .maybeSingle();

  if (teacher) return true;

  // Check students table
  const { data: student } = await supabaseAdmin
    .from("students")
    .select("id")
    .eq("user_id", userId)
    .eq("school_id", schoolId)
    .maybeSingle();

  if (student) return true;

  // Check parents table
  const { data: parent } = await supabaseAdmin
    .from("parents")
    .select("id")
    .eq("user_id", userId)
    .eq("school_id", schoolId)
    .maybeSingle();

  if (parent) return true;

  return false;
}

/**
 * Middleware to inject schoolId into body from request context
 */
export const injectSchoolId = (req, res, next) => {
  if (req.schoolId && req.body) {
    req.body.school_id = req.schoolId;
  }
  next();
};

/**
 * Invalidate school-related caches
 * Call these when school data or user associations change
 */
export const invalidateSchoolCache = (schoolId) => {
  cache.delete(schoolCacheKeys.school(schoolId));
  cache.deletePattern(`school:access:*:${schoolId}`);
  logger.info("Invalidated school cache", { schoolId });
};

export const invalidateUserSchoolAccess = (userId) => {
  cache.deletePattern(`school:access:${userId}:*`);
  cache.delete(schoolCacheKeys.userSchools(userId));
  cache.delete(schoolCacheKeys.superAdmin(userId));
  logger.info("Invalidated user school access cache", { userId });
};

export const invalidateUserSuperAdminStatus = (userId) => {
  cache.delete(schoolCacheKeys.superAdmin(userId));
  cache.deletePattern(`school:access:${userId}:*`);
};

export default {
  requireSchool,
  optionalSchool,
  injectSchoolId,
  invalidateSchoolCache,
  invalidateUserSchoolAccess,
  invalidateUserSuperAdminStatus,
};
