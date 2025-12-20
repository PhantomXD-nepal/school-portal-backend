import { supabase } from '../config/supabase.js';
import { onGradePosted } from '../utils/cacheInvalidator.js';

/**
 * Get grades with filters
 */
export const getGrades = async (req, res, next) => {
  try {
    const { student_id, class_id, subject } = req.query;

    let query = supabase
      .from('grades')
      .select('*');

    if (student_id) query = query.eq('student_id', student_id);
    if (class_id) query = query.eq('class_id', class_id);
    if (subject) query = query.eq('subject', subject);

    const { data: grades, error } = await query.order('created_at', { ascending: false });

    if (error) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    res.json({
      success: true,
      count: grades.length,
      data: grades
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get student grades
 */
export const getStudentGrades = async (req, res, next) => {
  try {
    const { studentId } = req.params;

    const { data: grades, error } = await supabase
      .from('grades')
      .select('*')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    res.json({
      success: true,
      count: grades.length,
      data: grades
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Post new grade
 */
export const postGrade = async (req, res, next) => {
  try {
    const gradeData = req.body;

    const { data: grade, error } = await supabase
      .from('grades')
      .insert([gradeData])
      .select()
      .single();

    if (error) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    // Invalidate grade caches
    if (grade.student_id && grade.class_id) {
      onGradePosted(grade.student_id, grade.class_id);
    }

    res.status(201).json({
      success: true,
      message: 'Grade posted successfully',
      data: grade
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update grade
 */
export const updateGrade = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const { data: grade, error } = await supabase
      .from('grades')
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

    // Invalidate grade caches
    if (grade.student_id && grade.class_id) {
      onGradePosted(grade.student_id, grade.class_id);
    }

    res.json({
      success: true,
      message: 'Grade updated successfully',
      data: grade
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete grade
 */
export const deleteGrade = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { student_id, class_id } = req.query; // Optional: pass these to invalidate cache

    const { error } = await supabase
      .from('grades')
      .delete()
      .eq('id', id);

    if (error) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    // Invalidate grade caches if student/class info provided
    if (student_id && class_id) {
      onGradePosted(student_id, class_id);
    }

    res.json({
      success: true,
      message: 'Grade deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Bulk upload grades
 */
export const bulkUploadGrades = async (req, res, next) => {
  try {
    const { grades } = req.body;

    if (!Array.isArray(grades) || grades.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid grades data'
      });
    }

    const { data, error } = await supabase
      .from('grades')
      .insert(grades)
      .select();

    if (error) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    // Invalidate grade caches for each unique student/class combination
    const invalidated = new Set();
    data.forEach(grade => {
      if (grade.student_id && grade.class_id) {
        const key = `${grade.student_id}:${grade.class_id}`;
        if (!invalidated.has(key)) {
          onGradePosted(grade.student_id, grade.class_id);
          invalidated.add(key);
        }
      }
    });

    res.status(201).json({
      success: true,
      message: `${data.length} grades uploaded successfully`,
      data
    });
  } catch (error) {
    next(error);
  }
};

export default {
  getGrades,
  getStudentGrades,
  postGrade,
  updateGrade,
  deleteGrade,
  bulkUploadGrades
};
