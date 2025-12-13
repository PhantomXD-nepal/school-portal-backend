import { supabaseAdmin } from '../config/supabase.js';
import { ApiError, ErrorTypes, mapDatabaseError } from '../utils/apiError.js';
import logger, { logDatabase } from '../utils/logger.js';

/**
 * Get all students for a school with optional filters
 */
export const getStudents = async (req, res, next) => {
  try {
    const { grade, section, class_id, status, search } = req.query;
    const schoolId = req.schoolId;
    console.log(schoolId)

    let query = supabaseAdmin
      .from('students')
      .select('*')
      .eq('school_id', schoolId);

    // Apply filters
    if (grade) query = query.eq('grade', grade);
    if (section) query = query.eq('section', section);
    if (class_id) query = query.eq('class_id', class_id);
    if (status) query = query.eq('status', status);
    if (search) {
      query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,roll_number.ilike.%${search}%,email.ilike.%${search}%`);
    }

    const { data: students, error } = await query.order('created_at', { ascending: false });

    if (error) {
      throw mapDatabaseError(error);
    }

    logDatabase('SELECT', 'students', { schoolId, count: students.length });

    res.json({
      success: true,
      data: {
        students,
        count: students.length,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get student by ID
 */
export const getStudentById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const schoolId = req.schoolId;

    const { data: student, error } = await supabaseAdmin
      .from('students')
      .select('*')
      .eq('id', id)
      .eq('school_id', schoolId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw ErrorTypes.NOT_FOUND('Student');
      }
      throw mapDatabaseError(error);
    }

    res.json({
      success: true,
      data: { student },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create new student
 */
export const createStudent = async (req, res, next) => {
  try {
    const schoolId = req.schoolId;
    const {
      first_name, last_name, email, date_of_birth, gender,
      roll_number, grade, section, admission_date, status,
      address, emergency_contact, medical_info
    } = req.body;

    // Check if roll number already exists in this school
    if (roll_number) {
      const { data: existingStudent } = await supabaseAdmin
        .from('students')
        .select('id')
        .eq('school_id', schoolId)
        .eq('roll_number', roll_number)
        .single();

      if (existingStudent) {
        throw new ApiError(409, 'A student with this roll number already exists in this school',
          { field: 'roll_number' }, 'DUPLICATE_ROLL_NUMBER');
      }
    }

    // Check if email already exists (if provided)
    if (email) {
      const { data: existingEmail } = await supabaseAdmin
        .from('students')
        .select('id')
        .eq('email', email)
        .single();

      if (existingEmail) {
        throw ErrorTypes.ALREADY_EXISTS('A student with this email');
      }
    }

    const studentData = {
      school_id: schoolId,
      first_name,
      last_name,
      email,
      date_of_birth,
      gender,
      roll_number,
      grade,
      section,
      admission_date: admission_date || new Date().toISOString().split('T')[0],
      status: status || 'active',
      address,
      emergency_contact,
      medical_info,
    };

    const { data: student, error } = await supabaseAdmin
      .from('students')
      .insert([studentData])
      .select()
      .single();

    if (error) {
      throw mapDatabaseError(error);
    }

    logDatabase('INSERT', 'students', { schoolId, studentId: student.id });
    logger.info('Student created', { studentId: student.id, schoolId, grade });

    res.status(201).json({
      success: true,
      message: 'Student created successfully',
      data: { student },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update student
 */
export const updateStudent = async (req, res, next) => {
  try {
    const { id } = req.params;
    const schoolId = req.schoolId;
    const updateData = req.body;

    // Remove fields that shouldn't be updated
    delete updateData.id;
    delete updateData.school_id;
    delete updateData.created_at;

    // Verify student exists and belongs to this school
    const { data: existingStudent, error: fetchError } = await supabaseAdmin
      .from('students')
      .select('id, roll_number, email')
      .eq('id', id)
      .eq('school_id', schoolId)
      .single();

    if (fetchError || !existingStudent) {
      throw ErrorTypes.NOT_FOUND('Student');
    }

    // Check for roll number duplicates if being updated
    if (updateData.roll_number && updateData.roll_number !== existingStudent.roll_number) {
      const { data: rollExists } = await supabaseAdmin
        .from('students')
        .select('id')
        .eq('school_id', schoolId)
        .eq('roll_number', updateData.roll_number)
        .neq('id', id)
        .single();

      if (rollExists) {
        throw new ApiError(409, 'A student with this roll number already exists',
          { field: 'roll_number' }, 'DUPLICATE_ROLL_NUMBER');
      }
    }

    // Check for email duplicates if being updated
    if (updateData.email && updateData.email !== existingStudent.email) {
      const { data: emailExists } = await supabaseAdmin
        .from('students')
        .select('id')
        .eq('email', updateData.email)
        .neq('id', id)
        .single();

      if (emailExists) {
        throw ErrorTypes.ALREADY_EXISTS('A student with this email');
      }
    }

    const { data: student, error } = await supabaseAdmin
      .from('students')
      .update(updateData)
      .eq('id', id)
      .eq('school_id', schoolId)
      .select()
      .single();

    if (error) {
      throw mapDatabaseError(error);
    }

    logDatabase('UPDATE', 'students', { schoolId, studentId: id });
    logger.info('Student updated', { studentId: id, schoolId });

    res.json({
      success: true,
      message: 'Student updated successfully',
      data: { student },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete/Deactivate student (soft delete)
 */
export const deleteStudent = async (req, res, next) => {
  try {
    const { id } = req.params;
    const schoolId = req.schoolId;
    const { hard = false } = req.query;

    // Verify student exists and belongs to this school
    const { data: existingStudent, error: fetchError } = await supabaseAdmin
      .from('students')
      .select('id')
      .eq('id', id)
      .eq('school_id', schoolId)
      .single();

    if (fetchError || !existingStudent) {
      throw ErrorTypes.NOT_FOUND('Student');
    }

    if (hard === 'true') {
      // Hard delete
      const { error } = await supabaseAdmin
        .from('students')
        .delete()
        .eq('id', id)
        .eq('school_id', schoolId);

      if (error) {
        throw mapDatabaseError(error);
      }

      logDatabase('DELETE', 'students', { schoolId, studentId: id });
      logger.info('Student deleted (hard)', { studentId: id, schoolId });

      res.json({
        success: true,
        message: 'Student permanently deleted',
      });
    } else {
      // Soft delete by updating status
      const { data: student, error } = await supabaseAdmin
        .from('students')
        .update({ status: 'inactive' })
        .eq('id', id)
        .eq('school_id', schoolId)
        .select()
        .single();

      if (error) {
        throw mapDatabaseError(error);
      }

      logDatabase('UPDATE', 'students', { schoolId, studentId: id, action: 'deactivate' });
      logger.info('Student deactivated', { studentId: id, schoolId });

      res.json({
        success: true,
        message: 'Student deactivated successfully',
        data: { student },
      });
    }
  } catch (error) {
    next(error);
  }
};

/**
 * Bulk import students
 */
export const bulkImportStudents = async (req, res, next) => {
  try {
    const { students } = req.body;
    const schoolId = req.schoolId;

    if (!Array.isArray(students) || students.length === 0) {
      throw new ApiError(400, 'Please provide an array of students to import', null, 'INVALID_INPUT');
    }

    if (students.length > 100) {
      throw new ApiError(400, 'Cannot import more than 100 students at a time', null, 'BATCH_TOO_LARGE');
    }

    // Add school_id to all students
    const studentsWithSchool = students.map(student => ({
      ...student,
      school_id: schoolId,
      status: student.status || 'active',
    }));

    // Validate required fields
    const invalidStudents = studentsWithSchool.filter(s => !s.first_name || !s.last_name);
    if (invalidStudents.length > 0) {
      throw new ApiError(400, 'All students must have first_name and last_name',
        { invalidCount: invalidStudents.length }, 'VALIDATION_ERROR');
    }

    const { data, error } = await supabaseAdmin
      .from('students')
      .insert(studentsWithSchool)
      .select();

    if (error) {
      throw mapDatabaseError(error);
    }

    logDatabase('INSERT', 'students', { schoolId, count: data.length, action: 'bulk_import' });
    logger.info('Bulk student import completed', { count: data.length, schoolId });

    res.status(201).json({
      success: true,
      message: `${data.length} students imported successfully`,
      data: {
        imported: data.length,
        students: data,
      },
    });
  } catch (error) {
    next(error);
  }
};

export default {
  getStudents,
  getStudentById,
  createStudent,
  updateStudent,
  deleteStudent,
  bulkImportStudents,
};
