/**
 * Tests for cache utilities
 */

import { Cache, ContentHashCache, simpleHash } from '../cache';

describe('Cache', () => {
  describe('Cache class', () => {
    let cache: Cache<string, string>;

    beforeEach(() => {
      cache = new Cache<string, string>();
    });

    it('should store and retrieve values', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('should return undefined for non-existent keys', () => {
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('should check if key exists', () => {
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('nonexistent')).toBe(false);
    });

    it('should delete values', () => {
      cache.set('key1', 'value1');
      expect(cache.delete('key1')).toBe(true);
      expect(cache.get('key1')).toBeUndefined();
      expect(cache.delete('nonexistent')).toBe(false);
    });

    it('should clear all entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.clear();
      expect(cache.size).toBe(0);
      expect(cache.get('key1')).toBeUndefined();
    });

    it('should return correct size', () => {
      expect(cache.size).toBe(0);
      cache.set('key1', 'value1');
      expect(cache.size).toBe(1);
      cache.set('key2', 'value2');
      expect(cache.size).toBe(2);
    });

    describe('TTL support', () => {
      beforeEach(() => {
        jest.useFakeTimers();
      });

      afterEach(() => {
        jest.useRealTimers();
      });

      it('should expire entries after TTL', () => {
        cache.set('key1', 'value1', 1000);
        expect(cache.get('key1')).toBe('value1');

        jest.advanceTimersByTime(1001);
        expect(cache.get('key1')).toBeUndefined();
      });

      it('should not expire entries before TTL', () => {
        cache.set('key1', 'value1', 1000);
        jest.advanceTimersByTime(999);
        expect(cache.get('key1')).toBe('value1');
      });

      it('should use default TTL when provided', () => {
        const cacheWithTTL = new Cache<string, string>(1000);
        cacheWithTTL.set('key1', 'value1');

        jest.advanceTimersByTime(1001);
        expect(cacheWithTTL.get('key1')).toBeUndefined();
      });

      it('should override default TTL with specific TTL', () => {
        const cacheWithTTL = new Cache<string, string>(1000);
        cacheWithTTL.set('key1', 'value1', 2000);

        jest.advanceTimersByTime(1001);
        expect(cacheWithTTL.get('key1')).toBe('value1');

        jest.advanceTimersByTime(1000);
        expect(cacheWithTTL.get('key1')).toBeUndefined();
      });

      it('should handle entries without TTL', () => {
        cache.set('key1', 'value1');
        jest.advanceTimersByTime(10000);
        expect(cache.get('key1')).toBe('value1');
      });

      it('should remove expired entries on access', () => {
        cache.set('key1', 'value1', 1000);
        jest.advanceTimersByTime(1001);
        expect(cache.has('key1')).toBe(false);
        expect(cache.size).toBe(0);
      });

      it('should cleanup expired entries', () => {
        cache.set('key1', 'value1', 1000);
        cache.set('key2', 'value2', 2000);
        cache.set('key3', 'value3'); // No TTL

        jest.advanceTimersByTime(1001);
        const removed = cache.cleanup();

        expect(removed).toBe(1);
        expect(cache.has('key1')).toBe(false);
        expect(cache.has('key2')).toBe(true);
        expect(cache.has('key3')).toBe(true);
      });
    });
  });

  describe('ContentHashCache', () => {
    let cache: ContentHashCache<string>;

    beforeEach(() => {
      cache = new ContentHashCache<string>();
    });

    it('should store and retrieve values with matching hash', () => {
      cache.set('key1', 'value1', 'hash1');
      expect(cache.get('key1', 'hash1')).toBe('value1');
    });

    it('should return undefined for non-existent keys', () => {
      expect(cache.get('nonexistent', 'hash1')).toBeUndefined();
    });

    it('should invalidate cache when hash does not match', () => {
      cache.set('key1', 'value1', 'hash1');
      expect(cache.get('key1', 'hash2')).toBeUndefined();
      // Entry should be deleted
      expect(cache.get('key1', 'hash1')).toBeUndefined();
    });

    it('should delete values', () => {
      cache.set('key1', 'value1', 'hash1');
      expect(cache.delete('key1')).toBe(true);
      expect(cache.get('key1', 'hash1')).toBeUndefined();
      expect(cache.delete('nonexistent')).toBe(false);
    });

    it('should clear all entries', () => {
      cache.set('key1', 'value1', 'hash1');
      cache.set('key2', 'value2', 'hash2');
      cache.clear();
      expect(cache.size).toBe(0);
    });

    it('should return correct size', () => {
      expect(cache.size).toBe(0);
      cache.set('key1', 'value1', 'hash1');
      expect(cache.size).toBe(1);
      cache.set('key2', 'value2', 'hash2');
      expect(cache.size).toBe(2);
    });

    it('should update value with new hash', () => {
      cache.set('key1', 'value1', 'hash1');
      cache.set('key1', 'value2', 'hash2');
      expect(cache.get('key1', 'hash2')).toBe('value2');
      expect(cache.get('key1', 'hash1')).toBeUndefined();
    });
  });

  describe('simpleHash', () => {
    it('should generate hash for string', () => {
      const hash = simpleHash('test string');
      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
    });

    it('should generate consistent hash for same string', () => {
      const hash1 = simpleHash('test string');
      const hash2 = simpleHash('test string');
      expect(hash1).toBe(hash2);
    });

    it('should generate different hash for different strings', () => {
      const hash1 = simpleHash('test string 1');
      const hash2 = simpleHash('test string 2');
      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty string', () => {
      const hash = simpleHash('');
      expect(hash).toBeDefined();
    });

    it('should handle special characters', () => {
      const hash = simpleHash('!@#$%^&*()');
      expect(hash).toBeDefined();
    });
  });
});
