import { supabase, supabaseAdmin } from '../config/supabase.js';
import { ApiError, ErrorTypes, mapDatabaseError } from '../utils/apiError.js';
import logger, { logDatabase } from '../utils/logger.js';

/**
 * Get all teachers for a school
 */
export const getTeachers = async (req, res, next) => {
  try {
    const { department, search, status } = req.query;
    const schoolId = req.schoolId;

    let query = supabaseAdmin
      .from('teachers')
      .select('*')
      .eq('school_id', schoolId);

    if (department) query = query.eq('department', department);
    if (status) query = query.eq('status', status);
    if (search) {
      query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`);
    }

    const { data: teachers, error } = await query.order('created_at', { ascending: false });

    if (error) {
      throw mapDatabaseError(error);
    }

    logDatabase('SELECT', 'teachers', { schoolId, count: teachers.length });

    res.json({
      success: true,
      data: {
        teachers,
        count: teachers.length,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get teacher by ID
 */
export const getTeacherById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const schoolId = req.schoolId;

    const { data: teacher, error } = await supabaseAdmin
      .from('teachers')
      .select('*')
      .eq('id', id)
      .eq('school_id', schoolId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw ErrorTypes.NOT_FOUND('Teacher');
      }
      throw mapDatabaseError(error);
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
 * Create new teacher
 */
export const createTeacher = async (req, res, next) => {
  try {
    const schoolId = req.schoolId;
    const { first_name, last_name, email, phone, department, designation, qualification, hire_date, status } = req.body;

    // Check if email already exists
    const { data: existingTeacher } = await supabaseAdmin
      .from('teachers')
      .select('id')
      .eq('email', email)
      .single();

    if (existingTeacher) {
      throw ErrorTypes.ALREADY_EXISTS('A teacher with this email');
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
      status: status || 'active',
    };

    const { data: teacher, error } = await supabaseAdmin
      .from('teachers')
      .insert([teacherData])
      .select()
      .single();

    if (error) {
      throw mapDatabaseError(error);
    }

    logDatabase('INSERT', 'teachers', { schoolId, teacherId: teacher.id });
    logger.info('Teacher created', { teacherId: teacher.id, email, schoolId });

    res.status(201).json({
      success: true,
      message: 'Teacher created successfully',
      data: { teacher },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update teacher
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
      .from('teachers')
      .select('id')
      .eq('id', id)
      .eq('school_id', schoolId)
      .single();

    if (fetchError || !existingTeacher) {
      throw ErrorTypes.NOT_FOUND('Teacher');
    }

    // If email is being updated, check for duplicates
    if (updateData.email) {
      const { data: emailExists } = await supabaseAdmin
        .from('teachers')
        .select('id')
        .eq('email', updateData.email)
        .neq('id', id)
        .single();

      if (emailExists) {
        throw ErrorTypes.ALREADY_EXISTS('A teacher with this email');
      }
    }

    const { data: teacher, error } = await supabaseAdmin
      .from('teachers')
      .update(updateData)
      .eq('id', id)
      .eq('school_id', schoolId)
      .select()
      .single();

    if (error) {
      throw mapDatabaseError(error);
    }

    logDatabase('UPDATE', 'teachers', { schoolId, teacherId: id });
    logger.info('Teacher updated', { teacherId: id, schoolId });

    res.json({
      success: true,
      message: 'Teacher updated successfully',
      data: { teacher },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete teacher
 */
export const deleteTeacher = async (req, res, next) => {
  try {
    const { id } = req.params;
    const schoolId = req.schoolId;

    // Verify teacher exists and belongs to this school
    const { data: existingTeacher, error: fetchError } = await supabaseAdmin
      .from('teachers')
      .select('id')
      .eq('id', id)
      .eq('school_id', schoolId)
      .single();

    if (fetchError || !existingTeacher) {
      throw ErrorTypes.NOT_FOUND('Teacher');
    }

    const { error } = await supabaseAdmin
      .from('teachers')
      .delete()
      .eq('id', id)
      .eq('school_id', schoolId);

    if (error) {
      throw mapDatabaseError(error);
    }

    logDatabase('DELETE', 'teachers', { schoolId, teacherId: id });
    logger.info('Teacher deleted', { teacherId: id, schoolId });

    res.json({
      success: true,
      message: 'Teacher deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

export default {
  getTeachers,
  getTeacherById,
  createTeacher,
  updateTeacher,
  deleteTeacher,
};
