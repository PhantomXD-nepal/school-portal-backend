import { supabase, supabaseAdmin } from '../config/supabase.js';

/**
 * Get events for a school
 */
export const getEvents = async (req, res, next) => {
  try {
    const schoolId = req.headers['x-school-id'];

    if (!schoolId) {
      return res.status(400).json({
        success: false,
        error: 'School ID is required'
      });
    }

    const { data: events, error } = await supabaseAdmin
      .from('events')
      .select('*')
      .eq('school_id', schoolId)
      .order('start_time', { ascending: true });

    if (error) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    res.json({
      success: true,
      count: events.length,
      data: events
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new event (Admin only)
 */
export const createEvent = async (req, res, next) => {
  try {
    const schoolId = req.headers['x-school-id'];

    if (!schoolId) {
      return res.status(400).json({
        success: false,
        error: 'School ID is required'
      });
    }

    const { title, description, start_time, end_time, location, type } = req.body;

    const eventData = {
      school_id: schoolId,
      title,
      description,
      start_time,
      end_time,
      location,
      type: type || 'general',
      created_by: req.user.id
    };

    const { data: event, error } = await supabaseAdmin
      .from('events')
      .insert([eventData])
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
      message: 'Event created successfully',
      data: event
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update an event (Admin only)
 */
export const updateEvent = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Prevent updating school_id or created_by
    delete updateData.school_id;
    delete updateData.created_by;
    delete updateData.id;

    updateData.updated_at = new Date().toISOString();

    const { data: event, error } = await supabaseAdmin
      .from('events')
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
      message: 'Event updated successfully',
      data: event
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete an event (Admin only)
 */
export const deleteEvent = async (req, res, next) => {
  try {
    const { id } = req.params;

    const { error } = await supabaseAdmin
      .from('events')
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
      message: 'Event deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

export default {
  getEvents,
  createEvent,
  updateEvent,
  deleteEvent
};
