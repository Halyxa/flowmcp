#!/usr/bin/env python3
"""Hyperopt TPE optimizer for tool description signal weights."""

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

from hyperopt import fmin, tpe, hp, Trials, STATUS_OK


def main():
    parser = argparse.ArgumentParser(description="Hyperopt TPE optimization")
    parser.add_argument("--trials", type=int, default=25000)
    parser.add_argument("--output", type=str, default="data/overnight/hyperopt-results.json")
    args = parser.parse_args()

    gold_queries = load_gold_queries()
    lower, upper = get_bounds_arrays()

    print(f"Hyperopt TPE")
    print(f"Trials: {args.trials}")
    print(f"Parameters: {N_PARAMS}")
    print()

    # Search space
    space = []
    param_names = ["w_strong", "w_medium", "w_weak", "w_negative"] + \
                  [f"thresh_{t}" for t in TOOL_NAMES]

    for i, name in enumerate(param_names):
        space.append(hp.uniform(name, lower[i], upper[i]))

    best_raw_f1 = [0.0]
    best_precision = [0.0]
    best_recall = [0.0]
    best_below = [0]

    def objective(params_list):
        # hyperopt passes individual values, reconstruct flat array
        flat = [params_list[name] for name in param_names]
        pf1, f1, p, r, below = evaluate_flat(flat, gold_queries)
        best_raw_f1[0] = max(best_raw_f1[0], f1)
        best_precision[0] = p
        best_recall[0] = r
        best_below[0] = below
        return {"loss": -pf1, "status": STATUS_OK, "raw_f1": f1, "precision": p, "recall": r}

    space_dict = {name: hp.uniform(name, lower[i], upper[i]) for i, name in enumerate(param_names)}

    trials = Trials()
    start = time.time()

    best = fmin(
        fn=lambda params: objective(params),
        space=space_dict,
        algo=tpe.suggest,
        max_evals=args.trials,
        trials=trials,
        verbose=False,
        rstate=None
    )

    elapsed = time.time() - start

    # Evaluate best
    flat_best = [best[name] for name in param_names]
    best_pf1, best_f1, best_p, best_r, below = evaluate_flat(flat_best, gold_queries)

    print()
    print("=" * 72)
    print("  HYPEROPT RESULTS")
    print("=" * 72)
    print(f"Best penalized F1: {best_pf1:.4f}")
    print(f"Best raw F1: {best_f1:.4f}")
    print(f"Precision: {best_p:.4f}, Recall: {best_r:.4f}")
    print(f"Tools below floor: {below}")
    print(f"Time: {elapsed:.1f}s ({elapsed/args.trials*1000:.2f}ms/trial)")
    print()

    result = {
        "optimizer": "Hyperopt_TPE",
        "trials": args.trials,
        "elapsed_s": round(elapsed, 1),
        "best_value": round(best_pf1, 4),
        "best_raw_f1": round(best_f1, 4),
        "precision": round(best_p, 4),
        "recall": round(best_r, 4),
        "tools_below_floor": below,
        "best_params": {
            "w_strong": round(best["w_strong"], 4),
            "w_medium": round(best["w_medium"], 4),
            "w_weak": round(best["w_weak"], 4),
            "w_negative": round(best["w_negative"], 4),
            **{f"thresh_{TOOL_NAMES[i]}": round(best[f"thresh_{TOOL_NAMES[i]}"], 4) for i in range(len(TOOL_NAMES))}
        },
    }

    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    with open(args.output, "w") as f:
        json.dump(result, f, indent=2)
    print(f"Results saved to {args.output}")


if __name__ == "__main__":
    main()
