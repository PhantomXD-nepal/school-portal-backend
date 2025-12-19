import { supabase, supabaseAdmin } from "../config/supabase.js";
import { ApiError, ErrorTypes } from "../utils/apiError.js";
import cache, { cacheTTL } from "../utils/cache.js";
import logger, { logAuth } from "../utils/logger.js";

/**
 * Middleware to verify authentication token
 */

const authCacheKeys = {
  userToken: (token) => `auth:token:${token.substring(0, 20)}`,
  userRoles: (userId) => `auth:roles:${userId}`,
  userSession: (userId) => `auth:session:${userId}`,
};

export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      throw ErrorTypes.UNAUTHORIZED("No authentication token provided");
    }

    if (!authHeader.startsWith("Bearer ")) {
      throw ErrorTypes.UNAUTHORIZED("Invalid authorization header format. Use: Bearer <token>");
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    if (!token || token.trim() === "") {
      throw ErrorTypes.UNAUTHORIZED("Empty authentication token");
    }

    //Try getting user fmr the auth cahce authCacheKeys
    const cacheKey = authCacheKeys.userToken(token);
    const cachedUser = cache.get(cacheKey);

    if (cachedUser) {
      req.user = cachedUser;
      logAuth("Token verified (cached)", cachedUser.id, { email: cachedUser.email });
      return next();
    }

    // Verify the JWT token with Supabase
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error) {
      logger.warn("Token verification failed", { error: error.message });

      if (error.message.includes("expired")) {
        throw ErrorTypes.TOKEN_EXPIRED();
      }
      throw ErrorTypes.TOKEN_INVALID();
    }

    if (!user) {
      throw ErrorTypes.TOKEN_INVALID();
    }

    cache.set(cacheKey, user, cacheTTL.SHORT);

    cache.set(authCacheKeys.userSession(user.id), user, cacheTTL.SHORT);

    // Attach user to request object
    req.user = user;

    logAuth("Token verified(fresh)", user.id, { email: user.email });
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
        throw ErrorTypes.UNAUTHORIZED("User not authenticated");
      }

      const userId = req.user.id;
      const rolesCacheKey = authCacheKeys.userRoles(userId);

      // Try to get roles from cache
      let roleNames = cache.get(rolesCacheKey);

      if (!roleNames) {
        // Cache miss - fetch from database
        const { data: userRoles, error } = await supabaseAdmin
          .from("user_roles")
          .select("role:roles(name)")
          .eq("user_id", userId);

        if (error) {
          logger.error("Failed to fetch user roles", { userId, error: error.message });
          throw ErrorTypes.INTERNAL_ERROR("Failed to verify user permissions");
        }

        if (!userRoles || userRoles.length === 0) {
          // Check user metadata for role as fallback
          const metadataRole = req.user.user_metadata?.role;
          if (metadataRole && allowedRoles.includes(metadataRole)) {
            req.userRole = metadataRole;
            req.userRoles = [metadataRole];
            // Cache the metadata role
            cache.set(rolesCacheKey, [metadataRole], cacheTTL.MEDIUM);
            return next();
          }

          throw new ApiError(403, "No role assigned to this user. Please contact an administrator", null, "NO_ROLE");
        }

        // Extract role names
        roleNames = userRoles.map((ur) => ur.role?.name).filter(Boolean);

        // Cache roles for 5 minutes (roles don't change frequently)
        cache.set(rolesCacheKey, roleNames, cacheTTL.MEDIUM);
      }

      // Check if user has any of the allowed roles
      const hasPermission = roleNames.some((role) => allowedRoles.includes(role));

      if (!hasPermission) {
        logAuth("Access denied - insufficient permissions", userId, {
          userRoles: roleNames,
          requiredRoles: allowedRoles,
        });
        throw new ApiError(
          403,
          `This action requires one of the following roles: ${allowedRoles.join(", ")}`,
          { requiredRoles: allowedRoles, userRoles: roleNames },
          "INSUFFICIENT_PERMISSIONS",
        );
      }

      req.userRole = roleNames[0]; // Primary role
      req.userRoles = roleNames; // All roles

      logAuth("Authorization passed", userId, {
        role: req.userRole,
        cached: !!cache.get(rolesCacheKey),
      });
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

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return next();
    }

    const token = authHeader.substring(7);

    if (!token || token.trim() === "") {
      return next();
    }

    const cacheKey = authCacheKeys.userToken(token);
    const cachedUser = cache.get(cacheKey);

    if (cachedUser) {
      req.user = cachedUser;
      return next();
    }

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (!error && user) {
      req.user = user;
      cache.set(cacheKey, user, cacheTTL.SHORT);
    }

    next();
  } catch (error) {
    // For optional auth, we don't fail on errors
    logger.warn("Optional auth failed", { error: error.message });
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
      const isAdmin = req.userRoles?.includes("admin") || req.userRole === "admin";
      if (isAdmin) {
        return next();
      }

      // Get the owner ID from the resource
      const ownerId = await getOwnerId(req);

      if (ownerId !== req.user.id) {
        throw ErrorTypes.FORBIDDEN("You can only access or modify your own resources");
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

export default { authenticate, authorize, optionalAuth, authorizeOwnerOrAdmin };
