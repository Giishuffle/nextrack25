/**
 * Interest Search Module
 * Search for Meta interest targeting options
 */

import { getMetaClient } from './meta-client.js';
import { SEARCH_TYPES } from '../config/constants.js';

/**
 * Interest Search Class
 * Provides methods to search and discover Meta interest targeting options
 */
export class InterestSearch {
  constructor() {
    this.client = getMetaClient();
  }

  /**
   * Search for interests by keyword
   * Uses the /search?type=adinterest endpoint
   *
   * @param {string} query - Search keyword
   * @param {number} limit - Maximum results (default 100)
   * @returns {Array} - Array of interest objects
   */
  async searchInterests(query, limit = 100) {
    if (!query || query.trim().length === 0) {
      throw new Error('Search query is required');
    }

    const response = await this.client.graphApiGet('/search', {
      type: SEARCH_TYPES.AD_INTEREST,
      q: query.trim(),
      limit: Math.min(limit, 1000),
      locale: 'en_US'
    });

    return this.parseInterestResponse(response);
  }

  /**
   * Get interest suggestions based on a seed interest
   * Uses the /search?type=adinterestsuggestion endpoint
   *
   * @param {string} interestName - Seed interest name
   * @param {number} limit - Maximum results
   * @returns {Array} - Array of suggested interest objects
   */
  async getSuggestions(interestName, limit = 50) {
    if (!interestName || interestName.trim().length === 0) {
      throw new Error('Interest name is required');
    }

    const response = await this.client.graphApiGet('/search', {
      type: SEARCH_TYPES.AD_INTEREST_SUGGESTION,
      interest_list: JSON.stringify([interestName.trim()]),
      limit: Math.min(limit, 100),
      locale: 'en_US'
    });

    return this.parseInterestResponse(response);
  }

  /**
   * Validate if interests exist and get their current IDs
   * Interest IDs can change over time, so validation is important
   *
   * @param {string[]} interestNames - Array of interest names to validate
   * @returns {Array} - Array of validated interest objects
   */
  async validateInterests(interestNames) {
    const results = [];
    const notFound = [];

    for (const name of interestNames) {
      try {
        const interests = await this.searchInterests(name, 10);

        // Find exact match first
        const exactMatch = interests.find(i =>
          i.name.toLowerCase() === name.toLowerCase()
        );

        // Otherwise, use the first result (closest match)
        const match = exactMatch || interests[0];

        if (match) {
          results.push({
            ...match,
            originalQuery: name,
            exactMatch: !!exactMatch
          });
        } else {
          notFound.push(name);
        }
      } catch (error) {
        notFound.push(name);
      }
    }

    return {
      found: results,
      notFound,
      successRate: results.length / interestNames.length
    };
  }

  /**
   * Browse targeting categories
   * @param {string} type - Category type (interests, behaviors, demographics)
   * @returns {Array} - Array of category objects
   */
  async browseCategories(type = 'interests') {
    const response = await this.client.graphApiGet('/search', {
      type: SEARCH_TYPES.TARGETING_CATEGORY,
      class: type
    });

    return response.data || [];
  }

  /**
   * Search for behaviors (purchase behaviors, device usage, etc.)
   * @param {string} query - Search query
   * @param {number} limit - Maximum results
   * @returns {Array} - Array of behavior objects
   */
  async searchBehaviors(query, limit = 50) {
    const response = await this.client.graphApiGet('/search', {
      type: 'adTargetingCategory',
      class: 'behaviors',
      q: query,
      limit
    });

    return (response.data || []).map(item => ({
      id: item.id,
      name: item.name,
      type: 'behavior',
      description: item.description || null,
      audienceSize: item.audience_size || 0,
      path: item.path || []
    }));
  }

  /**
   * Get interest details by ID
   * @param {string} interestId - Interest ID
   * @returns {Object} - Interest details
   */
  async getInterestById(interestId) {
    const response = await this.client.graphApiGet(`/${interestId}`, {
      fields: 'id,name,audience_size,path,description,topic'
    });

    return {
      id: response.id,
      name: response.name,
      audienceSize: response.audience_size || 0,
      path: response.path || [],
      description: response.description || null,
      topic: response.topic || null
    };
  }

  /**
   * Parse interest response from API
   * @param {Object} response - Raw API response
   * @returns {Array} - Parsed interest objects
   */
  parseInterestResponse(response) {
    if (!response || !response.data) {
      return [];
    }

    return response.data.map(interest => ({
      id: interest.id,
      name: interest.name,
      audienceSizeLowerBound: interest.audience_size_lower_bound || 0,
      audienceSizeUpperBound: interest.audience_size_upper_bound || 0,
      audienceSize: interest.audience_size || 0,
      path: interest.path || [],
      type: interest.type || 'interest',
      description: interest.description || null,
      topic: interest.topic || null
    }));
  }

  /**
   * Format audience size for display
   * @param {Object} interest - Interest object
   * @returns {string} - Formatted audience range
   */
  formatAudienceSize(interest) {
    const lower = interest.audienceSizeLowerBound || interest.audienceSize || 0;
    const upper = interest.audienceSizeUpperBound || interest.audienceSize || 0;

    const format = (num) => {
      if (num >= 1000000000) return `${(num / 1000000000).toFixed(1)}B`;
      if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
      if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
      return num.toString();
    };

    if (lower === upper || upper === 0) {
      return format(lower);
    }

    return `${format(lower)} - ${format(upper)}`;
  }
}

// Default singleton instance
export default new InterestSearch();
