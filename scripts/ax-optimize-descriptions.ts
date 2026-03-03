#!/usr/bin/env npx tsx
/**
 * ax-optimize-descriptions.ts — Ax MiPRO optimization for flowmcp tool descriptions
 *
 * Uses the 79 gold queries as training data and F1 score as the metric to
 * optimize the prompt that selects which tools match a user query.
 *
 * The optimized instruction and few-shot demos teach an LLM to route user
 * queries to the correct subset of 18 Flow Immersive MCP tools.
 *
 * Usage:
 *   npx tsx scripts/ax-optimize-descriptions.ts
 *   npx tsx scripts/ax-optimize-descriptions.ts --trials 20
 *   npx tsx scripts/ax-optimize-descriptions.ts --dry-run
 *
 * Requires:
 *   npm install @ax-llm/ax dotenv
 *   OPENROUTER_API_KEY in environment or /hive/shared/credentials/openrouter.env
 */

import { ai, ax, AxMiPRO, AxOptimizedProgramImpl, type AxMetricFn } from '@ax-llm/ax';
import { promises as fs } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

// ============================================================
// Configuration
// ============================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

const GOLD_QUERIES_PATH = resolve(ROOT, 'test/gold-queries.json');
const OUTPUT_PATH = resolve(ROOT, 'data/ax-optimized-descriptions.json');
const BASELINE_REPORT_PATH = resolve(ROOT, 'data/ax-optimization-report.json');

// Load OpenRouter API key
config({ path: '/hive/shared/credentials/openrouter.env' });

if (!process.env.OPENROUTER_API_KEY) {
  console.error('OPENROUTER_API_KEY not found. Check /hive/shared/credentials/openrouter.env');
  process.exit(1);
}

// ============================================================
// CLI Arguments
// ============================================================

const args = process.argv.slice(2);
const NUM_TRIALS = parseInt(args.find((_, i, a) => a[i - 1] === '--trials') || '10', 10);
const EARLY_STOPPING = parseInt(args.find((_, i, a) => a[i - 1] === '--early-stop') || '3', 10);
const DRY_RUN = args.includes('--dry-run');
const VERBOSE = args.includes('--verbose');

// ============================================================
// All 18 Flow Immersive MCP Tools
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
] as const;

// Tool descriptions for context (current production descriptions, abbreviated)
const TOOL_SUMMARIES: Record<string, string> = {
  analyze_data_for_flow: 'Measure dataset structural fitness for 3D spatial visualization across 8 signal dimensions',
  validate_csv_for_flow: 'Diagnose CSV data against Flow Immersive format requirements',
  transform_to_network_graph: 'Construct Flow network graph CSV from edge-list data (source-target pairs)',
  generate_flow_python_code: 'Generate ready-to-run Python upload script for Flow Immersive',
  suggest_flow_visualization: 'Recommend optimal visualization type from column metadata',
  get_flow_template: 'Retrieve Flow Immersive template with setup instructions and column requirements',
  flow_extract_from_text: 'Decompose unstructured text into structured data for 3D visualization',
  flow_extract_from_url: 'Fetch URL content and extract structured data for Flow visualization',
  flow_authenticate: 'Authenticate with Flow Immersive API (email/password to bearer token)',
  flow_upload_data: 'Create or update datasets via Flow Immersive API',
  flow_browse_flows: 'Browse 26k+ public flows in the Flow Immersive catalog',
  flow_get_flow: 'Get full flow definition by selector (URL or ID)',
  flow_list_templates: 'List all 36 visualization templates with column requirements',
  flow_list_categories: 'List all 35 visualization categories',
  flow_precompute_force_layout: 'Pre-compute force-directed 3D layout positions for instant rendering',
  flow_scale_dataset: 'Intelligently reduce dataset size (random, stratified, spatial binning)',
  flow_compute_graph_metrics: 'Compute graph metrics: degree, PageRank, components, clustering',
  flow_query_graph: 'Query FalkorDB graph database with Cypher and output Flow-compatible CSV',
};

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
// Model Setup
// ============================================================

// Student: cheap model for running evaluations (called many times)
const studentAI = ai({
  name: 'openrouter',
  apiKey: process.env.OPENROUTER_API_KEY!,
  config: { model: 'anthropic/claude-haiku-4-5' }
});

// Teacher: apex model for generating prompt candidates (called few times)
// halyx directive: always use Opus unless defended. Teacher = Opus (few calls, quality matters).
const teacherAI = ai({
  name: 'openrouter',
  apiKey: process.env.OPENROUTER_API_KEY!,
  config: { model: 'anthropic/claude-opus-4-6' }
});

// ============================================================
// Ax Program Definition
// ============================================================

// The signature: given a user query and tool catalog, select the right tools
const toolSelector = ax(`
  userQuery:string "Natural language user query about data visualization, CSV processing, network graphs, or Flow Immersive"
  toolCatalog:string "Available tools with descriptions"
  ->
  selectedTools:string "Comma-separated names of tools that should handle this query. Select 1-3 most relevant tools."
`);

// ============================================================
// Training Data Preparation
// ============================================================

async function loadGoldQueries(): Promise<GoldQuery[]> {
  const raw = await fs.readFile(GOLD_QUERIES_PATH, 'utf8');
  return JSON.parse(raw);
}

function buildToolCatalog(): string {
  return ALL_TOOLS.map(tool => `- ${tool}: ${TOOL_SUMMARIES[tool]}`).join('\n');
}

function goldQueriesToExamples(queries: GoldQuery[]) {
  const catalog = buildToolCatalog();
  return queries
    .filter(q => q.expected_tools.length > 0) // Only positive examples
    .map(q => ({
      userQuery: q.query,
      toolCatalog: catalog,
      selectedTools: q.expected_tools.join(', ')
    }));
}

// ============================================================
// Metric Function: F1 Score
// ============================================================

const toolSelectionMetric: AxMetricFn = ({ prediction, example }) => {
  // Parse predicted tools (comma-separated, potentially with extra whitespace)
  const predictedRaw = (prediction?.selectedTools || '') as string;
  const predicted = new Set(
    predictedRaw
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(s => s.length > 0 && ALL_TOOLS.includes(s as any))
  );

  // Parse expected tools
  const expectedRaw = (example?.selectedTools || '') as string;
  const expected = new Set(
    expectedRaw
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(Boolean)
  );

  // Edge case: both empty
  if (predicted.size === 0 && expected.size === 0) return 1.0;
  if (predicted.size === 0 || expected.size === 0) return 0.0;

  // Calculate F1
  let truePositives = 0;
  for (const tool of predicted) {
    if (expected.has(tool)) truePositives++;
  }

  const precision = truePositives / predicted.size;
  const recall = truePositives / expected.size;

  if (precision + recall === 0) return 0.0;
  const f1 = 2 * (precision * recall) / (precision + recall);

  return f1;
};

// ============================================================
// Baseline Evaluation
// ============================================================

async function evaluateBaseline(
  examples: Array<{ userQuery: string; toolCatalog: string; selectedTools: string }>
): Promise<number> {
  console.log('Running baseline evaluation (no optimization)...');

  let totalScore = 0;
  let evaluated = 0;
  const sampleSize = Math.min(examples.length, 20); // Evaluate on subset to save cost
  const sample = examples.slice(0, sampleSize);

  for (const ex of sample) {
    try {
      const result = await toolSelector.forward(studentAI, {
        userQuery: ex.userQuery,
        toolCatalog: ex.toolCatalog,
      });

      const score = toolSelectionMetric({
        prediction: result,
        example: ex
      });

      totalScore += score;
      evaluated++;

      if (VERBOSE) {
        console.log(`  [${evaluated}/${sampleSize}] Score: ${score.toFixed(2)} | Query: ${ex.userQuery.substring(0, 60)}...`);
        console.log(`    Expected: ${ex.selectedTools}`);
        console.log(`    Got: ${result.selectedTools || '(none)'}`);
      }
    } catch (err) {
      console.log(`  [${evaluated + 1}/${sampleSize}] Error: ${(err as Error).message}`);
      evaluated++;
    }
  }

  const avgScore = evaluated > 0 ? totalScore / evaluated : 0;
  console.log(`Baseline F1: ${(avgScore * 100).toFixed(1)}% (${evaluated} queries evaluated)\n`);
  return avgScore;
}

// ============================================================
// Main Optimization
// ============================================================

async function main() {
  console.log('='.repeat(72));
  console.log('  Ax MiPRO Optimization: flowmcp Tool Description Selection');
  console.log('='.repeat(72));
  console.log(`  Trials: ${NUM_TRIALS}`);
  console.log(`  Early stopping: ${EARLY_STOPPING} trials`);
  console.log(`  Student model: anthropic/claude-haiku-4-5`);
  console.log(`  Teacher model: anthropic/claude-opus-4-6`);
  console.log(`  Provider: OpenRouter`);
  console.log(`  Dry run: ${DRY_RUN}`);
  console.log('');

  // Load gold queries
  const goldQueries = await loadGoldQueries();
  console.log(`Loaded ${goldQueries.length} gold queries from ${GOLD_QUERIES_PATH}`);

  // Convert to Ax examples
  const allExamples = goldQueriesToExamples(goldQueries);
  console.log(`Positive examples (with expected tools): ${allExamples.length}`);

  // Split 80/20 for train/validation
  const shuffled = [...allExamples].sort(() => Math.random() - 0.5);
  const splitIdx = Math.floor(shuffled.length * 0.8);
  const trainExamples = shuffled.slice(0, splitIdx);
  const valExamples = shuffled.slice(splitIdx);

  console.log(`Training set: ${trainExamples.length} examples`);
  console.log(`Validation set: ${valExamples.length} examples`);
  console.log('');

  // Baseline evaluation
  const baselineScore = await evaluateBaseline(valExamples);

  if (DRY_RUN) {
    console.log('Dry run complete. Exiting without optimization.');
    console.log(`Would optimize ${trainExamples.length} examples over ${NUM_TRIALS} trials.`);
    return;
  }

  // Run MiPRO optimization
  console.log('Starting MiPRO optimization...');
  console.log('-'.repeat(72));

  const startTime = Date.now();

  const optimizer = new AxMiPRO({
    studentAI,
    teacherAI,
    examples: trainExamples,
    numTrials: NUM_TRIALS,
    earlyStoppingTrials: EARLY_STOPPING,
    options: { verbose: true },
    onProgress: (update) => {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      console.log(
        `  Trial ${String(update.round).padStart(2)}: ` +
        `score=${update.currentScore.toFixed(3)} | ` +
        `best=${update.bestScore?.toFixed(3) || 'N/A'} | ` +
        `${elapsed}s elapsed`
      );
    }
  });

  const result = await optimizer.compile(toolSelector, trainExamples, toolSelectionMetric);

  const optimizationTime = Date.now() - startTime;
  console.log('-'.repeat(72));
  console.log(`Optimization completed in ${(optimizationTime / 1000).toFixed(1)}s`);

  if (!result.optimizedProgram) {
    console.log('Optimization did not produce an improved program.');
    return;
  }

  // Apply optimization
  toolSelector.applyOptimization(result.optimizedProgram);

  // Evaluate on validation set
  console.log('\nValidation evaluation (optimized)...');
  let valScore = 0;
  let valCount = 0;
  const perQueryResults: Array<{
    query: string;
    expected: string;
    predicted: string;
    score: number;
  }> = [];

  for (const ex of valExamples) {
    try {
      const pred = await toolSelector.forward(studentAI, {
        userQuery: ex.userQuery,
        toolCatalog: ex.toolCatalog,
      });

      const score = toolSelectionMetric({ prediction: pred, example: ex });
      valScore += score;
      valCount++;

      perQueryResults.push({
        query: ex.userQuery,
        expected: ex.selectedTools,
        predicted: (pred.selectedTools as string) || '',
        score
      });

      if (VERBOSE) {
        const status = score >= 0.8 ? 'PASS' : score >= 0.4 ? 'PARTIAL' : 'FAIL';
        console.log(`  [${status}] ${ex.userQuery.substring(0, 60)} | F1=${score.toFixed(2)}`);
      }
    } catch (err) {
      valCount++;
      perQueryResults.push({
        query: ex.userQuery,
        expected: ex.selectedTools,
        predicted: `ERROR: ${(err as Error).message}`,
        score: 0
      });
    }
  }

  const avgValScore = valCount > 0 ? valScore / valCount : 0;
  const improvement = avgValScore - baselineScore;

  // ============================================================
  // Results
  // ============================================================

  console.log('\n' + '='.repeat(72));
  console.log('  OPTIMIZATION RESULTS');
  console.log('='.repeat(72));
  console.log(`  Baseline F1:      ${(baselineScore * 100).toFixed(1)}%`);
  console.log(`  Optimized F1:     ${(avgValScore * 100).toFixed(1)}%`);
  console.log(`  Improvement:      ${improvement >= 0 ? '+' : ''}${(improvement * 100).toFixed(1)}%`);
  console.log(`  Training score:   ${(result.optimizedProgram.bestScore * 100).toFixed(1)}%`);
  console.log(`  Converged:        ${result.optimizedProgram.converged}`);
  console.log(`  Total rounds:     ${result.optimizedProgram.totalRounds}`);
  console.log(`  Optimization time: ${(optimizationTime / 1000).toFixed(1)}s`);
  console.log(`  Optimizer:        ${result.optimizedProgram.optimizerType}`);
  console.log('='.repeat(72));

  // Show the optimized instruction
  if (result.optimizedProgram.instruction) {
    console.log('\nOptimized Instruction:');
    console.log('-'.repeat(72));
    console.log(result.optimizedProgram.instruction);
    console.log('-'.repeat(72));
  }

  // Show demos count
  if (result.optimizedProgram.demos) {
    console.log(`\nFew-shot demos: ${result.optimizedProgram.demos.length} examples`);
  }

  // ============================================================
  // Save Results
  // ============================================================

  const outputData = {
    version: '2.0',
    being: 'flowmcp',
    task: 'tool-description-selection',
    bestScore: result.optimizedProgram.bestScore,
    validationScore: avgValScore,
    baselineScore,
    improvement,
    instruction: result.optimizedProgram.instruction,
    demos: result.optimizedProgram.demos,
    modelConfig: result.optimizedProgram.modelConfig,
    optimizerType: result.optimizedProgram.optimizerType,
    optimizationTime: result.optimizedProgram.optimizationTime,
    totalRounds: result.optimizedProgram.totalRounds,
    converged: result.optimizedProgram.converged,
    stats: result.optimizedProgram.stats,
    config: {
      numTrials: NUM_TRIALS,
      earlyStoppingTrials: EARLY_STOPPING,
      studentModel: 'anthropic/claude-haiku-4-5',
      teacherModel: 'anthropic/claude-opus-4-6',
      provider: 'openrouter',
      trainingExamples: trainExamples.length,
      validationExamples: valExamples.length,
      totalGoldQueries: goldQueries.length
    },
    tools: ALL_TOOLS,
    toolDescriptions: TOOL_SUMMARIES,
    created: new Date().toISOString()
  };

  await fs.writeFile(OUTPUT_PATH, JSON.stringify(outputData, null, 2));
  console.log(`\nOptimization saved to ${OUTPUT_PATH}`);

  // Save detailed report
  const reportData = {
    summary: {
      baseline: baselineScore,
      optimized: avgValScore,
      improvement,
      trainScore: result.optimizedProgram.bestScore,
      converged: result.optimizedProgram.converged,
      rounds: result.optimizedProgram.totalRounds,
      timeMs: optimizationTime
    },
    perQueryResults,
    instruction: result.optimizedProgram.instruction,
    demosCount: result.optimizedProgram.demos?.length || 0,
    created: new Date().toISOString()
  };

  await fs.writeFile(BASELINE_REPORT_PATH, JSON.stringify(reportData, null, 2));
  console.log(`Detailed report saved to ${BASELINE_REPORT_PATH}`);

  // ============================================================
  // Usage Instructions
  // ============================================================

  console.log('\n' + '='.repeat(72));
  console.log('  HOW TO USE IN PRODUCTION');
  console.log('='.repeat(72));
  console.log(`
  1. Load the optimization at server startup:

     import { ax, AxOptimizedProgramImpl } from '@ax-llm/ax';
     import { readFileSync } from 'fs';

     const saved = JSON.parse(readFileSync('${OUTPUT_PATH}', 'utf8'));
     const toolSelector = ax(\`
       userQuery:string -> selectedTools:string
     \`);
     toolSelector.applyOptimization(new AxOptimizedProgramImpl(saved));

  2. Use the optimized instruction text to refine tool descriptions
     in src/index.ts for improved AI tool selection.

  3. The few-shot demos can be added to your MCP server's system
     prompt to improve tool routing.
`);
}

// ============================================================
// Entry Point
// ============================================================

main().catch(err => {
  console.error('Optimization failed:', err);
  process.exit(1);
});
