import { supabase, supabaseAdmin } from '../config/supabase.js';

/**
 * Get all announcements
 */
export const getAnnouncements = async (req, res, next) => {
  try {
    const schoolId = req.headers['x-school-id'];

    if (!schoolId) {
      return res.status(400).json({
        success: false,
        error: 'School ID is required'
      });
    }

    // Get user's role from the authenticated user
    let userRole = null;
    if (req.user) {
      // Fetch user role from database
      const { data: userRoles, error: roleError } = await supabaseAdmin
        .from('user_roles')
        .select('role:roles(name)')
        .eq('user_id', req.user.id);

      if (!roleError && userRoles && userRoles.length > 0) {
        userRole = userRoles[0].role?.name;
      } else {
        // Fallback to metadata
        userRole = req.user.user_metadata?.role;
      }
    }

    // Build query - get all announcements for this school
    let query = supabaseAdmin
      .from('announcements')
      .select('*')
      .eq('school_id', schoolId);

    // If user is authenticated, filter by target_role
    // Show announcements targeted to 'all' OR to the user's specific role
    if (userRole) {
      query = query.or(`target_role.eq.all,target_role.eq.${userRole}`);
    } else {
      // If no authenticated user, only show 'all' announcements
      query = query.eq('target_role', 'all');
    }

    // Execute query with ordering
    const { data: announcements, error } = await query.order('created_at', { ascending: false });

    const { data:ann, err} = await supabaseAdmin.from('announcements').select('*');
    console.log(ann, err);

    if (error) {
      console.error('Error fetching announcements:', error);
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    res.json({
      success: true,
      count: announcements ? announcements.length : 0,
      data: announcements || []
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get announcement by ID
 */
export const getAnnouncementById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const { data: announcement, error } = await supabase
      .from('announcements')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !announcement) {
      return res.status(404).json({
        success: false,
        error: 'Announcement not found'
      });
    }

    res.json({
      success: true,
      data: announcement
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create new announcement
 */
export const createAnnouncement = async (req, res, next) => {
  try {
    const schoolId = req.headers['x-school-id'];

    if (!schoolId) {
      return res.status(400).json({
        success: false,
        error: 'School ID is required to create an announcement'
      });
    }

    const announcementData = {
      ...req.body,
      school_id: schoolId,
      created_by: req.user.id
    };

    const { data: announcement, error } = await supabaseAdmin
      .from('announcements')
      .insert([announcementData])
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
      message: 'Announcement created successfully',
      data: announcement
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update announcement
 */
export const updateAnnouncement = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const { data: announcement, error } = await supabase
      .from('announcements')
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
      message: 'Announcement updated successfully',
      data: announcement
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete announcement
 */
export const deleteAnnouncement = async (req, res, next) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('announcements')
      .delete()
      .eq('id', id);

    if (error) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    res.json({
      success: true,
      message: 'Announcement deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Mark announcement as read
 */
export const markAsRead = async (req, res, next) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('announcement_recipients')
      .insert([{
        announcement_id: id,
        user_id: req.user.id,
        read_at: new Date().toISOString()
      }])
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
      message: 'Announcement marked as read',
      data
    });
  } catch (error) {
    next(error);
  }
};

export default {
  getAnnouncements,
  getAnnouncementById,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  markAsRead
};
