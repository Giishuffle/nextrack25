/**
 * Meta API Client
 * Handles authentication, rate limiting, and base API calls
 */

import bizSdk from 'facebook-nodejs-business-sdk';
import Bottleneck from 'bottleneck';
import axios from 'axios';
import { config, getAdAccountId } from '../config/index.js';
import { META_API } from '../config/constants.js';

const { FacebookAdsApi, AdAccount } = bizSdk;

/**
 * Meta API Client with rate limiting
 */
export class MetaApiClient {
  constructor() {
    this.initialized = false;
    this.api = null;
    this.account = null;
    this.accountId = getAdAccountId();

    // Rate limiter using Bottleneck
    // Meta allows ~200 calls per hour for standard access
    this.limiter = new Bottleneck({
      reservoir: config.API_RATE_LIMIT,
      reservoirRefreshAmount: config.API_RATE_LIMIT,
      reservoirRefreshInterval: 60 * 60 * 1000, // 1 hour
      maxConcurrent: 5,
      minTime: 200 // 200ms between requests
    });

    // Axios instance for direct API calls
    this.axios = axios.create({
      baseURL: `${META_API.BASE_URL}/${config.META_API_VERSION}`,
      timeout: 30000,
      params: {
        access_token: config.META_ACCESS_TOKEN
      }
    });

    this._initialize();
  }

  /**
   * Initialize the Facebook SDK
   */
  _initialize() {
    try {
      this.api = FacebookAdsApi.init(config.META_ACCESS_TOKEN);
      this.api.setDebug(config.DEBUG_MODE);
      this.account = new AdAccount(this.accountId);
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize Meta API:', error.message);
      this.initialized = false;
    }
  }

  /**
   * Execute a rate-limited API call
   * @param {Function} fn - The async function to execute
   * @returns {Promise} - Result of the function
   */
  async rateLimitedCall(fn) {
    return this.limiter.schedule(fn);
  }

  /**
   * Get the Ad Account instance
   * @returns {AdAccount} - Facebook SDK AdAccount instance
   */
  getAccount() {
    return this.account;
  }

  /**
   * Direct Graph API GET call with rate limiting
   * @param {string} endpoint - API endpoint (e.g., '/search')
   * @param {Object} params - Query parameters
   * @returns {Object} - API response data
   */
  async graphApiGet(endpoint, params = {}) {
    return this.rateLimitedCall(async () => {
      try {
        const response = await this.axios.get(endpoint, { params });
        return response.data;
      } catch (error) {
        this._handleApiError(error);
      }
    });
  }

  /**
   * Direct Graph API POST call with rate limiting
   * @param {string} endpoint - API endpoint
   * @param {Object} data - Request body
   * @param {Object} params - Query parameters
   * @returns {Object} - API response data
   */
  async graphApiPost(endpoint, data = {}, params = {}) {
    return this.rateLimitedCall(async () => {
      try {
        const response = await this.axios.post(endpoint, data, { params });
        return response.data;
      } catch (error) {
        this._handleApiError(error);
      }
    });
  }

  /**
   * Handle API errors with meaningful messages
   * @param {Error} error - The caught error
   */
  _handleApiError(error) {
    if (error.response) {
      const { status, data } = error.response;
      const fbError = data.error || {};

      // Rate limit error
      if (status === 429 || fbError.code === 17) {
        throw new Error(`Rate limit exceeded. Please wait before making more requests.`);
      }

      // Authentication error
      if (status === 401 || fbError.code === 190) {
        throw new Error(`Authentication failed. Check your META_ACCESS_TOKEN.`);
      }

      // Permission error
      if (fbError.code === 10 || fbError.code === 200) {
        throw new Error(`Permission denied. Check your app permissions and ad account access.`);
      }

      // General API error
      throw new Error(`Meta API Error (${fbError.code || status}): ${fbError.message || 'Unknown error'}`);
    }

    throw error;
  }

  /**
   * Validate the access token and account access
   * @returns {Object} - Validation result
   */
  async validateConnection() {
    try {
      const response = await this.graphApiGet(`/${this.accountId}`, {
        fields: 'name,account_status,currency,amount_spent'
      });

      const statusMap = {
        1: 'Active',
        2: 'Disabled',
        3: 'Unsettled',
        7: 'Pending Review',
        8: 'Pending Closure',
        9: 'In Grace Period',
        100: 'Pending Risk Review',
        101: 'Any Active',
        102: 'Any Closed'
      };

      return {
        valid: true,
        accountId: this.accountId,
        accountName: response.name,
        currency: response.currency,
        status: statusMap[response.account_status] || `Unknown (${response.account_status})`,
        amountSpent: response.amount_spent
      };
    } catch (error) {
      return {
        valid: false,
        accountId: this.accountId,
        error: error.message
      };
    }
  }

  /**
   * Get current rate limit status
   * @returns {Object} - Rate limit info
   */
  async getRateLimitStatus() {
    const counts = await this.limiter.currentReservoir();
    return {
      remaining: counts,
      limit: config.API_RATE_LIMIT,
      resetInterval: '1 hour'
    };
  }
}

// Singleton instance
let clientInstance = null;

/**
 * Get the singleton Meta API client instance
 * @returns {MetaApiClient} - The client instance
 */
export function getMetaClient() {
  if (!clientInstance) {
    clientInstance = new MetaApiClient();
  }
  return clientInstance;
}

export default MetaApiClient;
