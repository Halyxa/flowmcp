/**
 * Tests for tools-fog.ts (flow_fog_of_war)
 *
 * Fog of War: stateful progressive disclosure for data exploration.
 * Tests verify starter reveal, progressive visibility, reveal hints,
 * network propagation, world coverage, and edge cases.
 */

import { describe, it, expect } from "vitest";
import { flowFogOfWar } from "./tools-fog.js";
import type { FogOfWarInput, FogOfWarResult } from "./tools-fog.js";
import { parseCSVLine } from "./csv-utils.js";

// ============================================================================
// Test datasets
// ============================================================================

const BASIC_DATASET = [
  "name,age,salary,department,score",
  "Alice,30,70000,Engineering,85",
  "Bob,25,60000,Marketing,72",
  "Carol,35,90000,Engineering,91",
  "Dave,28,55000,Sales,68",
  "Eve,32,80000,Marketing,88",
].join("\n");

const CORRELATED_DATASET = [
  "x,y,z,w",
  "1,2,100,50",
  "2,4,200,48",
  "3,6,300,52",
  "4,8,400,47",
  "5,10,500,51",
  "6,12,600,49",
  "7,14,700,53",
  "8,16,800,46",
].join("\n");

const NETWORK_DATASET = [
  "id,label,connections,value",
  "A,Node A,B|C,10",
  "B,Node B,A|D,20",
  "C,Node C,A,30",
  "D,Node D,B|E,40",
  "E,Node E,D,50",
].join("\n");

const SINGLE_ROW = ["col_a,col_b,col_c", "1,2,3"].join("\n");

const SINGLE_COLUMN = ["metric", "10", "20", "30"].join("\n");

const ID_FIRST_DATASET = [
  "id,alpha,beta,gamma,delta",
  "1,10,20,30,40",
  "2,11,22,33,44",
  "3,12,24,36,48",
  "4,13,26,39,52",
].join("\n");

// ============================================================================
// Starter reveal (no history)
// ============================================================================

describe("flow_fog_of_war — starter reveal", () => {
  it("reveals first 2 columns when no history given", () => {
    const result = flowFogOfWar({ csv_data: BASIC_DATASET });
    // "name" and "age" should be visible (first 2 non-id columns)
    expect(result.visible_columns).toContain("name");
    expect(result.visible_columns).toContain("age");
    expect(result.visible_columns.length).toBeLessThanOrEqual(3); // at most 2 + id
    expect(result.hidden_columns.length).toBeGreaterThan(0);
  });

  it("reveals id column plus first 2 non-id columns with id-first dataset", () => {
    const result = flowFogOfWar({ csv_data: ID_FIRST_DATASET });
    expect(result.visible_columns).toContain("id");
    expect(result.visible_columns).toContain("alpha");
    expect(result.visible_columns).toContain("beta");
    expect(result.visible_columns.length).toBe(3); // id + 2 non-id
  });

  it("empty exploration_history acts same as no history", () => {
    const result = flowFogOfWar({
      csv_data: BASIC_DATASET,
      exploration_history: { columns_viewed: [], rows_viewed: [] },
    });
    expect(result.visible_columns.length).toBeLessThanOrEqual(3);
    expect(result.hidden_columns.length).toBeGreaterThan(0);
  });

  it("starter reveal world_coverage is between 0 and 1 exclusive", () => {
    const result = flowFogOfWar({ csv_data: BASIC_DATASET });
    expect(result.world_coverage).toBeGreaterThan(0);
    expect(result.world_coverage).toBeLessThan(1);
  });
});

// ============================================================================
// Progressive reveal
// ============================================================================

describe("flow_fog_of_war — progressive reveal", () => {
  it("viewing more columns reveals more of the dataset", () => {
    const r1 = flowFogOfWar({
      csv_data: BASIC_DATASET,
      exploration_history: { columns_viewed: ["name"], rows_viewed: [0] },
    });
    const r2 = flowFogOfWar({
      csv_data: BASIC_DATASET,
      exploration_history: { columns_viewed: ["name", "age", "salary"], rows_viewed: [0, 1, 2] },
    });
    expect(r2.visible_columns.length).toBeGreaterThanOrEqual(r1.visible_columns.length);
    expect(r2.hidden_columns.length).toBeLessThanOrEqual(r1.hidden_columns.length);
  });

  it("full history reveals all columns", () => {
    const result = flowFogOfWar({
      csv_data: BASIC_DATASET,
      exploration_history: {
        columns_viewed: ["name", "age", "salary", "department", "score"],
        rows_viewed: [0, 1, 2, 3, 4],
      },
    });
    expect(result.visible_columns.length).toBe(5);
    expect(result.hidden_columns.length).toBe(0);
    expect(result.world_coverage).toBe(1);
  });

  it("world_coverage increases with more exploration", () => {
    const r1 = flowFogOfWar({
      csv_data: BASIC_DATASET,
      exploration_history: { columns_viewed: ["name"], rows_viewed: [0] },
    });
    const r2 = flowFogOfWar({
      csv_data: BASIC_DATASET,
      exploration_history: { columns_viewed: ["name", "age", "salary"], rows_viewed: [0, 1, 2, 3] },
    });
    expect(r2.world_coverage).toBeGreaterThan(r1.world_coverage);
  });

  it("correlated columns auto-reveal when parent explored", () => {
    // x and y are perfectly correlated (y = 2x), z = 100x also correlated
    const result = flowFogOfWar({
      csv_data: CORRELATED_DATASET,
      exploration_history: { columns_viewed: ["x"], rows_viewed: [0] },
    });
    // y and z should be auto-revealed due to high correlation with x
    expect(result.visible_columns).toContain("x");
    expect(result.visible_columns).toContain("y");
    expect(result.visible_columns).toContain("z");
  });
});

// ============================================================================
// _visibility column
// ============================================================================

describe("flow_fog_of_war — _visibility column", () => {
  it("output CSV contains _visibility column", () => {
    const result = flowFogOfWar({ csv_data: BASIC_DATASET });
    const headerLine = result.fog_csv.split("\n")[0];
    const headers = parseCSVLine(headerLine);
    expect(headers).toContain("_visibility");
  });

  it("no history → all rows have visibility 0", () => {
    const result = flowFogOfWar({ csv_data: BASIC_DATASET });
    const lines = result.fog_csv.trim().split("\n");
    const headers = parseCSVLine(lines[0]);
    const visIdx = headers.indexOf("_visibility");
    for (let i = 1; i < lines.length; i++) {
      const fields = parseCSVLine(lines[i]);
      expect(Number(fields[visIdx])).toBe(0);
    }
  });

  it("viewed rows get visibility 3 (viewed but not all columns explored)", () => {
    const result = flowFogOfWar({
      csv_data: BASIC_DATASET,
      exploration_history: { columns_viewed: ["name", "age"], rows_viewed: [0, 2] },
    });
    const lines = result.fog_csv.trim().split("\n");
    const headers = parseCSVLine(lines[0]);
    const visIdx = headers.indexOf("_visibility");
    // Row 0 (index 1 in lines) should be 3
    expect(Number(parseCSVLine(lines[1])[visIdx])).toBe(3);
    // Row 2 (index 3 in lines) should be 3
    expect(Number(parseCSVLine(lines[3])[visIdx])).toBe(3);
    // Unviewed rows should be 2 (columns being explored but row not viewed)
    expect(Number(parseCSVLine(lines[2])[visIdx])).toBe(2);
  });

  it("full exploration → visibility 4 for viewed rows", () => {
    const result = flowFogOfWar({
      csv_data: BASIC_DATASET,
      exploration_history: {
        columns_viewed: ["name", "age", "salary", "department", "score"],
        rows_viewed: [0, 1, 2, 3, 4],
      },
    });
    const lines = result.fog_csv.trim().split("\n");
    const headers = parseCSVLine(lines[0]);
    const visIdx = headers.indexOf("_visibility");
    for (let i = 1; i < lines.length; i++) {
      expect(Number(parseCSVLine(lines[i])[visIdx])).toBe(4);
    }
  });
});

// ============================================================================
// _reveal_hint column
// ============================================================================

describe("flow_fog_of_war — _reveal_hint column", () => {
  it("output CSV contains _reveal_hint column", () => {
    const result = flowFogOfWar({ csv_data: BASIC_DATASET });
    const headerLine = result.fog_csv.split("\n")[0];
    const headers = parseCSVLine(headerLine);
    expect(headers).toContain("_reveal_hint");
  });

  it("reveal hints reference hidden columns when fog exists", () => {
    const result = flowFogOfWar({
      csv_data: BASIC_DATASET,
      exploration_history: { columns_viewed: ["name"], rows_viewed: [0] },
    });
    const lines = result.fog_csv.trim().split("\n");
    const headers = parseCSVLine(lines[0]);
    const hintIdx = headers.indexOf("_reveal_hint");
    const hint = parseCSVLine(lines[1])[hintIdx];
    expect(hint).toContain("Hidden:");
  });

  it("full reveal shows 'All dimensions revealed' in hints", () => {
    const result = flowFogOfWar({
      csv_data: BASIC_DATASET,
      exploration_history: {
        columns_viewed: ["name", "age", "salary", "department", "score"],
        rows_viewed: [0, 1, 2, 3, 4],
      },
    });
    const lines = result.fog_csv.trim().split("\n");
    const headers = parseCSVLine(lines[0]);
    const hintIdx = headers.indexOf("_reveal_hint");
    const hint = parseCSVLine(lines[1])[hintIdx];
    expect(hint).toBe("All dimensions revealed");
  });
});

// ============================================================================
// Reveal hints structure
// ============================================================================

describe("flow_fog_of_war — reveal hints", () => {
  it("each hint has hidden_column, tease, and unlock_action", () => {
    const result = flowFogOfWar({
      csv_data: BASIC_DATASET,
      exploration_history: { columns_viewed: ["name"], rows_viewed: [0] },
    });
    expect(result.reveal_hints.length).toBeGreaterThan(0);
    for (const hint of result.reveal_hints) {
      expect(hint).toHaveProperty("hidden_column");
      expect(hint).toHaveProperty("tease");
      expect(hint).toHaveProperty("unlock_action");
      expect(typeof hint.hidden_column).toBe("string");
      expect(typeof hint.tease).toBe("string");
      expect(typeof hint.unlock_action).toBe("string");
    }
  });

  it("tease references actual stats for numeric hidden columns", () => {
    const result = flowFogOfWar({
      csv_data: BASIC_DATASET,
      exploration_history: { columns_viewed: ["name"], rows_viewed: [0] },
    });
    // salary is hidden and numeric — its tease should mention range
    const salaryHint = result.reveal_hints.find((h) => h.hidden_column === "salary");
    if (salaryHint) {
      expect(salaryHint.tease).toMatch(/ranges from/);
      expect(salaryHint.tease).toMatch(/55000/); // min salary
      expect(salaryHint.tease).toMatch(/90000/); // max salary
    }
  });

  it("unlock_action mentions a related column", () => {
    const result = flowFogOfWar({
      csv_data: BASIC_DATASET,
      exploration_history: { columns_viewed: ["name", "age"], rows_viewed: [0] },
    });
    for (const hint of result.reveal_hints) {
      expect(hint.unlock_action).toMatch(/Explore .+ to reveal .+/);
    }
  });

  it("no reveal hints when all columns visible", () => {
    const result = flowFogOfWar({
      csv_data: BASIC_DATASET,
      exploration_history: {
        columns_viewed: ["name", "age", "salary", "department", "score"],
        rows_viewed: [0],
      },
    });
    expect(result.reveal_hints.length).toBe(0);
  });
});

// ============================================================================
// Network data
// ============================================================================

describe("flow_fog_of_war — network data", () => {
  it("exploring a node reveals connected nodes with higher visibility", () => {
    // View row 0 (A, connected to B and C)
    const result = flowFogOfWar({
      csv_data: NETWORK_DATASET,
      exploration_history: { columns_viewed: ["id", "label", "connections"], rows_viewed: [0] },
    });
    const lines = result.fog_csv.trim().split("\n");
    const headers = parseCSVLine(lines[0]);
    const visIdx = headers.indexOf("_visibility");

    // Row 0 (A) → viewed → visibility 3+
    const visA = Number(parseCSVLine(lines[1])[visIdx]);
    expect(visA).toBeGreaterThanOrEqual(3);

    // Row 1 (B) → connected to A → visibility 1
    const visB = Number(parseCSVLine(lines[2])[visIdx]);
    expect(visB).toBe(1);

    // Row 2 (C) → connected to A → visibility 1
    const visC = Number(parseCSVLine(lines[3])[visIdx]);
    expect(visC).toBe(1);

    // Row 3 (D) → NOT connected to A → visibility 2 (columns explored but row not viewed)
    const visD = Number(parseCSVLine(lines[4])[visIdx]);
    expect(visD).toBe(2);
  });

  it("network connections propagate through viewed nodes", () => {
    // View rows 0 (A) and 1 (B). B connects to D.
    const result = flowFogOfWar({
      csv_data: NETWORK_DATASET,
      exploration_history: { columns_viewed: ["id", "connections"], rows_viewed: [0, 1] },
    });
    const lines = result.fog_csv.trim().split("\n");
    const headers = parseCSVLine(lines[0]);
    const visIdx = headers.indexOf("_visibility");

    // Row 3 (D) → connected to B (viewed) → visibility 1
    const visD = Number(parseCSVLine(lines[4])[visIdx]);
    expect(visD).toBe(1);
  });
});

// ============================================================================
// Fog CSV output structure
// ============================================================================

describe("flow_fog_of_war — fog_csv structure", () => {
  it("fog_csv excludes hidden columns", () => {
    const result = flowFogOfWar({
      csv_data: BASIC_DATASET,
      exploration_history: { columns_viewed: ["name"], rows_viewed: [0] },
    });
    const headers = parseCSVLine(result.fog_csv.split("\n")[0]);
    for (const hidden of result.hidden_columns) {
      expect(headers).not.toContain(hidden);
    }
  });

  it("fog_csv includes all visible columns plus _visibility and _reveal_hint", () => {
    const result = flowFogOfWar({
      csv_data: BASIC_DATASET,
      exploration_history: { columns_viewed: ["name", "age"], rows_viewed: [0] },
    });
    const headers = parseCSVLine(result.fog_csv.split("\n")[0]);
    for (const vis of result.visible_columns) {
      expect(headers).toContain(vis);
    }
    expect(headers).toContain("_visibility");
    expect(headers).toContain("_reveal_hint");
  });

  it("fog_csv row count matches input data row count", () => {
    const result = flowFogOfWar({ csv_data: BASIC_DATASET });
    const lines = result.fog_csv.trim().split("\n");
    // header + 5 data rows
    expect(lines.length).toBe(6);
  });
});

// ============================================================================
// Edge cases
// ============================================================================

describe("flow_fog_of_war — edge cases", () => {
  it("single row dataset", () => {
    const result = flowFogOfWar({ csv_data: SINGLE_ROW });
    expect(result.visible_columns.length).toBeGreaterThan(0);
    const lines = result.fog_csv.trim().split("\n");
    expect(lines.length).toBe(2); // header + 1 row
  });

  it("single column dataset", () => {
    const result = flowFogOfWar({ csv_data: SINGLE_COLUMN });
    expect(result.visible_columns).toContain("metric");
    expect(result.hidden_columns.length).toBe(0);
  });

  it("nonexistent columns in history are ignored", () => {
    const result = flowFogOfWar({
      csv_data: BASIC_DATASET,
      exploration_history: { columns_viewed: ["nonexistent", "fake_col"], rows_viewed: [0] },
    });
    // Should fall back to starter reveal since no valid columns viewed
    expect(result.visible_columns.length).toBeLessThanOrEqual(3);
  });

  it("csv_content alias works (via normalizeCsvArgs)", () => {
    const input = { csv_content: BASIC_DATASET } as unknown as FogOfWarInput;
    const result = flowFogOfWar(input);
    expect(result.visible_columns.length).toBeGreaterThan(0);
    expect(result.fog_csv.length).toBeGreaterThan(0);
  });

  it("empty CSV returns empty result", () => {
    const result = flowFogOfWar({ csv_data: "" });
    expect(result.visible_columns.length).toBe(0);
    expect(result.hidden_columns.length).toBe(0);
    expect(result.reveal_hints.length).toBe(0);
    expect(result.world_coverage).toBe(0);
  });

  it("header-only CSV (no data rows)", () => {
    const result = flowFogOfWar({ csv_data: "a,b,c" });
    expect(result.visible_columns.length).toBeGreaterThan(0);
    const lines = result.fog_csv.trim().split("\n");
    expect(lines.length).toBe(1); // header only, no data rows
  });

  it("out-of-range row indices are ignored gracefully", () => {
    const result = flowFogOfWar({
      csv_data: BASIC_DATASET,
      exploration_history: { columns_viewed: ["name"], rows_viewed: [-1, 999, 1000] },
    });
    // No valid rows viewed, but columns are valid
    expect(result.visible_columns).toContain("name");
  });
});
