/**
 * Delivery Estimate Fetcher
 * Core module for fetching ad cost predictions from Meta's API
 * This implements the "Phantom Probing" methodology
 */

import { getMetaClient } from './meta-client.js';
import { config, getAdAccountId } from '../config/index.js';
import { OPTIMIZATION_GOALS, DEFAULT_TARGETING, PLACEMENTS } from '../config/constants.js';

/**
 * Delivery Estimate Fetcher Class
 * Fetches cost predictions without running actual campaigns
 */
export class DeliveryEstimateFetcher {
  constructor() {
    this.client = getMetaClient();
    this.accountId = getAdAccountId();
  }

  /**
   * Build targeting spec for Meta API
   * @param {Object} options - Targeting options
   * @returns {Object} - Meta targeting_spec format
   */
  buildTargetingSpec({
    countries = [config.DEFAULT_COUNTRY],
    ageMin = DEFAULT_TARGETING.AGE_MIN,
    ageMax = DEFAULT_TARGETING.AGE_MAX,
    genders = null,
    interests = [],
    behaviors = [],
    exclusions = [],
    placement = 'all'
  }) {
    const targetingSpec = {
      geo_locations: {
        countries: Array.isArray(countries) ? countries : [countries]
      },
      age_min: ageMin,
      age_max: ageMax
    };

    // Add placement targeting if not 'all'
    if (placement !== 'all' && PLACEMENTS[placement]) {
      const placementConfig = PLACEMENTS[placement];
      if (placementConfig.publisher_platforms) {
        targetingSpec.publisher_platforms = placementConfig.publisher_platforms;
      }
      if (placementConfig.facebook_positions) {
        targetingSpec.facebook_positions = placementConfig.facebook_positions;
      }
      if (placementConfig.instagram_positions) {
        targetingSpec.instagram_positions = placementConfig.instagram_positions;
      }
      if (placementConfig.device_platforms) {
        targetingSpec.device_platforms = placementConfig.device_platforms;
      }
    }

    // Add gender targeting if specified (1 = male, 2 = female)
    if (genders) {
      targetingSpec.genders = Array.isArray(genders) ? genders : [genders];
    }

    // Add interest targeting using flexible_spec (OR logic between interests)
    if (interests.length > 0) {
      targetingSpec.flexible_spec = [{
        interests: interests.map(interest => ({
          id: String(interest.id),
          name: interest.name
        }))
      }];
    }

    // Add behavior targeting if specified
    if (behaviors.length > 0) {
      if (!targetingSpec.flexible_spec) {
        targetingSpec.flexible_spec = [{}];
      }
      targetingSpec.flexible_spec[0].behaviors = behaviors.map(behavior => ({
        id: String(behavior.id),
        name: behavior.name
      }));
    }

    // Add exclusions
    if (exclusions.length > 0) {
      targetingSpec.exclusions = {
        interests: exclusions.map(interest => ({
          id: String(interest.id),
          name: interest.name
        }))
      };
    }

    return targetingSpec;
  }

  /**
   * Fetch delivery estimate from Meta API
   * This is the core "phantom probe" - gets predictions without spending money
   *
   * @param {Object} targetingSpec - Targeting specification
   * @param {string} optimizationGoal - Campaign optimization goal
   * @returns {Object} - Delivery estimate response
   */
  async fetchEstimate(targetingSpec, optimizationGoal = OPTIMIZATION_GOALS.LINK_CLICKS) {
    const params = {
      targeting_spec: JSON.stringify(targetingSpec),
      optimization_goal: optimizationGoal
    };

    if (config.DEBUG_MODE) {
      console.log('Fetching delivery estimate with params:', params);
    }

    try {
      const response = await this.client.graphApiGet(
        `/${this.accountId}/delivery_estimate`,
        params
      );

      return this.parseEstimateResponse(response, optimizationGoal);
    } catch (error) {
      // Handle specific delivery estimate errors
      if (error.message.includes('not enough people')) {
        throw new Error('Audience too small for estimation. Try broader targeting.');
      }
      if (error.message.includes('targeting_spec')) {
        throw new Error('Invalid targeting specification. Check interest IDs.');
      }
      throw new Error(`Delivery estimate failed: ${error.message}`);
    }
  }

  /**
   * Parse the delivery estimate response
   * @param {Object} response - Raw API response
   * @param {string} optimizationGoal - The optimization goal used
   * @returns {Object} - Parsed estimate data
   */
  parseEstimateResponse(response, optimizationGoal) {
    if (!response || !response.data || response.data.length === 0) {
      throw new Error('Empty delivery estimate response - account may need more history');
    }

    const estimate = response.data[0];

    // Parse the daily outcomes curve
    const dailyOutcomesCurve = this.parseDailyOutcomesCurve(estimate.daily_outcomes_curve || []);

    return {
      // Estimate readiness
      estimateReady: estimate.estimate_ready !== false,

      // Audience size estimates
      audienceSize: {
        dau: estimate.estimate_dau || 0,
        mau: estimate.estimate_mau || Math.round((estimate.estimate_mau_lower_bound + estimate.estimate_mau_upper_bound) / 2) || 0,
        mauLowerBound: estimate.estimate_mau_lower_bound || 0,
        mauUpperBound: estimate.estimate_mau_upper_bound || 0
      },

      // Daily outcomes curve (spend vs results prediction)
      dailyOutcomesCurve,

      // Optimization goal used
      optimizationGoal,

      // Bid estimate if available
      bidEstimate: estimate.bid_estimate || null,

      // Raw data points count
      dataPoints: dailyOutcomesCurve.length,

      // Raw response for debugging
      raw: config.DEBUG_MODE ? estimate : undefined
    };
  }

  /**
   * Parse the daily outcomes curve into a standardized format
   * The curve contains spend/impression/action predictions at different budget levels
   *
   * @param {Array} curve - Raw curve data
   * @returns {Array} - Parsed curve with normalized values
   */
  parseDailyOutcomesCurve(curve) {
    if (!Array.isArray(curve) || curve.length === 0) {
      return [];
    }

    return curve.map((point, index) => {
      // Spend is in cents, convert to dollars
      const spendCents = point.spend || 0;
      const spendDollars = spendCents / 100;

      // Impressions
      const impressions = point.impressions || 0;

      // Actions depend on optimization goal (clicks for LINK_CLICKS)
      const actions = point.actions || 0;

      // Reach (unique users)
      const reach = point.reach || 0;

      return {
        index,
        spend: spendDollars,
        spendCents,
        impressions,
        actions,
        reach,
        // Calculate instant metrics for this point
        cpm: impressions > 0 ? (spendDollars / impressions) * 1000 : 0,
        ctr: impressions > 0 ? (actions / impressions) * 100 : 0,
        cpc: actions > 0 ? spendDollars / actions : 0
      };
    });
  }

  /**
   * Convenience method to fetch estimate with industry interests
   * @param {Array} industryInterests - Array of interest objects
   * @param {Object} options - Additional targeting options
   * @returns {Object} - Parsed estimate with metrics
   */
  async probeIndustry(industryInterests, options = {}) {
    const targetingSpec = this.buildTargetingSpec({
      countries: options.countries || [config.DEFAULT_COUNTRY],
      ageMin: options.ageMin || DEFAULT_TARGETING.AGE_MIN,
      ageMax: options.ageMax || DEFAULT_TARGETING.AGE_MAX,
      genders: options.genders || null,
      interests: industryInterests,
      behaviors: options.behaviors || [],
      exclusions: options.exclusions || [],
      placement: options.placement || 'all'
    });

    const optimizationGoal = options.optimizationGoal || OPTIMIZATION_GOALS.LINK_CLICKS;

    const estimate = await this.fetchEstimate(targetingSpec, optimizationGoal);

    return {
      ...estimate,
      targeting: {
        countries: options.countries || [config.DEFAULT_COUNTRY],
        ageRange: `${options.ageMin || DEFAULT_TARGETING.AGE_MIN}-${options.ageMax || DEFAULT_TARGETING.AGE_MAX}`,
        interestCount: industryInterests.length
      }
    };
  }

  /**
   * Probe multiple industries in batch
   * @param {Object} industriesMap - Map of industry name to interests
   * @param {Object} options - Targeting options
   * @returns {Object} - Results by industry
   */
  async probeBatch(industriesMap, options = {}) {
    const results = {};

    for (const [industry, interests] of Object.entries(industriesMap)) {
      try {
        results[industry] = await this.probeIndustry(interests, options);
        results[industry].success = true;
      } catch (error) {
        results[industry] = {
          success: false,
          error: error.message
        };
      }
    }

    return results;
  }
}

// Export optimization goals for external use
export { OPTIMIZATION_GOALS };

// Default singleton instance
export default new DeliveryEstimateFetcher();
