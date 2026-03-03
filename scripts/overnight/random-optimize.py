#!/usr/bin/env python3
"""Random search baseline via Optuna for comparison."""

import argparse
import json
import time
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from eval_common import load_gold_queries, TOOL_NAMES, evaluate_f1

import optuna
from optuna.samplers import RandomSampler


def create_objective(gold_queries):
    def objective(trial):
        w_strong = trial.suggest_float("w_strong", 1.0, 6.0)
        w_medium = trial.suggest_float("w_medium", 0.3, 3.0)
        w_weak = trial.suggest_float("w_weak", 0.1, 1.5)
        w_negative = trial.suggest_float("w_negative", -5.0, -0.5)

        thresholds = {}
        for tool_name in TOOL_NAMES:
            thresholds[tool_name] = trial.suggest_float(f"thresh_{tool_name}", 0.3, 5.0)

        penalized_f1, raw_f1, precision, recall, per_tool, tools_below = evaluate_f1(
            gold_queries, thresholds, w_strong, w_medium, w_weak, w_negative
        )

        trial.set_user_attr("raw_f1", raw_f1)
        trial.set_user_attr("precision", precision)
        trial.set_user_attr("recall", recall)
        trial.set_user_attr("tools_below_floor", tools_below)

        return penalized_f1

    return objective


def main():
    parser = argparse.ArgumentParser(description="Random search baseline via Optuna")
    parser.add_argument("--trials", type=int, default=50000)
    parser.add_argument("--workers", type=int, default=96)
    parser.add_argument("--output", type=str, default="data/overnight/optuna-random-results.json")
    args = parser.parse_args()

    gold_queries = load_gold_queries()

    print(f"Random Search Baseline")
    print(f"Trials: {args.trials}, Workers: {args.workers}")
    print()

    study = optuna.create_study(
        direction="maximize",
        sampler=RandomSampler(seed=42)
    )
    optuna.logging.set_verbosity(optuna.logging.WARNING)

    objective = create_objective(gold_queries)

    start = time.time()
    study.optimize(objective, n_trials=args.trials, n_jobs=args.workers)
    elapsed = time.time() - start

    best = study.best_trial

    print()
    print("=" * 72)
    print("  RANDOM SEARCH RESULTS")
    print("=" * 72)
    print(f"Best penalized F1: {best.value:.4f}")
    print(f"Best raw F1: {best.user_attrs.get('raw_f1', 'N/A')}")
    print(f"Time: {elapsed:.1f}s")
    print()

    result = {
        "optimizer": "Optuna_RandomSampler",
        "trials": len(study.trials),
        "elapsed_s": round(elapsed, 1),
        "best_value": round(best.value, 4),
        "best_raw_f1": round(best.user_attrs.get("raw_f1", 0), 4),
        "precision": round(best.user_attrs.get("precision", 0), 4),
        "recall": round(best.user_attrs.get("recall", 0), 4),
        "tools_below_floor": best.user_attrs.get("tools_below_floor", 0),
        "best_params": {k: round(v, 4) for k, v in best.params.items()},
    }

    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    with open(args.output, "w") as f:
        json.dump(result, f, indent=2)
    print(f"Results saved to {args.output}")


if __name__ == "__main__":
    main()
