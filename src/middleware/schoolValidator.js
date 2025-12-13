import { supabaseAdmin } from '../config/supabase.js';
import { ApiError, ErrorTypes } from '../utils/apiError.js';
import logger from '../utils/logger.js';

/**
 * Middleware to validate and attach school context to requests
 * Ensures that schoolId is present and the user has access to that school
 */
export const requireSchool = async (req, res, next) => {
  try {
    // Get schoolId from various sources
    const schoolId = req.headers['x-school-id'] ||
                     req.query.school_id ||
                     req.body.school_id ||
                     req.params.schoolId;

    // Validate schoolId is present
    if (!schoolId) {
      throw ErrorTypes.SCHOOL_REQUIRED();
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(schoolId)) {
      throw new ApiError(400, 'Invalid school ID format. Must be a valid UUID', null, 'INVALID_SCHOOL_ID');
    }


    // Verify school exists
    const { data: school, error } = await supabaseAdmin
      .from('schools')
      .select('id, name')
      .eq('id', schoolId)
      .single();

    if (error || !school) {
      logger.error('School not found', { schoolId, error: error?.message });
      throw ErrorTypes.SCHOOL_NOT_FOUND();
    }

    // If user is authenticated, verify they have access to this school
    if (req.user) {
      const hasAccess = await verifySchoolAccess(req.user.id, schoolId);
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
    const schoolId = req.headers['x-school-id'] ||
                     req.query.school_id ||
                     req.body.school_id;

    if (schoolId) {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(schoolId)) {
        throw new ApiError(400, 'Invalid school ID format', null, 'INVALID_SCHOOL_ID');
      }

      const { data: school, error } = await supabaseAdmin
        .from('schools')
        .select('id, name')
        .eq('id', schoolId)
        .single();

      if (!error && school) {
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
 * Verify if a user has access to a specific school
 */
async function verifySchoolAccess(userId, schoolId) {
  // Check if user is a super admin (school_id is null in admins table)
  const { data: superAdmin } = await supabaseAdmin
    .from('admins')
    .select('id')
    .eq('user_id', userId)
    .is('school_id', null)
    .single();

  if (superAdmin) {
    return true; // Super admins have access to all schools
  }

  // Check if user is associated with this school
  // Check admins table
  const { data: admin } = await supabaseAdmin
    .from('admins')
    .select('id')
    .eq('user_id', userId)
    .eq('school_id', schoolId)
    .single();

  if (admin) return true;

  // Check teachers table
  const { data: teacher } = await supabaseAdmin
    .from('teachers')
    .select('id')
    .eq('user_id', userId)
    .eq('school_id', schoolId)
    .single();

  if (teacher) return true;

  // Check students table
  const { data: student } = await supabaseAdmin
    .from('students')
    .select('id')
    .eq('user_id', userId)
    .eq('school_id', schoolId)
    .single();

  if (student) return true;

  // Check parents table
  const { data: parent } = await supabaseAdmin
    .from('parents')
    .select('id')
    .eq('user_id', userId)
    .eq('school_id', schoolId)
    .single();

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

export default { requireSchool, optionalSchool, injectSchoolId };
