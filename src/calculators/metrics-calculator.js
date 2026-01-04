/**
 * Metrics Calculator
 * Calculates CPM, CTR, and CPC from the daily_outcomes_curve data
 * using linear regression on the specified spend range
 */

import { linearRegression, weightedAverage } from './regression.js';
import { SPEND_RANGE } from '../config/constants.js';

/**
 * Metrics Calculator Class
 */
export class MetricsCalculator {
  constructor(options = {}) {
    // Spend range for regression analysis (default: $20-$100)
    this.minSpend = options.minSpend || SPEND_RANGE.MIN;
    this.maxSpend = options.maxSpend || SPEND_RANGE.MAX;
  }

  /**
   * Filter curve data points within the spend range
   * @param {Array} curve - Array of curve data points
   * @returns {Array} - Filtered data points
   */
  filterSpendRange(curve) {
    return curve.filter(point =>
      point.spend >= this.minSpend && point.spend <= this.maxSpend
    );
  }

  /**
   * Calculate CPM using linear regression
   * CPM = (delta_spend / delta_impressions) * 1000
   *
   * @param {Array} curve - Daily outcomes curve
   * @returns {number} - CPM value in dollars
   */
  calculateCPM(curve) {
    let filtered = this.filterSpendRange(curve);

    // If not enough points in range, use all available points
    if (filtered.length < 2) {
      filtered = curve.filter(p => p.impressions > 0);
    }

    if (filtered.length < 2) {
      throw new Error('Insufficient data points for CPM calculation');
    }

    // Extract spend (x) and impressions (y)
    const spendValues = filtered.map(p => p.spend);
    const impressionValues = filtered.map(p => p.impressions);

    // Linear regression: impressions = slope * spend + intercept
    const { slope } = linearRegression(spendValues, impressionValues);

    // CPM = (1 / slope) * 1000
    // Because: delta_impressions = slope * delta_spend
    // So: delta_spend / delta_impressions = 1 / slope
    if (slope <= 0) {
      // Fallback: use average CPM from data points
      const avgCpm = weightedAverage(
        filtered.map(p => p.cpm),
        filtered.map(p => p.impressions)
      );
      return this.round(avgCpm, 2);
    }

    const cpm = (1 / slope) * 1000;
    return this.round(cpm, 2);
  }

  /**
   * Calculate CTR using linear regression
   * CTR = (delta_actions / delta_impressions) * 100
   *
   * @param {Array} curve - Daily outcomes curve
   * @returns {number} - CTR percentage
   */
  calculateCTR(curve) {
    let filtered = this.filterSpendRange(curve);

    // If not enough points in range, use all available points
    if (filtered.length < 2) {
      filtered = curve.filter(p => p.impressions > 0 && p.actions > 0);
    }

    if (filtered.length < 2) {
      throw new Error('Insufficient data points for CTR calculation');
    }

    // Extract impressions (x) and actions (y)
    const impressionValues = filtered.map(p => p.impressions);
    const actionValues = filtered.map(p => p.actions);

    // Linear regression: actions = slope * impressions + intercept
    const { slope } = linearRegression(impressionValues, actionValues);

    // CTR = slope * 100 (convert to percentage)
    if (slope <= 0) {
      // Fallback: use weighted average CTR
      const avgCtr = weightedAverage(
        filtered.map(p => p.ctr),
        filtered.map(p => p.impressions)
      );
      return this.round(avgCtr, 3);
    }

    const ctr = slope * 100;
    return this.round(ctr, 3);
  }

  /**
   * Calculate CPC (Cost Per Click)
   * CPC = spend / actions
   *
   * @param {Array} curve - Daily outcomes curve
   * @returns {number} - CPC value in dollars
   */
  calculateCPC(curve) {
    let filtered = this.filterSpendRange(curve);

    // If not enough points in range, use all available points
    if (filtered.length < 2) {
      filtered = curve.filter(p => p.actions > 0);
    }

    if (filtered.length < 1) {
      throw new Error('Insufficient data points for CPC calculation');
    }

    // Use weighted average CPC (weighted by number of actions)
    const cpc = weightedAverage(
      filtered.map(p => p.cpc),
      filtered.map(p => p.actions)
    );

    return this.round(cpc, 2);
  }

  /**
   * Calculate all metrics from a delivery estimate
   * @param {Object} estimate - Delivery estimate response
   * @returns {Object} - All calculated metrics
   */
  calculateAllMetrics(estimate) {
    const curve = estimate.dailyOutcomesCurve;

    if (!curve || curve.length === 0) {
      return {
        cpm: null,
        ctr: null,
        cpc: null,
        audienceSize: estimate.audienceSize || {},
        error: 'No daily_outcomes_curve data available',
        confidence: 'none'
      };
    }

    // Check if curve has all zeros (common for new/low-spend accounts)
    const hasData = curve.some(p => p.spend > 0 || p.impressions > 0);
    if (!hasData) {
      return {
        cpm: null,
        ctr: null,
        cpc: null,
        audienceSize: estimate.audienceSize || {},
        curveDataPoints: curve.length,
        error: 'Account needs more spending history for cost predictions (Zero Returns)',
        zeroReturns: true,
        confidence: 'none'
      };
    }

    const metrics = {
      cpm: null,
      ctr: null,
      cpc: null,
      cpmError: null,
      ctrError: null,
      cpcError: null,
      audienceSize: estimate.audienceSize || {},
      curveDataPoints: curve.length,
      spendRange: {
        min: this.minSpend,
        max: this.maxSpend
      },
      filteredDataPoints: this.filterSpendRange(curve).length
    };

    // Calculate each metric with error handling
    try {
      metrics.cpm = this.calculateCPM(curve);
    } catch (error) {
      metrics.cpmError = error.message;
    }

    try {
      metrics.ctr = this.calculateCTR(curve);
    } catch (error) {
      metrics.ctrError = error.message;
    }

    try {
      metrics.cpc = this.calculateCPC(curve);
    } catch (error) {
      metrics.cpcError = error.message;
    }

    // Add confidence assessment
    metrics.confidence = this.assessConfidence(metrics, curve);

    return metrics;
  }

  /**
   * Generate a human-readable summary
   * @param {Object} metrics - Calculated metrics
   * @returns {Object} - Summary with formatted values
   */
  generateSummary(metrics) {
    return {
      ...metrics,
      // Formatted values
      formattedCPM: metrics.cpm !== null ? `$${metrics.cpm.toFixed(2)}` : 'N/A',
      formattedCTR: metrics.ctr !== null ? `${metrics.ctr.toFixed(2)}%` : 'N/A',
      formattedCPC: metrics.cpc !== null ? `$${metrics.cpc.toFixed(2)}` : 'N/A',
      formattedAudience: this.formatAudienceSize(metrics.audienceSize?.mau),
      // Insights
      insights: this.generateInsights(metrics)
    };
  }

  /**
   * Assess confidence level based on data quality
   * @param {Object} metrics - Calculated metrics
   * @param {Array} curve - The curve data
   * @returns {string} - Confidence level: 'high', 'medium', 'low', 'none'
   */
  assessConfidence(metrics, curve) {
    let score = 0;

    // Check if metrics were calculated successfully
    if (metrics.cpm !== null) score += 25;
    if (metrics.ctr !== null) score += 25;
    if (metrics.cpc !== null) score += 20;

    // Check data point density
    if (metrics.curveDataPoints >= 10) score += 15;
    else if (metrics.curveDataPoints >= 5) score += 10;
    else if (metrics.curveDataPoints >= 2) score += 5;

    // Check audience size
    const mau = metrics.audienceSize?.mau || 0;
    if (mau > 1000000) score += 15;
    else if (mau > 100000) score += 10;
    else if (mau > 10000) score += 5;

    // Convert score to confidence level
    if (score >= 80) return 'high';
    if (score >= 50) return 'medium';
    if (score >= 20) return 'low';
    return 'none';
  }

  /**
   * Generate insights based on metrics
   * @param {Object} metrics - Calculated metrics
   * @returns {Array} - Array of insight strings
   */
  generateInsights(metrics) {
    const insights = [];

    if (metrics.cpm !== null) {
      if (metrics.cpm < 5) {
        insights.push('Low CPM indicates affordable reach in this market');
      } else if (metrics.cpm > 20) {
        insights.push('High CPM suggests competitive market or premium audience');
      }
    }

    if (metrics.ctr !== null) {
      if (metrics.ctr > 2) {
        insights.push('Above-average CTR indicates high audience relevance');
      } else if (metrics.ctr < 0.5) {
        insights.push('Low CTR may require creative optimization');
      }
    }

    if (metrics.cpc !== null) {
      if (metrics.cpc < 0.5) {
        insights.push('Low CPC makes this audience cost-effective for traffic');
      } else if (metrics.cpc > 2) {
        insights.push('High CPC - consider broader targeting to reduce costs');
      }
    }

    return insights;
  }

  /**
   * Format audience size with K/M suffixes
   * @param {number} num - Audience size
   * @returns {string} - Formatted string
   */
  formatAudienceSize(num) {
    if (!num) return 'Unknown';
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  }

  /**
   * Round number to specified decimal places
   * @param {number} num - Number to round
   * @param {number} decimals - Decimal places
   * @returns {number} - Rounded number
   */
  round(num, decimals) {
    const factor = Math.pow(10, decimals);
    return Math.round(num * factor) / factor;
  }
}

// Default singleton instance
export default new MetricsCalculator();
