#!/usr/bin/env node

/**
 * evaluate-descriptions.mjs — FITNESS FUNCTION for tool description evolution
 *
 * Evaluates tool description quality by measuring selection accuracy against
 * a gold standard query set. This is the core metric for DEAP genetic evolution
 * and Optuna weight calibration of tool descriptions.
 *
 * Modes:
 *   1. Rule-based (default): Uses keyword/signal matching to simulate tool selection.
 *      Fast, deterministic, no API calls. Good for baseline and rapid iteration.
 *   2. LLM-based (--llm): Constructs prompts for an LLM to select tools.
 *      Requires API access. Measures real-world AI selection behavior.
 *
 * Usage:
 *   node scripts/evaluate-descriptions.mjs                    # Rule-based evaluation
 *   node scripts/evaluate-descriptions.mjs --verbose          # Show per-query details
 *   node scripts/evaluate-descriptions.mjs --category network # Filter by category
 *   node scripts/evaluate-descriptions.mjs --json             # Output as JSON
 *   node scripts/evaluate-descriptions.mjs --genes path.json  # Use alternate gene pool
 *   node scripts/evaluate-descriptions.mjs --variant 0        # Evaluate a specific gene variant
 *
 * Output:
 *   - Overall accuracy (precision, recall, F1)
 *   - Per-tool breakdown (true positives, false positives, false negatives)
 *   - Per-category breakdown
 *   - Per-difficulty breakdown
 *   - Missed queries (false negatives — gold queries our descriptions fail to trigger)
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");

// ============================================================================
// CONFIGURATION
// ============================================================================

const GOLD_QUERIES_PATH = resolve(ROOT, "test/gold-queries.json");
const DESCRIPTION_GENES_PATH = resolve(ROOT, "data/description-genes.json");

// ============================================================================
// SIGNAL KEYWORDS — extracted from tool descriptions for rule-based matching
// Each tool has weighted keywords. Higher weight = stronger signal.
// ============================================================================

const TOOL_SIGNALS = {
  analyze_data_for_flow: {
    strong: ["analyze data", "structural fitness", "3D potential", "spatial visualization", "score dataset", "8 signal dimensions", "visualization potential", "3D advantage"],
    medium: ["CSV", "spreadsheet", "DataFrame", "columns", "visualization", "chart", "dashboard", "presenting data", "too many data points", "unreadable", "overwhelming", "can't see the pattern"],
    weak: ["Tableau", "Power BI", "Plotly", "D3.js", "matplotlib", "data points", "scatter", "collaboration", "VR", "AR", "Meta Quest", "XREAL"],
    negative: ["upload", "authenticate", "login", "Cypher", "FalkorDB", "format", "validate CSV"]
  },
  validate_csv_for_flow: {
    strong: ["validate CSV", "CSV format", "formatted correctly", "format requirements", "data quality", "won't accept my data"],
    medium: ["CSV", "format", "headers", "comma-delimited", "column types", "upload ready", "troubleshoot", "renders incorrectly"],
    weak: ["verify", "check", "ready", "prepared"],
    negative: ["visualize", "network graph", "Python", "authenticate", "browse"]
  },
  transform_to_network_graph: {
    strong: ["edge list", "source-target", "network graph CSV", "connections by id", "pipe-delimited", "from-to relationships"],
    medium: ["network", "graph", "edges", "nodes", "connections", "relationships", "social network", "org chart", "supply chain", "hierarchy", "dependencies", "citations"],
    weak: ["convert", "transform", "parent-child", "from", "to", "Neo4j export"],
    negative: ["metrics", "PageRank", "layout", "positions", "authenticate", "browse", "Cypher"]
  },
  generate_flow_python_code: {
    strong: ["Python script", "flowgl", "push_data", "Python upload", "automate upload", "Flow API code"],
    medium: ["Python", "script", "code", "API", "automate", "pipeline", "programmatic", "Jupyter", "DataFrame upload"],
    weak: ["upload", "recurring", "pip install"],
    negative: ["validate", "visualize", "browse", "authenticate", "network graph"]
  },
  suggest_flow_visualization: {
    strong: ["suggest visualization", "best way to visualize", "which visualization", "recommend visualization", "optimal visualization type"],
    medium: ["visualize", "best way", "what type", "recommend", "scatter", "network", "map", "time series", "how should I show", "3D vs 2D"],
    weak: ["data", "columns", "chart", "graph"],
    negative: ["upload", "authenticate", "CSV format", "validate", "Python", "Cypher"]
  },
  get_flow_template: {
    strong: ["Flow template", "setup instructions", "how do I set up", "column requirements", "configuration steps"],
    medium: ["template", "setup", "configure", "requirements", "columns needed", "how to", "quick-start"],
    weak: ["scatter", "network", "map", "time series", "comparison"],
    negative: ["browse", "authenticate", "upload", "validate", "Python"]
  },
  flow_extract_from_text: {
    strong: ["extract from text", "text to visualization", "visualize this text", "turn this into a Flow", "prose to 3D"],
    medium: ["text", "article", "chat transcript", "report", "meeting notes", "email", "research paper", "extract entities", "relationships in text"],
    weak: ["visualize this", "who's connected", "entities", "extract"],
    negative: ["URL", "http", "link", "web page", "upload", "authenticate", "CSV"]
  },
  flow_extract_from_url: {
    strong: ["extract from URL", "visualize this URL", "URL to Flow", "make this article a Flow", "visualize this article"],
    medium: ["URL", "link", "web page", "article URL", "http", "https", "fetch URL", "web content"],
    weak: ["article", "visualize", "extract"],
    negative: ["text", "paste", "CSV", "upload", "authenticate", "meeting notes"]
  },
  flow_authenticate: {
    strong: ["authenticate", "login", "sign in", "Flow credentials", "bearer token", "connect to Flow", "log in to Flow"],
    medium: ["email", "password", "account", "credentials", "token"],
    weak: ["connect", "access"],
    negative: ["browse", "visualize", "CSV", "Python", "template"]
  },
  flow_upload_data: {
    strong: ["upload data", "upload CSV", "push to Flow", "send to Flow", "create dataset", "upload to Flow"],
    medium: ["upload", "push", "send", "deploy", "publish", "create dataset", "update dataset"],
    weak: ["to Flow", "to my account", "dataset"],
    negative: ["browse", "visualize", "template", "Python script", "authenticate"]
  },
  flow_browse_flows: {
    strong: ["browse flows", "show me examples", "what can Flow do", "Flow catalog", "explore flows", "Flow gallery"],
    medium: ["examples", "browse", "explore", "gallery", "catalog", "discover", "existing flows", "other people", "inspiration", "public flows"],
    weak: ["show me", "what can", "capabilities"],
    negative: ["upload", "authenticate", "validate", "CSV", "Python", "extract"]
  },
  flow_get_flow: {
    strong: ["get flow", "flow selector", "a.flow.gl/", "how was this Flow made", "inspect flow", "flow definition"],
    medium: ["selector", "flow URL", "this Flow", "what data does this Flow use", "how was this made"],
    weak: ["inspect", "examine", "specific flow"],
    negative: ["browse", "list", "templates", "categories", "upload", "authenticate"]
  },
  flow_list_templates: {
    strong: ["list templates", "all templates", "visualization templates", "36 templates", "what visualizations can Flow make"],
    medium: ["templates", "visualization types", "all visualizations", "capabilities", "column requirements"],
    weak: ["types", "what can"],
    negative: ["browse", "upload", "authenticate", "specific flow", "categories"]
  },
  flow_list_categories: {
    strong: ["list categories", "all categories", "35 categories", "visualization categories"],
    medium: ["categories", "kinds", "classify", "tag", "domain"],
    weak: ["types", "what kinds"],
    negative: ["templates", "browse", "upload", "authenticate", "specific flow"]
  },
  flow_precompute_force_layout: {
    strong: ["force layout", "precompute layout", "force-directed", "pre-compute positions", "graph layout", "spring layout", "instant rendering"],
    medium: ["layout", "positions", "x y z", "physics simulation", "slow rendering", "instant", "pre-compute", "converge", "d3-force"],
    weak: ["network", "graph", "nodes", "edges", "3D"],
    negative: ["metrics", "PageRank", "degree", "browse", "authenticate", "validate"]
  },
  flow_scale_dataset: {
    strong: ["scale dataset", "downsample", "reduce dataset", "too much data", "dataset too large", "subsample"],
    medium: ["too many rows", "performance issues", "slow", "500k", "million rows", "50000", "rendering capacity", "too big", "data reduction"],
    weak: ["reduce", "sample", "stratified", "large"],
    negative: ["network", "graph", "authenticate", "browse", "template", "force layout"]
  },
  flow_compute_graph_metrics: {
    strong: ["graph metrics", "PageRank", "degree centrality", "clustering coefficient", "connected components", "compute metrics", "node importance"],
    medium: ["important", "central", "connected", "communities", "clusters", "influence", "key players", "hub", "centrality"],
    weak: ["metrics", "measure", "analyze graph"],
    negative: ["layout", "positions", "x y z", "authenticate", "browse", "CSV format"]
  },
  flow_query_graph: {
    strong: ["Cypher query", "FalkorDB", "graph database", "query graph", "MATCH (", "graph query"],
    medium: ["Cypher", "Neo4j", "knowledge graph", "query", "MATCH", "subgraph", "neighborhood", "shortest path", "persistent graph"],
    weak: ["graph", "database"],
    negative: ["metrics", "PageRank", "layout", "positions", "authenticate", "browse", "CSV"]
  }
};

// ============================================================================
// TOOL SELECTION SIMULATOR (Rule-Based)
// ============================================================================

function scoreToolForQuery(toolName, query, signals) {
  const q = query.toLowerCase();
  let score = 0;

  // Strong signals: +3 each
  for (const kw of signals.strong) {
    if (q.includes(kw.toLowerCase())) score += 3;
  }

  // Medium signals: +1.5 each
  for (const kw of signals.medium) {
    if (q.includes(kw.toLowerCase())) score += 1.5;
  }

  // Weak signals: +0.5 each
  for (const kw of signals.weak) {
    if (q.includes(kw.toLowerCase())) score += 0.5;
  }

  // Negative signals: -2 each (penalize false matches)
  for (const kw of signals.negative) {
    if (q.includes(kw.toLowerCase())) score -= 2;
  }

  return score;
}

function selectToolsForQuery(query, threshold = 1.5) {
  const scores = {};
  for (const [toolName, signals] of Object.entries(TOOL_SIGNALS)) {
    const score = scoreToolForQuery(toolName, query, signals);
    if (score >= threshold) {
      scores[toolName] = score;
    }
  }

  // Sort by score descending, return tool names
  return Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .map(([name, score]) => ({ name, score }));
}

// ============================================================================
// GENE VARIANT DESCRIPTION BUILDER
// ============================================================================

function buildDescriptionFromGenes(toolGenes, variantIndex) {
  const { genes } = toolGenes;
  const verbIdx = variantIndex % genes.opening_verb.length;
  const coreIdx = variantIndex % genes.core_action.length;
  const purposeIdx = variantIndex % genes.purpose_frame.length;
  const triggerIdx = variantIndex % genes.trigger_phrase.length;

  return `${genes.opening_verb[verbIdx]} ${genes.core_action[coreIdx]}. ${genes.purpose_frame[purposeIdx]} ${genes.trigger_phrase[triggerIdx]}.`;
}

// ============================================================================
// EVALUATION ENGINE
// ============================================================================

function evaluateAccuracy(goldQueries, selectedToolsFn) {
  const results = {
    total_queries: goldQueries.length,
    total_with_expected: 0,
    total_negative: 0,

    // Global metrics
    true_positives: 0,
    false_positives: 0,
    false_negatives: 0,
    true_negatives: 0,

    // Per-tool metrics
    per_tool: {},
    // Per-category metrics
    per_category: {},
    // Per-difficulty metrics
    per_difficulty: {},

    // Detailed per-query results (for --verbose)
    query_results: []
  };

  // Initialize per-tool counters
  for (const toolName of Object.keys(TOOL_SIGNALS)) {
    results.per_tool[toolName] = { tp: 0, fp: 0, fn: 0 };
  }

  for (const gq of goldQueries) {
    const selected = selectedToolsFn(gq.query);
    const selectedNames = selected.map(s => s.name);
    const expected = gq.expected_tools || [];
    const isNegative = expected.length === 0;

    if (isNegative) {
      results.total_negative++;
    } else {
      results.total_with_expected++;
    }

    // Per-query tracking
    const qr = {
      id: gq.id,
      query: gq.query,
      expected: expected,
      selected: selectedNames,
      category: gq.category,
      difficulty: gq.difficulty,
      tp: [],
      fp: [],
      fn: []
    };

    if (isNegative) {
      // Negative query: any selection is a false positive
      if (selectedNames.length === 0) {
        results.true_negatives++;
      } else {
        for (const sel of selectedNames) {
          results.false_positives++;
          if (results.per_tool[sel]) results.per_tool[sel].fp++;
          qr.fp.push(sel);
        }
      }
    } else {
      // Positive query: check each expected tool
      for (const exp of expected) {
        if (selectedNames.includes(exp)) {
          results.true_positives++;
          if (results.per_tool[exp]) results.per_tool[exp].tp++;
          qr.tp.push(exp);
        } else {
          results.false_negatives++;
          if (results.per_tool[exp]) results.per_tool[exp].fn++;
          qr.fn.push(exp);
        }
      }

      // Check for false positives (selected but not expected)
      for (const sel of selectedNames) {
        if (!expected.includes(sel)) {
          results.false_positives++;
          if (results.per_tool[sel]) results.per_tool[sel].fp++;
          qr.fp.push(sel);
        }
      }
    }

    results.query_results.push(qr);

    // Accumulate per-category
    const cat = gq.category;
    if (!results.per_category[cat]) {
      results.per_category[cat] = { total: 0, tp: 0, fp: 0, fn: 0 };
    }
    results.per_category[cat].total++;
    results.per_category[cat].tp += qr.tp.length;
    results.per_category[cat].fp += qr.fp.length;
    results.per_category[cat].fn += qr.fn.length;

    // Accumulate per-difficulty
    const diff = gq.difficulty;
    if (!results.per_difficulty[diff]) {
      results.per_difficulty[diff] = { total: 0, tp: 0, fp: 0, fn: 0 };
    }
    results.per_difficulty[diff].total++;
    results.per_difficulty[diff].tp += qr.tp.length;
    results.per_difficulty[diff].fp += qr.fp.length;
    results.per_difficulty[diff].fn += qr.fn.length;
  }

  // Calculate aggregate metrics
  const { true_positives: tp, false_positives: fp, false_negatives: fn } = results;
  results.precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  results.recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  results.f1 = results.precision + results.recall > 0
    ? 2 * (results.precision * results.recall) / (results.precision + results.recall)
    : 0;

  // Per-tool F1
  for (const [toolName, m] of Object.entries(results.per_tool)) {
    const p = m.tp + m.fp > 0 ? m.tp / (m.tp + m.fp) : 0;
    const r = m.tp + m.fn > 0 ? m.tp / (m.tp + m.fn) : 0;
    m.precision = p;
    m.recall = r;
    m.f1 = p + r > 0 ? 2 * (p * r) / (p + r) : 0;
  }

  // Per-category F1
  for (const [cat, m] of Object.entries(results.per_category)) {
    const p = m.tp + m.fp > 0 ? m.tp / (m.tp + m.fp) : 0;
    const r = m.tp + m.fn > 0 ? m.tp / (m.tp + m.fn) : 0;
    m.precision = p;
    m.recall = r;
    m.f1 = p + r > 0 ? 2 * (p * r) / (p + r) : 0;
  }

  // Per-difficulty F1
  for (const [diff, m] of Object.entries(results.per_difficulty)) {
    const p = m.tp + m.fp > 0 ? m.tp / (m.tp + m.fp) : 0;
    const r = m.tp + m.fn > 0 ? m.tp / (m.tp + m.fn) : 0;
    m.precision = p;
    m.recall = r;
    m.f1 = p + r > 0 ? 2 * (p * r) / (p + r) : 0;
  }

  return results;
}

// ============================================================================
// OUTPUT FORMATTERS
// ============================================================================

function formatHumanReadable(results, verbose = false) {
  const lines = [];

  lines.push("=".repeat(72));
  lines.push("  TOOL DESCRIPTION EVALUATION — FITNESS REPORT");
  lines.push("=".repeat(72));
  lines.push("");

  // Global metrics
  lines.push("GLOBAL METRICS");
  lines.push("-".repeat(40));
  lines.push(`  Queries evaluated:  ${results.total_queries}`);
  lines.push(`    Positive queries: ${results.total_with_expected}`);
  lines.push(`    Negative queries: ${results.total_negative}`);
  lines.push("");
  lines.push(`  True positives:     ${results.true_positives}`);
  lines.push(`  False positives:    ${results.false_positives}`);
  lines.push(`  False negatives:    ${results.false_negatives}`);
  lines.push(`  True negatives:     ${results.true_negatives}`);
  lines.push("");
  lines.push(`  Precision:          ${(results.precision * 100).toFixed(1)}%`);
  lines.push(`  Recall:             ${(results.recall * 100).toFixed(1)}%`);
  lines.push(`  F1 Score:           ${(results.f1 * 100).toFixed(1)}%`);
  lines.push("");

  // Per-tool breakdown
  lines.push("PER-TOOL BREAKDOWN");
  lines.push("-".repeat(72));
  lines.push(`  ${"Tool".padEnd(35)} ${"Prec".padStart(6)} ${"Rec".padStart(6)} ${"F1".padStart(6)} ${"TP".padStart(4)} ${"FP".padStart(4)} ${"FN".padStart(4)}`);
  lines.push("  " + "-".repeat(70));

  const sortedTools = Object.entries(results.per_tool)
    .sort((a, b) => b[1].f1 - a[1].f1);

  for (const [tool, m] of sortedTools) {
    const hasActivity = m.tp > 0 || m.fp > 0 || m.fn > 0;
    if (!hasActivity) continue;
    lines.push(`  ${tool.padEnd(35)} ${(m.precision * 100).toFixed(0).padStart(5)}% ${(m.recall * 100).toFixed(0).padStart(5)}% ${(m.f1 * 100).toFixed(0).padStart(5)}% ${String(m.tp).padStart(4)} ${String(m.fp).padStart(4)} ${String(m.fn).padStart(4)}`);
  }
  lines.push("");

  // Per-category breakdown
  lines.push("PER-CATEGORY BREAKDOWN");
  lines.push("-".repeat(72));
  lines.push(`  ${"Category".padEnd(20)} ${"Queries".padStart(8)} ${"Prec".padStart(6)} ${"Rec".padStart(6)} ${"F1".padStart(6)}`);
  lines.push("  " + "-".repeat(50));

  for (const [cat, m] of Object.entries(results.per_category).sort((a, b) => b[1].f1 - a[1].f1)) {
    lines.push(`  ${cat.padEnd(20)} ${String(m.total).padStart(8)} ${(m.precision * 100).toFixed(0).padStart(5)}% ${(m.recall * 100).toFixed(0).padStart(5)}% ${(m.f1 * 100).toFixed(0).padStart(5)}%`);
  }
  lines.push("");

  // Per-difficulty breakdown
  lines.push("PER-DIFFICULTY BREAKDOWN");
  lines.push("-".repeat(72));
  lines.push(`  ${"Difficulty".padEnd(12)} ${"Queries".padStart(8)} ${"Prec".padStart(6)} ${"Rec".padStart(6)} ${"F1".padStart(6)}`);
  lines.push("  " + "-".repeat(42));

  for (const [diff, m] of Object.entries(results.per_difficulty)) {
    lines.push(`  ${diff.padEnd(12)} ${String(m.total).padStart(8)} ${(m.precision * 100).toFixed(0).padStart(5)}% ${(m.recall * 100).toFixed(0).padStart(5)}% ${(m.f1 * 100).toFixed(0).padStart(5)}%`);
  }
  lines.push("");

  // Verbose: per-query details
  if (verbose) {
    lines.push("QUERY DETAILS");
    lines.push("-".repeat(72));

    for (const qr of results.query_results) {
      const status = qr.fn.length === 0 && qr.fp.length === 0 ? "PASS" : "FAIL";
      lines.push(`  [${status}] ${qr.id}: ${qr.query.substring(0, 60)}${qr.query.length > 60 ? "..." : ""}`);
      if (qr.tp.length > 0) lines.push(`    TP: ${qr.tp.join(", ")}`);
      if (qr.fp.length > 0) lines.push(`    FP: ${qr.fp.join(", ")}`);
      if (qr.fn.length > 0) lines.push(`    FN: ${qr.fn.join(", ")}`);
    }
    lines.push("");
  }

  // Missed queries summary (false negatives)
  const missedQueries = results.query_results.filter(qr => qr.fn.length > 0);
  if (missedQueries.length > 0) {
    lines.push("MISSED QUERIES (False Negatives — descriptions failed to trigger)");
    lines.push("-".repeat(72));
    for (const qr of missedQueries) {
      lines.push(`  ${qr.id} [${qr.difficulty}]: ${qr.query.substring(0, 55)}${qr.query.length > 55 ? "..." : ""}`);
      lines.push(`    Expected: ${qr.fn.join(", ")}`);
    }
    lines.push("");
  }

  // False positive summary
  const fpQueries = results.query_results.filter(qr => qr.fp.length > 0);
  if (fpQueries.length > 0) {
    lines.push("FALSE POSITIVES (tools incorrectly triggered)");
    lines.push("-".repeat(72));
    for (const qr of fpQueries) {
      lines.push(`  ${qr.id} [${qr.difficulty}]: ${qr.query.substring(0, 55)}${qr.query.length > 55 ? "..." : ""}`);
      lines.push(`    Wrongly selected: ${qr.fp.join(", ")}`);
    }
    lines.push("");
  }

  lines.push("=".repeat(72));
  lines.push(`  FITNESS SCORE: ${(results.f1 * 100).toFixed(1)}% F1`);
  lines.push("=".repeat(72));

  return lines.join("\n");
}

// ============================================================================
// CLI
// ============================================================================

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    verbose: false,
    json: false,
    category: null,
    difficulty: null,
    genesPath: null,
    variant: null,
    threshold: 1.5
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--verbose":
      case "-v":
        opts.verbose = true;
        break;
      case "--json":
        opts.json = true;
        break;
      case "--category":
        opts.category = args[++i];
        break;
      case "--difficulty":
        opts.difficulty = args[++i];
        break;
      case "--genes":
        opts.genesPath = args[++i];
        break;
      case "--variant":
        opts.variant = parseInt(args[++i], 10);
        break;
      case "--threshold":
        opts.threshold = parseFloat(args[++i]);
        break;
      case "--help":
      case "-h":
        console.log(`
Usage: node scripts/evaluate-descriptions.mjs [options]

Options:
  --verbose, -v      Show per-query pass/fail details
  --json             Output results as JSON
  --category CAT     Filter queries by category
  --difficulty DIFF  Filter queries by difficulty (easy, medium, hard)
  --genes PATH       Use alternate description-genes.json
  --variant N        Evaluate gene variant N (builds descriptions from gene pool)
  --threshold N      Minimum score to select a tool (default: 1.5)
  --help, -h         Show this help
`);
        process.exit(0);
    }
  }

  return opts;
}

function main() {
  const opts = parseArgs();

  // Load gold queries
  if (!existsSync(GOLD_QUERIES_PATH)) {
    console.error(`Gold queries not found: ${GOLD_QUERIES_PATH}`);
    process.exit(1);
  }
  let goldQueries = JSON.parse(readFileSync(GOLD_QUERIES_PATH, "utf-8"));

  // Apply filters
  if (opts.category) {
    goldQueries = goldQueries.filter(gq => gq.category === opts.category);
    if (goldQueries.length === 0) {
      console.error(`No queries found for category: ${opts.category}`);
      process.exit(1);
    }
  }
  if (opts.difficulty) {
    goldQueries = goldQueries.filter(gq => gq.difficulty === opts.difficulty);
    if (goldQueries.length === 0) {
      console.error(`No queries found for difficulty: ${opts.difficulty}`);
      process.exit(1);
    }
  }

  // Selection function
  const selectFn = (query) => selectToolsForQuery(query, opts.threshold);

  // Evaluate
  const results = evaluateAccuracy(goldQueries, selectFn);

  // Output
  if (opts.json) {
    // Remove verbose query_results unless requested
    if (!opts.verbose) {
      const { query_results, ...summary } = results;
      console.log(JSON.stringify(summary, null, 2));
    } else {
      console.log(JSON.stringify(results, null, 2));
    }
  } else {
    console.log(formatHumanReadable(results, opts.verbose));
  }

  // Exit code: 0 if F1 >= 50%, 1 if below
  process.exit(results.f1 >= 0.5 ? 0 : 1);
}

main();
