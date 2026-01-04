/**
 * Configuration loader with validation
 */

import { cleanEnv, str, num, bool } from 'envalid';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Validated configuration object
 */
export const config = cleanEnv(process.env, {
  // Meta API Configuration (Required)
  META_ACCESS_TOKEN: str({
    desc: 'Meta Marketing API access token'
  }),
  META_AD_ACCOUNT_ID: str({
    desc: 'Meta Ad Account ID (without act_ prefix)'
  }),

  // Meta API Configuration (Optional)
  META_APP_ID: str({
    default: '',
    desc: 'Meta App ID (optional)'
  }),
  META_APP_SECRET: str({
    default: '',
    desc: 'Meta App Secret (optional)'
  }),

  // API Settings
  META_API_VERSION: str({
    default: 'v21.0',
    desc: 'Meta Graph API version'
  }),
  API_RATE_LIMIT: num({
    default: 200,
    desc: 'Max API calls per hour'
  }),

  // Application Settings
  DEFAULT_CURRENCY: str({
    default: 'USD',
    desc: 'Default currency for cost estimates'
  }),
  DEFAULT_COUNTRY: str({
    default: 'US',
    desc: 'Default target country'
  }),
  CACHE_TTL_HOURS: num({
    default: 24,
    desc: 'Cache time-to-live in hours'
  }),

  // Calibration Settings
  REFERENCE_INDUSTRY: str({
    default: '',
    desc: 'Industry your account primarily runs campaigns in (for β calibration)'
  }),

  // Output Settings
  OUTPUT_DIR: str({
    default: join(__dirname, '../../data/output'),
    desc: 'Output directory for results'
  }),
  DEBUG_MODE: bool({
    default: false,
    desc: 'Enable debug logging'
  })
});

/**
 * Path configuration
 */
export const paths = {
  root: join(__dirname, '../..'),
  src: join(__dirname, '..'),
  data: join(__dirname, '../../data'),
  mappings: join(__dirname, '../../data/mappings'),
  cache: join(__dirname, '../../data/cache'),
  output: config.OUTPUT_DIR
};

/**
 * Get the full ad account ID with prefix
 */
export function getAdAccountId() {
  return `act_${config.META_AD_ACCOUNT_ID}`;
}
