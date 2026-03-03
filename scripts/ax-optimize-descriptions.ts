#!/usr/bin/env npx tsx
/**
 * ax-optimize-descriptions.ts — MiPRO-style optimization for flowmcp tool descriptions
 *
 * Uses `claude -p` directly instead of @ax-llm/ax + OpenRouter.
 * Student model: Haiku (cheap, runs many times — evaluates tool routing accuracy)
 * Teacher model: Opus (smart, runs few times — generates improved description candidates)
 *
 * The same model stack that will be routing queries in production.
 *
 * Usage:
 *   npx tsx scripts/ax-optimize-descriptions.ts
 *   npx tsx scripts/ax-optimize-descriptions.ts --trials 3
 *   npx tsx scripts/ax-optimize-descriptions.ts --dry-run
 *   npx tsx scripts/ax-optimize-descriptions.ts --verbose
 */

import { execFileSync, execSync } from 'child_process';
import { promises as fs } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync, unlinkSync } from 'fs';

// ============================================================
// Configuration
// ============================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

const GOLD_QUERIES_PATH = resolve(ROOT, 'test/gold-queries.json');
const OUTPUT_PATH = resolve(ROOT, 'data/ax-optimized-descriptions.json');
const REPORT_PATH = resolve(ROOT, 'data/ax-optimization-report.json');

// ============================================================
// CLI Arguments
// ============================================================

const args = process.argv.slice(2);
const NUM_TRIALS = parseInt(args.find((_, i, a) => a[i - 1] === '--trials') || '3', 10);
const DRY_RUN = args.includes('--dry-run');
const VERBOSE = args.includes('--verbose');

// ============================================================
// All 25 Flow Immersive MCP Tools
// ============================================================

const ALL_TOOLS = [
  'analyze_data_for_flow',
  'validate_csv_for_flow',
  'transform_to_network_graph',
  'generate_flow_python_code',
  'suggest_flow_visualization',
  'get_flow_template',
  'flow_extract_from_text',
  'flow_extract_from_url',
  'flow_authenticate',
  'flow_upload_data',
  'flow_browse_flows',
  'flow_get_flow',
  'flow_list_templates',
  'flow_list_categories',
  'flow_precompute_force_layout',
  'flow_scale_dataset',
  'flow_compute_graph_metrics',
  'flow_query_graph',
  'flow_semantic_search',
  'flow_time_series_animate',
  'flow_merge_datasets',
  'flow_anomaly_detect',
  'flow_geo_enhance',
  'flow_nlp_to_viz',
  'flow_export_formats',
] as const;

type ToolName = typeof ALL_TOOLS[number];

// ============================================================
// Gold Query Types
// ============================================================

interface GoldQuery {
  id: string;
  query: string;
  expected_tools: string[];
  category: string;
  difficulty: string;
  notes: string;
}

// ============================================================
// Tool Descriptions (mutable — teacher rewrites these)
// ============================================================

const toolDescriptions: Record<ToolName, string> = {
  analyze_data_for_flow: 'Measure dataset structural fitness for 3D spatial visualization across 8 signal dimensions — column count, relationship density, geographic coordinates, temporal patterns, cardinality, dimensionality, row volume, and category diversity.',
  validate_csv_for_flow: 'Diagnose CSV data against Flow Immersive format requirements. Validate comma-delimited structure, decompose column types, and measure data quality.',
  transform_to_network_graph: 'Construct Flow network graph CSV from edge-list data. Map source-target pairs into Flow\'s id + pipe-delimited connections format.',
  generate_flow_python_code: 'Construct a ready-to-run Python script that uploads data to Flow Immersive via the flowgl client library.',
  suggest_flow_visualization: 'Resolve the optimal visualization type for a dataset by mapping column metadata against Flow Immersive\'s template library.',
  get_flow_template: 'Retrieve a Flow Immersive template with setup instructions, column requirements, and configuration steps.',
  flow_extract_from_text: 'Decompose unstructured text into structured data for 3D visualization. Trace entities, relationships, metrics, geographic references, and timeline events.',
  flow_extract_from_url: 'Decompose a web article into structured data for 3D visualization. Fetch the URL, trace entities and relationships, construct Flow-ready CSV.',
  flow_authenticate: 'Resolve Flow Immersive API credentials into a bearer token. Validate email and password against Flow\'s authentication endpoint.',
  flow_upload_data: 'Construct a new dataset in Flow Immersive from CSV content, or update an existing one. Calls Flow\'s API directly.',
  flow_browse_flows: 'Map Flow Immersive\'s public catalog of 26,000+ 3D data visualizations. Browse, search, and filter existing flows.',
  flow_get_flow: 'Decompose a specific Flow visualization into its full definition: template type, column mappings, data source metadata.',
  flow_list_templates: 'Map all 36 visualization templates available in Flow Immersive with column requirements and data type constraints.',
  flow_list_categories: 'Map all 35 visualization categories in Flow Immersive. Classify datasets or resolve category membership.',
  flow_precompute_force_layout: 'Construct a fully converged 3D force-directed graph layout via offline physics simulation. Resolve every node\'s spatial position (x, y, z) for instant rendering.',
  flow_scale_dataset: 'Decompose a large dataset into a representative subset. Reduce CSV size via random, stratified, or spatial binning while preserving patterns.',
  flow_compute_graph_metrics: 'Measure structural properties of every node — degree, PageRank, connected components, clustering coefficient — and construct metric columns for visualization.',
  flow_query_graph: 'Trace paths through a FalkorDB graph database using Cypher queries and construct Flow-compatible CSV from the results.',
  flow_semantic_search: 'Trace meaning through Flow Immersive\'s catalog of 26,000+ public 3D visualizations. Resolve natural language queries into ranked matches.',
  flow_time_series_animate: 'Decompose temporal data into animation frames for Flow Immersive. Parse date/time values, bin into sequential frames, add _frame and _time_label columns.',
  flow_merge_datasets: 'Construct a unified dataset from multiple CSV sources. Join on shared columns or concatenate vertically with conflict resolution.',
  flow_anomaly_detect: 'Measure statistical anomalies in numeric data using Z-score or IQR methods. Score deviation, flag outliers, add _anomaly_score and _is_anomaly columns.',
  flow_geo_enhance: 'Resolve text-based geographic references into latitude and longitude coordinates using a built-in gazetteer. Construct geo-enriched CSV for 3D map visualization.',
  flow_nlp_to_viz: 'Construct a complete 3D visualization from a single natural language description. Generate synthetic data, select optimal template, produce ready-to-upload CSV.',
  flow_export_formats: 'Construct presentation-ready outputs from Flow data. Transform CSV into HTML 3D viewers, JSON, GeoJSON, or statistical summaries.',
};

// ============================================================
// claude -p Interface
//
// NOTE: This is a CLI script, not production server code.
// We use execFileSync with explicit args where possible.
// The shell pipe for `claude -p` is necessary because claude CLI
// reads from stdin. All inputs are script-controlled (not user-supplied).
// ============================================================

function callClaude(prompt: string, model: 'haiku' | 'opus' = 'haiku'): string {
  // Write prompt to a temp file to avoid shell escaping issues
  const tmpFile = `/tmp/flowmcp-claude-prompt-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`;
  try {
    writeFileSync(tmpFile, prompt, 'utf-8');

    // Use execFileSync with shell:true to pipe the temp file into claude -p.
    // All inputs are script-controlled constants or LLM-generated descriptions,
    // not external user input.
    const modelArg = model === 'haiku' ? 'haiku' : 'opus';
    const result = execFileSync('bash', [
      '-c',
      `cat "${tmpFile}" | claude -p --model ${modelArg} --output-format text --no-session-persistence`
    ], {
      encoding: 'utf-8',
      timeout: 120_000,
      maxBuffer: 2 * 1024 * 1024,
      env: { ...process.env, DISABLE_INTERACTIVITY: '1' },
    });

    return result.trim();
  } finally {
    try { unlinkSync(tmpFile); } catch { /* ignore cleanup errors */ }
  }
}

// ============================================================
// Student: Evaluate tool routing accuracy (Haiku)
// ============================================================

function buildToolCatalog(descriptions: Record<string, string>): string {
  return ALL_TOOLS.map(tool => `- ${tool}: ${descriptions[tool]}`).join('\n');
}

function evaluateQuery(
  query: string,
  catalog: string
): string[] {
  const prompt = `Given these MCP tools and their descriptions:

${catalog}

Which tools should be invoked for this user query? Select the 1-5 most relevant tools.
If NO tools are relevant, return an empty array.

Query: "${query}"

Return ONLY a JSON array of tool names, nothing else. Example: ["tool_a", "tool_b"]`;

  try {
    const response = callClaude(prompt, 'haiku');
    // Extract JSON array from response — handle cases where model wraps in markdown
    const jsonMatch = response.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) return [];
    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((s: unknown) => String(s).trim().toLowerCase())
      .filter((s: string) => ALL_TOOLS.includes(s as ToolName));
  } catch (err) {
    if (VERBOSE) {
      console.log(`  [ERROR] evaluateQuery failed: ${(err as Error).message}`);
    }
    return [];
  }
}

// ============================================================
// Teacher: Generate improved descriptions (Opus)
// ============================================================

function improveDescription(
  toolName: string,
  currentDescription: string,
  missedQueries: string[],
  falsePositiveQueries: string[],
): string {
  const missedSection = missedQueries.length > 0
    ? `These queries SHOULD match this tool but currently DON'T:\n${missedQueries.map(q => `- "${q}"`).join('\n')}`
    : 'No missed queries (recall is perfect).';

  const fpSection = falsePositiveQueries.length > 0
    ? `These queries should NOT match but currently DO:\n${falsePositiveQueries.map(q => `- "${q}"`).join('\n')}`
    : 'No false positives (precision is perfect).';

  const prompt = `You are optimizing tool descriptions for an MCP server that routes AI queries to the correct tools.

The tool "${toolName}" currently has this description:
"${currentDescription}"

${missedSection}

${fpSection}

Rewrite the description to:
1. Include trigger phrases and vocabulary that match the missed queries
2. Exclude or clarify language that causes false positives
3. Start with a strong action verb (Measure, Construct, Decompose, Resolve, Trace, Map)
4. Keep it under 500 characters
5. Focus on WHEN to invoke this tool, not implementation details
6. Use specific nouns from the missed queries as semantic anchors

Return ONLY the new description text, nothing else. No quotes around it.`;

  try {
    const response = callClaude(prompt, 'opus');
    // Strip any wrapping quotes the model might add
    return response.replace(/^["']|["']$/g, '').trim();
  } catch (err) {
    console.log(`  [ERROR] improveDescription failed for ${toolName}: ${(err as Error).message}`);
    return currentDescription; // Fall back to current description
  }
}

// ============================================================
// F1 Score Computation
// ============================================================

interface F1Result {
  precision: number;
  recall: number;
  f1: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
}

function computeF1(predicted: string[], expected: string[]): F1Result {
  const predSet = new Set(predicted.map(s => s.toLowerCase()));
  const expSet = new Set(expected.map(s => s.toLowerCase()));

  if (predSet.size === 0 && expSet.size === 0) {
    return { precision: 1, recall: 1, f1: 1, truePositives: 0, falsePositives: 0, falseNegatives: 0 };
  }
  if (predSet.size === 0 || expSet.size === 0) {
    return {
      precision: predSet.size === 0 && expSet.size === 0 ? 1 : 0,
      recall: predSet.size === 0 && expSet.size === 0 ? 1 : 0,
      f1: 0,
      truePositives: 0,
      falsePositives: predSet.size,
      falseNegatives: expSet.size,
    };
  }

  let tp = 0;
  for (const tool of predSet) {
    if (expSet.has(tool)) tp++;
  }

  const precision = tp / predSet.size;
  const recall = tp / expSet.size;
  const f1 = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;

  return {
    precision,
    recall,
    f1,
    truePositives: tp,
    falsePositives: predSet.size - tp,
    falseNegatives: expSet.size - tp,
  };
}

// ============================================================
// Evaluate all queries with current descriptions
// ============================================================

interface QueryResult {
  id: string;
  query: string;
  expected: string[];
  predicted: string[];
  f1: number;
  precision: number;
  recall: number;
  category: string;
}

function evaluateAll(
  queries: GoldQuery[],
  descriptions: Record<string, string>
): QueryResult[] {
  const catalog = buildToolCatalog(descriptions);
  const results: QueryResult[] = [];

  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];
    const predicted = evaluateQuery(q.query, catalog);
    const { f1, precision, recall } = computeF1(predicted, q.expected_tools);

    results.push({
      id: q.id,
      query: q.query,
      expected: q.expected_tools,
      predicted,
      f1,
      precision,
      recall,
      category: q.category,
    });

    if (VERBOSE) {
      const status = f1 >= 0.8 ? 'PASS' : f1 >= 0.4 ? 'PART' : f1 === 1.0 ? 'PASS' : 'FAIL';
      console.log(`  [${String(i + 1).padStart(2)}/${queries.length}] [${status}] F1=${f1.toFixed(2)} | ${q.query.substring(0, 65)}`);
      if (f1 < 1.0) {
        console.log(`         Expected: [${q.expected_tools.join(', ')}]`);
        console.log(`         Got:      [${predicted.join(', ')}]`);
      }
    } else {
      process.stdout.write(`\r  Evaluating: ${i + 1}/${queries.length}`);
    }
  }

  if (!VERBOSE) process.stdout.write('\n');
  return results;
}

// ============================================================
// Per-tool error analysis
// ============================================================

interface ToolErrors {
  missedQueries: string[]; // Should match but didn't (hurts recall)
  falsePositiveQueries: string[]; // Shouldn't match but did (hurts precision)
  f1: number;
  queryCount: number;
}

function analyzeToolErrors(
  results: QueryResult[],
): Record<string, ToolErrors> {
  const toolErrors: Record<string, ToolErrors> = {};

  for (const tool of ALL_TOOLS) {
    const missed: string[] = [];
    const falsePos: string[] = [];
    let tp = 0, fp = 0, fn = 0;

    for (const r of results) {
      const expected = r.expected.map(t => t.toLowerCase()).includes(tool);
      const predicted = r.predicted.map(t => t.toLowerCase()).includes(tool);

      if (expected && !predicted) {
        missed.push(r.query);
        fn++;
      } else if (!expected && predicted) {
        falsePos.push(r.query);
        fp++;
      } else if (expected && predicted) {
        tp++;
      }
    }

    const precision = tp + fp > 0 ? tp / (tp + fp) : 1;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 1;
    const f1 = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;

    toolErrors[tool] = {
      missedQueries: missed,
      falsePositiveQueries: falsePos,
      f1,
      queryCount: tp + fn,
    };
  }

  return toolErrors;
}

// ============================================================
// Main Optimization Loop
// ============================================================

async function main() {
  console.log('='.repeat(72));
  console.log('  FlowMCP Tool Description Optimization via claude -p');
  console.log('='.repeat(72));
  console.log(`  Trials:         ${NUM_TRIALS}`);
  console.log(`  Student model:  Haiku (claude -p --model haiku)`);
  console.log(`  Teacher model:  Opus (claude -p --model opus)`);
  console.log(`  Dry run:        ${DRY_RUN}`);
  console.log(`  Verbose:        ${VERBOSE}`);
  console.log('');

  // Load gold queries
  const goldQueries: GoldQuery[] = JSON.parse(await fs.readFile(GOLD_QUERIES_PATH, 'utf8'));
  console.log(`Loaded ${goldQueries.length} gold queries from ${GOLD_QUERIES_PATH}`);

  // Split: use all for evaluation, but limit baseline eval sample in dry-run
  const evalQueries = DRY_RUN ? goldQueries.slice(0, 10) : goldQueries;
  console.log(`Evaluating on ${evalQueries.length} queries\n`);

  // ------------------------------------------------------------------
  // Phase 1: Baseline evaluation
  // ------------------------------------------------------------------
  console.log('Phase 1: Baseline evaluation (current descriptions)...');
  const baselineResults = evaluateAll(evalQueries, toolDescriptions);
  const baselineF1 = baselineResults.reduce((sum, r) => sum + r.f1, 0) / baselineResults.length;

  console.log(`\n  Baseline F1: ${(baselineF1 * 100).toFixed(1)}%`);

  // Show per-category breakdown
  const categories = [...new Set(baselineResults.map(r => r.category))];
  for (const cat of categories.sort()) {
    const catResults = baselineResults.filter(r => r.category === cat);
    const catF1 = catResults.reduce((sum, r) => sum + r.f1, 0) / catResults.length;
    console.log(`    ${cat.padEnd(15)} ${(catF1 * 100).toFixed(1)}% (${catResults.length} queries)`);
  }
  console.log('');

  if (DRY_RUN) {
    console.log('Dry run complete. Would run optimization on all queries.');

    // Still save baseline report
    const report = {
      mode: 'dry-run',
      baselineF1,
      queriesEvaluated: evalQueries.length,
      perQueryResults: baselineResults,
      toolDescriptions,
      created: new Date().toISOString(),
    };
    await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2));
    console.log(`Baseline report saved to ${REPORT_PATH}`);
    return;
  }

  // ------------------------------------------------------------------
  // Phase 2: Identify weak tools and improve descriptions
  // ------------------------------------------------------------------
  const currentDescriptions = { ...toolDescriptions };
  let currentF1 = baselineF1;

  for (let trial = 1; trial <= NUM_TRIALS; trial++) {
    console.log(`\n${'='.repeat(72)}`);
    console.log(`  Trial ${trial}/${NUM_TRIALS}`);
    console.log('='.repeat(72));

    // Analyze per-tool errors with current descriptions
    const currentResults = trial === 1
      ? baselineResults
      : evaluateAll(evalQueries, currentDescriptions);

    if (trial > 1) {
      currentF1 = currentResults.reduce((sum, r) => sum + r.f1, 0) / currentResults.length;
      console.log(`  Current F1: ${(currentF1 * 100).toFixed(1)}%`);
    }

    const toolErrors = analyzeToolErrors(currentResults);

    // Find tools with F1 < 0.7 that have gold queries (skip tools with 0 queries)
    const weakTools = ALL_TOOLS
      .filter(t => toolErrors[t].queryCount > 0 && toolErrors[t].f1 < 0.7)
      .sort((a, b) => toolErrors[a].f1 - toolErrors[b].f1);

    if (weakTools.length === 0) {
      console.log('\n  All tools have F1 >= 0.7. Optimization converged.');
      break;
    }

    console.log(`\n  Weak tools (F1 < 0.7): ${weakTools.length}`);
    for (const tool of weakTools) {
      const err = toolErrors[tool];
      console.log(`    ${tool.padEnd(35)} F1=${err.f1.toFixed(2)} | missed=${err.missedQueries.length} fp=${err.falsePositiveQueries.length}`);
    }

    // Ask teacher to improve descriptions for up to 5 weakest tools per trial
    const toImprove = weakTools.slice(0, 5);
    console.log(`\n  Improving ${toImprove.length} tool descriptions via Opus...\n`);

    let improved = 0;
    for (const tool of toImprove) {
      const err = toolErrors[tool];
      console.log(`  [Teacher] ${tool}...`);

      const newDescription = improveDescription(
        tool,
        currentDescriptions[tool as ToolName],
        err.missedQueries,
        err.falsePositiveQueries,
      );

      if (newDescription && newDescription !== currentDescriptions[tool as ToolName]) {
        currentDescriptions[tool as ToolName] = newDescription;
        improved++;

        if (VERBOSE) {
          console.log(`    OLD: ${toolDescriptions[tool as ToolName].substring(0, 80)}...`);
          console.log(`    NEW: ${newDescription.substring(0, 80)}...`);
        }
        console.log(`    [OK] Description updated (${newDescription.length} chars)`);
      } else {
        console.log(`    [SKIP] No change produced`);
      }
    }

    console.log(`\n  Improved ${improved}/${toImprove.length} descriptions in trial ${trial}`);

    if (improved === 0) {
      console.log('  No improvements made. Stopping early.');
      break;
    }
  }

  // ------------------------------------------------------------------
  // Phase 3: Final evaluation with improved descriptions
  // ------------------------------------------------------------------
  console.log(`\n${'='.repeat(72)}`);
  console.log('  Phase 3: Final evaluation');
  console.log('='.repeat(72));

  const finalResults = evaluateAll(evalQueries, currentDescriptions);
  const finalF1 = finalResults.reduce((sum, r) => sum + r.f1, 0) / finalResults.length;
  const improvement = finalF1 - baselineF1;

  console.log(`\n${'='.repeat(72)}`);
  console.log('  OPTIMIZATION RESULTS');
  console.log('='.repeat(72));
  console.log(`  Baseline F1:     ${(baselineF1 * 100).toFixed(1)}%`);
  console.log(`  Optimized F1:    ${(finalF1 * 100).toFixed(1)}%`);
  console.log(`  Improvement:     ${improvement >= 0 ? '+' : ''}${(improvement * 100).toFixed(1)}%`);
  console.log(`  Trials run:      ${NUM_TRIALS}`);
  console.log(`  Tools improved:  ${ALL_TOOLS.filter(t => currentDescriptions[t] !== toolDescriptions[t]).length}`);
  console.log('='.repeat(72));

  // Show changed descriptions
  const changedTools = ALL_TOOLS.filter(t => currentDescriptions[t] !== toolDescriptions[t]);
  if (changedTools.length > 0) {
    console.log('\nChanged descriptions:');
    console.log('-'.repeat(72));
    for (const tool of changedTools) {
      console.log(`\n${tool}:`);
      console.log(`  BEFORE: ${toolDescriptions[tool]}`);
      console.log(`  AFTER:  ${currentDescriptions[tool]}`);
    }
  }

  // ------------------------------------------------------------------
  // Save results
  // ------------------------------------------------------------------

  const outputData = {
    version: '3.0',
    being: 'flowmcp',
    task: 'tool-description-optimization',
    method: 'claude-p-mipro',
    baselineF1,
    optimizedF1: finalF1,
    improvement,
    trialsRun: NUM_TRIALS,
    toolsImproved: changedTools.length,
    descriptions: {
      baseline: { ...toolDescriptions },
      optimized: currentDescriptions,
      changed: Object.fromEntries(changedTools.map(t => [t, {
        before: toolDescriptions[t],
        after: currentDescriptions[t],
      }])),
    },
    config: {
      studentModel: 'haiku (claude -p --model haiku)',
      teacherModel: 'opus (claude -p --model opus)',
      provider: 'claude-cli',
      goldQueries: goldQueries.length,
      queriesEvaluated: evalQueries.length,
    },
    tools: [...ALL_TOOLS],
    created: new Date().toISOString(),
  };

  await fs.writeFile(OUTPUT_PATH, JSON.stringify(outputData, null, 2));
  console.log(`\nOptimization saved to ${OUTPUT_PATH}`);

  // Save detailed report
  const reportData = {
    summary: {
      baselineF1,
      optimizedF1: finalF1,
      improvement,
      trialsRun: NUM_TRIALS,
      toolsImproved: changedTools.length,
    },
    perQueryResults: finalResults,
    perToolErrors: analyzeToolErrors(finalResults),
    changedDescriptions: Object.fromEntries(changedTools.map(t => [t, {
      before: toolDescriptions[t],
      after: currentDescriptions[t],
    }])),
    created: new Date().toISOString(),
  };

  await fs.writeFile(REPORT_PATH, JSON.stringify(reportData, null, 2));
  console.log(`Detailed report saved to ${REPORT_PATH}`);

  // ------------------------------------------------------------------
  // Usage instructions
  // ------------------------------------------------------------------

  console.log(`\n${'='.repeat(72)}`);
  console.log('  HOW TO APPLY');
  console.log('='.repeat(72));
  console.log(`
  1. Review changed descriptions in ${OUTPUT_PATH}
  2. Copy improved descriptions into src/index.ts tool definitions
  3. Run npm test to verify no regressions
  4. Run this script again with --dry-run to measure new baseline

  The optimized descriptions use trigger language from the gold queries
  that the student model (Haiku) uses for routing. This is the same
  model stack that AI clients use in production.
`);
}

// ============================================================
// Entry Point
// ============================================================

main().catch(err => {
  console.error('Optimization failed:', err);
  process.exit(1);
});
