#!/usr/bin/env python3
"""
FalkorDB optimization history store for FlowMCP.

Stores optimization trials, tool descriptions, best results, and self-assessment
data in FalkorDB's graph database for historical analysis and cross-optimizer comparison.

Graph: flowmcp_optim
Node types: Trial, ToolDescription, BestResult, SelfAssessment, ToolScore
Edge types: USED_DESCRIPTION, HAS_TOOL_SCORE

Usage:
    python3 scripts/falkor-optim-store.py store --trial-file data/optuna-study.db
    python3 scripts/falkor-optim-store.py best
    python3 scripts/falkor-optim-store.py history --tool analyze_data_for_flow
    python3 scripts/falkor-optim-store.py stats
    python3 scripts/falkor-optim-store.py self-assess --file data/self-evaluation-report.json
    python3 scripts/falkor-optim-store.py init  (create graph with sample data)
"""

import argparse
import json
import os
import sqlite3
import sys
import time
from datetime import datetime, timezone

import redis

GRAPH_NAME = "flowmcp_optim"
REDIS_HOST = "localhost"
REDIS_PORT = 6379


def get_redis():
    """Connect to FalkorDB (Redis protocol)."""
    r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)
    r.ping()
    return r


def graph_query(r, query, params=None):
    """Execute a FalkorDB GRAPH.QUERY command."""
    if params:
        param_str = " ".join(f"{k}={json.dumps(v)}" for k, v in params.items())
        full_query = f"CYPHER {param_str} {query}"
    else:
        full_query = query
    result = r.execute_command("GRAPH.QUERY", GRAPH_NAME, full_query)
    return result


def ensure_graph(r):
    """Create the graph and indexes if they don't exist."""
    index_queries = [
        "CREATE INDEX IF NOT EXISTS FOR (t:Trial) ON (t.trial_id)",
        "CREATE INDEX IF NOT EXISTS FOR (t:Trial) ON (t.optimizer_name)",
        "CREATE INDEX IF NOT EXISTS FOR (td:ToolDescription) ON (td.tool_name)",
        "CREATE INDEX IF NOT EXISTS FOR (td:ToolDescription) ON (td.variant_id)",
        "CREATE INDEX IF NOT EXISTS FOR (br:BestResult) ON (br.optimizer_name)",
        "CREATE INDEX IF NOT EXISTS FOR (se:SelfAssessment) ON (se.assessor)",
        "CREATE INDEX IF NOT EXISTS FOR (ts:ToolScore) ON (ts.tool_name)",
    ]
    for q in index_queries:
        try:
            graph_query(r, q)
        except redis.exceptions.ResponseError as e:
            if "already indexed" not in str(e).lower() and "already exists" not in str(e).lower():
                try:
                    q_no_if = q.replace("IF NOT EXISTS ", "")
                    graph_query(r, q_no_if)
                except redis.exceptions.ResponseError:
                    pass


def esc(s):
    """Escape single quotes for Cypher string literals."""
    if s is None:
        return ""
    return str(s).replace("\\", "\\\\").replace("'", "\\'")


def to_float(v, default=0.0):
    """Safely convert a FalkorDB return value to float."""
    if v is None:
        return default
    try:
        return float(v)
    except (ValueError, TypeError):
        return default


def to_int(v, default=0):
    """Safely convert a FalkorDB return value to int."""
    if v is None:
        return default
    try:
        return int(float(v))
    except (ValueError, TypeError):
        return default


def cmd_init(args):
    """Initialize graph with sample data to verify connectivity."""
    r = get_redis()
    ensure_graph(r)

    ts = datetime.now(timezone.utc).isoformat() + "Z"
    graph_query(r, f"""
        CREATE (t:Trial {{
            trial_id: 'sample_001',
            f1_score: 0.504,
            precision: 0.52,
            recall: 0.49,
            timestamp: '{ts}',
            optimizer_name: 'baseline',
            study_name: 'sample_init'
        }})
    """)

    graph_query(r, """
        CREATE (td:ToolDescription {
            tool_name: 'analyze_data_for_flow',
            description_text: 'Score data for 3D visualization potential across 8 signal dimensions',
            variant_id: 'baseline_v1',
            timestamp: timestamp()
        })
    """)

    graph_query(r, """
        MATCH (t:Trial {trial_id: 'sample_001'}),
              (td:ToolDescription {variant_id: 'baseline_v1', tool_name: 'analyze_data_for_flow'})
        CREATE (t)-[:USED_DESCRIPTION]->(td)
    """)

    graph_query(r, f"""
        CREATE (br:BestResult {{
            f1_score: 0.504,
            timestamp: '{ts}',
            optimizer_name: 'baseline',
            trial_count: 1,
            study_name: 'sample_init'
        }})
    """)

    result = graph_query(r, "MATCH (n) RETURN labels(n) AS type, count(*) AS cnt")
    print(f"Graph '{GRAPH_NAME}' initialized.")
    print("Node counts:")
    if result and len(result) > 1:
        for row in result[1]:
            if isinstance(row, (list, tuple)) and len(row) >= 2:
                print(f"  {row[0]}: {row[1]}")
    print("\nSample data stored. Graph is ready.")


def cmd_store(args):
    """Import Optuna study results from SQLite database."""
    trial_file = args.trial_file
    if not os.path.exists(trial_file):
        print(f"Error: file not found: {trial_file}")
        sys.exit(1)

    if not trial_file.endswith(".db"):
        print(f"Error: expected .db file (Optuna SQLite), got: {trial_file}")
        sys.exit(1)

    r = get_redis()
    ensure_graph(r)

    conn = sqlite3.connect(trial_file)
    cur = conn.cursor()

    cur.execute("SELECT study_id, study_name FROM studies")
    studies = cur.fetchall()
    if not studies:
        print("No studies found in database.")
        sys.exit(1)

    total_stored = 0
    for study_id, study_name in studies:
        print(f"Importing study: {study_name} (id={study_id})")

        cur.execute("""
            SELECT t.trial_id, t.number, t.datetime_start, t.datetime_complete,
                   tv.value
            FROM trials t
            LEFT JOIN trial_values tv ON t.trial_id = tv.trial_id AND tv.objective = 0
            WHERE t.study_id = ? AND t.state = 'COMPLETE'
            ORDER BY t.number
        """, (study_id,))
        trials = cur.fetchall()

        best_f1 = 0.0
        best_trial_id = None

        for trial_id, number, dt_start, dt_complete, obj_value in trials:
            f1_value = float(obj_value) if obj_value is not None else 0.0

            if f1_value > best_f1:
                best_f1 = f1_value
                best_trial_id = trial_id

            # Get params for this trial
            cur.execute(
                "SELECT param_name, param_value FROM trial_params WHERE trial_id = ?",
                (trial_id,),
            )
            params = {name: float(val) for name, val in cur.fetchall()}

            trial_node_id = f"optuna_{study_name}_{number}"
            ts = dt_complete or dt_start or datetime.now(timezone.utc).isoformat()

            param_set = ""
            for pname, pval in params.items():
                safe_name = pname.replace("-", "_")
                param_set += f", t.param_{safe_name} = {pval}"

            cypher = f"""
                MERGE (t:Trial {{trial_id: '{esc(trial_node_id)}'}})
                SET t.f1_score = {f1_value},
                    t.timestamp = '{esc(ts)}',
                    t.optimizer_name = 'optuna',
                    t.study_name = '{esc(study_name)}',
                    t.trial_number = {number}
                    {param_set}
            """

            try:
                graph_query(r, cypher)
                total_stored += 1
            except redis.exceptions.ResponseError as e:
                print(f"  Warning: trial {number} failed: {e}")

            if total_stored % 100 == 0 and total_stored > 0:
                print(f"  Stored {total_stored} trials...")

        # Store best result for this study
        if best_trial_id is not None:
            ts_now = datetime.now(timezone.utc).isoformat() + "Z"
            graph_query(r, f"""
                MERGE (br:BestResult {{study_name: '{esc(study_name)}', optimizer_name: 'optuna'}})
                SET br.f1_score = {best_f1},
                    br.timestamp = '{ts_now}',
                    br.trial_count = {len(trials)}
            """)
            print(f"  Best F1: {best_f1:.4f} (trial {best_trial_id})")

    conn.close()
    print(f"\nDone. Stored {total_stored} trials from {len(studies)} study/studies.")


def cmd_best(args):
    """Query best results across all optimizers."""
    r = get_redis()

    print("=== Best Results by Optimizer ===\n")
    try:
        result = graph_query(r, """
            MATCH (br:BestResult)
            RETURN br.optimizer_name AS optimizer,
                   br.f1_score AS f1,
                   br.trial_count AS trials,
                   br.study_name AS study,
                   br.timestamp AS ts
            ORDER BY br.f1_score DESC
        """)
        if result and len(result) > 1 and result[1]:
            print(f"{'Optimizer':<15} {'Study':<30} {'F1':>8} {'Trials':>8} {'Timestamp'}")
            print("-" * 90)
            for row in result[1]:
                optimizer = str(row[0] or "unknown")
                f1 = to_float(row[1])
                trials = to_int(row[2])
                study = str(row[3] or "")
                ts = str(row[4] or "")
                print(f"{optimizer:<15} {study:<30} {f1:>8.4f} {trials:>8} {ts}")
        else:
            print("No BestResult nodes found.")
    except redis.exceptions.ResponseError as e:
        print(f"Query error: {e}")

    print("\n=== Top 10 Individual Trials ===\n")
    try:
        result = graph_query(r, """
            MATCH (t:Trial)
            RETURN t.trial_id AS id,
                   t.f1_score AS f1,
                   t.optimizer_name AS optimizer,
                   t.study_name AS study,
                   t.timestamp AS ts
            ORDER BY t.f1_score DESC
            LIMIT 10
        """)
        if result and len(result) > 1 and result[1]:
            print(f"{'Trial ID':<40} {'F1':>8} {'Optimizer':<15} {'Study'}")
            print("-" * 85)
            for row in result[1]:
                tid = str(row[0] or "unknown")
                f1 = to_float(row[1])
                opt = str(row[2] or "")
                study = str(row[3] or "")
                print(f"{tid:<40} {f1:>8.4f} {opt:<15} {study}")
        else:
            print("No Trial nodes found.")
    except redis.exceptions.ResponseError as e:
        print(f"Query error: {e}")


def cmd_history(args):
    """Show description evolution for a specific tool."""
    r = get_redis()
    tool_name = args.tool

    print(f"=== Description History: {tool_name} ===\n")

    try:
        result = graph_query(r, f"""
            MATCH (td:ToolDescription {{tool_name: '{esc(tool_name)}'}})
            OPTIONAL MATCH (t:Trial)-[:USED_DESCRIPTION]->(td)
            RETURN td.variant_id AS variant,
                   td.description_text AS description,
                   td.timestamp AS ts,
                   avg(t.f1_score) AS avg_f1,
                   count(t) AS trial_count
            ORDER BY td.timestamp
        """)
        if result and len(result) > 1 and result[1]:
            for row in result[1]:
                variant = str(row[0] or "unknown")
                desc = str(row[1] or "")
                ts = str(row[2] or "")
                avg_f1 = to_float(row[3]) if row[3] is not None else None
                trials = to_int(row[4])
                print(f"Variant: {variant}")
                print(f"  Description: {desc[:120]}{'...' if len(desc) > 120 else ''}")
                if avg_f1 is not None:
                    print(f"  Avg F1: {avg_f1:.4f} ({trials} trials)")
                else:
                    print(f"  No trial data linked")
                print()
        else:
            print(f"No descriptions found for tool '{tool_name}'.")
    except redis.exceptions.ResponseError as e:
        print(f"Query error: {e}")

    print(f"--- Self-Assessment Scores ---\n")
    try:
        result = graph_query(r, f"""
            MATCH (ts_node:ToolScore {{tool_name: '{esc(tool_name)}'}})
            OPTIONAL MATCH (se:SelfAssessment)-[:HAS_TOOL_SCORE]->(ts_node)
            RETURN ts_node.f1 AS f1,
                   ts_node.precision AS prec,
                   ts_node.recall AS recall,
                   ts_node.tp AS tp, ts_node.fp AS fp, ts_node.fn AS fn,
                   se.assessor AS assessor,
                   se.timestamp AS ts_time
            ORDER BY se.timestamp
        """)
        if result and len(result) > 1 and result[1]:
            for row in result[1]:
                f1 = to_float(row[0])
                prec = to_float(row[1])
                recall = to_float(row[2])
                tp = to_int(row[3])
                fp = to_int(row[4])
                fn = to_int(row[5])
                assessor = str(row[6] or "")
                ts_time = str(row[7] or "")
                print(f"  Assessor: {assessor}")
                print(f"  F1: {f1:.3f}  Precision: {prec:.3f}  Recall: {recall:.3f}")
                print(f"  TP: {tp}  FP: {fp}  FN: {fn}")
                print(f"  Timestamp: {ts_time}")
                print()
        else:
            print(f"  No self-assessment scores found for '{tool_name}'.")
    except redis.exceptions.ResponseError as e:
        print(f"  Query error: {e}")


def cmd_stats(args):
    """Overall optimization statistics."""
    r = get_redis()

    print("=== FlowMCP Optimization Statistics ===\n")

    queries = [
        ("Total Trials", "MATCH (t:Trial) RETURN count(t)"),
        ("Total Tool Descriptions", "MATCH (td:ToolDescription) RETURN count(td)"),
        ("Total Best Results", "MATCH (br:BestResult) RETURN count(br)"),
        ("Total Self-Assessments", "MATCH (se:SelfAssessment) RETURN count(se)"),
        ("Total Tool Scores", "MATCH (ts:ToolScore) RETURN count(ts)"),
        ("USED_DESCRIPTION edges", "MATCH ()-[r:USED_DESCRIPTION]->() RETURN count(r)"),
        ("HAS_TOOL_SCORE edges", "MATCH ()-[r:HAS_TOOL_SCORE]->() RETURN count(r)"),
    ]

    print("Node/Edge Counts:")
    for label, query in queries:
        try:
            result = graph_query(r, query)
            count = 0
            if result and len(result) > 1 and result[1]:
                count = result[1][0][0] if result[1][0] else 0
            print(f"  {label}: {count}")
        except redis.exceptions.ResponseError:
            print(f"  {label}: (query failed)")

    print("\nTrials by Optimizer:")
    try:
        result = graph_query(r, """
            MATCH (t:Trial)
            RETURN t.optimizer_name AS optimizer, count(t) AS cnt,
                   avg(t.f1_score) AS avg_f1,
                   max(t.f1_score) AS max_f1,
                   min(t.f1_score) AS min_f1
            ORDER BY cnt DESC
        """)
        if result and len(result) > 1 and result[1]:
            print(f"  {'Optimizer':<15} {'Count':>8} {'Avg F1':>8} {'Max F1':>8} {'Min F1':>8}")
            print("  " + "-" * 55)
            for row in result[1]:
                opt = str(row[0] or "unknown")
                cnt = to_int(row[1])
                avg_f1 = to_float(row[2])
                max_f1 = to_float(row[3])
                min_f1 = to_float(row[4])
                print(f"  {opt:<15} {cnt:>8} {avg_f1:>8.4f} {max_f1:>8.4f} {min_f1:>8.4f}")
    except redis.exceptions.ResponseError as e:
        print(f"  Query error: {e}")

    print("\nSelf-Assessment Summary:")
    try:
        result = graph_query(r, """
            MATCH (se:SelfAssessment)
            RETURN se.assessor AS assessor,
                   se.overall_f1 AS f1,
                   se.overall_precision AS prec,
                   se.overall_recall AS recall,
                   se.total_queries AS queries,
                   se.timestamp AS ts
            ORDER BY se.timestamp DESC
        """)
        if result and len(result) > 1 and result[1]:
            for row in result[1]:
                assessor = str(row[0] or "unknown")
                f1 = to_float(row[1])
                prec = to_float(row[2])
                recall = to_float(row[3])
                q_count = to_int(row[4])
                ts = str(row[5] or "")
                print(f"  {assessor}: F1={f1:.3f} P={prec:.3f} R={recall:.3f} ({q_count} queries) [{ts}]")
        else:
            print("  No self-assessments stored yet.")
    except redis.exceptions.ResponseError as e:
        print(f"  Query error: {e}")

    print("\nTools With Imperfect F1 (from self-assessment):")
    try:
        result = graph_query(r, """
            MATCH (ts:ToolScore)
            WHERE ts.f1 < 1.0
            RETURN ts.tool_name AS tool, ts.f1 AS f1,
                   ts.precision AS prec, ts.recall AS recall,
                   ts.description_issues AS issues
            ORDER BY ts.f1 ASC
        """)
        if result and len(result) > 1 and result[1]:
            for row in result[1]:
                tool = str(row[0] or "unknown")
                f1 = to_float(row[1])
                prec = to_float(row[2])
                recall = to_float(row[3])
                issues = str(row[4] or "")
                print(f"  {tool}: F1={f1:.3f} (P={prec:.3f} R={recall:.3f})")
                if issues:
                    print(f"    Issue: {issues[:120]}{'...' if len(issues) > 120 else ''}")
        else:
            print("  All tools have perfect F1 (or no assessment data).")
    except redis.exceptions.ResponseError as e:
        print(f"  Query error: {e}")


def cmd_self_assess(args):
    """Store self-assessment results from JSON report."""
    assess_file = args.file
    if not os.path.exists(assess_file):
        print(f"Error: file not found: {assess_file}")
        sys.exit(1)

    with open(assess_file, "r") as f:
        report = json.load(f)

    r = get_redis()
    ensure_graph(r)

    timestamp = report.get("timestamp", datetime.now(timezone.utc).isoformat() + "Z")
    assessor = report.get("evaluator", "unknown")
    model = report.get("model", "unknown")
    overall = report.get("overall_metrics", {})
    per_tool = report.get("per_tool", {})

    # Create SelfAssessment node
    assess_id = f"assess_{model}_{timestamp.replace(':', '').replace('.', '').replace('-', '')}"
    graph_query(r, f"""
        MERGE (se:SelfAssessment {{assess_id: '{assess_id}'}})
        SET se.assessor = '{esc(assessor)}',
            se.model = '{esc(model)}',
            se.timestamp = '{esc(timestamp)}',
            se.total_queries = {overall.get('total_queries', report.get('total_queries', 0))},
            se.overall_f1 = {overall.get('f1', 0)},
            se.overall_precision = {overall.get('precision', 0)},
            se.overall_recall = {overall.get('recall', 0)},
            se.total_tp = {overall.get('total_tp', 0)},
            se.total_fp = {overall.get('total_fp', 0)},
            se.total_fn = {overall.get('total_fn', 0)},
            se.perfect_matches = {overall.get('perfect_matches', 0)},
            se.perfect_match_rate = {overall.get('perfect_match_rate', 0)}
    """)
    print(f"Stored SelfAssessment: {assess_id}")
    print(f"  Overall: F1={overall.get('f1', 0):.3f} P={overall.get('precision', 0):.3f} R={overall.get('recall', 0):.3f}")

    tool_count = 0
    for tool_name, scores in per_tool.items():
        score_id = f"{assess_id}_{tool_name}"
        desc_issues = esc(scores.get("description_issues", ""))
        missed = json.dumps(scores.get("missed_queries", []))
        fps = json.dumps(scores.get("false_positive_queries", []))

        graph_query(r, f"""
            MERGE (ts:ToolScore {{score_id: '{score_id}'}})
            SET ts.tool_name = '{tool_name}',
                ts.f1 = {scores.get('f1', 0)},
                ts.precision = {scores.get('precision', 0)},
                ts.recall = {scores.get('recall', 0)},
                ts.tp = {scores.get('tp', 0)},
                ts.fp = {scores.get('fp', 0)},
                ts.fn = {scores.get('fn', 0)},
                ts.description_issues = '{desc_issues}',
                ts.missed_queries = '{esc(missed)}',
                ts.false_positive_queries = '{esc(fps)}',
                ts.assess_id = '{assess_id}'
        """)

        graph_query(r, f"""
            MATCH (se:SelfAssessment {{assess_id: '{assess_id}'}}),
                  (ts:ToolScore {{score_id: '{score_id}'}})
            MERGE (se)-[:HAS_TOOL_SCORE]->(ts)
        """)
        tool_count += 1

    recommendations = report.get("recommendations", {})
    for tool_name, rec_text in recommendations.items():
        score_id = f"{assess_id}_{tool_name}"
        graph_query(r, f"""
            MATCH (ts:ToolScore {{score_id: '{score_id}'}})
            SET ts.recommendation = '{esc(rec_text)}'
        """)

    worst = report.get("worst_performing", [])
    never = report.get("never_triggered", [])
    graph_query(r, f"""
        MATCH (se:SelfAssessment {{assess_id: '{assess_id}'}})
        SET se.worst_performing = '{esc(json.dumps(worst))}',
            se.never_triggered = '{esc(json.dumps(never))}'
    """)

    print(f"  Stored {tool_count} ToolScore nodes with HAS_TOOL_SCORE edges.")
    print(f"  Worst performing: {', '.join(worst)}")
    print(f"  Never triggered: {', '.join(never)}")


def main():
    parser = argparse.ArgumentParser(
        description="FalkorDB optimization history store for FlowMCP"
    )
    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    subparsers.add_parser("init", help="Initialize graph with sample data")

    store_parser = subparsers.add_parser("store", help="Import Optuna trial results")
    store_parser.add_argument(
        "--trial-file", required=True, help="Path to Optuna .db file"
    )

    subparsers.add_parser("best", help="Query best results across all optimizers")

    history_parser = subparsers.add_parser(
        "history", help="Show description evolution for a tool"
    )
    history_parser.add_argument("--tool", required=True, help="Tool name")

    subparsers.add_parser("stats", help="Overall optimization statistics")

    assess_parser = subparsers.add_parser(
        "self-assess", help="Store self-assessment results"
    )
    assess_parser.add_argument(
        "--file", required=True, help="Path to self-assessment JSON"
    )

    args = parser.parse_args()

    if args.command is None:
        parser.print_help()
        sys.exit(1)

    commands = {
        "init": cmd_init,
        "store": cmd_store,
        "best": cmd_best,
        "history": cmd_history,
        "stats": cmd_stats,
        "self-assess": cmd_self_assess,
    }

    try:
        commands[args.command](args)
    except redis.exceptions.ConnectionError:
        print(f"Error: Cannot connect to FalkorDB at {REDIS_HOST}:{REDIS_PORT}")
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
