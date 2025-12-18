import fs from 'fs';
import path from 'path';

class SimpleCache {
  constructor() {
    this.cache = new Map();
    this.defaultTTL = 5 * 60 * 1000; // 5 minutes default

    // File persistence setup
    this.cacheDir = path.resolve(process.cwd(), '.cache');
    this.cacheFile = path.join(this.cacheDir, 'data.json');
    this.saveTimeout = null;

    // Load existing cache
    this.loadFromDisk();

    // Clean up expired entries every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60 * 1000);
  }

  /**
   * Load cache from disk
   */
  loadFromDisk() {
    try {
      if (fs.existsSync(this.cacheFile)) {
        const rawData = fs.readFileSync(this.cacheFile, 'utf8');
        const data = JSON.parse(rawData);

        // Convert array back to Map and filter expired
        const now = Date.now();
        for (const [key, item] of data) {
          if (now < item.expiresAt) {
            this.cache.set(key, item);
          }
        }
        console.log(`[CACHE] Loaded ${this.cache.size} entries from disk`);
      }
    } catch (err) {
      console.error('[CACHE] Failed to load cache:', err.message);
    }
  }

  /**
   * Save cache to disk (debounced)
   */
  saveToDisk() {
    if (this.saveTimeout) clearTimeout(this.saveTimeout);

    this.saveTimeout = setTimeout(() => {
      try {
        if (!fs.existsSync(this.cacheDir)) {
          fs.mkdirSync(this.cacheDir, { recursive: true });
        }

        // Convert Map to array for JSON serialization
        const data = Array.from(this.cache.entries());
        fs.writeFileSync(this.cacheFile, JSON.stringify(data), 'utf8');
      } catch (err) {
        console.error('[CACHE] Failed to save cache:', err.message);
      }
    }, 1000); // Wait 1 second after last write to save
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
      this.saveToDisk();
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
    this.saveToDisk();
  }

  /**
   * Delete a specific key from cache
   * @param {string} key - Cache key
   */
  delete(key) {
    this.cache.delete(key);
    this.saveToDisk();
  }

  /**
   * Delete all keys matching a pattern
   * @param {string} pattern - Pattern to match (supports * wildcard at end)
   */
  deletePattern(pattern) {
    const prefix = pattern.replace('*', '');
    let modified = false;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
        modified = true;
      }
    }
    if (modified) this.saveToDisk();
  }

  /**
   * Clear all cached values
   */
  clear() {
    this.cache.clear();
    this.saveToDisk();
  }

  /**
   * Clean up expired entries
   */
  cleanup() {
    const now = Date.now();
    let modified = false;
    for (const [key, item] of this.cache.entries()) {
      if (now > item.expiresAt) {
        this.cache.delete(key);
        modified = true;
      }
    }
    if (modified) this.saveToDisk();
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
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      // Force immediate save on destroy/exit
      try {
        if (!fs.existsSync(this.cacheDir)) {
          fs.mkdirSync(this.cacheDir, { recursive: true });
        }
        const data = Array.from(this.cache.entries());
        fs.writeFileSync(this.cacheFile, JSON.stringify(data), 'utf8');
      } catch (err) {
        // ignore
      }
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
