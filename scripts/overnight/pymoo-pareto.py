#!/usr/bin/env python3
"""pymoo NSGA-II multi-objective optimization (F1 vs signal efficiency)."""

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

import numpy as np
from pymoo.core.problem import Problem
from pymoo.algorithms.moo.nsga2 import NSGA2
from pymoo.operators.crossover.sbx import SBX
from pymoo.operators.mutation.pm import PM
from pymoo.operators.sampling.rnd import FloatRandomSampling
from pymoo.optimize import minimize
from pymoo.termination import get_termination


class FlowMCPProblem(Problem):
    def __init__(self, gold_queries, lower, upper):
        super().__init__(
            n_var=N_PARAMS,
            n_obj=2,  # F1 and efficiency
            n_ieq_constr=0,
            xl=np.array(lower),
            xu=np.array(upper)
        )
        self.gold_queries = gold_queries

    def _evaluate(self, X, out, *args, **kwargs):
        f1_scores = []
        efficiencies = []

        for x in X:
            pf1, f1, p, r, below = evaluate_flat(x.tolist(), self.gold_queries)
            # Objective 1: maximize F1 (pymoo minimizes, so negate)
            f1_scores.append(-pf1)
            # Objective 2: minimize mean threshold (lower = more inclusive)
            mean_thresh = np.mean(x[4:])
            efficiencies.append(mean_thresh)

        out["F"] = np.column_stack([f1_scores, efficiencies])


def main():
    parser = argparse.ArgumentParser(description="pymoo NSGA-II multi-objective optimization")
    parser.add_argument("--generations", type=int, default=500)
    parser.add_argument("--population", type=int, default=200)
    parser.add_argument("--output", type=str, default="data/overnight/pymoo-results.json")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    gold_queries = load_gold_queries()
    lower, upper = get_bounds_arrays()

    print(f"pymoo NSGA-II Multi-Objective Optimization")
    print(f"Objectives: Maximize F1, Minimize threshold mean")
    print(f"Population: {args.population}, Generations: {args.generations}")
    print(f"Parameters: {N_PARAMS}")
    print()

    problem = FlowMCPProblem(gold_queries, lower, upper)

    algorithm = NSGA2(
        pop_size=args.population,
        sampling=FloatRandomSampling(),
        crossover=SBX(prob=0.9, eta=15),
        mutation=PM(eta=20),
        eliminate_duplicates=True
    )

    termination = get_termination("n_gen", args.generations)

    start = time.time()
    res = minimize(problem, algorithm, termination, seed=args.seed, verbose=True)
    elapsed = time.time() - start

    # Extract Pareto front
    pareto_f = res.F  # Objective values
    pareto_x = res.X  # Parameter values

    print()
    print("=" * 72)
    print("  PYMOO NSGA-II RESULTS")
    print("=" * 72)
    print(f"Pareto front size: {len(pareto_f)}")
    print(f"Time: {elapsed:.1f}s")
    print()

    # Find best F1 solution and best efficiency solution
    best_f1_idx = np.argmin(pareto_f[:, 0])  # Most negative = best F1
    best_eff_idx = np.argmin(pareto_f[:, 1])  # Lowest threshold mean

    best_f1_x = pareto_x[best_f1_idx].tolist()
    best_f1_pf1, best_f1_f1, best_f1_p, best_f1_r, _ = evaluate_flat(best_f1_x, gold_queries)

    best_eff_x = pareto_x[best_eff_idx].tolist()
    best_eff_pf1, best_eff_f1, best_eff_p, best_eff_r, _ = evaluate_flat(best_eff_x, gold_queries)

    print(f"Best F1 solution: penalized_F1={best_f1_pf1:.4f}, raw_F1={best_f1_f1:.4f}, thresh_mean={np.mean(best_f1_x[4:]):.4f}")
    print(f"Best efficiency:  penalized_F1={best_eff_pf1:.4f}, raw_F1={best_eff_f1:.4f}, thresh_mean={np.mean(best_eff_x[4:]):.4f}")
    print()

    # Build pareto front for JSON
    pareto_solutions = []
    for i in range(len(pareto_f)):
        x = pareto_x[i].tolist()
        pf1, f1, p, r, below = evaluate_flat(x, gold_queries)
        pareto_solutions.append({
            "penalized_f1": round(pf1, 4),
            "raw_f1": round(f1, 4),
            "threshold_mean": round(float(np.mean(x[4:])), 4),
            "precision": round(p, 4),
            "recall": round(r, 4),
        })

    # Sort by F1 descending
    pareto_solutions.sort(key=lambda s: s["penalized_f1"], reverse=True)

    result = {
        "optimizer": "pymoo_NSGA2",
        "generations": args.generations,
        "population": args.population,
        "trials": args.generations * args.population,
        "elapsed_s": round(elapsed, 1),
        "pareto_front_size": len(pareto_f),
        "best_f1_solution": {
            "best_value": round(best_f1_pf1, 4),
            "best_raw_f1": round(best_f1_f1, 4),
            "precision": round(best_f1_p, 4),
            "recall": round(best_f1_r, 4),
            "threshold_mean": round(float(np.mean(best_f1_x[4:])), 4),
            "params": {
                "w_strong": round(best_f1_x[0], 4),
                "w_medium": round(best_f1_x[1], 4),
                "w_weak": round(best_f1_x[2], 4),
                "w_negative": round(best_f1_x[3], 4),
            }
        },
        "best_efficiency_solution": {
            "best_value": round(best_eff_pf1, 4),
            "best_raw_f1": round(best_eff_f1, 4),
            "threshold_mean": round(float(np.mean(best_eff_x[4:])), 4),
        },
        "pareto_front": pareto_solutions[:20],  # Top 20 by F1
    }

    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    with open(args.output, "w") as f:
        json.dump(result, f, indent=2)
    print(f"Results saved to {args.output}")


if __name__ == "__main__":
    main()
