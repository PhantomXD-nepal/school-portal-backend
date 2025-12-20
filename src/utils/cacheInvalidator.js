/**
 * Cache Invalidation Helpers
 * Use these in controllers when making changes that affect cached data
 *
 * This file is a central hub for cache invalidation.
 * To avoid circular dependencies, it does NOT import from controllers.
 */

import { invalidateUserCache } from "../middleware/auth.js";
import {
  invalidateSchoolCache,
  invalidateUserSchoolAccess,
  invalidateUserSuperAdminStatus,
} from "../middleware/schoolValidator.js";
import cache, { cacheKeys } from "../utils/cache.js";
import logger from "../utils/logger.js";

/**
 * Invalidate cache when user roles are updated
 */
export const onUserRolesUpdated = (userId) => {
  invalidateUserCache(userId);
  // Also invalidate any user-specific data
  cache.deletePattern(`user:${userId}:*`);
};

/**
 * Invalidate cache when a user is deleted
 */
export const onUserDeleted = (userId) => {
  invalidateUserCache(userId);
  cache.deletePattern(`user:${userId}:*`);
  // Clear any resources owned by this user
  cache.deletePattern(`*:owner:${userId}`);
};

/**
 * Invalidate cache when school data changes
 */
export const onSchoolDataUpdated = (schoolId) => {
  invalidateSchoolCache(schoolId);
  cache.deletePattern(`school:${schoolId}:*`);
  cache.delete(`stats:${schoolId}`);
};

/**
 * Invalidate student-related caches
 */
export const onStudentUpdated = (studentId, schoolId) => {
  cache.delete(`student:detail:${studentId}`);
  cache.deletePattern(`student:${studentId}:*`);
  if (schoolId) {
    cache.deletePattern(`students:${schoolId}:*`);
    cache.delete(`stats:${schoolId}`);
  }
};

/**
 * Invalidate teacher-related caches
 */
export const onTeacherUpdated = (teacherId, schoolId) => {
  cache.delete(`teacher:detail:${teacherId}`);
  cache.deletePattern(`classes:teacher:${teacherId}*`);
  if (schoolId) {
    cache.deletePattern(`teachers:${schoolId}:*`);
    cache.delete(`stats:${schoolId}`);
  }
};

/**
 * Invalidate when grade is posted
 */
export const onGradePosted = (studentId, classId) => {
  if (studentId) {
    cache.deletePattern(`student:${studentId}:grades*`);
    cache.deletePattern(`grades:student:${studentId}*`);
  }
  if (classId) {
    cache.deletePattern(`grades:class:${classId}*`);
  }
  // Also invalidate general school data cache (for grade summaries)
  cache.deletePattern(`schools:user:*`);
};

/**
 * Invalidate when announcement is created
 */
export const onAnnouncementCreated = (schoolId) => {
  if (schoolId) {
    cache.deletePattern(`announcements:${schoolId}:*`);
    cache.deletePattern(`user:announcements:${schoolId}:*`);
  }
};

/**
 * Invalidate when user is assigned/removed from a school
 */
export const onUserSchoolAssignment = (userId, schoolId) => {
  invalidateUserSchoolAccess(userId);
  if (schoolId) {
    cache.deletePattern(`school:access:*:${schoolId}`);
  }
};

/**
 * Invalidate when user becomes/stops being super admin
 */
export const onSuperAdminStatusChanged = (userId) => {
  invalidateUserSuperAdminStatus(userId);
  onUserRolesUpdated(userId);
};

/**
 * Invalidate when school settings are updated
 */
export const onSchoolSettingsUpdated = (schoolId, schoolKey = null) => {
  onSchoolDataUpdated(schoolId);
  if (schoolKey) {
    cache.delete(`school:key:${schoolKey}`);
  }
};

/**
 * Invalidate when teacher is assigned to school
 */
export const onTeacherAssigned = (teacherId, userId, schoolId) => {
  onTeacherUpdated(teacherId, schoolId);
  invalidateUserSchoolAccess(userId);
};

/**
 * Invalidate when student is enrolled
 */
export const onStudentEnrolled = (studentId, userId, schoolId) => {
  onStudentUpdated(studentId, schoolId);
  invalidateUserSchoolAccess(userId);
};

/**
 * Invalidate when parent is added to school
 */
export const onParentAdded = (parentId, userId, schoolId) => {
  cache.delete(`parent:${parentId}`);
  cache.deletePattern(`parents:${schoolId}*`);
  if (userId) invalidateUserSchoolAccess(userId);
  if (schoolId) cache.delete(`stats:${schoolId}`);
};

/**
 * Invalidate when class is created or updated
 */
export const onClassUpdated = (classId, schoolId) => {
  if (classId) {
    cache.delete(`class:detail:${classId}`);
    cache.deletePattern(`class:${classId}:*`);
  }
  if (schoolId) {
    cache.deletePattern(`classes:${schoolId}:*`);
  }
};

/**
 * Invalidate when student is enrolled in/removed from class
 */
export const onClassEnrollmentChanged = (classId, studentId, schoolId) => {
  onClassUpdated(classId, schoolId);
  if (studentId) {
    cache.deletePattern(`student:${studentId}:classes*`);
  }
};

/**
 * Invalidate when teacher is assigned to/removed from class
 */
export const onClassTeacherChanged = (classId, teacherId, schoolId) => {
  onClassUpdated(classId, schoolId);
  if (teacherId) {
    cache.deletePattern(`classes:teacher:${teacherId}*`);
  }
  cache.deletePattern(`class:access:*:${classId}`);
};

/**
 * Invalidate when attendance is marked
 */
export const onAttendanceMarked = (classId, date, studentIds = []) => {
  if (classId) {
    if (date) cache.delete(`attendance:class:${classId}:${date}`);
    cache.deletePattern(`attendance:class:${classId}:*`);
  }
  studentIds.forEach((studentId) => {
    cache.deletePattern(`attendance:student:${studentId}*`);
  });
};

/**
 * Invalidate when syllabus is updated
 */
export const onSyllabusUpdated = (classId) => {
  if (classId) {
    cache.delete(`syllabus:class:${classId}`);
    cache.deletePattern(`syllabus:class:${classId}:*`);
  }
};

export default {
  onUserRolesUpdated,
  onUserDeleted,
  onSchoolDataUpdated,
  onStudentUpdated,
  onTeacherUpdated,
  onGradePosted,
  onAnnouncementCreated,
  onUserSchoolAssignment,
  onSuperAdminStatusChanged,
  onSchoolSettingsUpdated,
  onTeacherAssigned,
  onStudentEnrolled,
  onParentAdded,
  onClassUpdated,
  onClassEnrollmentChanged,
  onClassTeacherChanged,
  onAttendanceMarked,
  onSyllabusUpdated,
};
