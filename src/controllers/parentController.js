import { supabase, supabaseAdmin } from '../config/supabase.js';

/**
 * Register a student (child) for the logged-in parent
 */
export const registerChild = async (req, res, next) => {
  let authUserId = null;

  try {
    const { email, password, first_name, last_name, date_of_birth, gender, grade, relationship } = req.body;
    const parentUserId = req.user.id;

    // 1. Verify parent and get school_id
    const { data: parentData, error: parentError } = await supabaseAdmin
      .from('parents')
      .select('id, school_id')
      .eq('user_id', parentUserId)
      .single();

    if (parentError || !parentData) {
      return res.status(404).json({
        success: false,
        error: 'Parent profile not found'
      });
    }

    const parentId = parentData.id;
    const schoolId = parentData.school_id;

    if (!schoolId) {
      return res.status(400).json({
        success: false,
        error: 'Parent is not associated with any school'
      });
    }

    // 2. Create student user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name,
          last_name,
          role: 'student'
        }
      }
    });

    if (authError) {
      return res.status(400).json({
        success: false,
        error: authError.message
      });
    }

    authUserId = authData.user.id;

    // 3. Create user record
    const { error: userError } = await supabaseAdmin
      .from('users')
      .insert([{
        id: authUserId,
        email,
        first_name,
        last_name,
        status: 'active'
      }]);

    if (userError) {
      throw new Error(`Failed to create user record: ${userError.message}`);
    }

    // 4. Assign 'student' role
    const { data: roleData } = await supabaseAdmin
      .from('roles')
      .select('id')
      .eq('name', 'student')
      .single();

    const { error: roleError } = await supabaseAdmin
      .from('user_roles')
      .insert([{
        user_id: authUserId,
        role_id: roleData.id
      }]);

    if (roleError) {
      throw new Error(`Failed to assign role: ${roleError.message}`);
    }

    // 5. Create student profile linked to school
    const { data: studentData, error: studentError } = await supabaseAdmin
      .from('students')
      .insert([{
        user_id: authUserId,
        school_id: schoolId,
        first_name,
        last_name,
        email,
        date_of_birth,
        gender,
        grade,
        status: 'active'
      }])
      .select()
      .single();

    if (studentError) {
      throw new Error(`Failed to create student profile: ${studentError.message}`);
    }

    // 6. Link student to parent
    const { error: relationError } = await supabaseAdmin
      .from('student_parent_relations')
      .insert([{
        student_id: studentData.id,
        parent_id: parentId,
        relationship: relationship || 'guardian',
        is_primary: true
      }]);

    if (relationError) {
      throw new Error(`Failed to link student to parent: ${relationError.message}`);
    }

    res.status(201).json({
      success: true,
      message: 'Student registered successfully',
      data: {
        student: studentData,
        user_id: authUserId
      }
    });

  } catch (error) {
    // Rollback
    if (authUserId) {
      await supabaseAdmin.auth.admin.deleteUser(authUserId);
    }
    next(error);
  }
};

/**
 * Get all children for the logged-in parent
 */
export const getChildren = async (req, res, next) => {
  try {
    const parentUserId = req.user.id;

    // Get parent ID
    const { data: parentData } = await supabaseAdmin
      .from('parents')
      .select('id')
      .eq('user_id', parentUserId)
      .single();

    if (!parentData) {
      return res.status(404).json({ success: false, error: 'Parent profile not found' });
    }

    // Get children
    const { data: children, error } = await supabaseAdmin
      .from('student_parent_relations')
      .select(`
        student:students (
          id,
          first_name,
          last_name,
          grade,
          school_id
        )
      `)
      .eq('parent_id', parentData.id);

    if (error) {
      throw new Error(error.message);
    }

    res.json({
      success: true,
      data: children.map(c => c.student)
    });
  } catch (error) {
    next(error);
  }
};
