import { supabase } from '../config/supabase.js';

/**
 * Get all announcements
 */
export const getAnnouncements = async (req, res, next) => {
  try {
    const { type, target_role } = req.query;

    let query = supabase
      .from('announcements')
      .select('*');

    if (type) query = query.eq('type', type);
    if (target_role) query = query.eq('target_role', target_role);

    const { data: announcements, error } = await query.order('created_at', { ascending: false });

    if (error) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    res.json({
      success: true,
      count: announcements.length,
      data: announcements
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
    const announcementData = {
      ...req.body,
      created_by: req.user.id
    };

    const { data: announcement, error } = await supabase
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
