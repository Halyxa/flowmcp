#!/usr/bin/env python3
"""
optuna-optimize.py — Optuna TPE optimization of tool description signal weights + thresholds.

Optimizes the rule-based tool selection to maximize F1 score on gold-queries.json.
Embeds the evaluation logic directly (no subprocess) for maximum throughput.

Search space (23 dimensions):
  - 4 global signal weights: strong, medium, weak, negative
  - 18 per-tool thresholds (one per tool)
  - 1 global threshold fallback

Floor penalty: per-tool recall >= 0.3 or -0.15 penalty per violating tool.
This prevents optimizers from gaming the global F1 by sacrificing minority tools.

Usage:
  python3 scripts/optuna-optimize.py                      # 5000 trials, 48 workers
  python3 scripts/optuna-optimize.py --trials 50000       # More trials
  python3 scripts/optuna-optimize.py --workers 96         # All cores
  python3 scripts/optuna-optimize.py --study-name my_run  # Custom study name
"""

import json
import os
import sys
import time
import argparse
import multiprocessing
from pathlib import Path

import optuna
from optuna.samplers import TPESampler
from optuna.pruners import MedianPruner

# ============================================================================
# PATHS
# ============================================================================

ROOT = Path(__file__).resolve().parent.parent
GOLD_QUERIES_PATH = ROOT / "test" / "gold-queries.json"
GENES_PATH = ROOT / "data" / "description-genes.json"
RESULTS_PATH = ROOT / "data" / "optuna-best-descriptions.json"
STUDY_DB_PATH = ROOT / "data" / "optuna-study.db"

# ============================================================================
# TOOL SIGNALS — Copied from evaluate-descriptions.mjs for zero-subprocess eval.
# These are the keywords used for rule-based tool selection scoring.
# ============================================================================

TOOL_SIGNALS = {
    "analyze_data_for_flow": {
        "strong": ["analyze data for flow", "structural fitness", "3D potential", "score dataset", "8 signal dimensions", "visualization potential", "3D advantage", "is my data suitable for 3D"],
        "medium": ["too many data points", "unreadable", "overwhelming", "can't see the pattern", "presenting data", "spreadsheet", "columns"],
        "weak": ["Tableau", "Power BI", "Plotly", "D3.js", "matplotlib", "VR", "AR", "Meta Quest", "XREAL"],
        "negative": ["upload", "authenticate", "login", "Cypher", "FalkorDB", "validate CSV", "geocode", "anomaly", "merge", "export", "search flows", "animate", "join", "pie chart", "bar chart", "Python function", "debug", "category list", "template list"]
    },
    "validate_csv_for_flow": {
        "strong": ["validate CSV", "CSV format", "formatted correctly", "format requirements", "data quality", "won't accept my data", "check if this CSV will work"],
        "medium": ["headers", "comma-delimited", "column types", "upload ready", "troubleshoot", "renders incorrectly"],
        "weak": ["verify format", "check format"],
        "negative": ["visualize", "network graph", "Python", "authenticate", "browse", "geocode", "anomaly", "merge", "export", "search", "animate", "pie chart", "bar chart", "debug", "sort", "template", "weather", "analyze data"]
    },
    "transform_to_network_graph": {
        "strong": ["edge list", "source-target", "network graph CSV", "connections by id", "pipe-delimited", "from-to relationships", "convert to network"],
        "medium": ["edges", "connections", "social network", "org chart", "supply chain", "hierarchy", "dependencies", "citations", "who talks to whom"],
        "weak": ["Neo4j export"],
        "negative": ["metrics", "PageRank", "layout", "positions", "authenticate", "browse", "Cypher", "FalkorDB", "shortest path", "subgraph", "knowledge graph", "geocode", "anomaly", "merge", "export", "search flows", "template", "column requirements", "minimum column"]
    },
    "generate_flow_python_code": {
        "strong": ["Python script", "flowgl", "push_data", "Python upload", "automate upload", "Flow API code"],
        "medium": ["Python", "script", "code", "API", "automate", "pipeline", "programmatic", "Jupyter", "DataFrame upload"],
        "weak": ["upload", "recurring", "pip install"],
        "negative": ["validate", "visualize", "browse", "authenticate", "network graph"]
    },
    "suggest_flow_visualization": {
        "strong": ["suggest visualization", "best way to visualize", "which visualization", "recommend visualization", "optimal visualization type", "what type of viz"],
        "medium": ["how should I show", "3D vs 2D", "should I use a scatter", "should I use a network", "what can Flow do", "visualization type"],
        "weak": ["best way", "visualize my"],
        "negative": ["upload", "authenticate", "CSV format", "validate", "Python", "Cypher", "geocode", "anomaly", "merge", "export", "animate", "search flows", "template requirements", "minimum column", "pie chart", "bar chart", "debug", "sort a list"]
    },
    "get_flow_template": {
        "strong": ["Flow template", "setup instructions", "how do I set up", "column requirements", "configuration steps"],
        "medium": ["template", "setup", "configure", "requirements", "columns needed", "how to", "quick-start"],
        "weak": ["scatter", "network", "map", "time series", "comparison"],
        "negative": ["browse", "authenticate", "upload", "validate", "Python"]
    },
    "flow_extract_from_text": {
        "strong": ["extract from text", "text to visualization", "visualize this text", "turn this text into a Flow", "prose to 3D"],
        "medium": ["article text", "chat transcript", "meeting notes", "extract entities from text", "relationships in text", "pasted text"],
        "weak": ["who's connected in this text"],
        "negative": ["URL", "http", "link", "web page", "upload", "authenticate", "CSV", "geocode", "anomaly", "merge", "export", "search", "animate", "Cypher", "template", "browse", "email and password", "correspondence data", "Power BI"]
    },
    "flow_extract_from_url": {
        "strong": ["extract from URL", "visualize this URL", "URL to Flow", "make this article a Flow", "visualize this article"],
        "medium": ["URL", "link", "web page", "article URL", "http", "https", "fetch URL", "web content"],
        "weak": ["article", "visualize", "extract"],
        "negative": ["text", "paste", "CSV", "upload", "authenticate", "meeting notes"]
    },
    "flow_authenticate": {
        "strong": ["authenticate", "login", "sign in", "Flow credentials", "bearer token", "connect to Flow", "log in to Flow"],
        "medium": ["email", "password", "account", "credentials", "token"],
        "weak": ["connect", "access"],
        "negative": ["browse", "visualize", "CSV", "Python", "template"]
    },
    "flow_upload_data": {
        "strong": ["upload data", "upload CSV", "push to Flow", "send to Flow", "create dataset", "upload to Flow"],
        "medium": ["upload", "push", "send", "deploy", "publish", "create dataset", "update dataset"],
        "weak": ["to Flow", "to my account", "dataset"],
        "negative": ["browse", "visualize", "template", "Python script", "authenticate"]
    },
    "flow_browse_flows": {
        "strong": ["browse flows", "show me examples", "what can Flow do", "Flow catalog", "explore flows", "Flow gallery"],
        "medium": ["examples", "browse", "explore", "gallery", "catalog", "discover", "existing flows", "other people", "inspiration", "public flows"],
        "weak": ["show me", "what can", "capabilities"],
        "negative": ["upload", "authenticate", "validate", "CSV", "Python", "extract"]
    },
    "flow_get_flow": {
        "strong": ["get flow", "flow selector", "a.flow.gl/", "how was this Flow made", "inspect flow", "flow definition"],
        "medium": ["selector", "flow URL", "this Flow", "what data does this Flow use", "how was this made"],
        "weak": ["inspect", "examine", "specific flow"],
        "negative": ["browse", "list", "templates", "categories", "upload", "authenticate"]
    },
    "flow_list_templates": {
        "strong": ["list templates", "all templates", "visualization templates", "36 templates", "what visualizations can Flow make"],
        "medium": ["templates", "visualization types", "all visualizations", "capabilities", "column requirements"],
        "weak": ["types", "what can"],
        "negative": ["browse", "upload", "authenticate", "specific flow", "categories"]
    },
    "flow_list_categories": {
        "strong": ["list categories", "all categories", "35 categories", "visualization categories"],
        "medium": ["categories", "kinds", "classify", "tag", "domain"],
        "weak": ["types", "what kinds"],
        "negative": ["templates", "browse", "upload", "authenticate", "specific flow"]
    },
    "flow_precompute_force_layout": {
        "strong": ["force layout", "precompute layout", "force-directed", "pre-compute positions", "graph layout", "spring layout", "instant rendering"],
        "medium": ["layout", "positions", "x y z", "physics simulation", "slow rendering", "instant", "pre-compute", "converge", "d3-force"],
        "weak": ["network", "graph", "nodes", "edges", "3D"],
        "negative": ["metrics", "PageRank", "degree", "browse", "authenticate", "validate"]
    },
    "flow_scale_dataset": {
        "strong": ["scale dataset", "downsample", "reduce dataset", "too much data", "dataset too large", "subsample"],
        "medium": ["too many rows", "performance issues", "slow", "500k", "million rows", "50000", "rendering capacity", "too big", "data reduction"],
        "weak": ["reduce", "sample", "stratified", "large"],
        "negative": ["network", "graph", "authenticate", "browse", "template", "force layout"]
    },
    "flow_compute_graph_metrics": {
        "strong": ["graph metrics", "PageRank", "degree centrality", "clustering coefficient", "connected components", "compute metrics", "node importance"],
        "medium": ["important", "central", "connected", "communities", "clusters", "influence", "key players", "hub", "centrality"],
        "weak": ["metrics", "measure", "analyze graph"],
        "negative": ["layout", "positions", "x y z", "authenticate", "browse", "CSV format"]
    },
    "flow_query_graph": {
        "strong": ["Cypher query", "FalkorDB", "graph database", "query graph", "MATCH (", "graph query"],
        "medium": ["Cypher", "Neo4j", "knowledge graph", "query", "MATCH", "subgraph", "neighborhood", "shortest path", "persistent graph"],
        "weak": ["graph", "database"],
        "negative": ["metrics", "PageRank", "layout", "positions", "authenticate", "browse", "CSV"]
    },
    "flow_semantic_search": {
        "strong": ["search flows", "find flows", "search Flow catalog", "discover flows", "find visualizations about", "search for flows"],
        "medium": ["search", "find", "discover", "look for", "flows about", "visualizations about", "explore catalog", "topic", "related flows"],
        "weak": ["similar", "like", "example", "show me"],
        "negative": ["upload", "authenticate", "validate", "extract", "template", "category list"]
    },
    "flow_time_series_animate": {
        "strong": ["animate", "time series animation", "animation frames", "temporal animation", "time lapse", "evolution over time", "show change over time"],
        "medium": ["time series", "temporal", "over time", "progression", "frames", "keyframes", "animate", "animation", "chronological", "date column"],
        "weak": ["time", "date", "trend", "quarterly", "monthly", "yearly"],
        "negative": ["upload", "authenticate", "validate", "browse", "template", "static"]
    },
    "flow_merge_datasets": {
        "strong": ["merge datasets", "join datasets", "combine datasets", "concatenate CSV", "union datasets", "merge CSV"],
        "medium": ["merge", "join", "combine", "concatenate", "union", "multiple datasets", "multiple CSV", "two datasets", "enrich dataset"],
        "weak": ["together", "multiple", "sources", "files"],
        "negative": ["upload", "authenticate", "validate", "browse", "template", "single"]
    },
    "flow_anomaly_detect": {
        "strong": ["anomaly detection", "detect anomalies", "find outliers", "outlier detection", "flag abnormal", "detect deviations", "unusual values"],
        "medium": ["anomaly", "outlier", "abnormal", "unusual", "deviant", "z-score", "IQR", "statistical", "stands out"],
        "weak": ["weird", "strange", "different", "flag"],
        "negative": ["upload", "authenticate", "validate", "browse", "template", "network"]
    },
    "flow_geo_enhance": {
        "strong": ["geocode", "add coordinates", "resolve locations", "put on a map", "geo-enrich", "gazetteer", "add lat lng", "city names", "country names"],
        "medium": ["location", "geographic", "coordinates", "lat", "lng", "latitude", "longitude", "globe", "map spatially"],
        "weak": ["place names", "region"],
        "negative": ["upload", "authenticate", "validate", "browse", "template", "Cypher", "anomaly", "merge", "export", "animate", "force layout", "metrics", "pie chart", "bar chart", "debug"]
    },
    "flow_nlp_to_viz": {
        "strong": ["natural language to visualization", "create a visualization from scratch", "visualize this concept", "show me a social network", "show me a world map", "describe a visualization"],
        "medium": ["prototype", "proof of concept", "quick viz", "generate synthetic data", "no data yet", "create a visualization"],
        "weak": ["visualize this"],
        "negative": ["upload", "authenticate", "validate", "CSV format", "template list", "browse", "search", "geocode", "anomaly", "merge", "export", "animate", "Cypher", "FalkorDB", "edge list", "template requirements", "column requirements", "metrics", "PageRank", "format requirements"]
    },
    "flow_export_formats": {
        "strong": ["export to JSON", "export to GeoJSON", "create HTML page", "export formats", "save as JSON", "download as", "convert to JSON"],
        "medium": ["export", "download", "save as", "convert", "HTML viewer", "GeoJSON", "standalone file", "share visualization", "statistical summary"],
        "weak": ["output", "format", "file"],
        "negative": ["upload", "authenticate", "validate", "browse", "template", "import"]
    }
}

TOOL_NAMES = list(TOOL_SIGNALS.keys())

# ============================================================================
# EVALUATION ENGINE (pure Python, zero subprocess)
# ============================================================================

def score_tool_for_query(query_lower, signals, w_strong, w_medium, w_weak, w_negative):
    """Score a single tool for a query using weighted keyword matching."""
    score = 0.0
    for kw in signals["strong"]:
        if kw.lower() in query_lower:
            score += w_strong
    for kw in signals["medium"]:
        if kw.lower() in query_lower:
            score += w_medium
    for kw in signals["weak"]:
        if kw.lower() in query_lower:
            score += w_weak
    for kw in signals["negative"]:
        if kw.lower() in query_lower:
            score += w_negative  # w_negative is already negative
    return score


def select_tools_for_query(query, thresholds, w_strong, w_medium, w_weak, w_negative):
    """Select tools for a query using per-tool thresholds."""
    q = query.lower()
    selected = []
    for tool_name, signals in TOOL_SIGNALS.items():
        score = score_tool_for_query(q, signals, w_strong, w_medium, w_weak, w_negative)
        if score >= thresholds[tool_name]:
            selected.append(tool_name)
    return selected


def evaluate_f1(gold_queries, thresholds, w_strong, w_medium, w_weak, w_negative):
    """
    Evaluate F1 score with per-tool recall floor penalty.
    Returns (penalized_f1, raw_f1, precision, recall, per_tool_stats).
    """
    # Per-tool counters
    per_tool = {t: {"tp": 0, "fp": 0, "fn": 0} for t in TOOL_NAMES}

    tp_total = 0
    fp_total = 0
    fn_total = 0
    tn_total = 0

    for gq in gold_queries:
        selected = select_tools_for_query(
            gq["query"], thresholds, w_strong, w_medium, w_weak, w_negative
        )
        expected = gq.get("expected_tools", [])

        if len(expected) == 0:
            # Negative query
            if len(selected) == 0:
                tn_total += 1
            else:
                for s in selected:
                    fp_total += 1
                    if s in per_tool:
                        per_tool[s]["fp"] += 1
        else:
            # Positive query
            for exp in expected:
                if exp in selected:
                    tp_total += 1
                    if exp in per_tool:
                        per_tool[exp]["tp"] += 1
                else:
                    fn_total += 1
                    if exp in per_tool:
                        per_tool[exp]["fn"] += 1
            for s in selected:
                if s not in expected:
                    fp_total += 1
                    if s in per_tool:
                        per_tool[s]["fp"] += 1

    # Global metrics
    precision = tp_total / (tp_total + fp_total) if (tp_total + fp_total) > 0 else 0.0
    recall = tp_total / (tp_total + fn_total) if (tp_total + fn_total) > 0 else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0

    # Floor penalty: each tool with recall < 0.3 gets a penalty
    # This prevents gaming the metric by ignoring minority tools
    penalty = 0.0
    tools_below_floor = 0
    for tool_name, m in per_tool.items():
        tool_expected = m["tp"] + m["fn"]
        if tool_expected > 0:  # Only penalize tools that appear in gold queries
            tool_recall = m["tp"] / tool_expected
            if tool_recall < 0.3:
                penalty += 0.15  # -0.15 per tool below floor
                tools_below_floor += 1

    penalized_f1 = max(0.0, f1 - penalty)

    return penalized_f1, f1, precision, recall, per_tool, tools_below_floor


# ============================================================================
# OPTUNA OBJECTIVE
# ============================================================================

def create_objective(gold_queries):
    """Create an Optuna objective function closed over gold_queries."""

    def objective(trial):
        # --- Signal weights (4 continuous params) ---
        w_strong = trial.suggest_float("w_strong", 1.0, 6.0)
        w_medium = trial.suggest_float("w_medium", 0.3, 3.0)
        w_weak = trial.suggest_float("w_weak", 0.1, 1.5)
        w_negative = trial.suggest_float("w_negative", -5.0, -0.5)

        # --- Per-tool thresholds (18 continuous params) ---
        thresholds = {}
        for tool_name in TOOL_NAMES:
            thresholds[tool_name] = trial.suggest_float(
                f"thresh_{tool_name}", 0.3, 5.0
            )

        # --- Evaluate ---
        penalized_f1, raw_f1, precision, recall, per_tool, tools_below = evaluate_f1(
            gold_queries, thresholds, w_strong, w_medium, w_weak, w_negative
        )

        # Store additional info for analysis
        trial.set_user_attr("raw_f1", raw_f1)
        trial.set_user_attr("precision", precision)
        trial.set_user_attr("recall", recall)
        trial.set_user_attr("tools_below_floor", tools_below)

        return penalized_f1

    return objective


# ============================================================================
# MAIN
# ============================================================================

def main():
    parser = argparse.ArgumentParser(description="Optuna optimization of tool description signal weights")
    parser.add_argument("--trials", type=int, default=5000, help="Number of trials (default: 5000)")
    parser.add_argument("--workers", type=int, default=48, help="Parallel workers (default: 48)")
    parser.add_argument("--study-name", type=str, default="flowmcp_signals_v1", help="Study name")
    parser.add_argument("--resume", action="store_true", help="Resume existing study")
    args = parser.parse_args()

    # Load gold queries
    with open(GOLD_QUERIES_PATH) as f:
        gold_queries = json.load(f)

    print(f"Loaded {len(gold_queries)} gold queries")
    print(f"Optimizing {len(TOOL_NAMES)} tools, {4 + len(TOOL_NAMES)} parameters")
    print(f"Trials: {args.trials}, Workers: {args.workers}")
    print()

    # Run baseline
    default_thresholds = {t: 1.5 for t in TOOL_NAMES}
    baseline_pf1, baseline_f1, baseline_p, baseline_r, _, baseline_below = evaluate_f1(
        gold_queries, default_thresholds, 3.0, 1.5, 0.5, -2.0
    )
    print(f"Baseline (default weights, threshold=1.5):")
    print(f"  F1={baseline_f1:.4f}  P={baseline_p:.4f}  R={baseline_r:.4f}  "
          f"Penalized_F1={baseline_pf1:.4f}  Tools_below_floor={baseline_below}")
    print()

    # Create or load study
    storage = f"sqlite:///{STUDY_DB_PATH}"

    if args.resume:
        study = optuna.load_study(
            study_name=args.study_name,
            storage=storage,
        )
        print(f"Resuming study '{args.study_name}' with {len(study.trials)} existing trials")
    else:
        study = optuna.create_study(
            study_name=args.study_name,
            storage=storage,
            direction="maximize",
            sampler=TPESampler(
                n_startup_trials=200,  # Random exploration before TPE kicks in
                multivariate=True,     # Model parameter correlations
                seed=42
            ),
            pruner=MedianPruner(
                n_startup_trials=100,
                n_warmup_steps=0
            ),
            load_if_exists=True
        )
        existing = len(study.trials)
        if existing > 0:
            print(f"Loaded existing study with {existing} trials")

    # Suppress Optuna INFO logs during optimization (too noisy with parallel workers)
    optuna.logging.set_verbosity(optuna.logging.WARNING)

    # Run optimization
    objective = create_objective(gold_queries)

    start_time = time.time()
    study.optimize(
        objective,
        n_trials=args.trials,
        n_jobs=args.workers,
        show_progress_bar=True
    )
    elapsed = time.time() - start_time

    # Results
    print()
    print("=" * 72)
    print("  OPTUNA OPTIMIZATION RESULTS")
    print("=" * 72)
    print()

    best = study.best_trial
    print(f"Total trials: {len(study.trials)}")
    print(f"Time: {elapsed:.1f}s ({elapsed/len(study.trials)*1000:.1f}ms/trial)")
    print()
    print(f"Best trial #{best.number}:")
    print(f"  Penalized F1: {best.value:.4f}")
    print(f"  Raw F1:       {best.user_attrs.get('raw_f1', 'N/A')}")
    print(f"  Precision:    {best.user_attrs.get('precision', 'N/A')}")
    print(f"  Recall:       {best.user_attrs.get('recall', 'N/A')}")
    print(f"  Tools below floor: {best.user_attrs.get('tools_below_floor', 'N/A')}")
    print()
    print(f"Improvement over baseline:")
    print(f"  F1: {baseline_f1:.4f} -> {best.user_attrs.get('raw_f1', 0):.4f} "
          f"({(best.user_attrs.get('raw_f1', 0) - baseline_f1) * 100:+.1f}pp)")
    print(f"  Penalized F1: {baseline_pf1:.4f} -> {best.value:.4f} "
          f"({(best.value - baseline_pf1) * 100:+.1f}pp)")
    print()

    # Extract best params
    params = best.params
    print("Best signal weights:")
    print(f"  w_strong:   {params['w_strong']:.4f}  (default: 3.0)")
    print(f"  w_medium:   {params['w_medium']:.4f}  (default: 1.5)")
    print(f"  w_weak:     {params['w_weak']:.4f}  (default: 0.5)")
    print(f"  w_negative: {params['w_negative']:.4f}  (default: -2.0)")
    print()

    print("Best per-tool thresholds:")
    for tool_name in TOOL_NAMES:
        key = f"thresh_{tool_name}"
        val = params[key]
        print(f"  {tool_name:40s} {val:.4f}  (default: 1.5)")
    print()

    # Re-evaluate with best params to get per-tool breakdown
    best_thresholds = {t: params[f"thresh_{t}"] for t in TOOL_NAMES}
    _, final_f1, final_p, final_r, per_tool, _ = evaluate_f1(
        gold_queries, best_thresholds,
        params["w_strong"], params["w_medium"],
        params["w_weak"], params["w_negative"]
    )

    print("Per-tool breakdown (best params):")
    print(f"  {'Tool':40s} {'Prec':>6s} {'Rec':>6s} {'F1':>6s} {'TP':>4s} {'FP':>4s} {'FN':>4s}")
    print("  " + "-" * 70)
    for tool_name in TOOL_NAMES:
        m = per_tool[tool_name]
        has_activity = m["tp"] > 0 or m["fp"] > 0 or m["fn"] > 0
        if not has_activity:
            continue
        p = m["tp"] / (m["tp"] + m["fp"]) if (m["tp"] + m["fp"]) > 0 else 0
        r = m["tp"] / (m["tp"] + m["fn"]) if (m["tp"] + m["fn"]) > 0 else 0
        f1 = 2 * p * r / (p + r) if (p + r) > 0 else 0
        flag = " *** BELOW FLOOR" if (m["tp"] + m["fn"] > 0 and r < 0.3) else ""
        print(f"  {tool_name:40s} {p*100:5.0f}% {r*100:5.0f}% {f1*100:5.0f}% {m['tp']:4d} {m['fp']:4d} {m['fn']:4d}{flag}")
    print()

    # Save results
    result = {
        "meta": {
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "total_trials": len(study.trials),
            "elapsed_seconds": round(elapsed, 1),
            "study_name": args.study_name,
            "baseline_f1": round(baseline_f1, 4),
            "baseline_penalized_f1": round(baseline_pf1, 4),
        },
        "best_trial": {
            "number": best.number,
            "penalized_f1": round(best.value, 4),
            "raw_f1": round(best.user_attrs.get("raw_f1", 0), 4),
            "precision": round(best.user_attrs.get("precision", 0), 4),
            "recall": round(best.user_attrs.get("recall", 0), 4),
            "tools_below_floor": best.user_attrs.get("tools_below_floor", 0),
        },
        "best_weights": {
            "w_strong": round(params["w_strong"], 4),
            "w_medium": round(params["w_medium"], 4),
            "w_weak": round(params["w_weak"], 4),
            "w_negative": round(params["w_negative"], 4),
        },
        "best_thresholds": {
            t: round(params[f"thresh_{t}"], 4) for t in TOOL_NAMES
        },
        "per_tool_results": {},
        "top_10_trials": []
    }

    # Per-tool results
    for tool_name in TOOL_NAMES:
        m = per_tool[tool_name]
        p = m["tp"] / (m["tp"] + m["fp"]) if (m["tp"] + m["fp"]) > 0 else 0
        r = m["tp"] / (m["tp"] + m["fn"]) if (m["tp"] + m["fn"]) > 0 else 0
        f1 = 2 * p * r / (p + r) if (p + r) > 0 else 0
        result["per_tool_results"][tool_name] = {
            "precision": round(p, 4),
            "recall": round(r, 4),
            "f1": round(f1, 4),
            "tp": m["tp"], "fp": m["fp"], "fn": m["fn"]
        }

    # Top 10 trials
    sorted_trials = sorted(study.trials, key=lambda t: t.value if t.value is not None else -1, reverse=True)
    for t in sorted_trials[:10]:
        result["top_10_trials"].append({
            "number": t.number,
            "penalized_f1": round(t.value, 4) if t.value else None,
            "raw_f1": round(t.user_attrs.get("raw_f1", 0), 4),
            "precision": round(t.user_attrs.get("precision", 0), 4),
            "recall": round(t.user_attrs.get("recall", 0), 4),
        })

    with open(RESULTS_PATH, "w") as f:
        json.dump(result, f, indent=2)
    print(f"Results saved to {RESULTS_PATH}")
    print(f"Study DB saved to {STUDY_DB_PATH}")
    print()

    # Summary
    print("=" * 72)
    improvement = (best.user_attrs.get("raw_f1", 0) - baseline_f1) * 100
    print(f"  SUMMARY: F1 improved {improvement:+.1f}pp  ({baseline_f1*100:.1f}% -> {best.user_attrs.get('raw_f1', 0)*100:.1f}%)")
    print(f"  {len(study.trials)} trials in {elapsed:.0f}s on {args.workers} workers")
    print("=" * 72)


if __name__ == "__main__":
    main()
