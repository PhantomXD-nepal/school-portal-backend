import { supabaseAdmin } from '../config/supabase.js';
import { ApiError, ErrorTypes, mapDatabaseError } from '../utils/apiError.js';
import logger, { logDatabase } from '../utils/logger.js';
import crypto from 'crypto';
import cache, { cacheKeys, cacheTTL } from '../utils/cache.js';

/**
 * Generate a random school key
 */
const generateSchoolKey = () => {
  return crypto.randomBytes(4).toString('hex').toUpperCase(); // 8 character hex string
};

/**
 * Create a new school
 */
export const createSchool = async (req, res, next) => {
  try {
    const {
      name, address, phone, email, website,
      timezone, academic_year_start, academic_year_end
    } = req.body;

    if (!name) {
      throw ErrorTypes.MISSING_REQUIRED_FIELD('name');
    }

    // Check if school with same name exists
    const { data: existingSchool } = await supabaseAdmin
      .from('schools')
      .select('id')
      .eq('name', name)
      .single();

    if (existingSchool) {
      throw ErrorTypes.ALREADY_EXISTS('A school with this name');
    }

    // Check if email is already used
    if (email) {
      const { data: emailExists } = await supabaseAdmin
        .from('schools')
        .select('id')
        .eq('email', email)
        .single();

      if (emailExists) {
        throw ErrorTypes.ALREADY_EXISTS('A school with this email');
      }
    }

    // Generate unique school key
    let schoolKey = generateSchoolKey();
    let isUnique = false;
    let attempts = 0;
    const maxAttempts = 10;

    while (!isUnique && attempts < maxAttempts) {
      const { data } = await supabaseAdmin
        .from('schools')
        .select('id')
        .eq('school_key', schoolKey)
        .single();

      if (!data) {
        isUnique = true;
      } else {
        schoolKey = generateSchoolKey();
        attempts++;
      }
    }

    if (!isUnique) {
      throw ErrorTypes.INTERNAL_ERROR('Failed to generate unique school key');
    }

    const schoolData = {
      name,
      school_key: schoolKey,
      address,
      phone,
      email,
      website,
      timezone: timezone || 'UTC',
      academic_year_start,
      academic_year_end,
    };

    const { data: school, error } = await supabaseAdmin
      .from('schools')
      .insert([schoolData])
      .select()
      .single();

    if (error) {
      throw mapDatabaseError(error);
    }

    // If user is authenticated, link them as admin of this school
    if (req.user) {
      const { error: adminError } = await supabaseAdmin
        .from('admins')
        .insert([{
          user_id: req.user.id,
          school_id: school.id,
          first_name: req.user.user_metadata?.first_name,
          last_name: req.user.user_metadata?.last_name,
        }]);

      if (adminError) {
        logger.warn('Failed to link user as school admin', {
          userId: req.user.id,
          schoolId: school.id,
          error: adminError.message
        });
      }
    }

    logDatabase('INSERT', 'schools', { schoolId: school.id });
    logger.info('School created', { schoolId: school.id, name, createdBy: req.user?.id });

    res.status(201).json({
      success: true,
      message: 'School created successfully',
      data: { school },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all schools (Super Admin) or user's schools
 */
export const getSchools = async (req, res, next) => {
  try {
    const { search, status } = req.query;
    const userId = req.user?.id;

    let query = supabaseAdmin
      .from('schools')
      .select('*');

    // If user is not a super admin, only show their schools
    if (userId) {
      // Check if super admin
      const { data: superAdmin } = await supabaseAdmin
        .from('admins')
        .select('id')
        .eq('user_id', userId)
        .is('school_id', null)
        .single();

      if (!superAdmin) {
        // Get schools user has access to
        const { data: adminSchools } = await supabaseAdmin
          .from('admins')
          .select('school_id')
          .eq('user_id', userId);

        const { data: teacherSchools } = await supabaseAdmin
          .from('teachers')
          .select('school_id')
          .eq('user_id', userId);

        const schoolIds = [
          ...(adminSchools || []).map(a => a.school_id),
          ...(teacherSchools || []).map(t => t.school_id),
        ].filter(Boolean);

        if (schoolIds.length > 0) {
          query = query.in('id', [...new Set(schoolIds)]);
        } else {
          // User has no schools
          return res.json({
            success: true,
            data: {
              schools: [],
              count: 0,
            },
          });
        }
      }
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,school_key.ilike.%${search}%`);
    }

    if (status) {
      query = query.eq('status', status);
    }

    const { data: schools, error } = await query.order('created_at', { ascending: false });

    if (error) {
      throw mapDatabaseError(error);
    }

    logDatabase('SELECT', 'schools', { count: schools.length, userId });

    res.json({
      success: true,
      data: {
        schools,
        count: schools.length,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get school by ID
 */
export const getSchoolById = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check cache first
    const cacheKey = cacheKeys.school(id);
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      return res.json(cachedData);
    }

    const { data: school, error } = await supabaseAdmin
      .from('schools')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw ErrorTypes.NOT_FOUND('School');
      }
      throw mapDatabaseError(error);
    }

    const responseData = {
      success: true,
      data: { school },
    };

    // Cache for 15 minutes (school data rarely changes)
    cache.set(cacheKey, responseData, cacheTTL.LONG);

    res.json(responseData);
  } catch (error) {
    next(error);
  }
};

/**
 * Get school by school key
 */
export const getSchoolByKey = async (req, res, next) => {
  try {
    const { key } = req.params;
    const normalizedKey = key.toUpperCase();

    // Check cache first
    const cacheKey = cacheKeys.schoolByKey(normalizedKey);
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      return res.json(cachedData);
    }

    const { data: school, error } = await supabaseAdmin
      .from('schools')
      .select('id, name, logo_url, address, phone, email')
      .eq('school_key', normalizedKey)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw ErrorTypes.NOT_FOUND('School with this key');
      }
      throw mapDatabaseError(error);
    }

    const responseData = {
      success: true,
      data: { school },
    };

    // Cache for 15 minutes
    cache.set(cacheKey, responseData, cacheTTL.LONG);

    res.json(responseData);
  } catch (error) {
    next(error);
  }
};

/**
 * Update school
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
      .from('schools')
      .select('id')
      .eq('id', id)
      .single();

    if (fetchError || !existingSchool) {
      throw ErrorTypes.NOT_FOUND('School');
    }

    // Check for duplicate name if being updated
    if (updateData.name) {
      const { data: nameExists } = await supabaseAdmin
        .from('schools')
        .select('id')
        .eq('name', updateData.name)
        .neq('id', id)
        .single();

      if (nameExists) {
        throw ErrorTypes.ALREADY_EXISTS('A school with this name');
      }
    }

    const { data: school, error } = await supabaseAdmin
      .from('schools')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw mapDatabaseError(error);
    }

    // Invalidate cache for this school
    cache.delete(cacheKeys.school(id));
    if (school.school_key) {
      cache.delete(cacheKeys.schoolByKey(school.school_key));
    }

    logDatabase('UPDATE', 'schools', { schoolId: id });
    logger.info('School updated', { schoolId: id });

    res.json({
      success: true,
      message: 'School updated successfully',
      data: { school },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete school
 */
export const deleteSchool = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Verify school exists
    const { data: existingSchool, error: fetchError } = await supabaseAdmin
      .from('schools')
      .select('id, name, school_key')
      .eq('id', id)
      .single();

    if (fetchError || !existingSchool) {
      throw ErrorTypes.NOT_FOUND('School');
    }

    // Check for dependencies before deleting
    const { count: studentCount } = await supabaseAdmin
      .from('students')
      .select('*', { count: 'exact', head: true })
      .eq('school_id', id);

    const { count: teacherCount } = await supabaseAdmin
      .from('teachers')
      .select('*', { count: 'exact', head: true })
      .eq('school_id', id);

    if (studentCount > 0 || teacherCount > 0) {
      throw new ApiError(400,
        `Cannot delete school. This school has ${studentCount || 0} students and ${teacherCount || 0} teachers. Please remove them first.`,
        { students: studentCount, teachers: teacherCount },
        'SCHOOL_HAS_DEPENDENCIES'
      );
    }

    const { error } = await supabaseAdmin
      .from('schools')
      .delete()
      .eq('id', id);

    if (error) {
      throw mapDatabaseError(error);
    }

    // Invalidate cache for this school
    cache.delete(cacheKeys.school(id));
    if (existingSchool.school_key) {
      cache.delete(cacheKeys.schoolByKey(existingSchool.school_key));
    }

    logDatabase('DELETE', 'schools', { schoolId: id });
    logger.info('School deleted', { schoolId: id, name: existingSchool.name });

    res.json({
      success: true,
      message: 'School deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get school statistics
 */
export const getSchoolStats = async (req, res, next) => {
  try {
    const schoolId = req.schoolId;

    const [
      { count: studentCount },
      { count: teacherCount },
      { count: classCount },
      { count: activeStudents },
    ] = await Promise.all([
      supabaseAdmin.from('students').select('*', { count: 'exact', head: true }).eq('school_id', schoolId),
      supabaseAdmin.from('teachers').select('*', { count: 'exact', head: true }).eq('school_id', schoolId),
      supabaseAdmin.from('classes').select('*', { count: 'exact', head: true }).eq('school_id', schoolId),
      supabaseAdmin.from('students').select('*', { count: 'exact', head: true }).eq('school_id', schoolId).eq('status', 'active'),
    ]);

    res.json({
      success: true,
      data: {
        stats: {
          totalStudents: studentCount || 0,
          activeStudents: activeStudents || 0,
          totalTeachers: teacherCount || 0,
          totalClasses: classCount || 0,
          attendanceToday: 0, // Placeholder until attendance module is implemented
          revenueMonth: 0, // Placeholder until finance module is implemented
        },
        charts: {
          attendance: [], // Placeholder
          revenue: [] // Placeholder
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export default {
  createSchool,
  getSchools,
  getSchoolById,
  getSchoolByKey,
  updateSchool,
  deleteSchool,
  getSchoolStats,
};
