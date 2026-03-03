"""
eval_common.py — Shared evaluation engine for all overnight optimizers.
Import this instead of copying TOOL_SIGNALS everywhere.
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
GOLD_QUERIES_PATH = ROOT / "test" / "gold-queries.json"

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
    }
}

TOOL_NAMES = list(TOOL_SIGNALS.keys())
N_TOOLS = len(TOOL_NAMES)

# Bounds for search space
BOUNDS = {
    "w_strong": (1.0, 6.0),
    "w_medium": (0.3, 3.0),
    "w_weak": (0.1, 1.5),
    "w_negative": (-5.0, -0.5),
    "threshold": (0.3, 5.0),  # per-tool thresholds
}

N_PARAMS = 4 + N_TOOLS  # 4 weights + 18 thresholds = 22


def load_gold_queries():
    with open(GOLD_QUERIES_PATH) as f:
        return json.load(f)


def score_tool_for_query(query_lower, signals, w_strong, w_medium, w_weak, w_negative):
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
            score += w_negative
    return score


def select_tools_for_query(query, thresholds, w_strong, w_medium, w_weak, w_negative):
    q = query.lower()
    selected = []
    for tool_name, signals in TOOL_SIGNALS.items():
        score = score_tool_for_query(q, signals, w_strong, w_medium, w_weak, w_negative)
        if score >= thresholds[tool_name]:
            selected.append(tool_name)
    return selected


def evaluate_f1(gold_queries, thresholds, w_strong, w_medium, w_weak, w_negative):
    per_tool = {t: {"tp": 0, "fp": 0, "fn": 0} for t in TOOL_NAMES}
    tp_total = fp_total = fn_total = tn_total = 0

    for gq in gold_queries:
        selected = select_tools_for_query(
            gq["query"], thresholds, w_strong, w_medium, w_weak, w_negative
        )
        expected = gq.get("expected_tools", [])

        if len(expected) == 0:
            if len(selected) == 0:
                tn_total += 1
            else:
                for s in selected:
                    fp_total += 1
                    if s in per_tool:
                        per_tool[s]["fp"] += 1
        else:
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

    precision = tp_total / (tp_total + fp_total) if (tp_total + fp_total) > 0 else 0.0
    recall = tp_total / (tp_total + fn_total) if (tp_total + fn_total) > 0 else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0

    penalty = 0.0
    tools_below_floor = 0
    for tool_name, m in per_tool.items():
        tool_expected = m["tp"] + m["fn"]
        if tool_expected > 0:
            tool_recall = m["tp"] / tool_expected
            if tool_recall < 0.3:
                penalty += 0.15
                tools_below_floor += 1

    penalized_f1 = max(0.0, f1 - penalty)
    return penalized_f1, f1, precision, recall, per_tool, tools_below_floor


def params_to_config(flat_params):
    """Convert flat array of 22 params to (thresholds_dict, w_strong, w_medium, w_weak, w_negative)."""
    w_strong = flat_params[0]
    w_medium = flat_params[1]
    w_weak = flat_params[2]
    w_negative = flat_params[3]
    thresholds = {TOOL_NAMES[i]: flat_params[4 + i] for i in range(N_TOOLS)}
    return thresholds, w_strong, w_medium, w_weak, w_negative


def evaluate_flat(flat_params, gold_queries):
    """Evaluate from a flat parameter array. Returns penalized F1."""
    thresholds, w_strong, w_medium, w_weak, w_negative = params_to_config(flat_params)
    penalized_f1, f1, precision, recall, per_tool, tools_below = evaluate_f1(
        gold_queries, thresholds, w_strong, w_medium, w_weak, w_negative
    )
    return penalized_f1, f1, precision, recall, tools_below


def get_bounds_arrays():
    """Return (lower_bounds, upper_bounds) as lists of length N_PARAMS."""
    lower = [BOUNDS["w_strong"][0], BOUNDS["w_medium"][0], BOUNDS["w_weak"][0], BOUNDS["w_negative"][0]]
    upper = [BOUNDS["w_strong"][1], BOUNDS["w_medium"][1], BOUNDS["w_weak"][1], BOUNDS["w_negative"][1]]
    for _ in range(N_TOOLS):
        lower.append(BOUNDS["threshold"][0])
        upper.append(BOUNDS["threshold"][1])
    return lower, upper
