import { supabase } from '../config/supabase.js';

/**
 * Get all classes
 */
export const getClasses = async (req, res, next) => {
  try {
    const { grade, section } = req.query;

    let query = supabase
      .from('classes')
      .select('*');

    if (grade) query = query.eq('grade', grade);
    if (section) query = query.eq('section', section);

    const { data: classes, error } = await query.order('grade', { ascending: true });

    if (error) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    res.json({
      success: true,
      count: classes.length,
      data: classes
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get class by ID with enrolled students
 */
export const getClassById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const { data: classData, error } = await supabase
      .from('classes')
      .select(`
        *,
        enrollments:class_enrollments(
          student:students(*)
        )
      `)
      .eq('id', id)
      .single();

    if (error || !classData) {
      return res.status(404).json({
        success: false,
        error: 'Class not found'
      });
    }

    res.json({
      success: true,
      data: classData
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create new class
 */
export const createClass = async (req, res, next) => {
  try {
    const classData = req.body;

    const { data: newClass, error } = await supabase
      .from('classes')
      .insert([classData])
      .select()
      .single();

    if (error) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    res.status(201).json({
      success: true,
      message: 'Class created successfully',
      data: newClass
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update class
 */
export const updateClass = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const { data: updatedClass, error } = await supabase
      .from('classes')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    res.json({
      success: true,
      message: 'Class updated successfully',
      data: updatedClass
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Enroll student in class
 */
export const enrollStudent = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { student_id } = req.body;

    const { data: enrollment, error } = await supabase
      .from('class_enrollments')
      .insert([{
        class_id: id,
        student_id
      }])
      .select()
      .single();

    if (error) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    res.status(201).json({
      success: true,
      message: 'Student enrolled successfully',
      data: enrollment
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Remove student from class
 */
export const removeStudent = async (req, res, next) => {
  try {
    const { id, studentId } = req.params;

    const { error } = await supabase
      .from('class_enrollments')
      .delete()
      .eq('class_id', id)
      .eq('student_id', studentId);

    if (error) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    res.json({
      success: true,
      message: 'Student removed from class successfully'
    });
  } catch (error) {
    next(error);
  }
};

export default {
  getClasses,
  getClassById,
  createClass,
  updateClass,
  enrollStudent,
  removeStudent
};
