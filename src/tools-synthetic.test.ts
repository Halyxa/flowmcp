/**
 * Tests for flow_generate_synthetic (Tool 71)
 *
 * Generates configurable synthetic CSV datasets with controllable
 * schemas, distributions, relationships, and structures.
 */

import { describe, it, expect } from "vitest";
import { parseCSVLine } from "./csv-utils.js";

// Import will fail until implementation exists
import { flowGenerateSynthetic } from "./tools-synthetic.js";
import type { GenerateSyntheticInput, GenerateSyntheticResult } from "./tools-synthetic.js";

// Helper: parse CSV result into headers + rows
function parseCsv(csv: string): { headers: string[]; rows: string[][] } {
  const lines = csv.trim().split("\n");
  const headers = parseCSVLine(lines[0]);
  const rows = lines.slice(1).map(l => parseCSVLine(l));
  return { headers, rows };
}

describe("flow_generate_synthetic", () => {
  // ========== BASIC FUNCTIONALITY ==========

  it("generates CSV with specified number of rows", () => {
    const result = flowGenerateSynthetic({ rows: 50 });
    expect(result.csv).toBeDefined();
    const { rows } = parseCsv(result.csv);
    expect(rows.length).toBe(50);
  });

  it("generates default columns when no schema specified", () => {
    const result = flowGenerateSynthetic({ rows: 10 });
    const { headers } = parseCsv(result.csv);
    expect(headers.length).toBeGreaterThanOrEqual(4);
    expect(headers).toContain("id");
  });

  it("returns metadata about generated data", () => {
    const result = flowGenerateSynthetic({ rows: 20 });
    expect(result.rows).toBe(20);
    expect(result.columns).toBeGreaterThan(0);
    expect(result.schema).toBeDefined();
    expect(Array.isArray(result.schema)).toBe(true);
  });

  // ========== CUSTOM SCHEMA ==========

  it("generates columns matching custom schema", () => {
    const result = flowGenerateSynthetic({
      rows: 10,
      schema: [
        { name: "company", type: "text" },
        { name: "revenue", type: "numeric" },
        { name: "founded", type: "date" },
        { name: "sector", type: "categorical", categories: ["Tech", "Finance", "Health"] },
      ],
    });
    const { headers, rows } = parseCsv(result.csv);
    expect(headers).toEqual(["company", "revenue", "founded", "sector"]);
    expect(rows.length).toBe(10);
  });

  it("generates numeric columns with values in specified range", () => {
    const result = flowGenerateSynthetic({
      rows: 100,
      schema: [
        { name: "score", type: "numeric", min: 0, max: 100 },
      ],
    });
    const { rows } = parseCsv(result.csv);
    for (const row of rows) {
      const val = parseFloat(row[0]);
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(100);
    }
  });

  it("generates categorical columns from specified categories", () => {
    const cats = ["Red", "Blue", "Green"];
    const result = flowGenerateSynthetic({
      rows: 30,
      schema: [
        { name: "color", type: "categorical", categories: cats },
      ],
    });
    const { rows } = parseCsv(result.csv);
    for (const row of rows) {
      expect(cats).toContain(row[0]);
    }
  });

  it("generates date columns with date-like values", () => {
    const result = flowGenerateSynthetic({
      rows: 10,
      schema: [
        { name: "created", type: "date" },
      ],
    });
    const { rows } = parseCsv(result.csv);
    for (const row of rows) {
      // Should match YYYY-MM-DD pattern
      expect(row[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("generates id columns with unique sequential values", () => {
    const result = flowGenerateSynthetic({
      rows: 20,
      schema: [
        { name: "item_id", type: "id" },
        { name: "value", type: "numeric" },
      ],
    });
    const { rows } = parseCsv(result.csv);
    const ids = rows.map(r => r[0]);
    expect(new Set(ids).size).toBe(20);
  });

  // ========== NETWORK MODE ==========

  it("generates network graph data with id and connections", () => {
    const result = flowGenerateSynthetic({
      rows: 15,
      mode: "network",
    });
    const { headers, rows } = parseCsv(result.csv);
    expect(headers).toContain("id");
    expect(headers).toContain("connections");
    expect(rows.length).toBe(15);
  });

  it("network connections reference valid node ids", () => {
    const result = flowGenerateSynthetic({
      rows: 10,
      mode: "network",
    });
    const { headers, rows } = parseCsv(result.csv);
    const idIdx = headers.indexOf("id");
    const connIdx = headers.indexOf("connections");
    const allIds = new Set(rows.map(r => r[idIdx]));
    for (const row of rows) {
      const conns = row[connIdx];
      if (conns && conns.trim()) {
        for (const conn of conns.split("|")) {
          expect(allIds).toContain(conn.trim());
        }
      }
    }
  });

  // ========== GEOGRAPHIC MODE ==========

  it("generates geographic data with lat/lon", () => {
    const result = flowGenerateSynthetic({
      rows: 20,
      mode: "geographic",
    });
    const { headers, rows } = parseCsv(result.csv);
    expect(headers).toContain("latitude");
    expect(headers).toContain("longitude");
    for (const row of rows) {
      const latIdx = headers.indexOf("latitude");
      const lonIdx = headers.indexOf("longitude");
      const lat = parseFloat(row[latIdx]);
      const lon = parseFloat(row[lonIdx]);
      expect(lat).toBeGreaterThanOrEqual(-90);
      expect(lat).toBeLessThanOrEqual(90);
      expect(lon).toBeGreaterThanOrEqual(-180);
      expect(lon).toBeLessThanOrEqual(180);
    }
  });

  // ========== TIME SERIES MODE ==========

  it("generates time series data with sequential dates", () => {
    const result = flowGenerateSynthetic({
      rows: 30,
      mode: "timeseries",
    });
    const { headers, rows } = parseCsv(result.csv);
    expect(headers).toContain("date");
    // Dates should be in order
    const dateIdx = headers.indexOf("date");
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i][dateIdx] >= rows[i - 1][dateIdx]).toBe(true);
    }
  });

  // ========== CORRELATIONS ==========

  it("generates correlated columns when correlation specified", () => {
    const result = flowGenerateSynthetic({
      rows: 200,
      schema: [
        { name: "x", type: "numeric", min: 0, max: 100 },
        { name: "y", type: "numeric", min: 0, max: 100, correlate_with: "x", correlation: 0.9 },
      ],
    });
    const { headers, rows } = parseCsv(result.csv);
    const xIdx = headers.indexOf("x");
    const yIdx = headers.indexOf("y");
    const xs = rows.map(r => parseFloat(r[xIdx]));
    const ys = rows.map(r => parseFloat(r[yIdx]));
    // Compute Pearson correlation
    const n = xs.length;
    const meanX = xs.reduce((a, b) => a + b) / n;
    const meanY = ys.reduce((a, b) => a + b) / n;
    let num = 0, denX = 0, denY = 0;
    for (let i = 0; i < n; i++) {
      num += (xs[i] - meanX) * (ys[i] - meanY);
      denX += (xs[i] - meanX) ** 2;
      denY += (ys[i] - meanY) ** 2;
    }
    const r = num / Math.sqrt(denX * denY);
    // Should be positively correlated (allowing some noise)
    expect(r).toBeGreaterThan(0.5);
  });

  // ========== EDGE CASES ==========

  it("handles rows=1", () => {
    const result = flowGenerateSynthetic({ rows: 1 });
    const { rows } = parseCsv(result.csv);
    expect(rows.length).toBe(1);
  });

  it("handles large row count (10000)", () => {
    const result = flowGenerateSynthetic({ rows: 10000 });
    const { rows } = parseCsv(result.csv);
    expect(rows.length).toBe(10000);
  });

  it("returns error for rows=0", () => {
    const result = flowGenerateSynthetic({ rows: 0 });
    expect(result.error).toBeDefined();
  });

  it("returns error for negative rows", () => {
    const result = flowGenerateSynthetic({ rows: -5 });
    expect(result.error).toBeDefined();
  });

  it("empty schema array uses defaults", () => {
    const result = flowGenerateSynthetic({ rows: 5, schema: [] });
    const { headers } = parseCsv(result.csv);
    expect(headers.length).toBeGreaterThanOrEqual(4);
  });

  // ========== SEED REPRODUCIBILITY ==========

  it("same seed produces identical output", () => {
    const r1 = flowGenerateSynthetic({ rows: 10, seed: 42 });
    const r2 = flowGenerateSynthetic({ rows: 10, seed: 42 });
    expect(r1.csv).toBe(r2.csv);
  });

  it("different seeds produce different output", () => {
    const r1 = flowGenerateSynthetic({ rows: 10, seed: 42 });
    const r2 = flowGenerateSynthetic({ rows: 10, seed: 99 });
    expect(r1.csv).not.toBe(r2.csv);
  });

  // ========== TEXT COLUMNS ==========

  it("text columns generate non-empty strings", () => {
    const result = flowGenerateSynthetic({
      rows: 10,
      schema: [
        { name: "label", type: "text" },
      ],
    });
    const { rows } = parseCsv(result.csv);
    for (const row of rows) {
      expect(row[0].length).toBeGreaterThan(0);
    }
  });

  // ========== CSV FORMAT CORRECTNESS ==========

  it("output is valid CSV parseable by our parser", () => {
    const result = flowGenerateSynthetic({
      rows: 50,
      schema: [
        { name: "id", type: "id" },
        { name: "name", type: "text" },
        { name: "value", type: "numeric" },
        { name: "group", type: "categorical", categories: ["A", "B", "C"] },
        { name: "date", type: "date" },
      ],
    });
    const lines = result.csv.trim().split("\n");
    expect(lines.length).toBe(51); // header + 50 rows
    const headers = parseCSVLine(lines[0]);
    expect(headers.length).toBe(5);
    // Every row should have same column count as header
    for (let i = 1; i < lines.length; i++) {
      const fields = parseCSVLine(lines[i]);
      expect(fields.length).toBe(5);
    }
  });
});
