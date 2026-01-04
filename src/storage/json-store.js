/**
 * JSON File Storage Module
 * Simple file-based storage for MVP
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { paths } from '../config/index.js';

/**
 * Base JSON Store Class
 */
export class JsonStore {
  constructor(filename) {
    this.filepath = join(paths.output, filename);
    this.ensureDirectory();
  }

  /**
   * Ensure the output directory exists
   */
  ensureDirectory() {
    const dir = dirname(this.filepath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Read data from JSON file
   * @returns {any} - Parsed JSON data or null
   */
  read() {
    if (!existsSync(this.filepath)) {
      return null;
    }

    try {
      const data = readFileSync(this.filepath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      console.error(`Error reading ${this.filepath}: ${error.message}`);
      return null;
    }
  }

  /**
   * Write data to JSON file
   * @param {any} data - Data to write
   * @returns {boolean} - Success status
   */
  write(data) {
    try {
      this.ensureDirectory();
      writeFileSync(this.filepath, JSON.stringify(data, null, 2), 'utf-8');
      return true;
    } catch (error) {
      console.error(`Error writing ${this.filepath}: ${error.message}`);
      return false;
    }
  }

  /**
   * Append item to array in JSON file
   * @param {any} item - Item to append
   * @returns {boolean} - Success status
   */
  append(item) {
    const existing = this.read() || [];
    existing.push({
      ...item,
      timestamp: new Date().toISOString()
    });
    return this.write(existing);
  }

  /**
   * Clear all data
   * @returns {boolean} - Success status
   */
  clear() {
    return this.write([]);
  }

  /**
   * Check if store has data
   * @returns {boolean} - True if file exists and has data
   */
  hasData() {
    const data = this.read();
    return Array.isArray(data) && data.length > 0;
  }

  /**
   * Get item count
   * @returns {number} - Number of items
   */
  count() {
    const data = this.read();
    return Array.isArray(data) ? data.length : 0;
  }
}

/**
 * Probe Results Store
 * Stores phantom probe results
 */
export class ProbeResultsStore extends JsonStore {
  constructor() {
    super('probe-results.json');
  }

  /**
   * Save a probe result
   * @param {string} industry - Industry name
   * @param {Object} targeting - Targeting info
   * @param {Object} metrics - Calculated metrics
   * @returns {boolean} - Success status
   */
  saveResult(industry, targeting, metrics) {
    return this.append({
      industry,
      targeting,
      metrics,
      country: targeting.countries?.[0] || 'US',
      currency: 'USD'
    });
  }

  /**
   * Get results by industry
   * @param {string} industry - Industry name
   * @returns {Array} - Matching results
   */
  getByIndustry(industry) {
    const all = this.read() || [];
    return all.filter(r =>
      r.industry.toLowerCase() === industry.toLowerCase()
    );
  }

  /**
   * Get results by country
   * @param {string} country - Country code
   * @returns {Array} - Matching results
   */
  getByCountry(country) {
    const all = this.read() || [];
    return all.filter(r =>
      r.country.toUpperCase() === country.toUpperCase()
    );
  }

  /**
   * Get results within date range
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Array} - Matching results
   */
  getByDateRange(startDate, endDate) {
    const all = this.read() || [];
    return all.filter(r => {
      const timestamp = new Date(r.timestamp);
      return timestamp >= startDate && timestamp <= endDate;
    });
  }

  /**
   * Get all results
   * @returns {Array} - All results
   */
  getAll() {
    return this.read() || [];
  }

  /**
   * Get latest results (most recent first)
   * @param {number} limit - Max results
   * @returns {Array} - Latest results
   */
  getLatest(limit = 10) {
    const all = this.read() || [];
    return all
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);
  }

  /**
   * Get summary statistics
   * @returns {Object} - Summary stats
   */
  getSummary() {
    const all = this.read() || [];

    if (all.length === 0) {
      return {
        totalProbes: 0,
        industries: [],
        dateRange: null
      };
    }

    const industries = [...new Set(all.map(r => r.industry))];
    const dates = all.map(r => new Date(r.timestamp));

    return {
      totalProbes: all.length,
      industries,
      industryCount: industries.length,
      dateRange: {
        first: new Date(Math.min(...dates)).toISOString(),
        last: new Date(Math.max(...dates)).toISOString()
      },
      avgCPM: this.calculateAverage(all, 'metrics.cpm'),
      avgCTR: this.calculateAverage(all, 'metrics.ctr'),
      avgCPC: this.calculateAverage(all, 'metrics.cpc')
    };
  }

  /**
   * Calculate average of a nested property
   * @param {Array} items - Array of items
   * @param {string} path - Property path (e.g., 'metrics.cpm')
   * @returns {number|null} - Average value
   */
  calculateAverage(items, path) {
    const values = items
      .map(item => {
        const parts = path.split('.');
        let value = item;
        for (const part of parts) {
          value = value?.[part];
        }
        return value;
      })
      .filter(v => v !== null && v !== undefined && !isNaN(v));

    if (values.length === 0) return null;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }
}

/**
 * Interest Cache Store
 * Caches interest search results to reduce API calls
 */
export class InterestCacheStore extends JsonStore {
  constructor() {
    super('../cache/interest-cache.json');
    this.ttlHours = 24;
  }

  /**
   * Get cached interests for a query
   * @param {string} query - Search query
   * @returns {Array|null} - Cached results or null
   */
  get(query) {
    const cache = this.read() || {};
    const key = query.toLowerCase().trim();
    const entry = cache[key];

    if (!entry) return null;

    // Check if cache is expired
    const age = Date.now() - new Date(entry.timestamp).getTime();
    const maxAge = this.ttlHours * 60 * 60 * 1000;

    if (age > maxAge) {
      return null;
    }

    return entry.data;
  }

  /**
   * Set cached interests for a query
   * @param {string} query - Search query
   * @param {Array} data - Interest data
   */
  set(query, data) {
    const cache = this.read() || {};
    const key = query.toLowerCase().trim();

    cache[key] = {
      data,
      timestamp: new Date().toISOString()
    };

    this.write(cache);
  }

  /**
   * Clear expired cache entries
   */
  clearExpired() {
    const cache = this.read() || {};
    const maxAge = this.ttlHours * 60 * 60 * 1000;
    const now = Date.now();

    const cleaned = {};
    for (const [key, entry] of Object.entries(cache)) {
      const age = now - new Date(entry.timestamp).getTime();
      if (age <= maxAge) {
        cleaned[key] = entry;
      }
    }

    this.write(cleaned);
  }
}

// Export default instances
export const resultsStore = new ProbeResultsStore();
export const cacheStore = new InterestCacheStore();

export default resultsStore;
