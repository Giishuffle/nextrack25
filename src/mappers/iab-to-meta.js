/**
 * IAB to Meta Interest Mapper
 * Maps industry categories to Meta interest targeting
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { paths } from '../config/index.js';
import interestSearch from '../api/interest-search.js';

/**
 * IAB to Meta Mapper Class
 * Provides mapping between IAB taxonomy categories and Meta interest targeting
 */
export class IABToMetaMapper {
  constructor() {
    this.mappingFile = join(paths.mappings, 'industry-interests.json');
    this.cache = new Map();
    this.loadMappings();
  }

  /**
   * Load pre-defined mappings from JSON file
   */
  loadMappings() {
    if (existsSync(this.mappingFile)) {
      try {
        const data = readFileSync(this.mappingFile, 'utf-8');
        const mappings = JSON.parse(data);

        for (const [category, interests] of Object.entries(mappings)) {
          this.cache.set(category.toLowerCase(), interests);
        }
      } catch (error) {
        console.warn(`Warning: Could not load mappings from ${this.mappingFile}: ${error.message}`);
      }
    }
  }

  /**
   * Get Meta interests for an industry category
   * @param {string} category - Industry category name
   * @returns {Array} - Array of Meta interest objects
   */
  async getInterestsForCategory(category) {
    const key = category.toLowerCase().trim();

    // Check cache first
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }

    // Search Meta API for matching interests
    const interests = await this.searchForCategory(category);

    // Cache the results
    if (interests.length > 0) {
      this.cache.set(key, interests);
    }

    return interests;
  }

  /**
   * Search Meta API for interests matching a category
   * @param {string} category - Category name
   * @returns {Array} - Array of interest objects
   */
  async searchForCategory(category) {
    try {
      // Try direct search first
      const directResults = await interestSearch.searchInterests(category, 20);

      if (directResults.length > 0) {
        // Return top 10 most relevant (by audience size)
        return directResults
          .sort((a, b) => (b.audienceSize || 0) - (a.audienceSize || 0))
          .slice(0, 10)
          .map(i => ({
            id: i.id,
            name: i.name
          }));
      }

      // If no direct results, try getting suggestions
      const suggestions = await interestSearch.getSuggestions(category, 20);

      return suggestions.slice(0, 10).map(i => ({
        id: i.id,
        name: i.name
      }));
    } catch (error) {
      console.warn(`Could not search for category "${category}": ${error.message}`);
      return [];
    }
  }

  /**
   * Get all supported (pre-mapped) industry categories
   * @returns {string[]} - Array of category names
   */
  getSupportedCategories() {
    return Array.from(this.cache.keys()).sort();
  }

  /**
   * Check if a category has pre-defined mappings
   * @param {string} category - Category name
   * @returns {boolean} - True if category is pre-mapped
   */
  isSupported(category) {
    return this.cache.has(category.toLowerCase().trim());
  }

  /**
   * Add or update a category mapping
   * @param {string} category - Category name
   * @param {Array} interests - Array of interest objects
   */
  setMapping(category, interests) {
    this.cache.set(category.toLowerCase().trim(), interests);
  }

  /**
   * Get category info with interests
   * @param {string} category - Category name
   * @returns {Object} - Category info with interests
   */
  async getCategoryInfo(category) {
    const key = category.toLowerCase().trim();
    const interests = await this.getInterestsForCategory(category);

    return {
      category: key,
      isPreMapped: this.cache.has(key),
      interestCount: interests.length,
      interests: interests
    };
  }

  /**
   * Validate all pre-mapped interests (check if IDs are still valid)
   * This should be run periodically as Meta interest IDs can change
   *
   * @returns {Object} - Validation report
   */
  async validateAllMappings() {
    const report = {
      categories: [],
      totalCategories: this.cache.size,
      validCategories: 0,
      invalidInterests: []
    };

    for (const [category, interests] of this.cache.entries()) {
      const interestNames = interests.map(i => i.name);
      const validation = await interestSearch.validateInterests(interestNames);

      const categoryReport = {
        category,
        total: interests.length,
        found: validation.found.length,
        notFound: validation.notFound,
        successRate: validation.successRate
      };

      report.categories.push(categoryReport);

      if (validation.successRate >= 0.8) {
        report.validCategories++;
      }

      if (validation.notFound.length > 0) {
        report.invalidInterests.push({
          category,
          interests: validation.notFound
        });
      }
    }

    return report;
  }
}

// Default singleton instance
export default new IABToMetaMapper();
