/**
 * Tests for tools-v5.ts (flow_quest_generator)
 *
 * Holodeck Intelligence Layer: procedural exploration quests from dataset topology.
 * Tests verify anomaly detection, comparison quests, trend quests, hypothesis quests,
 * connection quests, difficulty filtering, narrative quality, and edge cases.
 */

import { describe, it, expect } from "vitest";
import { flowQuestGenerator } from "./tools-v5.js";
import type { QuestGeneratorInput, QuestGeneratorResult } from "./tools-v5.js";

// ============================================================================
// Test datasets
// ============================================================================

/** Simple numeric dataset with clear outlier in row index 8 (Mega Corp) */
const NUMERIC_DATASET = [
  "name,revenue,employees,growth",
  "Acme Corp,5000000,250,12.5",
  "Beta Inc,1200000,45,8.3",
  "Gamma LLC,3500000,180,15.0",
  "Delta Co,300000,12,2.1",
  "Epsilon Ltd,4500000,200,14.2",
  "Zeta Corp,850000,30,5.2",
  "Eta Inc,2700000,120,10.7",
  "Theta Co,2100000,90,7.4",
  "Mega Corp,95000000,8000,85.0",
  "Kappa Inc,1500000,55,6.8",
].join("\n");

/** Dataset with two distinct clusters for comparison quests */
const CLUSTER_DATASET = [
  "id,income,spending,age",
  "A1,20000,18000,22",
  "A2,22000,19500,24",
  "A3,21000,18500,23",
  "A4,23000,20000,25",
  "A5,19000,17000,21",
  "B1,90000,40000,45",
  "B2,95000,42000,48",
  "B3,88000,38000,44",
  "B4,92000,41000,46",
  "B5,91000,39000,47",
].join("\n");

/** Time series with a clear slope change (trend quest) */
const TREND_DATASET = [
  "date,sales,cost",
  "2024-01-01,100,80",
  "2024-02-01,120,85",
  "2024-03-01,140,90",
  "2024-04-01,160,95",
  "2024-05-01,180,100",
  "2024-06-01,200,105",
  "2024-07-01,150,130",
  "2024-08-01,130,140",
  "2024-09-01,110,150",
  "2024-10-01,90,160",
].join("\n");

/** Dataset with near-significant correlation (hypothesis quest) — r ~ 0.7 */
const HYPOTHESIS_DATASET = [
  "employee,training_hours,satisfaction,tenure",
  "E1,40,7.5,3",
  "E2,10,5.0,6",
  "E3,35,7.0,2",
  "E4,5,3.5,5",
  "E5,30,6.5,1",
  "E6,15,4.5,4",
  "E7,25,6.0,3",
  "E8,20,7.0,2",
  "E9,45,8.0,4",
  "E10,8,3.0,5",
  "E11,38,5.5,1",
  "E12,12,4.0,6",
].join("\n");

/** Network dataset with bridge nodes (connection quest) */
const NETWORK_DATASET = [
  "id,connections,label,group",
  "Alice,Bob|Charlie,Alice,team_alpha",
  "Bob,Alice|Charlie,Bob,team_alpha",
  "Charlie,Alice|Bob|Dave,Charlie,team_alpha",
  "Dave,Charlie|Eve|Frank,Dave,team_beta",
  "Eve,Dave|Frank,Eve,team_beta",
  "Frank,Dave|Eve,Frank,team_beta",
  "Gina,Hank|Iris,Gina,team_gamma",
  "Hank,Gina|Iris,Hank,team_gamma",
  "Iris,Gina|Hank,Iris,team_gamma",
].join("\n");

/** Empty dataset (headers only) */
const EMPTY_DATASET = "name,value\n";

/** Single row dataset */
const SINGLE_ROW_DATASET = [
  "name,value,score",
  "Only One,42,100",
].join("\n");

/** All identical values -- no variance, no quests possible */
const IDENTICAL_DATASET = [
  "id,value,score",
  "A,10,50",
  "B,10,50",
  "C,10,50",
  "D,10,50",
  "E,10,50",
].join("\n");

/** Mixed numeric and categorical -- 12 rows with outlier at Golf */
const MIXED_DATASET = [
  "name,category,revenue,employees,region",
  "Alpha,Tech,5000000,200,North",
  "Bravo,Tech,4500000,180,South",
  "Charlie,Finance,8000000,500,North",
  "Delta,Finance,7500000,450,South",
  "Echo,Health,2000000,80,East",
  "Foxtrot,Health,1800000,70,West",
  "Golf,Tech,80000000,5000,North",
  "Hotel,Finance,7800000,470,East",
  "India,Tech,5200000,210,North",
  "Juliet,Finance,7600000,440,South",
  "Kilo,Health,2200000,90,East",
  "Lima,Tech,4800000,190,West",
].join("\n");

// ============================================================================
// Tests
// ============================================================================

describe("flow_quest_generator", () => {
  it("should generate quests from a numeric dataset", () => {
    const result = flowQuestGenerator({ csv_data: NUMERIC_DATASET });
    expect(result).toBeDefined();
    expect(result.quests).toBeDefined();
    expect(Array.isArray(result.quests)).toBe(true);
    expect(result.quests.length).toBeGreaterThan(0);
    expect(result.dataset_summary).toBeDefined();
    expect(result.dataset_summary.rows).toBe(10);
    expect(result.dataset_summary.columns).toBe(4);
  });

  it("should detect anomaly quest targeting the outlier row", () => {
    const result = flowQuestGenerator({ csv_data: NUMERIC_DATASET });
    const anomalyQuests = result.quests.filter((q) => q.type === "anomaly");
    expect(anomalyQuests.length).toBeGreaterThan(0);
    const megaQuest = anomalyQuests.find(
      (q) => q.target_rows && q.target_rows.includes(8)
    );
    expect(megaQuest).toBeDefined();
    expect(megaQuest!.target_columns.length).toBeGreaterThan(0);
    expect(megaQuest!.statistical_basis.metric).toBe("z_score");
    expect(Math.abs(megaQuest!.statistical_basis.value)).toBeGreaterThan(2.5);
  });

  it("should generate comparison quest for clustered data", () => {
    const result = flowQuestGenerator({ csv_data: CLUSTER_DATASET });
    const comparisonQuests = result.quests.filter((q) => q.type === "comparison");
    expect(comparisonQuests.length).toBeGreaterThan(0);
    const compQuest = comparisonQuests[0];
    expect(compQuest.target_columns.length).toBeGreaterThan(0);
    expect(compQuest.investigation_steps.length).toBeGreaterThanOrEqual(2);
  });

  it("should detect trend quest for time series with inflection", () => {
    const result = flowQuestGenerator({ csv_data: TREND_DATASET });
    const trendQuests = result.quests.filter((q) => q.type === "trend");
    expect(trendQuests.length).toBeGreaterThan(0);
    const trendQuest = trendQuests[0];
    expect(trendQuest.target_columns.length).toBeGreaterThan(0);
    expect(trendQuest.statistical_basis.metric).toBe("slope_change");
  });

  it("should generate hypothesis quest for correlated columns", () => {
    const result = flowQuestGenerator({ csv_data: HYPOTHESIS_DATASET });
    const hypothesisQuests = result.quests.filter((q) => q.type === "hypothesis");
    expect(hypothesisQuests.length).toBeGreaterThan(0);
    const hypQuest = hypothesisQuests[0];
    expect(hypQuest.target_columns.length).toBe(2);
    expect(hypQuest.statistical_basis.metric).toBe("correlation");
    expect(Math.abs(hypQuest.statistical_basis.value)).toBeGreaterThanOrEqual(0.5);
    expect(Math.abs(hypQuest.statistical_basis.value)).toBeLessThanOrEqual(1.0);
  });

  it("should generate connection quest for network data with bridges", () => {
    const result = flowQuestGenerator({ csv_data: NETWORK_DATASET });
    const connectionQuests = result.quests.filter((q) => q.type === "connection");
    expect(connectionQuests.length).toBeGreaterThan(0);
    const connQuest = connectionQuests[0];
    expect(connQuest.target_columns).toContain("connections");
  });

  it("should filter quests by difficulty (easy)", () => {
    const result = flowQuestGenerator({
      csv_data: NUMERIC_DATASET,
      difficulty: "easy",
    });
    for (const quest of result.quests) {
      expect(quest.difficulty).toBe("easy");
    }
  });

  it("should filter quests by difficulty (hard)", () => {
    const result = flowQuestGenerator({
      csv_data: HYPOTHESIS_DATASET,
      difficulty: "hard",
    });
    for (const quest of result.quests) {
      expect(quest.difficulty).toBe("hard");
    }
  });

  it("should return all difficulties when filter is all", () => {
    const result = flowQuestGenerator({
      csv_data: NUMERIC_DATASET,
      difficulty: "all",
    });
    expect(result.quests.length).toBeGreaterThan(0);
  });

  it("should respect max_quests limit", () => {
    const result = flowQuestGenerator({
      csv_data: NUMERIC_DATASET,
      max_quests: 2,
    });
    expect(result.quests.length).toBeLessThanOrEqual(2);
  });

  it("should handle empty dataset gracefully", () => {
    const result = flowQuestGenerator({ csv_data: EMPTY_DATASET });
    expect(result.quests).toEqual([]);
    expect(result.dataset_summary.rows).toBe(0);
  });

  it("should handle single row dataset", () => {
    const result = flowQuestGenerator({ csv_data: SINGLE_ROW_DATASET });
    expect(result.dataset_summary.rows).toBe(1);
    expect(Array.isArray(result.quests)).toBe(true);
  });

  it("should generate no quests for all-identical data", () => {
    const result = flowQuestGenerator({ csv_data: IDENTICAL_DATASET });
    expect(result.quests.length).toBe(0);
  });

  it("should handle mixed numeric and categorical columns", () => {
    const result = flowQuestGenerator({ csv_data: MIXED_DATASET });
    expect(result.quests.length).toBeGreaterThan(0);
    const anomalyQuests = result.quests.filter((q) => q.type === "anomaly");
    expect(anomalyQuests.length).toBeGreaterThan(0);
  });

  it("should generate narrative quest titles, not robotic ones", () => {
    const result = flowQuestGenerator({ csv_data: NUMERIC_DATASET });
    for (const quest of result.quests) {
      expect(quest.title.length).toBeGreaterThan(10);
      expect(quest.title).not.toMatch(/^Anomaly\b/);
      expect(quest.title).not.toMatch(/^Outlier\b/);
    }
  });

  it("should generate actionable investigation steps", () => {
    const result = flowQuestGenerator({ csv_data: NUMERIC_DATASET });
    for (const quest of result.quests) {
      expect(quest.investigation_steps.length).toBeGreaterThanOrEqual(2);
      for (const step of quest.investigation_steps) {
        expect(step.length).toBeGreaterThan(20);
      }
    }
  });

  it("should include specific numbers in statistical basis", () => {
    const result = flowQuestGenerator({ csv_data: NUMERIC_DATASET });
    for (const quest of result.quests) {
      expect(quest.statistical_basis).toBeDefined();
      expect(quest.statistical_basis.metric).toBeTruthy();
      expect(typeof quest.statistical_basis.value).toBe("number");
      expect(typeof quest.statistical_basis.threshold).toBe("number");
    }
  });

  it("should generate unique quest IDs", () => {
    const result = flowQuestGenerator({ csv_data: NUMERIC_DATASET });
    const ids = result.quests.map((q) => q.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("should have at least 2 investigation steps per quest", () => {
    const result = flowQuestGenerator({ csv_data: CLUSTER_DATASET });
    for (const quest of result.quests) {
      expect(quest.investigation_steps.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("should produce JSON-serializable output", () => {
    const result = flowQuestGenerator({ csv_data: NUMERIC_DATASET });
    const serialized = JSON.stringify(result);
    const parsed = JSON.parse(serialized);
    expect(parsed.quests).toBeDefined();
    expect(parsed.dataset_summary).toBeDefined();
    expect(parsed.suggested_sequence).toBeDefined();
  });

  it("should include quest_density and dominant_quest_type in summary", () => {
    const result = flowQuestGenerator({ csv_data: NUMERIC_DATASET });
    expect(typeof result.dataset_summary.quest_density).toBe("number");
    expect(result.dataset_summary.quest_density).toBeGreaterThanOrEqual(0);
    expect(typeof result.dataset_summary.dominant_quest_type).toBe("string");
  });

  it("should include suggested_sequence with quest IDs", () => {
    const result = flowQuestGenerator({ csv_data: NUMERIC_DATASET });
    expect(Array.isArray(result.suggested_sequence)).toBe(true);
    const questIds = result.quests.map((q) => q.id);
    for (const seqId of result.suggested_sequence) {
      expect(questIds).toContain(seqId);
    }
  });

  it("should include a reward description for each quest", () => {
    const result = flowQuestGenerator({ csv_data: NUMERIC_DATASET });
    for (const quest of result.quests) {
      expect(quest.reward).toBeDefined();
      expect(quest.reward.length).toBeGreaterThan(10);
    }
  });

  it("should generate narrative hooks that are compelling", () => {
    const result = flowQuestGenerator({ csv_data: NUMERIC_DATASET });
    for (const quest of result.quests) {
      expect(quest.narrative_hook).toBeDefined();
      expect(quest.narrative_hook.length).toBeGreaterThan(20);
    }
  });
});
