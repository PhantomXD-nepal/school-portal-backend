import { supabase, supabaseAdmin } from '../config/supabase.js';
import { ApiError, ErrorTypes } from '../utils/apiError.js';
import logger, { logAuth } from '../utils/logger.js';

/**
 * Middleware to verify authentication token
 */
export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      throw ErrorTypes.UNAUTHORIZED('No authentication token provided');
    }

    if (!authHeader.startsWith('Bearer ')) {
      throw ErrorTypes.UNAUTHORIZED('Invalid authorization header format. Use: Bearer <token>');
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    if (!token || token.trim() === '') {
      throw ErrorTypes.UNAUTHORIZED('Empty authentication token');
    }

    // Verify the JWT token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error) {
      logger.warn('Token verification failed', { error: error.message });

      if (error.message.includes('expired')) {
        throw ErrorTypes.TOKEN_EXPIRED();
      }
      throw ErrorTypes.TOKEN_INVALID();
    }

    if (!user) {
      throw ErrorTypes.TOKEN_INVALID();
    }

    // Attach user to request object
    req.user = user;

    logAuth('Token verified', user.id, { email: user.email });
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware to check if user has required role
 */
export const authorize = (...allowedRoles) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        throw ErrorTypes.UNAUTHORIZED('User not authenticated');
      }

      // Fetch user role from database
      const { data: userRoles, error } = await supabaseAdmin
        .from('user_roles')
        .select('role:roles(name)')
        .eq('user_id', req.user.id);

      if (error) {
        logger.error('Failed to fetch user roles', { userId: req.user.id, error: error.message });
        throw ErrorTypes.INTERNAL_ERROR('Failed to verify user permissions');
      }

      if (!userRoles || userRoles.length === 0) {
        // Check user metadata for role as fallback
        const metadataRole = req.user.user_metadata?.role;
        if (metadataRole && allowedRoles.includes(metadataRole)) {
          req.userRole = metadataRole;
          return next();
        }

        throw new ApiError(403, 'No role assigned to this user. Please contact an administrator', null, 'NO_ROLE');
      }

      // Get all role names
      const roleNames = userRoles.map(ur => ur.role?.name).filter(Boolean);

      // Check if user has any of the allowed roles
      const hasPermission = roleNames.some(role => allowedRoles.includes(role));

      if (!hasPermission) {
        logAuth('Access denied - insufficient permissions', req.user.id, {
          userRoles: roleNames,
          requiredRoles: allowedRoles
        });
        throw new ApiError(403,
          `This action requires one of the following roles: ${allowedRoles.join(', ')}`,
          { requiredRoles: allowedRoles, userRoles: roleNames },
          'INSUFFICIENT_PERMISSIONS'
        );
      }

      req.userRole = roleNames[0]; // Primary role
      req.userRoles = roleNames; // All roles

      logAuth('Authorization passed', req.user.id, { role: req.userRole });
      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Optional authentication - attaches user if token present but doesn't require it
 */
export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.substring(7);

    if (!token || token.trim() === '') {
      return next();
    }

    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (!error && user) {
      req.user = user;
    }

    next();
  } catch (error) {
    // For optional auth, we don't fail on errors
    logger.warn('Optional auth failed', { error: error.message });
    next();
  }
};

/**
 * Middleware to check if user is the resource owner or an admin
 */
export const authorizeOwnerOrAdmin = (getOwnerId) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        throw ErrorTypes.UNAUTHORIZED();
      }

      // Check if user is admin
      const isAdmin = req.userRoles?.includes('admin') || req.userRole === 'admin';
      if (isAdmin) {
        return next();
      }

      // Get the owner ID from the resource
      const ownerId = await getOwnerId(req);

      if (ownerId !== req.user.id) {
        throw ErrorTypes.FORBIDDEN('You can only access or modify your own resources');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

export default { authenticate, authorize, optionalAuth, authorizeOwnerOrAdmin };
