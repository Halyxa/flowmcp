#!/usr/bin/env python3
"""Generate final overnight pipeline summary."""

import json
import glob
import os
import argparse


def main():
    parser = argparse.ArgumentParser(description="Generate overnight summary")
    parser.add_argument("--overnight-dir", type=str, default="data/overnight")
    args = parser.parse_args()

    results = {}
    for f in glob.glob(os.path.join(args.overnight_dir, "*-results.json")):
        name = os.path.basename(f).replace("-results.json", "")
        try:
            with open(f) as fh:
                results[name] = json.load(fh)
        except Exception:
            results[name] = {"error": "Failed to load"}

    print()
    print("=" * 72)
    print("  OVERNIGHT PIPELINE — FINAL RESULTS")
    print("=" * 72)
    print()
    print(f"{'Optimizer':<25} {'Best F1':>10} {'Pen.F1':>10} {'Trials':>10} {'Time':>10}")
    print("-" * 65)

    sorted_results = sorted(
        results.items(),
        key=lambda x: x[1].get("best_raw_f1", x[1].get("best_value", 0))
            if isinstance(x[1].get("best_raw_f1", x[1].get("best_value", 0)), (int, float)) else 0,
        reverse=True
    )

    for name, r in sorted_results:
        if "error" in r:
            print(f"{name:<25} {'ERROR':>10}")
        else:
            f1 = r.get("best_raw_f1", r.get("best_value", "N/A"))
            pf1 = r.get("best_value", "N/A")
            trials = r.get("trials", r.get("generations", "N/A"))
            elapsed = r.get("elapsed_s", "N/A")
            f1_str = f"{f1:.4f}" if isinstance(f1, float) else str(f1)
            pf1_str = f"{pf1:.4f}" if isinstance(pf1, float) else str(pf1)
            print(f"{name:<25} {f1_str:>10} {pf1_str:>10} {str(trials):>10} {str(elapsed):>10}s")

    print()

    # Find best
    best_name = None
    best_f1 = 0
    for name, r in results.items():
        f1 = r.get("best_value", 0)
        if isinstance(f1, (int, float)) and f1 > best_f1:
            best_f1 = f1
            best_name = name

    if best_name:
        print(f"WINNER: {best_name} with penalized F1 = {best_f1:.4f}")
        best_r = results[best_name]
        if "best_params" in best_r:
            params = best_r["best_params"]
            print(f"\nRecommended signal weights:")
            for k in ["w_strong", "w_medium", "w_weak", "w_negative"]:
                if k in params:
                    print(f"  {k}: {params[k]}")

    # Save summary
    summary = {
        "timestamp": __import__("time").strftime("%Y-%m-%dT%H:%M:%SZ", __import__("time").gmtime()),
        "optimizers_run": len(results),
        "best_optimizer": best_name,
        "best_penalized_f1": best_f1,
        "all_results": {
            name: {
                "best_raw_f1": r.get("best_raw_f1", None),
                "best_value": r.get("best_value", None),
                "trials": r.get("trials", None),
                "elapsed_s": r.get("elapsed_s", None),
            } for name, r in results.items()
        }
    }

    with open(os.path.join(args.overnight_dir, "summary.json"), "w") as f:
        json.dump(summary, f, indent=2)

    print(f"\nSummary saved to {args.overnight_dir}/summary.json")


if __name__ == "__main__":
    main()
