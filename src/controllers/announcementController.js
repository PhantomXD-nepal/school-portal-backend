import { supabase, supabaseAdmin } from "../config/supabase.js";
import cache, { cacheTTL } from "../utils/cache.js";
import logger from "../utils/logger.js";

// Cache key generators for announcements
const announcementCacheKeys = {
  list: (schoolId, userRole) => `announcements:list:${schoolId}:${userRole || "all"}`,
  detail: (id) => `announcements:detail:${id}`,
  userAnnouncements: (schoolId, userId) => `announcements:user:${schoolId}:${userId}`,
};

/**
 * Get all announcements (with caching)
 */
export const getAnnouncements = async (req, res, next) => {
  try {
    const schoolId = req.headers["x-school-id"];

    if (!schoolId) {
      return res.status(400).json({
        success: false,
        error: "School ID is required",
      });
    }

    // Get user's role from the authenticated user
    let userRole = null;
    if (req.user) {
      // Check if role is already in request (from authorize middleware)
      if (req.userRole) {
        userRole = req.userRole;
      } else {
        // Fetch user role from database (this will be cached by auth middleware)
        const { data: userRoles, error: roleError } = await supabaseAdmin
          .from("user_roles")
          .select("role:roles(name)")
          .eq("user_id", req.user.id);

        if (!roleError && userRoles && userRoles.length > 0) {
          userRole = userRoles[0].role?.name;
        } else {
          // Fallback to metadata
          userRole = req.user.user_metadata?.role;
        }
      }
    }

    // Try to get from cache
    const cacheKey = announcementCacheKeys.list(schoolId, userRole);
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
      logger.debug("Announcements served from cache", { schoolId, userRole });
      return res.json(cachedData);
    }

    // Cache miss - fetch from database
    logger.debug("Fetching announcements from database", { schoolId, userRole });

    // Build query - get all announcements for this school
    let query = supabaseAdmin.from("announcements").select("*").eq("school_id", schoolId);

    // If user is authenticated, filter by target_role
    // Show announcements targeted to 'all' OR to the user's specific role
    if (userRole) {
      query = query.or(`target_role.eq.all,target_role.eq.${userRole}`);
    } else {
      // If no authenticated user, only show 'all' announcements
      query = query.eq("target_role", "all");
    }

    // Execute query with ordering
    const { data: announcements, error } = await query.order("created_at", { ascending: false });

    if (error) {
      logger.error("Error fetching announcements:", error);
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }

    const responseData = {
      success: true,
      count: announcements ? announcements.length : 0,
      data: announcements || [],
    };

    // Cache for 2 minutes (announcements change somewhat frequently)
    cache.set(cacheKey, responseData, cacheTTL.SHORT);

    res.json(responseData);
  } catch (error) {
    next(error);
  }
};

/**
 * Get announcement by ID (with caching)
 */
export const getAnnouncementById = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Try cache first
    const cacheKey = announcementCacheKeys.detail(id);
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
      logger.debug("Announcement detail served from cache", { id });
      return res.json(cachedData);
    }

    // Cache miss - fetch from database
    const { data: announcement, error } = await supabase.from("announcements").select("*").eq("id", id).single();

    if (error || !announcement) {
      return res.status(404).json({
        success: false,
        error: "Announcement not found",
      });
    }

    const responseData = {
      success: true,
      data: announcement,
    };

    // Cache for 5 minutes
    cache.set(cacheKey, responseData, cacheTTL.MEDIUM);

    res.json(responseData);
  } catch (error) {
    next(error);
  }
};

/**
 * Create new announcement (with cache invalidation)
 */
export const createAnnouncement = async (req, res, next) => {
  try {
    const schoolId = req.headers["x-school-id"];

    if (!schoolId) {
      return res.status(400).json({
        success: false,
        error: "School ID is required to create an announcement",
      });
    }

    const announcementData = {
      ...req.body,
      school_id: schoolId,
      created_by: req.user.id,
    };

    const { data: announcement, error } = await supabaseAdmin
      .from("announcements")
      .insert([announcementData])
      .select()
      .single();

    if (error) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }

    // Invalidate announcement caches for this school
    invalidateAnnouncementCache(schoolId);

    logger.info("Announcement created", {
      announcementId: announcement.id,
      schoolId,
      targetRole: announcement.target_role,
    });

    res.status(201).json({
      success: true,
      message: "Announcement created successfully",
      data: announcement,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update announcement (with cache invalidation)
 */
export const updateAnnouncement = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Get the announcement first to know which school it belongs to
    const { data: existingAnnouncement } = await supabase
      .from("announcements")
      .select("school_id")
      .eq("id", id)
      .single();

    const { data: announcement, error } = await supabase
      .from("announcements")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }

    // Invalidate caches
    cache.delete(announcementCacheKeys.detail(id));
    if (existingAnnouncement?.school_id) {
      invalidateAnnouncementCache(existingAnnouncement.school_id);
    }

    logger.info("Announcement updated", { announcementId: id });

    res.json({
      success: true,
      message: "Announcement updated successfully",
      data: announcement,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete announcement (with cache invalidation)
 */
export const deleteAnnouncement = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Get the announcement first to know which school it belongs to
    const { data: existingAnnouncement } = await supabase
      .from("announcements")
      .select("school_id")
      .eq("id", id)
      .single();

    const { error } = await supabase.from("announcements").delete().eq("id", id);

    if (error) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }

    // Invalidate caches
    cache.delete(announcementCacheKeys.detail(id));
    if (existingAnnouncement?.school_id) {
      invalidateAnnouncementCache(existingAnnouncement.school_id);
    }

    logger.info("Announcement deleted", { announcementId: id });

    res.json({
      success: true,
      message: "Announcement deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Mark announcement as read (with cache invalidation)
 */
export const markAsRead = async (req, res, next) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from("announcement_recipients")
      .insert([
        {
          announcement_id: id,
          user_id: req.user.id,
          read_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (error) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }

    // Optionally invalidate user-specific announcement cache
    // This depends on whether you're tracking read status in the main query

    res.json({
      success: true,
      message: "Announcement marked as read",
      data,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Helper function to invalidate announcement caches for a school
 */
function invalidateAnnouncementCache(schoolId) {
  // Clear all announcement lists for this school (all roles)
  cache.deletePattern(`announcements:list:${schoolId}:*`);
  cache.deletePattern(`announcements:user:${schoolId}:*`);

  logger.debug("Invalidated announcement cache", { schoolId });
}

/**
 * Export helper for use in other modules
 */
export const invalidateSchoolAnnouncements = invalidateAnnouncementCache;

export default {
  getAnnouncements,
  getAnnouncementById,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  markAsRead,
  invalidateSchoolAnnouncements,
};
