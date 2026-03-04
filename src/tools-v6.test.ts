/**
 * Tests for tools-v6.ts (flow_visor_mode)
 *
 * Visor Mode: switch analytical lenses on the same dataset.
 * Each visor reveals different patterns — statistical, relational, temporal, anomaly, geographic.
 * Tests verify annotation generation, computed columns, summaries, and edge cases.
 */

import { describe, it, expect } from "vitest";
import { flowVisorMode } from "./tools-v6.js";
import type { VisorModeInput, VisorModeResult, VisorAnnotation } from "./tools-v6.js";
import { parseCSVLine } from "./csv-utils.js";

// ============================================================================
// Test datasets
// ============================================================================

/** Numeric dataset with a clear outlier (Mega City population) */
const STAT_DATASET = [
  "city,population,avg_temp,elevation",
  "Springfield,50000,65,800",
  "Shelbyville,48000,64,750",
  "Capital City,52000,66,900",
  "Ogdenville,47000,63,700",
  "North Haverbrook,46000,64,720",
  "Brockway,49000,65,780",
  "Cypress Creek,51000,66,850",
  "Shelby Falls,47500,64,730",
  "Mega City,5000000,72,200",
  "Smalltown,45000,63,710",
].join("\n");

/** Dataset with strongly correlated columns (hours_studied ↔ test_score) */
const CORR_DATASET = [
  "student,hours_studied,test_score,absences",
  "Alice,40,95,1",
  "Bob,35,88,2",
  "Charlie,30,82,3",
  "Diana,25,75,5",
  "Eve,20,68,7",
  "Frank,15,60,9",
  "Grace,10,52,12",
  "Hank,5,45,15",
  "Iris,45,98,0",
  "Jack,50,99,0",
].join("\n");

/** Time series with clear upward trend */
const TIME_DATASET = [
  "date,sales,returns",
  "2024-01-15,1000,50",
  "2024-02-15,1200,45",
  "2024-03-15,1500,40",
  "2024-04-15,1800,35",
  "2024-05-15,2200,30",
  "2024-06-15,2800,28",
  "2024-07-15,3500,25",
  "2024-08-15,4200,22",
  "2024-09-15,5000,20",
  "2024-10-15,6000,18",
].join("\n");

/** Multi-dimensional anomaly dataset (row 8 is anomalous across multiple dims) */
const ANOM_DATASET = [
  "id,metric_a,metric_b,metric_c",
  "r1,10,20,30",
  "r2,12,22,28",
  "r3,11,21,31",
  "r4,13,19,29",
  "r5,10,20,30",
  "r6,12,21,32",
  "r7,11,22,28",
  "r8,50,60,90",
  "r9,10,20,31",
  "r10,13,21,29",
].join("\n");

/** Geographic dataset with lat/lon */
const GEO_DATASET = [
  "name,lat,lon,value",
  "NYC,40.7128,-74.0060,100",
  "LA,34.0522,-118.2437,90",
  "Chicago,41.8781,-87.6298,80",
  "Houston,29.7604,-95.3698,70",
  "Phoenix,33.4484,-112.0740,60",
  "Philadelphia,39.9526,-75.1652,95",
  "San Antonio,29.4241,-98.4936,65",
  "San Diego,32.7157,-117.1611,85",
  "Dallas,32.7767,-96.7970,75",
  "Remote Island,0.0000,160.0000,10",
].join("\n");

/** Non-geo dataset to test graceful handling */
const NO_GEO_DATASET = [
  "product,price,quantity",
  "Widget A,29.99,500",
  "Widget B,49.99,300",
  "Widget C,19.99,800",
  "Widget D,39.99,400",
  "Widget E,59.99,200",
].join("\n");

/** Single row dataset for edge case */
const SINGLE_ROW = [
  "x,y,z",
  "10,20,30",
].join("\n");

// ============================================================================
// Helper
// ============================================================================

function getAnnotatedHeaders(result: VisorModeResult): string[] {
  const firstLine = result.annotated_csv.trim().split("\n")[0];
  return parseCSVLine(firstLine);
}

function getAnnotatedRows(result: VisorModeResult): string[][] {
  const lines = result.annotated_csv.trim().split("\n");
  return lines.slice(1).map((l) => parseCSVLine(l));
}

// ============================================================================
// Tests
// ============================================================================

describe("flow_visor_mode", () => {
  // -------------------------------------------------------------------------
  // 1. Statistical visor: detects outliers correctly
  // -------------------------------------------------------------------------
  describe("statistical visor", () => {
    it("detects outliers correctly", async () => {
      const result = await flowVisorMode({
        csv_data: STAT_DATASET,
        visor: "statistical",
      });

      // Mega City (row 8, index 8) should be annotated as outlier in population
      const outlierAnnotations = result.annotations.filter(
        (a) => a.annotation_type === "outlier"
      );
      expect(outlierAnnotations.length).toBeGreaterThan(0);

      // At least one outlier should reference population column
      const popOutliers = outlierAnnotations.filter((a) => a.column === "population");
      expect(popOutliers.length).toBeGreaterThan(0);
      expect(popOutliers[0].row_index).toBe(8); // Mega City is row index 8
    });

    // -----------------------------------------------------------------------
    // 2. Statistical visor: adds z-score columns
    // -----------------------------------------------------------------------
    it("adds z-score columns to annotated CSV", async () => {
      const result = await flowVisorMode({
        csv_data: STAT_DATASET,
        visor: "statistical",
      });

      const headers = getAnnotatedHeaders(result);
      // Should have _stat_z_ columns for numeric columns
      const zCols = headers.filter((h) => h.startsWith("_stat_z_"));
      expect(zCols.length).toBeGreaterThan(0);

      // Should also have _stat_role column
      expect(headers).toContain("_stat_role");

      // The Mega City row should have "outlier" or "extreme" in _stat_role
      const rows = getAnnotatedRows(result);
      const roleIdx = headers.indexOf("_stat_role");
      expect(roleIdx).toBeGreaterThan(-1);
      const megaCityRole = rows[8][roleIdx];
      expect(megaCityRole).toMatch(/outlier|extreme/);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Relational visor: finds strong correlations
  // -------------------------------------------------------------------------
  describe("relational visor", () => {
    it("finds strong correlations", async () => {
      const result = await flowVisorMode({
        csv_data: CORR_DATASET,
        visor: "relational",
      });

      // hours_studied and test_score are nearly perfectly correlated
      const corrAnnotations = result.annotations.filter(
        (a) => a.annotation_type === "correlation_anchor"
      );
      expect(corrAnnotations.length).toBeGreaterThan(0);

      // Summary should mention correlation
      expect(result.summary.top_finding.toLowerCase()).toMatch(
        /correlat|relationship|associat/
      );
    });

    // -----------------------------------------------------------------------
    // 4. Relational visor: annotates correlation anchors
    // -----------------------------------------------------------------------
    it("annotates correlation anchors and adds columns", async () => {
      const result = await flowVisorMode({
        csv_data: CORR_DATASET,
        visor: "relational",
      });

      const headers = getAnnotatedHeaders(result);
      expect(headers).toContain("_rel_strongest_pair");
      expect(headers).toContain("_rel_correlation");

      // Should have rows with correlation values populated
      const rows = getAnnotatedRows(result);
      const corrIdx = headers.indexOf("_rel_correlation");
      // At least some rows should have non-empty correlation values
      const nonEmpty = rows.filter((r) => r[corrIdx] && r[corrIdx].trim() !== "");
      expect(nonEmpty.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // 5. Temporal visor: detects trends in sequential data
  // -------------------------------------------------------------------------
  describe("temporal visor", () => {
    it("detects trends in sequential data", async () => {
      const result = await flowVisorMode({
        csv_data: TIME_DATASET,
        visor: "temporal",
      });

      // Should detect the upward trend in sales
      const trendAnnotations = result.annotations.filter(
        (a) => a.annotation_type === "trend_peak" || a.annotation_type === "trend_direction"
      );
      expect(trendAnnotations.length).toBeGreaterThan(0);

      // Summary should mention trend or growth
      expect(result.summary.top_finding.toLowerCase()).toMatch(
        /trend|grow|increas|ris/
      );
    });

    // -----------------------------------------------------------------------
    // 6. Temporal visor: computes period-over-period changes
    // -----------------------------------------------------------------------
    it("computes period-over-period changes", async () => {
      const result = await flowVisorMode({
        csv_data: TIME_DATASET,
        visor: "temporal",
      });

      const headers = getAnnotatedHeaders(result);
      // Should have _temp_change and _temp_trend columns
      const tempCols = headers.filter((h) => h.startsWith("_temp_"));
      expect(tempCols.length).toBeGreaterThan(0);
      expect(headers.some((h) => h.includes("_temp_change"))).toBe(true);
      expect(headers.some((h) => h.includes("_temp_trend"))).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 7. Anomaly visor: assigns anomaly scores
  // -------------------------------------------------------------------------
  describe("anomaly visor", () => {
    it("assigns anomaly scores", async () => {
      const result = await flowVisorMode({
        csv_data: ANOM_DATASET,
        visor: "anomaly",
      });

      const headers = getAnnotatedHeaders(result);
      expect(headers).toContain("_anom_score");

      // Row 7 (r8 — the anomalous row) should have the highest score
      const rows = getAnnotatedRows(result);
      const scoreIdx = headers.indexOf("_anom_score");
      const scores = rows.map((r) => parseFloat(r[scoreIdx]) || 0);
      const maxScoreIdx = scores.indexOf(Math.max(...scores));
      expect(maxScoreIdx).toBe(7); // r8 is at data row index 7
    });

    // -----------------------------------------------------------------------
    // 8. Anomaly visor: identifies driving dimensions
    // -----------------------------------------------------------------------
    it("identifies driving dimensions", async () => {
      const result = await flowVisorMode({
        csv_data: ANOM_DATASET,
        visor: "anomaly",
      });

      const headers = getAnnotatedHeaders(result);
      expect(headers).toContain("_anom_drivers");

      // The anomalous row should have drivers listed
      const rows = getAnnotatedRows(result);
      const driverIdx = headers.indexOf("_anom_drivers");
      const anomRow = rows[7]; // r8
      expect(anomRow[driverIdx]).toBeTruthy();
      expect(anomRow[driverIdx].length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // 9. Geographic visor: handles data with lat/lon
  // -------------------------------------------------------------------------
  describe("geographic visor", () => {
    it("handles data with lat/lon", async () => {
      const result = await flowVisorMode({
        csv_data: GEO_DATASET,
        visor: "geographic",
      });

      const headers = getAnnotatedHeaders(result);
      expect(headers).toContain("_geo_cluster");
      expect(headers).toContain("_geo_isolation");

      // Remote Island should be flagged as spatially isolated
      const rows = getAnnotatedRows(result);
      const isoIdx = headers.indexOf("_geo_isolation");
      const remoteRow = rows[9]; // Remote Island
      const remoteIso = parseFloat(remoteRow[isoIdx]) || 0;
      // Remote Island should have a high isolation score
      const otherIso = rows.slice(0, 9).map((r) => parseFloat(r[isoIdx]) || 0);
      const maxOtherIso = Math.max(...otherIso);
      expect(remoteIso).toBeGreaterThan(maxOtherIso);
    });

    // -----------------------------------------------------------------------
    // 10. Geographic visor: handles data without geo columns gracefully
    // -----------------------------------------------------------------------
    it("handles data without geo columns gracefully", async () => {
      const result = await flowVisorMode({
        csv_data: NO_GEO_DATASET,
        visor: "geographic",
      });

      // Should still return a valid result with informative message
      expect(result.visor).toBe("geographic");
      expect(result.summary.top_finding.toLowerCase()).toMatch(
        /no.*geo|no.*lat|no.*location|not found|unavailable|cannot/
      );
      // Should recommend a different visor
      expect(result.recommended_next_visor).toBeTruthy();
      expect(result.recommended_next_visor).not.toBe("geographic");
    });
  });

  // -------------------------------------------------------------------------
  // 11. All visors produce annotated CSV with new columns
  // -------------------------------------------------------------------------
  describe("cross-visor properties", () => {
    it("all visors produce annotated CSV with new columns", async () => {
      const visors: VisorModeInput["visor"][] = [
        "statistical",
        "relational",
        "temporal",
        "anomaly",
      ];

      for (const visor of visors) {
        const result = await flowVisorMode({
          csv_data: STAT_DATASET,
          visor,
        });

        const origHeaders = parseCSVLine(STAT_DATASET.split("\n")[0]);
        const newHeaders = getAnnotatedHeaders(result);

        // Annotated CSV must have MORE columns than original
        expect(newHeaders.length).toBeGreaterThan(origHeaders.length);

        // All original columns must be preserved
        for (const orig of origHeaders) {
          expect(newHeaders).toContain(orig);
        }
      }
    });

    // -----------------------------------------------------------------------
    // 12. Annotations have significance scores 0-1
    // -----------------------------------------------------------------------
    it("annotations have significance scores between 0 and 1", async () => {
      const result = await flowVisorMode({
        csv_data: STAT_DATASET,
        visor: "statistical",
      });

      for (const ann of result.annotations) {
        expect(ann.significance).toBeGreaterThanOrEqual(0);
        expect(ann.significance).toBeLessThanOrEqual(1);
      }
    });

    // -----------------------------------------------------------------------
    // 13. Summary includes top_finding and coverage
    // -----------------------------------------------------------------------
    it("summary includes top_finding and coverage", async () => {
      const result = await flowVisorMode({
        csv_data: STAT_DATASET,
        visor: "statistical",
      });

      expect(result.summary.top_finding).toBeTruthy();
      expect(result.summary.top_finding.length).toBeGreaterThan(0);
      expect(typeof result.summary.coverage).toBe("number");
      expect(result.summary.coverage).toBeGreaterThanOrEqual(0);
      expect(result.summary.coverage).toBeLessThanOrEqual(1);
      expect(result.summary.total_annotations).toBeGreaterThan(0);
    });

    // -----------------------------------------------------------------------
    // 14. Recommended_next_visor is always populated
    // -----------------------------------------------------------------------
    it("recommended_next_visor is always populated", async () => {
      const visors: VisorModeInput["visor"][] = [
        "statistical",
        "relational",
        "temporal",
        "anomaly",
        "geographic",
      ];

      for (const visor of visors) {
        const csv = visor === "geographic" ? GEO_DATASET : STAT_DATASET;
        const result = await flowVisorMode({ csv_data: csv, visor });
        expect(result.recommended_next_visor).toBeTruthy();
        expect(result.recommended_next_visor.length).toBeGreaterThan(0);
      }
    });

    // -----------------------------------------------------------------------
    // 15. Focus columns parameter limits analysis scope
    // -----------------------------------------------------------------------
    it("focus columns parameter limits analysis scope", async () => {
      // Run with all columns
      const fullResult = await flowVisorMode({
        csv_data: STAT_DATASET,
        visor: "statistical",
      });

      // Run with just population
      const focusResult = await flowVisorMode({
        csv_data: STAT_DATASET,
        visor: "statistical",
        focus_columns: ["population"],
      });

      // Focused result should have fewer or equal annotations
      // and annotations should primarily reference population
      const focusedCols = new Set(focusResult.annotations.map((a) => a.column));
      expect(focusedCols.has("population")).toBe(true);
      // Should not have annotations for columns not in focus (like elevation, avg_temp)
      expect(focusedCols.has("elevation")).toBe(false);
      expect(focusedCols.has("avg_temp")).toBe(false);
    });

    // -----------------------------------------------------------------------
    // 16. Edge case: single-row dataset
    // -----------------------------------------------------------------------
    it("handles single-row dataset gracefully", async () => {
      const result = await flowVisorMode({
        csv_data: SINGLE_ROW,
        visor: "statistical",
      });

      expect(result.visor).toBe("statistical");
      expect(result.annotated_csv).toBeTruthy();
      // Should still return a valid structure even with minimal data
      expect(result.summary).toBeTruthy();
      expect(result.recommended_next_visor).toBeTruthy();
    });
  });
});
