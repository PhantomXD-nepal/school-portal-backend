/**
 * Simple in-memory cache with TTL (Time To Live)
 * For a read-heavy backend, this reduces database queries
 */

class SimpleCache {
  constructor() {
    this.cache = new Map();
    this.defaultTTL = 5 * 60 * 1000; // 5 minutes default

    // Clean up expired entries every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60 * 1000);
  }

  /**
   * Get a value from cache
   * @param {string} key - Cache key
   * @returns {any|null} - Cached value or null if not found/expired
   */
  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;

    if (Date.now() > item.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    // Log cache hit in yellow
    console.log('\x1b[33m%s\x1b[0m', `[CACHE HIT] ${key}`);

    return item.value;
  }

  /**
   * Set a value in cache
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttl - Time to live in milliseconds (optional)
   */
  set(key, value, ttl = this.defaultTTL) {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttl
    });
  }

  /**
   * Delete a specific key from cache
   * @param {string} key - Cache key
   */
  delete(key) {
    this.cache.delete(key);
  }

  /**
   * Delete all keys matching a pattern
   * @param {string} pattern - Pattern to match (supports * wildcard at end)
   */
  deletePattern(pattern) {
    const prefix = pattern.replace('*', '');
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear all cached values
   */
  clear() {
    this.cache.clear();
  }

  /**
   * Clean up expired entries
   */
  cleanup() {
    const now = Date.now();
    for (const [key, item] of this.cache.entries()) {
      if (now > item.expiresAt) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Get cache stats
   */
  stats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }

  /**
   * Stop the cleanup interval (for graceful shutdown)
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

// Create singleton instance
const cache = new SimpleCache();

// Cache key generators for consistent key naming
export const cacheKeys = {
  school: (id) => `school:${id}`,
  schoolByKey: (key) => `school:key:${key}`,
  schools: (userId) => `schools:user:${userId || 'all'}`,
  students: (schoolId) => `students:${schoolId}`,
  student: (id) => `student:${id}`,
  teachers: (schoolId) => `teachers:${schoolId}`,
  teacher: (id) => `teacher:${id}`,
  userSchool: (email) => `user-school:${email}`,
  stats: (schoolId) => `stats:${schoolId}`,
};

// Cache TTL values (in milliseconds)
export const cacheTTL = {
  SHORT: 1 * 60 * 1000,      // 1 minute - for frequently changing data
  MEDIUM: 5 * 60 * 1000,     // 5 minutes - default
  LONG: 15 * 60 * 1000,      // 15 minutes - for rarely changing data
  VERY_LONG: 60 * 60 * 1000, // 1 hour - for static data like schools
};

export default cache;
