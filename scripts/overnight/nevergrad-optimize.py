#!/usr/bin/env python3
"""Nevergrad meta-optimizer for tool description signal weights."""

import argparse
import json
import time
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from eval_common import (
    load_gold_queries, evaluate_flat, get_bounds_arrays,
    N_PARAMS, TOOL_NAMES
)

import nevergrad as ng
import numpy as np


def main():
    parser = argparse.ArgumentParser(description="Nevergrad optimization of signal weights")
    parser.add_argument("--budget", type=int, default=50000)
    parser.add_argument("--workers", type=int, default=96)
    parser.add_argument("--output", type=str, default="data/overnight/nevergrad-results.json")
    args = parser.parse_args()

    gold_queries = load_gold_queries()
    lower, upper = get_bounds_arrays()

    print(f"Nevergrad NGOpt Meta-Optimizer")
    print(f"Budget: {args.budget}, Workers: {args.workers}")
    print(f"Parameters: {N_PARAMS}")
    print()

    # Build parametrization — init midpoint within bounds
    init_value = np.array([(lo + hi) / 2 for lo, hi in zip(lower, upper)])
    params = ng.p.Array(init=init_value)
    params.set_bounds(np.array(lower), np.array(upper))

    # NGOpt auto-selects the best strategy
    optimizer = ng.optimizers.NGOpt(parametrization=params, budget=args.budget, num_workers=args.workers)

    def objective(x):
        pf1, f1, p, r, below = evaluate_flat(x.tolist(), gold_queries)
        return -pf1  # Nevergrad minimizes

    start = time.time()

    # Track convergence
    best_so_far = float('inf')
    convergence = []

    for i in range(args.budget):
        x = optimizer.ask()
        val = objective(x.value)
        optimizer.tell(x, val)

        if val < best_so_far:
            best_so_far = val
            if i % 1000 == 0:
                convergence.append({"eval": i, "best": round(-val, 4)})

        if i % 5000 == 0:
            print(f"  [{i}/{args.budget}] best penalized F1: {-best_so_far:.4f}")

    elapsed = time.time() - start

    # Get best
    recommendation = optimizer.provide_recommendation()
    best_params = recommendation.value.tolist()
    best_pf1, best_f1, best_p, best_r, best_below = evaluate_flat(best_params, gold_queries)

    print()
    print("=" * 72)
    print("  NEVERGRAD RESULTS")
    print("=" * 72)
    print(f"Best penalized F1: {best_pf1:.4f}")
    print(f"Best raw F1: {best_f1:.4f}")
    print(f"Precision: {best_p:.4f}, Recall: {best_r:.4f}")
    print(f"Tools below floor: {best_below}")
    print(f"Time: {elapsed:.1f}s")
    print()

    result = {
        "optimizer": "Nevergrad_NGOpt",
        "budget": args.budget,
        "trials": args.budget,
        "elapsed_s": round(elapsed, 1),
        "best_value": round(best_pf1, 4),
        "best_raw_f1": round(best_f1, 4),
        "precision": round(best_p, 4),
        "recall": round(best_r, 4),
        "tools_below_floor": best_below,
        "best_params": {
            "w_strong": round(best_params[0], 4),
            "w_medium": round(best_params[1], 4),
            "w_weak": round(best_params[2], 4),
            "w_negative": round(best_params[3], 4),
            **{TOOL_NAMES[i]: round(best_params[4+i], 4) for i in range(len(TOOL_NAMES))}
        },
        "convergence": convergence
    }

    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    with open(args.output, "w") as f:
        json.dump(result, f, indent=2)
    print(f"Results saved to {args.output}")


if __name__ == "__main__":
    main()
