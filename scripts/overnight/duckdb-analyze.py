#!/usr/bin/env python3
"""DuckDB cross-optimizer analytics — compare all overnight results."""

import argparse
import json
import glob
import os
import sys

import duckdb


def main():
    parser = argparse.ArgumentParser(description="Cross-optimizer analytics with DuckDB")
    parser.add_argument("--overnight-dir", type=str, default="data/overnight")
    parser.add_argument("--output", type=str, default="data/overnight/cross-optimizer-analysis.json")
    args = parser.parse_args()

    # Load all result files
    results = {}
    for f in glob.glob(os.path.join(args.overnight_dir, "*-results.json")):
        name = os.path.basename(f).replace("-results.json", "")
        try:
            with open(f) as fh:
                results[name] = json.load(fh)
        except Exception as e:
            print(f"  Warning: Could not load {f}: {e}")

    if not results:
        print("No result files found. Run optimizers first.")
        return

    print(f"Loaded {len(results)} optimizer results")
    print()

    # Create DuckDB tables
    con = duckdb.connect()

    # Optimizer comparison table
    rows = []
    for name, r in results.items():
        rows.append({
            "optimizer": r.get("optimizer", name),
            "best_f1": r.get("best_raw_f1", r.get("best_value", 0)),
            "penalized_f1": r.get("best_value", 0),
            "precision": r.get("precision", 0),
            "recall": r.get("recall", 0),
            "trials": r.get("trials", 0),
            "elapsed_s": r.get("elapsed_s", 0),
            "tools_below_floor": r.get("tools_below_floor", 0),
        })

    import tempfile
    tmp = tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False)
    json.dump(rows, tmp)
    tmp.close()
    con.execute(f"CREATE TABLE optimizers AS SELECT * FROM read_json_auto('{tmp.name}')")

    # Analysis queries
    analysis = {}

    # 1. Rank by F1
    ranking = con.execute("""
        SELECT optimizer, best_f1, penalized_f1, precision, recall, trials, elapsed_s,
               ROUND(trials / NULLIF(elapsed_s, 0), 0) as trials_per_sec
        FROM optimizers
        ORDER BY penalized_f1 DESC
    """).fetchall()

    print("=" * 80)
    print("  OPTIMIZER RANKING (by penalized F1)")
    print("=" * 80)
    print(f"{'Optimizer':<30} {'F1':>7} {'Pen.F1':>7} {'Prec':>7} {'Recall':>7} {'Trials':>8} {'Time':>7} {'T/s':>8}")
    print("-" * 80)

    analysis["ranking"] = []
    for row in ranking:
        opt, f1, pf1, p, r, trials, elapsed, tps = row
        print(f"{str(opt):<30} {f1:>6.4f} {pf1:>6.4f} {p:>6.4f} {r:>6.4f} {trials:>8} {elapsed:>6.1f}s {int(tps or 0):>7}")
        analysis["ranking"].append({
            "optimizer": opt, "f1": f1, "penalized_f1": pf1,
            "precision": p, "recall": r, "trials": trials,
            "elapsed_s": elapsed, "trials_per_sec": int(tps or 0)
        })

    # 2. Parameter consensus — what do optimizers agree on?
    print()
    print("=" * 80)
    print("  PARAMETER CONSENSUS")
    print("=" * 80)

    param_data = []
    for name, r in results.items():
        params = r.get("best_params", {})
        for pk, pv in params.items():
            if isinstance(pv, (int, float)):
                param_data.append({"optimizer": name, "param": pk, "value": float(pv)})

    if param_data:
        tmp2 = tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False)
        json.dump(param_data, tmp2)
        tmp2.close()
        con.execute(f"CREATE TABLE params AS SELECT * FROM read_json_auto('{tmp2.name}')")

        consensus = con.execute("""
            SELECT param,
                   ROUND(AVG(value), 4) as mean_val,
                   ROUND(STDDEV(value), 4) as std_val,
                   ROUND(MIN(value), 4) as min_val,
                   ROUND(MAX(value), 4) as max_val,
                   COUNT(*) as n_optimizers
            FROM params
            GROUP BY param
            HAVING COUNT(*) >= 2
            ORDER BY std_val ASC
        """).fetchall()

        print(f"{'Parameter':<40} {'Mean':>8} {'StdDev':>8} {'Min':>8} {'Max':>8} {'N':>3}")
        print("-" * 75)

        analysis["parameter_consensus"] = {"high_agreement": [], "low_agreement": []}
        for row in consensus:
            param, mean, std, mn, mx, n = row
            std = std or 0
            print(f"{str(param):<40} {mean:>8.4f} {std:>8.4f} {mn:>8.4f} {mx:>8.4f} {n:>3}")
            bucket = "high_agreement" if std < 0.5 else "low_agreement"
            analysis["parameter_consensus"][bucket].append({
                "param": param, "mean": mean, "std": std, "min": mn, "max": mx
            })

    # 3. Efficiency analysis
    print()
    print("=" * 80)
    print("  EFFICIENCY ANALYSIS")
    print("=" * 80)

    efficiency = con.execute("""
        SELECT optimizer,
               ROUND(penalized_f1 / NULLIF(elapsed_s, 0) * 1000, 4) as f1_per_second,
               ROUND(trials / NULLIF(elapsed_s, 0), 0) as throughput
        FROM optimizers
        ORDER BY f1_per_second DESC
    """).fetchall()

    analysis["efficiency"] = []
    for row in efficiency:
        opt, fps, tp = row
        print(f"  {str(opt):<30} F1/s: {fps:.4f}  Throughput: {int(tp or 0)} trials/s")
        analysis["efficiency"].append({"optimizer": opt, "f1_per_second": fps, "throughput": int(tp or 0)})

    # 4. Best overall config
    best_row = con.execute("SELECT * FROM optimizers ORDER BY penalized_f1 DESC LIMIT 1").fetchone()
    if best_row:
        best_name = best_row[0]
        analysis["best_overall"] = {
            "optimizer": best_name,
            "penalized_f1": best_row[2],
            "raw_f1": best_row[1],
        }
        # Find its params
        for name, r in results.items():
            if r.get("optimizer", name) == best_name:
                analysis["best_overall"]["params"] = r.get("best_params", {})
                break

    print()
    print(f"Best overall: {analysis.get('best_overall', {}).get('optimizer', 'N/A')} "
          f"with penalized F1 = {analysis.get('best_overall', {}).get('penalized_f1', 'N/A')}")

    # Save
    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    with open(args.output, "w") as f:
        json.dump(analysis, f, indent=2)
    print(f"\nAnalysis saved to {args.output}")

    con.close()


if __name__ == "__main__":
    main()
