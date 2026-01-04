
import { getMetaClient } from './src/api/meta-client.js';
import { getAdAccountId } from './src/config/index.js';

async function auditAccount() {
  const client = getMetaClient();
  const accountId = getAdAccountId();

  console.log(`\n🔍 Auditing Account: ${accountId}`);

  try {
    // 1. Get Account Details
    const accountResponse = await client.graphApiGet(`/${accountId}`, {
      fields: 'name,account_status,amount_spent,currency,created_time,min_campaign_group_spend_cap,balance,timezone_name'
    });
    const account = accountResponse.data || accountResponse;

    // 2. Get Recent Insights (Last 90 Days)
    const insightsResponse = await client.graphApiGet(`/${accountId}/insights`, {
      date_preset: 'last_90d',
      level: 'account',
      fields: 'spend,impressions,cpm,cpc,ctr,actions,objective,date_start,date_stop'
    });
    const insights = (insightsResponse.data && insightsResponse.data[0]) || null;

    // 3. active campaigns check
    const campaignsResponse = await client.graphApiGet(`/${accountId}/campaigns`, {
        effective_status: ['ACTIVE'],
        fields: 'name,effective_status'
    });
    const activeCampaigns = campaignsResponse.data || [];

    const result = {
      account: {
        name: account.name,
        status: getAccountStatus(account.account_status),
        currency: account.currency,
        timezone: account.timezone_name,
        totalSpend: account.amount_spent,
        created: account.created_time
      },
      insights: null,
      warmth: { isWarmed: false, clickCount: 0 },
      activeCampaigns: activeCampaigns.map(c => ({ name: c.name, status: c.effective_status }))
    };

    if (insights) {
      result.insights = {
        spend: insights.spend,
        impressions: insights.impressions,
        cpm: insights.cpm,
        clicks: getLinkClicks(insights.actions),
        dateStart: insights.date_start,
        dateStop: insights.date_stop
      };
      
      const clicks = getLinkClicks(insights.actions);
      result.warmth.clickCount = clicks;
      result.warmth.isWarmed = clicks > 200;
      result.warmth.msg = result.warmth.isWarmed ? 'WARMED' : 'COLD';
    }

    const fs = await import('fs');
    fs.writeFileSync('audit_results.json', JSON.stringify(result, null, 2));
    console.log('Audit saved to audit_results.json');

  } catch (error) {
    console.error('❌ Error auditing account:', error.message);
    if(error.response) console.error(JSON.stringify(error.response.data, null, 2));
  }
}

function getAccountStatus(code) {
  const statuses = {
    1: 'ACTIVE',
    2: 'DISABLED',
    3: 'UNSETTLED',
    7: 'PENDING_RISK_REVIEW',
    8: 'PENDING_SETTLEMENT',
    9: 'IN_GRACE_PERIOD',
    100: 'PENDING_CLOSURE',
    101: 'CLOSED',
    201: 'ANY_ACTIVE',
    202: 'ANY_CLOSED'
  };
  return `${code} (${statuses[code] || 'UNKNOWN'})`;
}

function getLinkClicks(actions) {
  if (!actions) return 0;
  const clickAction = actions.find(a => a.action_type === 'link_click');
  return clickAction ? parseInt(clickAction.value) : 0;
}

auditAccount();
