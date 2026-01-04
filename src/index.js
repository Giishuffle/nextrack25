/**
 * SM Data Analyzer
 * Meta Advertising Cost Analyzer using Phantom Probing methodology
 *
 * Main entry point for programmatic usage
 */

// Configuration
import { config, paths, getAdAccountId } from './config/index.js';
import { OPTIMIZATION_GOALS, SPEND_RANGE, DEFAULT_TARGETING } from './config/constants.js';

// API modules
import { getMetaClient, MetaApiClient } from './api/meta-client.js';
import deliveryEstimate, { DeliveryEstimateFetcher } from './api/delivery-estimate.js';
import interestSearch, { InterestSearch } from './api/interest-search.js';

// Calculators
import metricsCalculator, { MetricsCalculator } from './calculators/metrics-calculator.js';
import { linearRegression, predict } from './calculators/regression.js';

// Mappers
import iabMapper, { IABToMetaMapper } from './mappers/iab-to-meta.js';

// Storage
import { resultsStore, cacheStore, JsonStore, ProbeResultsStore } from './storage/json-store.js';

/**
 * Main Analyzer Class
 * High-level API for running phantom probes and analyzing ad costs
 */
export class MetaAdAnalyzer {
  constructor() {
    this.client = getMetaClient();
    this.deliveryEstimate = deliveryEstimate;
    this.interestSearch = interestSearch;
    this.metricsCalculator = metricsCalculator;
    this.iabMapper = iabMapper;
    this.resultsStore = resultsStore;
  }

  /**
   * Validate API connection
   * @returns {Object} - Validation result with account info
   */
  async validateConnection() {
    return this.client.validateConnection();
  }

  /**
   * Run a complete probe for an industry
   * This is the main "phantom probe" - gets cost estimates without spending money
   *
   * @param {string} industry - Industry category name
   * @param {Object} options - Probe options
   * @returns {Object} - Complete probe results with metrics
   */
  async probeIndustry(industry, options = {}) {
    // Get interests for the industry
    const interests = await this.iabMapper.getInterestsForCategory(industry);

    if (interests.length === 0) {
      throw new Error(`No interests found for industry: ${industry}. Use getSupportedIndustries() to see available options.`);
    }

    // Fetch delivery estimate from Meta API
    const estimate = await this.deliveryEstimate.probeIndustry(interests, {
      countries: options.countries || [config.DEFAULT_COUNTRY],
      ageMin: options.ageMin || DEFAULT_TARGETING.AGE_MIN,
      ageMax: options.ageMax || DEFAULT_TARGETING.AGE_MAX,
      genders: options.genders,
      optimizationGoal: options.optimizationGoal || OPTIMIZATION_GOALS.LINK_CLICKS
    });

    // Calculate metrics from the curve
    const metrics = this.metricsCalculator.calculateAllMetrics(estimate);
    const summary = this.metricsCalculator.generateSummary(metrics);

    return {
      industry,
      interests,
      estimate,
      metrics,
      summary,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Probe with custom interests (bypass industry mapping)
   * @param {Array} interests - Array of interest objects with id and name
   * @param {Object} options - Probe options
   * @returns {Object} - Probe results
   */
  async probeWithInterests(interests, options = {}) {
    const estimate = await this.deliveryEstimate.probeIndustry(interests, options);
    const metrics = this.metricsCalculator.calculateAllMetrics(estimate);
    const summary = this.metricsCalculator.generateSummary(metrics);

    return {
      interests,
      estimate,
      metrics,
      summary,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Search for interests by keyword
   * @param {string} query - Search query
   * @param {number} limit - Max results
   * @returns {Array} - Array of interest objects
   */
  async searchInterests(query, limit = 20) {
    return this.interestSearch.searchInterests(query, limit);
  }

  /**
   * Get supported industry categories
   * @returns {string[]} - Array of industry names
   */
  getSupportedIndustries() {
    return this.iabMapper.getSupportedCategories();
  }

  /**
   * Get probe history
   * @param {Object} options - Filter options
   * @returns {Array} - Past probe results
   */
  getHistory(options = {}) {
    if (options.industry) {
      return this.resultsStore.getByIndustry(options.industry);
    }
    if (options.limit) {
      return this.resultsStore.getLatest(options.limit);
    }
    return this.resultsStore.getAll();
  }

  /**
   * Save a probe result
   * @param {Object} result - Probe result from probeIndustry()
   * @returns {boolean} - Success status
   */
  saveResult(result) {
    return this.resultsStore.saveResult(
      result.industry,
      { interests: result.interests },
      result.summary
    );
  }

  /**
   * Get summary statistics
   * @returns {Object} - Summary of all probes
   */
  getSummary() {
    return this.resultsStore.getSummary();
  }
}

// Create default analyzer instance
const analyzer = new MetaAdAnalyzer();

// Export everything for flexible usage
export {
  // Configuration
  config,
  paths,
  getAdAccountId,
  OPTIMIZATION_GOALS,
  SPEND_RANGE,
  DEFAULT_TARGETING,

  // API clients
  getMetaClient,
  MetaApiClient,
  DeliveryEstimateFetcher,
  InterestSearch,

  // Instances
  deliveryEstimate,
  interestSearch,
  metricsCalculator,
  iabMapper,
  resultsStore,
  cacheStore,

  // Classes
  MetricsCalculator,
  IABToMetaMapper,
  JsonStore,
  ProbeResultsStore,

  // Utilities
  linearRegression,
  predict
};

// Default export
export default analyzer;
