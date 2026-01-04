/**
 * Application constants
 */

export const META_API = {
  BASE_URL: 'https://graph.facebook.com',
  DEFAULT_VERSION: 'v21.0',
  ENDPOINTS: {
    DELIVERY_ESTIMATE: '/delivery_estimate',
    SEARCH: '/search',
    REACH_ESTIMATE: '/reachestimate'
  }
};

export const SEARCH_TYPES = {
  AD_INTEREST: 'adinterest',
  AD_INTEREST_SUGGESTION: 'adinterestsuggestion',
  TARGETING_CATEGORY: 'adTargetingCategory',
  GEO_LOCATION: 'adgeolocation'
};

export const OPTIMIZATION_GOALS = {
  LINK_CLICKS: 'LINK_CLICKS',
  IMPRESSIONS: 'IMPRESSIONS',
  REACH: 'REACH',
  LANDING_PAGE_VIEWS: 'LANDING_PAGE_VIEWS',
  CONVERSIONS: 'CONVERSIONS',
  POST_ENGAGEMENT: 'POST_ENGAGEMENT',
  VIDEO_VIEWS: 'VIDEO_VIEWS'
};

// Spend range for regression analysis (in USD)
export const SPEND_RANGE = {
  MIN: 20,
  MAX: 100
};

// Supported countries - 50 countries organized by tier
// Tier 1: Daily probing - Top 10 ad markets
// Tier 2: Weekly probing - Medium markets
// Tier 3: Monthly probing - Emerging/smaller markets
export const COUNTRY_TIERS = {
  tier1: {
    frequency: 'daily',
    countries: {
      'US': 'United States',
      'GB': 'United Kingdom',
      'DE': 'Germany',
      'FR': 'France',
      'JP': 'Japan',
      'CA': 'Canada',
      'AU': 'Australia',
      'IT': 'Italy',
      'ES': 'Spain',
      'BR': 'Brazil'
    }
  },
  tier2: {
    frequency: 'weekly',
    countries: {
      'NL': 'Netherlands',
      'SE': 'Sweden',
      'CH': 'Switzerland',
      'BE': 'Belgium',
      'AT': 'Austria',
      'PL': 'Poland',
      'MX': 'Mexico',
      'KR': 'South Korea',
      'IN': 'India',
      'SG': 'Singapore',
      'HK': 'Hong Kong',
      'AE': 'United Arab Emirates',
      'SA': 'Saudi Arabia',
      'IL': 'Israel',
      'NO': 'Norway',
      'DK': 'Denmark',
      'FI': 'Finland',
      'IE': 'Ireland',
      'NZ': 'New Zealand',
      'PT': 'Portugal'
    }
  },
  tier3: {
    frequency: 'monthly',
    countries: {
      'AR': 'Argentina',
      'CL': 'Chile',
      'CO': 'Colombia',
      'PE': 'Peru',
      'ZA': 'South Africa',
      'NG': 'Nigeria',
      'EG': 'Egypt',
      'PH': 'Philippines',
      'MY': 'Malaysia',
      'TH': 'Thailand',
      'VN': 'Vietnam',
      'ID': 'Indonesia',
      'TW': 'Taiwan',
      'TR': 'Turkey',
      'RU': 'Russia',
      'UA': 'Ukraine',
      'CZ': 'Czech Republic',
      'RO': 'Romania',
      'HU': 'Hungary',
      'GR': 'Greece'
    }
  }
};

// Flattened list of all supported countries
export const SUPPORTED_COUNTRIES = {
  ...COUNTRY_TIERS.tier1.countries,
  ...COUNTRY_TIERS.tier2.countries,
  ...COUNTRY_TIERS.tier3.countries
};

// Default targeting settings
export const DEFAULT_TARGETING = {
  AGE_MIN: 18,
  AGE_MAX: 65,
  COUNTRY: 'US'
};

// Placement configurations for Meta platforms
// Note: delivery_estimate API provides aggregate data; placement-specific breakdown
// is limited. These are primarily for campaign planning reference.
export const PLACEMENTS = {
  // All placements (default - let Meta optimize)
  all: {
    name: 'All Placements',
    description: 'Meta auto-optimizes across all placements (recommended)'
  },
  // Facebook Feed only
  feed: {
    name: 'Feed Only',
    description: 'Facebook & Instagram main feeds',
    publisher_platforms: ['facebook', 'instagram'],
    facebook_positions: ['feed'],
    instagram_positions: ['stream']
  },
  // Desktop only (for B2B)
  desktop: {
    name: 'Desktop Only',
    description: 'Desktop placements for B2B targeting',
    device_platforms: ['desktop']
  },
  // Mobile only
  mobile: {
    name: 'Mobile Only',
    description: 'Mobile device placements',
    device_platforms: ['mobile']
  }
};
