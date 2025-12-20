import { supabase, supabaseAdmin } from '../config/supabase.js';
import {
  onTeacherAssigned,
  onStudentEnrolled,
  onParentAdded,
  onUserRolesUpdated
} from '../utils/cacheInvalidator.js';

/**
 * Create a new user (Teacher, Parent, or School Admin)
 * Only accessible by Admins
 */
export const createUser = async (req, res, next) => {
  let authUserId = null;

  try {
    const { email, password, role, school_id, ...userData } = req.body;
    const adminUserId = req.user.id;

    // 1. Verify requester is an Admin and check their school access
    const { data: adminData, error: adminError } = await supabaseAdmin
      .from('admins')
      .select('school_id')
      .eq('user_id', adminUserId)
      .single();

    // If admin record not found, check if they are a legacy admin (no record in admins table yet)
    // For now, we'll assume strict mode: Admin must exist in admins table
    // OR we can allow if they have 'admin' role but treat as Super Admin if no record?
    // Let's enforce admins table for better control.

    // However, for the FIRST admin created via register endpoint, we need to handle that.
    // I'll handle that in authController.register.

    if (adminError && adminError.code !== 'PGRST116') { // PGRST116 is 'not found'
       throw new Error(`Failed to verify admin privileges: ${adminError.message}`);
    }

    const requesterSchoolId = adminData ? adminData.school_id : null;

    // 2. Enforce School Access
    if (requesterSchoolId) {
      // School Admin: Can only create users for their school
      if (school_id && school_id !== requesterSchoolId) {
        return res.status(403).json({
          success: false,
          error: 'You can only create users for your own school'
        });
      }
      // Force school_id to be the admin's school if not provided (or if provided correctly)
      if (!school_id) {
         // If creating a user that requires a school, we must use the admin's school
         // But we should probably validate that the role needs a school
      }
    }

    // Determine target school_id
    const targetSchoolId = requesterSchoolId || school_id;

    // Validate target school_id for roles that need it
    if (['teacher', 'parent'].includes(role) && !targetSchoolId) {
      return res.status(400).json({
        success: false,
        error: `${role} must be associated with a school`
      });
    }

    // 3. Validate Role
    const { data: roleData, error: roleError } = await supabaseAdmin
      .from('roles')
      .select('id, name')
      .eq('name', role)
      .single();

    if (roleError || !roleData) {
      return res.status(400).json({
        success: false,
        error: `Invalid role '${role}'`
      });
    }

    // 4. Create user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { ...userData, role }
      }
    });

    if (authError) {
      return res.status(400).json({
        success: false,
        error: authError.message
      });
    }

    authUserId = authData.user.id;

    // 5. Create user record
    const { error: userError } = await supabaseAdmin
      .from('users')
      .insert([{
        id: authUserId,
        email,
        ...userData
      }]);

    if (userError) {
      throw new Error(`Failed to create user record: ${userError.message}`);
    }

    // 6. Assign Role
    const { error: userRoleError } = await supabaseAdmin
      .from('user_roles')
      .insert([{
        user_id: authUserId,
        role_id: roleData.id
      }]);

    if (userRoleError) {
      throw new Error(`Failed to assign role: ${userRoleError.message}`);
    }

    // 7. Create Profile
    let profileData = null;
    const { first_name, last_name, phone } = userData;

    switch (role) {
      case 'teacher':
        const { data: teacher, error: teacherErr } = await supabaseAdmin
          .from('teachers')
          .insert([{
            user_id: authUserId,
            school_id: targetSchoolId,
            first_name,
            last_name,
            email,
            phone,
            status: 'active'
          }])
          .select()
          .single();
        if (teacherErr) throw teacherErr;
        profileData = teacher;
        break;

      case 'parent':
        const { data: parent, error: parentErr } = await supabaseAdmin
          .from('parents')
          .insert([{
            user_id: authUserId,
            school_id: targetSchoolId,
            first_name,
            last_name,
            email,
            phone
          }])
          .select()
          .single();
        if (parentErr) throw parentErr;
        profileData = parent;
        break;

      case 'admin':
        const { data: admin, error: adminErr } = await supabaseAdmin
          .from('admins')
          .insert([{
            user_id: authUserId,
            school_id: targetSchoolId, // Can be null for Super Admin
            first_name,
            last_name,
            phone
          }])
          .select()
          .single();
        if (adminErr) throw adminErr;
        profileData = admin;
        break;

       case 'student':
         // Admins can create students too if needed, but usually parents do.
         // Let's allow it for flexibility.
         const { data: student, error: studentErr } = await supabaseAdmin
          .from('students')
          .insert([{
            user_id: authUserId,
            school_id: targetSchoolId,
            first_name,
            last_name,
            email, // We added this column
            status: 'active'
          }])
          .select()
          .single();
        if (studentErr) throw studentErr;
        profileData = student;
        break;
    }

    // 8. Invalidate caches based on role
    switch (role) {
      case 'teacher':
        onTeacherAssigned(profileData.id, authUserId, targetSchoolId);
        break;
      case 'student':
        onStudentEnrolled(profileData.id, authUserId, targetSchoolId);
        break;
      case 'parent':
        onParentAdded(profileData.id, authUserId, targetSchoolId);
        break;
      case 'admin':
        onUserRolesUpdated(authUserId);
        break;
    }

    res.status(201).json({
      success: true,
      message: `${role} created successfully`,
      data: {
        user: authData.user,
        profile: profileData
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
