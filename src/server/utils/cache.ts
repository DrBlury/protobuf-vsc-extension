/**
 * Caching utilities for parsed files and computed results
 * Helps avoid redundant parsing and computation
 */

/**
 * Simple in-memory cache with TTL (time-to-live) support
 */
export class Cache<K, V> {
  private cache = new Map<K, { value: V; expiresAt?: number }>();
  private defaultTtl?: number;

  /**
   * Create a new cache
   * @param defaultTtl - Default TTL in milliseconds (optional)
   */
  constructor(defaultTtl?: number) {
    this.defaultTtl = defaultTtl;
  }

  /**
   * Get a value from the cache
   * @param key - The cache key
   * @returns The cached value or undefined if not found or expired
   */
  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      return undefined;
    }

    // Check if expired
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.value;
  }

  /**
   * Set a value in the cache
   * @param key - The cache key
   * @param value - The value to cache
   * @param ttl - Optional TTL in milliseconds (overrides default)
   */
  set(key: K, value: V, ttl?: number): void {
    const expiresAt = ttl || this.defaultTtl;
    this.cache.set(key, {
      value,
      expiresAt: expiresAt ? Date.now() + expiresAt : undefined,
    });
  }

  /**
   * Check if a key exists in the cache
   * @param key - The cache key
   * @returns True if the key exists and is not expired
   */
  has(key: K): boolean {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    // Check if expired
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Delete a value from the cache
   * @param key - The cache key
   * @returns True if the key existed and was deleted
   */
  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all entries from the cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get the number of entries in the cache
   * Note: This may include expired entries that haven't been accessed yet
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Remove expired entries from the cache
   * @returns Number of entries removed
   */
  cleanup(): number {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt && now > entry.expiresAt) {
        this.cache.delete(key);
        removed++;
      }
    }

    return removed;
  }
}

/**
 * Content hash-based cache
 * Useful for caching parsed results based on file content
 */
export class ContentHashCache<V> {
  private cache = new Map<string, { value: V; hash: string }>();

  /**
   * Get a value from the cache if the hash matches
   * @param key - The cache key
   * @param hash - The content hash to check
   * @returns The cached value if hash matches, undefined otherwise
   */
  get(key: string, hash: string): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      return undefined;
    }

    // If hash doesn't match, invalidate the cache entry
    if (entry.hash !== hash) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.value;
  }

  /**
   * Set a value in the cache with its content hash
   * @param key - The cache key
   * @param value - The value to cache
   * @param hash - The content hash
   */
  set(key: string, value: V, hash: string): void {
    this.cache.set(key, { value, hash });
  }

  /**
   * Delete a value from the cache
   * @param key - The cache key
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all entries from the cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get the number of entries in the cache
   */
  get size(): number {
    return this.cache.size;
  }
}

/**
 * Simple hash function for strings
 * @param str - The string to hash
 * @returns A simple hash value
 */
export function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}
