#!/usr/bin/env node

/**
 * SM Data Analyzer CLI
 * Command-line interface for Meta advertising cost analysis
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import { createObjectCsvWriter } from 'csv-writer';
import { join } from 'path';

import { config, paths } from './config/index.js';
import { OPTIMIZATION_GOALS, SUPPORTED_COUNTRIES, COUNTRY_TIERS, PLACEMENTS } from './config/constants.js';
import { getMetaClient } from './api/meta-client.js';
import deliveryEstimate from './api/delivery-estimate.js';
import interestSearch from './api/interest-search.js';
import metricsCalculator from './calculators/metrics-calculator.js';
import iabMapper from './mappers/iab-to-meta.js';
import { resultsStore } from './storage/json-store.js';

const program = new Command();

program
  .name('smanalyzer')
  .description('Meta Advertising Cost Analyzer - Phantom Probing Tool')
  .version('1.0.0');

// ============================================================================
// VALIDATE COMMAND
// ============================================================================
program
  .command('validate')
  .description('Validate Meta API connection and credentials')
  .action(async () => {
    const spinner = ora('Validating Meta API connection...').start();

    try {
      const client = getMetaClient();
      const result = await client.validateConnection();

      if (result.valid) {
        spinner.succeed(chalk.green('Connection validated successfully!'));
        console.log('');
        console.log(`  ${chalk.bold('Account ID:')} ${result.accountId}`);
        console.log(`  ${chalk.bold('Name:')}       ${result.accountName}`);
        console.log(`  ${chalk.bold('Currency:')}   ${result.currency}`);
        console.log(`  ${chalk.bold('Status:')}     ${result.status}`);
      } else {
        spinner.fail(chalk.red('Connection failed'));
        console.log(`  ${chalk.red('Error:')} ${result.error}`);
        process.exit(1);
      }
    } catch (error) {
      spinner.fail(chalk.red(`Validation failed: ${error.message}`));
      process.exit(1);
    }
  });

// ============================================================================
// PROBE COMMAND - Main functionality
// ============================================================================
program
  .command('probe')
  .description('Run a phantom probe to estimate ad costs for an industry')
  .requiredOption('-i, --industry <industry>', 'Industry category (e.g., technology, automotive)')
  .option('-c, --country <code>', 'Target country code (ISO 3166-1)', 'US')
  .option('--age-min <age>', 'Minimum age', '18')
  .option('--age-max <age>', 'Maximum age', '65')
  .option('-g, --goal <goal>', 'Optimization goal (LINK_CLICKS, IMPRESSIONS, REACH)', 'LINK_CLICKS')
  .option('-p, --placement <placement>', 'Placement type (all, feed, desktop, mobile)', 'all')
  .option('-o, --output <format>', 'Output format (table, json, csv)', 'table')
  .option('--save', 'Save results to storage', false)
  .action(async (options) => {
    const spinner = ora(`Probing ${chalk.cyan(options.industry)} industry...`).start();

    try {
      // Step 1: Get interests for the industry
      spinner.text = 'Finding relevant interests...';
      const interests = await iabMapper.getInterestsForCategory(options.industry);

      if (interests.length === 0) {
        spinner.fail(chalk.yellow(`No interests found for "${options.industry}"`));
        console.log('');
        console.log('  Supported industries:');
        iabMapper.getSupportedCategories().forEach(cat => {
          console.log(`    - ${cat}`);
        });
        console.log('');
        console.log('  Or search for interests: smanalyzer search <query>');
        return;
      }

      spinner.text = `Found ${interests.length} interests. Fetching delivery estimate...`;

      // Step 2: Fetch delivery estimate
      const estimate = await deliveryEstimate.probeIndustry(interests, {
        countries: [options.country.toUpperCase()],
        ageMin: parseInt(options.ageMin, 10),
        ageMax: parseInt(options.ageMax, 10),
        optimizationGoal: OPTIMIZATION_GOALS[options.goal] || OPTIMIZATION_GOALS.LINK_CLICKS,
        placement: options.placement || 'all'
      });

      spinner.text = 'Calculating metrics...';

      // Step 3: Calculate metrics
      const metrics = metricsCalculator.calculateAllMetrics(estimate);
      let summary = metricsCalculator.generateSummary(metrics);

      // (Reverted to Pure Meta API mode - no hybrid benchmarks/insights)
      summary.dataSource = 'meta_api';

      spinner.succeed(chalk.green('Probe completed successfully!'));

      // Step 4: Output results
      outputResults(options.industry, summary, interests, estimate, options.output);

      // Step 5: Save if requested
      if (options.save) {
        resultsStore.saveResult(
          options.industry,
          { interests, countries: [options.country] },
          summary
        );
        console.log('');
        console.log(chalk.dim(`Results saved to ${paths.output}/probe-results.json`));
      }

    } catch (error) {
      spinner.fail(chalk.red(`Probe failed: ${error.message}`));
      if (config.DEBUG_MODE) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

// ============================================================================
// SEARCH COMMAND
// ============================================================================
program
  .command('search <query>')
  .description('Search for Meta interest targeting options')
  .option('-l, --limit <number>', 'Maximum results', '20')
  .action(async (query, options) => {
    const spinner = ora(`Searching for "${query}"...`).start();

    try {
      const results = await interestSearch.searchInterests(query, parseInt(options.limit, 10));

      spinner.succeed(`Found ${results.length} interests`);

      if (results.length === 0) {
        console.log(chalk.yellow('  No interests found. Try a different search term.'));
        return;
      }

      console.log('');

      const table = new Table({
        head: [
          chalk.cyan('ID'),
          chalk.cyan('Name'),
          chalk.cyan('Audience Size')
        ],
        colWidths: [20, 35, 25]
      });

      results.forEach(interest => {
        table.push([
          interest.id,
          interest.name,
          interestSearch.formatAudienceSize(interest)
        ]);
      });

      console.log(table.toString());

    } catch (error) {
      spinner.fail(chalk.red(`Search failed: ${error.message}`));
      process.exit(1);
    }
  });

// ============================================================================
// INDUSTRIES COMMAND
// ============================================================================
program
  .command('industries')
  .description('List supported industry categories')
  .action(() => {
    const categories = iabMapper.getSupportedCategories();

    console.log('');
    console.log(chalk.bold('Supported Industries:'));
    console.log('');

    categories.forEach(cat => {
      console.log(`  ${chalk.green('*')} ${cat}`);
    });

    console.log('');
    console.log(chalk.dim('Use "smanalyzer probe -i <industry>" to run a probe'));
    console.log(chalk.dim('Use "smanalyzer search <query>" to find custom interests'));
  });

// ============================================================================
// COUNTRIES COMMAND
// ============================================================================
program
  .command('countries')
  .description('List supported countries by tier')
  .option('-t, --tier <tier>', 'Filter by tier (1, 2, or 3)')
  .action((options) => {
    console.log('');
    console.log(chalk.bold('Supported Countries (50 total):'));
    console.log('');

    const tiers = [
      { name: 'Tier 1', tier: COUNTRY_TIERS.tier1, color: chalk.green },
      { name: 'Tier 2', tier: COUNTRY_TIERS.tier2, color: chalk.yellow },
      { name: 'Tier 3', tier: COUNTRY_TIERS.tier3, color: chalk.cyan }
    ];

    tiers.forEach(({ name, tier, color }, index) => {
      if (options.tier && options.tier !== String(index + 1)) return;

      console.log(color.bold(`${name} - ${tier.frequency} probing (${Object.keys(tier.countries).length} countries):`));
      const codes = Object.keys(tier.countries);
      for (let i = 0; i < codes.length; i += 5) {
        const row = codes.slice(i, i + 5).map(code =>
          `${code} (${tier.countries[code].slice(0, 12)})`
        ).join('  ');
        console.log(`  ${row}`);
      }
      console.log('');
    });

    console.log(chalk.dim('Use "smanalyzer probe -i <industry> -c <country_code>" to probe a specific country'));
  });

// ============================================================================
// PLACEMENTS COMMAND
// ============================================================================
program
  .command('placements')
  .description('List supported placement types')
  .action(() => {
    console.log('');
    console.log(chalk.bold('Supported Placements:'));
    console.log('');

    Object.entries(PLACEMENTS).forEach(([key, config]) => {
      console.log(`  ${chalk.green(key.padEnd(12))} ${config.name}`);
      console.log(`  ${' '.repeat(12)} ${chalk.dim(config.description)}`);
      if (config.publisher_platforms) {
        console.log(`  ${' '.repeat(12)} ${chalk.cyan('Platforms:')} ${config.publisher_platforms.join(', ')}`);
      }
      console.log('');
    });

    console.log(chalk.dim('Use "smanalyzer probe -i <industry> -p <placement>" to probe with specific placement'));
  });

// ============================================================================
// HISTORY COMMAND
// ============================================================================
program
  .command('history')
  .description('View probe history')
  .option('-i, --industry <industry>', 'Filter by industry')
  .option('-l, --limit <number>', 'Limit results', '10')
  .action((options) => {
    let results = resultsStore.getAll();

    if (options.industry) {
      results = results.filter(r =>
        r.industry.toLowerCase() === options.industry.toLowerCase()
      );
    }

    // Sort by timestamp (newest first) and limit
    results = results
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, parseInt(options.limit, 10));

    if (results.length === 0) {
      console.log(chalk.yellow('No probe history found.'));
      console.log(chalk.dim('Run "smanalyzer probe -i <industry> --save" to save results'));
      return;
    }

    console.log('');

    const table = new Table({
      head: [
        chalk.cyan('Timestamp'),
        chalk.cyan('Industry'),
        chalk.cyan('CPM'),
        chalk.cyan('CTR'),
        chalk.cyan('CPC'),
        chalk.cyan('Confidence')
      ],
      colWidths: [22, 15, 10, 10, 10, 12]
    });

    results.forEach(r => {
      const metrics = r.metrics || {};
      table.push([
        formatTimestamp(r.timestamp),
        r.industry,
        metrics.cpm ? `$${metrics.cpm.toFixed(2)}` : 'N/A',
        metrics.ctr ? `${metrics.ctr.toFixed(2)}%` : 'N/A',
        metrics.cpc ? `$${metrics.cpc.toFixed(2)}` : 'N/A',
        metrics.confidence || 'N/A'
      ]);
    });

    console.log(table.toString());
  });

// ============================================================================
// EXPORT COMMAND
// ============================================================================
program
  .command('export')
  .description('Export results to CSV')
  .option('-o, --output <file>', 'Output filename', 'probe-export.csv')
  .action(async (options) => {
    const results = resultsStore.getAll();

    if (results.length === 0) {
      console.log(chalk.yellow('No results to export.'));
      return;
    }

    const outputPath = join(paths.output, options.output);

    const csvWriter = createObjectCsvWriter({
      path: outputPath,
      header: [
        { id: 'timestamp', title: 'Timestamp' },
        { id: 'industry', title: 'Industry' },
        { id: 'country', title: 'Country' },
        { id: 'cpm', title: 'CPM' },
        { id: 'ctr', title: 'CTR' },
        { id: 'cpc', title: 'CPC' },
        { id: 'audience', title: 'Audience Size' },
        { id: 'confidence', title: 'Confidence' }
      ]
    });

    const records = results.map(r => ({
      timestamp: r.timestamp,
      industry: r.industry,
      country: r.country || 'US',
      cpm: r.metrics?.cpm ? r.metrics.cpm.toFixed(2) : 'N/A',
      ctr: r.metrics?.ctr ? r.metrics.ctr.toFixed(2) : 'N/A',
      cpc: r.metrics?.cpc ? r.metrics.cpc.toFixed(2) : 'N/A',
      audience: r.metrics?.formattedAudience || formatNumber(r.metrics?.audienceSize?.mau) || 'N/A',
      confidence: r.metrics?.confidence || 'N/A'
    }));

    await csvWriter.writeRecords(records);
    console.log(chalk.green(`Exported ${records.length} results to ${outputPath}`));
  });

// ============================================================================
// SUMMARY COMMAND
// ============================================================================
program
  .command('summary')
  .description('Show summary statistics of all probes')
  .action(() => {
    const summary = resultsStore.getSummary();

    if (summary.totalProbes === 0) {
      console.log(chalk.yellow('No probe data available.'));
      return;
    }

    console.log('');
    console.log(chalk.bold('Probe Summary'));
    console.log('');
    console.log(`  ${chalk.bold('Total Probes:')}    ${summary.totalProbes}`);
    console.log(`  ${chalk.bold('Industries:')}      ${summary.industryCount} (${summary.industries.join(', ')})`);
    console.log(`  ${chalk.bold('Date Range:')}      ${formatTimestamp(summary.dateRange.first)} to ${formatTimestamp(summary.dateRange.last)}`);
    console.log('');
    console.log(chalk.bold('Average Metrics:'));
    console.log(`  ${chalk.bold('CPM:')}  ${summary.avgCPM ? `$${summary.avgCPM.toFixed(2)}` : 'N/A'}`);
    console.log(`  ${chalk.bold('CTR:')}  ${summary.avgCTR ? `${summary.avgCTR.toFixed(2)}%` : 'N/A'}`);
    console.log(`  ${chalk.bold('CPC:')}  ${summary.avgCPC ? `$${summary.avgCPC.toFixed(2)}` : 'N/A'}`);
  });

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Output probe results in specified format
 */
function outputResults(industry, summary, interests, estimate, format) {
  if (format === 'json') {
    console.log(JSON.stringify({
      industry,
      interests: interests.map(i => ({ id: i.id, name: i.name })),
      metrics: summary,
      audienceSize: estimate.audienceSize,
      timestamp: new Date().toISOString()
    }, null, 2));
    return;
  }

  if (format === 'csv') {
    console.log('industry,cpm,ctr,cpc,audience,confidence');
    console.log(`${industry},${summary.cpm || ''},${summary.ctr || ''},${summary.cpc || ''},${estimate.audienceSize?.mau || ''},${summary.confidence}`);
    return;
  }


  // Table format (default)
  console.log('');
  console.log(chalk.bold.cyan(`${industry.toUpperCase()} Industry - Cost Estimates`));
  console.log('');

  const tableHead = [chalk.white('Metric'), chalk.white('Estimated Cost'), chalk.white('Source')];
  const colWidths = [12, 20, 18];

  // Add "Actuals" column if data exists
  if (summary.actuals) {
    tableHead.push(chalk.white('Your Actuals (30d)'));
    colWidths.push(20);
  }

  // Add "Per $100" column
  tableHead.push(chalk.white('Per $100 Budget'));
  colWidths.push(18);

  const metricsTable = new Table({
    head: tableHead,
    colWidths: colWidths
  });

  // Determine source label based on dataSource
  let sourceLabel;
  if (summary.dataSource === 'calibrated') {
    sourceLabel = chalk.green('Calibrated (β)');
  } else if (summary.dataSource === 'benchmark') {
    sourceLabel = chalk.yellow('Benchmark 2025');
  } else {
    sourceLabel = chalk.green('Meta AI');
  }

  const projections = summary.projections || {};

  metricsTable.push(
    [
      'CPM',
      summary.formattedCPM,
      sourceLabel,
      ...(summary.actuals ? [`$${summary.actuals.cpm.toFixed(2)}`] : []),
      projections.impressions ? `${projections.impressions.toLocaleString()} views` : '-'
    ],
    [
      'CTR',
      summary.formattedCTR,
      sourceLabel,
      ...(summary.actuals ? [`${summary.actuals.ctr.toFixed(2)}%`] : []),
      projections.ctr_explained || '-'
    ],
    [
      'CPC',
      summary.formattedCPC,
      sourceLabel,
      ...(summary.actuals ? [`$${summary.actuals.cpc.toFixed(2)}`] : []),
      projections.clicks ? `${projections.clicks.toLocaleString()} clicks` : '-'
    ],
    [
      'Audience',
      summary.formattedAudience,
      chalk.green('Meta API'),
      ...(summary.actuals ? ['-'] : []),
      '-'
    ]
  );

  console.log(metricsTable.toString());

  // Calibration info
  if (summary.beta) {
    console.log('');
    console.log(chalk.cyan('Calibration Factors (β):'));
    console.log(chalk.dim(`  Reference industry: ${summary.beta.referenceIndustry || 'N/A'}`));
    console.log(chalk.dim(`  CPM β = ${summary.beta.cpm?.toFixed(2) || 'N/A'} | CPC β = ${summary.beta.cpc?.toFixed(2) || 'N/A'} | CTR β = ${summary.beta.ctr?.toFixed(2) || 'N/A'}`));
    if (summary.beta.cpm < 1) {
      console.log(chalk.green(`  Your account pays ${((1 - summary.beta.cpm) * 100).toFixed(0)}% LESS than industry average`));
    } else if (summary.beta.cpm > 1) {
      console.log(chalk.yellow(`  Your account pays ${((summary.beta.cpm - 1) * 100).toFixed(0)}% MORE than industry average`));
    }
  }

  // Calibration warning
  if (summary.calibrationWarning) {
    console.log('');
    console.log(chalk.yellow(`⚠️  ${summary.calibrationWarning}`));
  }

  // Warnings & Notes
  if (summary.isReferenceIndustry) {
    console.log('');
    console.log(chalk.cyan('ℹ️  This is your REFERENCE industry. Showing benchmarks (not calibrated).'));
    console.log(chalk.dim('   Use these benchmarks to compare against your actuals.'));
  } else if (summary.dataSource === 'benchmark') {
    console.log('');
    console.log(chalk.yellow('⚠️  Meta API returned zero data. Using Industry Benchmarks (not calibrated).'));
  } else if (summary.dataSource === 'calibrated') {
    console.log('');
    console.log(chalk.green('✓ Estimates calibrated using your account\'s actual performance.'));
  }

  if (summary.actuals) {
    console.log(chalk.dim('Actuals based on your account history (last 30 days).'));
  }

  // Targeting info
  console.log('');
  console.log(chalk.dim(`Targeting: ${interests.length} interests`));
  console.log(chalk.dim(`Top interests: ${interests.slice(0, 3).map(i => i.name).join(', ')}`));

  // Insights
  if (summary.insights && summary.insights.length > 0) {
    console.log('');
    console.log(chalk.bold('Insights:'));
    summary.insights.forEach(insight => {
      console.log(`  ${chalk.yellow('*')} ${insight}`);
    });
  }
}

/**
 * Color confidence level
 */
function colorConfidence(confidence) {
  switch (confidence) {
    case 'high':
      return chalk.green(confidence);
    case 'medium':
      return chalk.yellow(confidence);
    case 'low':
      return chalk.red(confidence);
    default:
      return chalk.gray(confidence || 'none');
  }
}

/**
 * Format timestamp for display
 */
function formatTimestamp(timestamp) {
  if (!timestamp) return 'N/A';
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Format number with K/M suffix
 */
function formatNumber(num) {
  if (!num) return '0';
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

// Parse and run
program.parse();
