import { supabase, supabaseAdmin } from "../config/supabase.js";
import crypto from "crypto";
import logger from "../utils/logger.js";
import cache, { cacheKeys, cacheTTL } from "../utils/cache.js";

// Store for one-time admin registration keys (in production, use Redis or database)
const adminRegistrationKeys = new Map();

/**
 * Generate a one-time admin registration key
 * This should be called manually or through a secure admin endpoint
 */
export const generateAdminKey = () => {
  const key = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  adminRegistrationKeys.set(key, { expiresAt, used: false });

  console.log(adminRegistrationKeys);

  // Clean up expired keys
  for (const [k, v] of adminRegistrationKeys.entries()) {
    if (v.expiresAt < Date.now() || v.used) {
      adminRegistrationKeys.delete(k);
    }
  }

  return key;
};

/**
 * Register a new user (Public Endpoint)
 * Currently only allows Admin registration with a valid key.
 * Teachers and Parents must be registered by an Admin.
 */
export const register = async (req, res, next) => {
  let authUserId = null;

  try {
    const { email, password, role, admin_key, ...userData } = req.body;

    // Assign role (default to 'student' if not specified)
    const userRole = role || "student";

    // STEP 1: Validate role BEFORE creating anything
    const { data: roleData, error: roleError } = await supabaseAdmin
      .from("roles")
      .select("id, name")
      .eq("name", userRole)
      .single();

    if (roleError || !roleData) {
      return res.status(400).json({
        success: false,
        error: `Invalid role '${userRole}'. Valid roles are: admin, teacher, student, parent, finance`,
      });
    }

    // BLOCK direct registration for non-admins
    if (userRole !== "admin") {
      return res.status(403).json({
        success: false,
        error: `${userRole}s cannot register directly. Please contact your school administrator.`,
      });
    }

    // STEP 2: Validate admin registration key
    if (!admin_key) {
      return res.status(403).json({
        success: false,
        error: "Admin registration requires a valid admin_key",
      });
    }

    const keyData = adminRegistrationKeys.get(admin_key);
    if (!keyData || keyData.used || keyData.expiresAt < Date.now()) {
      return res.status(403).json({
        success: false,
        error: "Invalid or expired admin registration key",
      });
    }

    // Mark key as used
    keyData.used = true;

    // STEP 3: Create user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: userData,
      },
    });

    if (authError) {
      return res.status(400).json({
        success: false,
        error: authError.message,
      });
    }

    authUserId = authData.user.id;

    // STEP 4: Create user record in users table
    const { data: user, error: userError } = await supabaseAdmin
      .from("users")
      .insert([
        {
          id: authData.user.id,
          email,
          ...userData,
        },
      ])
      .select()
      .single();

    if (userError) {
      throw new Error(`Failed to create user record: ${userError.message}`);
    }

    // STEP 5: Assign role to user
    const { error: userRoleError } = await supabaseAdmin.from("user_roles").insert([
      {
        user_id: authData.user.id,
        role_id: roleData.id,
      },
    ]);

    if (userRoleError) {
      throw new Error(`Failed to assign role: ${userRoleError.message}`);
    }

    // STEP 6: Create Admin Profile
    // Since this is a self-registered admin via key, we treat them as a Super Admin (no specific school initially)
    const { first_name, last_name, phone } = userData;

    const { data: adminProfile, error: adminProfileError } = await supabaseAdmin
      .from("admins")
      .insert([
        {
          user_id: authData.user.id,
          school_id: null, // Super Admin
          first_name: first_name || "",
          last_name: last_name || "",
          phone: phone || null,
        },
      ])
      .select()
      .single();

    if (adminProfileError) {
      throw new Error(`Failed to create admin profile: ${adminProfileError.message}`);
    }

    res.status(201).json({
      success: true,
      message: "Admin registered successfully",
      data: {
        user: authData.user,
        session: authData.session,
        role: userRole,
        profile: adminProfile,
      },
    });
  } catch (error) {
    // ROLLBACK: Clean up auth user if any step fails
    if (authUserId) {
      try {
        await supabaseAdmin.auth.admin.deleteUser(authUserId);
        console.log(`Rolled back auth user: ${authUserId}`);
      } catch (deleteError) {
        console.error("Failed to rollback auth user:", deleteError);
      }
    }

    // Return error to client
    return res.status(400).json({
      success: false,
      error: error.message || "Registration failed",
    });
  }
};

/**
 * Login user
 */
export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return res.status(401).json({
        success: false,
        error: error.message,
      });
    }

    const userEmail = email.toLowerCase();
    let appRole = "admin"; // Default for admins who register directly
    let userData = null;

    // Check if user is a student
    const { data: student } = await supabaseAdmin
      .from("students")
      .select("id, first_name, last_name, school_id, grade, section")
      .eq("email", userEmail)
      .single();

    if (student) {
      appRole = "student";
      userData = student;
    } else {
      // Check if user is a teacher
      const { data: teacher } = await supabaseAdmin
        .from("teachers")
        .select("id, first_name, last_name, school_id, department")
        .eq("email", userEmail)
        .single();

      if (teacher) {
        appRole = "teacher";
        userData = teacher;
      } else {
        // Check user_roles table for admins
        const { data: userRole } = await supabaseAdmin
          .from("user_roles")
          .select("role:roles(name)")
          .eq("user_id", data.user.id)
          .single();

        if (userRole?.role?.name) {
          appRole = userRole.role.name;
        }
      }
    }

    // Build enhanced user response
    const userResponse = {
      id: data.user.id,
      email: data.user.email,
      role: appRole,
      firstName: userData?.first_name || data.user.user_metadata?.first_name || "",
      lastName: userData?.last_name || data.user.user_metadata?.last_name || "",
      name: userData ? `${userData.first_name || ""} ${userData.last_name || ""}`.trim() : "",
      schoolId: userData?.school_id || null,
    };

    logger.info("Login successful", { email: userEmail, role: appRole });

    res.json({
      success: true,
      message: "Login successful",
      data: {
        user: userResponse,
        session: data.session,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Logout user
 */
export const logout = async (req, res, next) => {
  try {
    const { error } = await supabase.auth.signOut();

    if (error) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }

    res.json({
      success: true,
      message: "Logout successful",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Refresh access token
 */
export const refreshToken = async (req, res, next) => {
  try {
    const { refresh_token } = req.body;

    const { data, error } = await supabase.auth.refreshSession({
      refresh_token,
    });

    if (error) {
      return res.status(401).json({
        success: false,
        error: error.message,
      });
    }

    res.json({
      success: true,
      message: "Token refreshed successfully",
      data: {
        session: data.session,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get current user profile
 */
export const getProfile = async (req, res, next) => {
  try {
    const { data: user, error } = await supabaseAdmin
      .from("users")
      .select(
        `
        *,
        user_roles (
          role:roles (
            name,
            description
          )
        )
      `,
      )
      .eq("id", req.user.id)
      .single();

    if (error) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Generate admin registration key (super admin only)
 * In production, this should be heavily restricted
 */
export const createAdminKey = async (req, res, next) => {
  try {
    const key = generateAdminKey();

    res.json({
      success: true,
      message: "Admin registration key generated (valid for 24 hours, one-time use)",
      data: {
        admin_key: key,
        expires_in: "24 hours",
        note: "This key can only be used once to register an admin user",
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Generate a magic link for a student or teacher
 * If the user doesn't have an auth account, one is created.
 */
export const generateMagicLink = async (req, res, next) => {
  try {
    const { studentId, teacherId } = req.body;

    logger.info("Generating magic link for student/teacher", { studentId, teacherId });

    if (!studentId && !teacherId) {
      return res.status(400).json({
        success: false,
        error: "Either studentId or teacherId is required",
      });
    }

    let person, role, tableName, authUserId;

    if (studentId) {
      // Fetch student details with all relevant data
      const { data, error } = await supabaseAdmin
        .from("students")
        .select(
          "id, email, first_name, last_name, school_id, grade, section, roll_number, status, date_of_birth, address",
        )
        .eq("id", studentId)
        .single();

      if (error || !data) {
        logger.error("Student not found", { studentId, error });
        return res.status(404).json({ success: false, error: "Student not found" });
      }
      person = data;
      role = "student";
      tableName = "students";
    } else {
      // Fetch teacher details with all relevant data
      const { data, error } = await supabaseAdmin
        .from("teachers")
        .select("id, email, first_name, last_name, school_id, department, status, phone")
        .eq("id", teacherId)
        .single();

      if (error || !data) {
        logger.error("Teacher not found", { teacherId, error });
        return res.status(404).json({ success: false, error: "Teacher not found" });
      }
      person = data;
      role = "teacher";
      tableName = "teachers";
    }

    // Fetch school info for setting in localStorage
    const { data: school } = await supabaseAdmin
      .from("schools")
      .select("id, name, school_key")
      .eq("id", person.school_id)
      .single();

    // Determine Email (use existing or generate dummy)
    let email = person.email;
    if (!email) {
      email = `${role}_${person.id}@portal.local`;
    }

    // Prepare User Metadata
    const userMetadata = {
      role: role,
      [`${role}_id`]: person.id,
      school_id: person.school_id,
      school_name: school?.name || null,
      school_key: school?.school_key || null,
      first_name: person.first_name,
      last_name: person.last_name,
      name: `${person.first_name || ""} ${person.last_name || ""}`.trim(),
      phone: person.phone || null,
      address: person.address || null,
      status: person.status || "active",
    };

    // Add role-specific fields
    if (role === "student") {
      userMetadata.grade = person.grade || null;
      userMetadata.section = person.section || null;
      userMetadata.roll_number = person.roll_number || null;
      userMetadata.date_of_birth = person.date_of_birth || null;
    } else if (role === "teacher") {
      userMetadata.department = person.department || null;
      // Note: 'subjects' is not in teachers table schema, removed to prevent issues
    }

    // Invalidate any existing user school cache to ensure fresh data fetch on login
    cache.delete(cacheKeys.userSchool(email));
    let userMetadataUpdated = false;

    // 1. Check if user already exists in our public users table (Fast check)
    const { data: existingUser } = await supabaseAdmin.from("users").select("id").eq("email", email).maybeSingle();

    if (existingUser) {
      authUserId = existingUser.id;
      logger.info("Found existing user in public table, updating metadata", { authUserId, role });

      // Update existing user metadata to reflect the CURRENT requested role context
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(authUserId, {
        user_metadata: userMetadata,
      });

      if (updateError) {
        logger.warn("Failed to update user metadata", { error: updateError.message });
      } else {
        userMetadataUpdated = true;
      }
    } else {
      // 2. Try to create new user in Supabase Auth
      const tempPassword = crypto.randomBytes(16).toString("hex");
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: userMetadata,
      });

      if (!createError && newUser?.user) {
        authUserId = newUser.user.id;
        userMetadataUpdated = true; // Created with data
        logger.info("Created new auth user", { authUserId });
      } else if (createError && createError.message?.includes("already been registered")) {
        // 3. User exists in Auth but not in public.users (Zombie/Sync issue)
        logger.warn(
          "User already registered in Auth but not found in public table. Proceeding to recover ID via link generation.",
        );
        // We will retrieve ID from generateLink response below
      } else if (createError) {
        throw createError;
      }
    }

    // 4. Generate Magic Link (Works for both new and existing users)
    // We do this BEFORE linking steps because generateLink can return the user object if we still don't have the ID
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: email,
      options: {
        redirectTo: `${process.env.FRONTEND_URL || "http://localhost:3000"}/#/magic-login`,
      },
    });

    if (linkError) {
      throw new Error(`Failed to generate magic link: ${linkError.message}`);
    }

    // 5. Recover Auth User ID if we missed it (Zombie case)
    if (!authUserId && linkData?.user) {
      authUserId = linkData.user.id;
      logger.info("Recovered auth user ID from magic link generation", { authUserId });
    }

    if (!authUserId) {
      throw new Error("Failed to determine Auth User ID for magic link.");
    }

    // 6. Update Metadata if it wasn't done yet (Zombie case recovery)
    if (!userMetadataUpdated) {
      await supabaseAdmin.auth.admin.updateUserById(authUserId, {
        user_metadata: userMetadata,
      });
    }

    // 7. ENSURE PUBLIC USER RECORD EXISTS (This is critical because there are no triggers)
    // We must insert into public.users BEFORE we can link students/teachers because they FK to public.users
    const { error: upsertError } = await supabaseAdmin
      .from("users")
      .upsert({
        id: authUserId,
        email: email,
        first_name: person.first_name,
        last_name: person.last_name,
        phone: person.phone,
        status: 'active'
      }, { onConflict: 'id' });

    if (upsertError) {
      logger.error("Failed to upsert public user record", { error: upsertError.message, authUserId });
      // Proceeding might fail on next step, but let's try or should we throw?
      // If this fails, the next update will definitely fail with FK violation.
      throw new Error(`Failed to sync public user record: ${upsertError.message}`);
    }

    // 8. ENSURE RELATIONS ARE CORRECT
    if (authUserId) {
      // Link to Person Table (students/teachers)
      const { error: linkError } = await supabaseAdmin
          .from(tableName)
          .update({ user_id: authUserId })
          .eq("id", person.id);

      if (linkError) {
        logger.warn(`Failed to link auth user to ${tableName}`, { personId: person.id, error: linkError.message });
      }

      // Ensure Role in user_roles
      const { data: roleData } = await supabaseAdmin.from("roles").select("id").eq("name", role).single();

      if (roleData) {
        const { data: existingRole } = await supabaseAdmin
          .from("user_roles")
          .select("id")
          .eq("user_id", authUserId)
          .eq("role_id", roleData.id)
          .maybeSingle();

        if (!existingRole) {
           await supabaseAdmin.from("user_roles").insert([{
              user_id: authUserId,
              role_id: roleData.id
           }]);
        }
      }
    }

    res.json({
      success: true,
      message: "Magic link generated successfully",
      data: {
        link: linkData.properties.action_link,
        email_used: email,
        school: school
          ? {
              id: school.id,
              name: school.name,
              school_key: school.school_key,
            }
          : null,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get the school data for the currently authenticated user
 * Looks up the user in students/teachers tables by email and returns their school
 */
export const getUserSchool = async (req, res, next) => {
  try {
    const userEmail = req.user.email.toLowerCase();

    // Check cache first
    const cacheKey = cacheKeys.userSchool(userEmail);
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      logger.info("Returning cached user school data", { userEmail });
      return res.json(cachedData);
    }

    logger.info("Fetching school for user", { userEmail });

    let userData = null;
    let role = null;
    let schoolId = null;

    // First, try to find user in students table by email
    const { data: student, error: studentError } = await supabaseAdmin
      .from("students")
      .select(
        "id, email, first_name, last_name, school_id, grade, section, roll_number, status, date_of_birth, address, emergency_contact",
      )
      .eq("email", userEmail)
      .single();

    console.log(studentError);

    if (!studentError && student) {
      userData = student;
      role = "student";
      schoolId = student.school_id;
      logger.info("Found user in students table", { studentId: student.id, schoolId });
    } else {
      // Try to find in teachers table by email
      const { data: teacher, error: teacherError } = await supabaseAdmin
        .from("teachers")
        .select("id, email, first_name, last_name, school_id, department, subjects, status, phone, address")
        .eq("email", userEmail)
        .single();

      if (!teacherError && teacher) {
        userData = teacher;
        role = "teacher";
        schoolId = teacher.school_id;
        logger.info("Found user in teachers table", { teacherId: teacher.id, schoolId });
      }
    }

    // If user not found in either table, check admins (admins use Supabase user_id from users table)
    if (!userData) {
      // First find in users table by email, then check admins
      const { data: user } = await supabaseAdmin.from("users").select("id").eq("email", userEmail).single();

      if (user) {
        const { data: admin, error: adminError } = await supabaseAdmin
          .from("admins")
          .select("id, first_name, last_name, school_id, phone")
          .eq("user_id", user.id)
          .single();

        if (!adminError && admin) {
          userData = admin;
          role = "admin";
          schoolId = admin.school_id;
          logger.info("Found user in admins table", { adminId: admin.id, schoolId });
        }
      }
    }

    if (!userData) {
      logger.warn("User not found in any role table", { userEmail });
      return res.status(404).json({
        success: false,
        error: "User profile not found. Please contact your administrator.",
      });
    }

    // Fetch school data if schoolId exists
    let schoolData = null;
    if (schoolId) {
      const { data: school, error: schoolError } = await supabaseAdmin
        .from("schools")
        .select("id, name, school_key, address, phone, email, logo_url, website, timezone")
        .eq("id", schoolId)
        .single();

      if (!schoolError && school) {
        schoolData = school;
      } else {
        logger.warn("School not found", { schoolId, error: schoolError?.message });
      }
    }

    // Build user response based on role
    const userResponse = {
      id: userData.id,
      email: userEmail,
      role: role,
      firstName: userData.first_name,
      lastName: userData.last_name,
      name: `${userData.first_name || ""} ${userData.last_name || ""}`.trim(),
      phone: userData.phone,
      address: userData.address,
      status: userData.status || "active",
    };

    // Add role-specific fields
    if (role === "student") {
      userResponse.grade = userData.grade;
      userResponse.section = userData.section;
      userResponse.rollNumber = userData.roll_number;
      userResponse.dateOfBirth = userData.date_of_birth;
      userResponse.studentId = userData.id;
    } else if (role === "teacher") {
      userResponse.department = userData.department;
      userResponse.subjects = userData.subjects;
      userResponse.teacherId = userData.id;
    } else if (role === "admin") {
      userResponse.adminId = userData.id;
    }

    logger.info("Returning user school data", { userEmail, role, schoolId: schoolData?.id });

    const responseData = {
      success: true,
      data: {
        user: userResponse,
        school: schoolData,
      },
    };

    // Cache the response
    cache.set(cacheKey, responseData, cacheTTL.SHORT);

    res.json(responseData);
  } catch (error) {
    logger.error("Error fetching user school", { error: error.message });
    next(error);
  }
};

/**
 * Get student dashboard data (announcements, attendance, etc.)
 * This endpoint is for students to fetch their personalized dashboard data
 */
export const getStudentDashboard = async (req, res, next) => {
  try {
    const userEmail = req.user.email;
    const schoolId = req.headers["x-school-id"];

    // Check cache first
    const cacheKey = `student-dashboard:${userEmail}`;
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      return res.json(cachedData);
    }

    logger.info("Fetching student dashboard", { userEmail, schoolId });

    // Get student info
    const { data: student } = await supabaseAdmin
      .from("students")
      .select("id, first_name, last_name, grade, section, school_id")
      .eq("email", userEmail)
      .single();

    if (!student) {
      return res.status(404).json({
        success: false,
        error: "Student not found",
      });
    }

    // Get announcements for this school (targeted to students or all)
    const { data: announcements } = await supabaseAdmin
      .from("announcements")
      .select("id, title, content, type, created_at")
      .eq("school_id", student.school_id)
      .or("target_role.eq.student,target_role.eq.all,target_role.is.null")
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(10);

    // Dummy attendance data (since attendance is not fully implemented)
    const today = new Date().toISOString().split("T")[0];
    const dummyAttendance = {
      today: {
        date: today,
        status: "present",
        markedAt: new Date().toISOString(),
      },
      thisWeek: {
        present: 4,
        absent: 0,
        late: 1,
        total: 5,
      },
      thisMonth: {
        present: 18,
        absent: 2,
        late: 2,
        total: 22,
        percentage: 90.9,
      },
    };

    // Dummy upcoming classes
    const dummyUpcomingClasses = [
      { id: "1", subject: "Mathematics", time: "09:00 AM", room: "Room 101" },
      { id: "2", subject: "Science", time: "10:30 AM", room: "Lab 201" },
      { id: "3", subject: "English", time: "12:00 PM", room: "Room 102" },
    ];

    const responseData = {
      success: true,
      data: {
        student: {
          id: student.id,
          name: `${student.first_name} ${student.last_name}`,
          grade: student.grade,
          section: student.section,
        },
        announcements: announcements || [],
        attendance: dummyAttendance,
        upcomingClasses: dummyUpcomingClasses,
      },
    };

    // Cache for 1 minute
    cache.set(cacheKey, responseData, cacheTTL.SHORT);

    res.json(responseData);
  } catch (error) {
    logger.error("Error fetching student dashboard", { error: error.message });
    next(error);
  }
};

export default {
  register,
  login,
  logout,
  refreshToken,
  getProfile,
  generateAdminKey,
  createAdminKey,
  generateMagicLink,
  getUserSchool,
  getStudentDashboard,
};
