import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { parseCSVLine, csvEscapeField } from "./csv-utils.js";
import {
  precomputeForceLayout,
  scaleDataset,
  transformToNetworkGraph,
} from "./index.js";
import {
  flowAnomalyDetect,
  flowTimeSeriesAnimate,
  flowMergeDatasets,
} from "./tools-v2.js";
import { flowGeoEnhance, flowExportFormats } from "./tools-v3.js";
import { flowCorrelationMatrix, flowClusterData, flowHierarchicalData, flowCompareDatasets, flowPivotTable, flowRegressionAnalysis, flowNormalizeData, flowDeduplicateRows } from "./tools-v4.js";

// ============================================================================
// Helpers: CSV generators for fast-check (v4 API)
// ============================================================================

/** Generate a safe CSV cell value (no embedded newlines to keep single-line rows) */
const arbCellValue = fc.oneof(
  fc.stringMatching(/^[a-d 12.\-]{0,20}$/),
  fc.integer({ min: -10000, max: 10000 }).map(String),
  fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true }).map(v => v.toFixed(2)),
);

/** Generate a header name: alphanumeric, no commas/quotes/newlines */
const arbHeader = fc.stringMatching(/^[a-z_]{1,10}$/);

/** Generate a short alphanumeric id */
const arbId = fc.stringMatching(/^[a-e]{1,4}$/);

/** Build a valid CSV string from headers and row data */
function buildCSV(headers: string[], rows: string[][]): string {
  const headerLine = headers.map(h => csvEscapeField(h)).join(",");
  const dataLines = rows.map(row =>
    row.map(cell => csvEscapeField(cell)).join(",")
  );
  return [headerLine, ...dataLines].join("\n");
}

// ============================================================================
// 1. CSV parsing roundtrip: parseCSVLine should never throw on valid CSV lines
// ============================================================================

describe("Property: CSV parsing roundtrip", () => {
  it("parseCSVLine never throws on any escaped CSV line", () => {
    fc.assert(
      fc.property(
        fc.array(arbCellValue, { minLength: 1, maxLength: 10 }),
        (cells) => {
          const line = cells.map(c => csvEscapeField(c)).join(",");
          const parsed = parseCSVLine(line);
          expect(parsed.length).toBe(cells.length);
        }
      ),
      { numRuns: 10_000 }
    );
  });

  it("row count matches for multi-row CSV", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 5 }).chain(numCols =>
          fc.tuple(
            fc.array(arbHeader, { minLength: numCols, maxLength: numCols }),
            fc.array(
              fc.array(arbCellValue, { minLength: numCols, maxLength: numCols }),
              { minLength: 1, maxLength: 20 }
            ),
          )
        ),
        ([headers, rows]) => {
          const csv = buildCSV(headers, rows);
          const lines = csv.trim().split("\n");
          // First line is header, rest are data rows
          expect(lines.length).toBe(rows.length + 1);
          // Each data line should parse to correct column count
          for (let i = 1; i < lines.length; i++) {
            const parsed = parseCSVLine(lines[i]);
            expect(parsed.length).toBe(headers.length);
          }
        }
      ),
      { numRuns: 10_000 }
    );
  });
});

// ============================================================================
// 2. CSV escaping roundtrip: escape then parse should preserve content
// ============================================================================

describe("Property: CSV escaping roundtrip", () => {
  it("escapeCSVField then parseCSVLine roundtrips for strings with commas, quotes, pipes", () => {
    const arbSpecialString = fc.stringMatching(/^[a-e,"|. 123]{0,30}$/);

    fc.assert(
      fc.property(
        fc.array(arbSpecialString, { minLength: 1, maxLength: 8 }),
        (values) => {
          const line = values.map(v => csvEscapeField(v)).join(",");
          const parsed = parseCSVLine(line);
          expect(parsed.length).toBe(values.length);
          for (let i = 0; i < values.length; i++) {
            // parseCSVLine trims values, so we compare trimmed
            expect(parsed[i]).toBe(values[i].trim());
          }
        }
      ),
      { numRuns: 10_000 }
    );
  });
});

// ============================================================================
// 3. Anomaly detection stability: should flag <= 50% of points with zscore threshold=3
// ============================================================================

describe("Property: Anomaly detection stability", () => {
  it("zscore with threshold=3 flags at most 50% of points", () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: -1000, max: 1000, noNaN: true, noDefaultInfinity: true }), { minLength: 3, maxLength: 200 }),
        (values) => {
          const csv = "value\n" + values.map(v => v.toFixed(4)).join("\n");
          const result = flowAnomalyDetect({
            csv_content: csv,
            numeric_columns: ["value"],
            method: "zscore",
            threshold: 3,
          });
          // Result should have summary with anomaly count
          if ("summary" in result && result.summary) {
            const summary = result.summary as { anomaly_count: number; total_rows: number };
            expect(summary.anomaly_count).toBeLessThanOrEqual(Math.ceil(summary.total_rows * 0.5));
          } else if ("anomaly_count" in result) {
            const r = result as { anomaly_count: number; total_rows: number };
            expect(r.anomaly_count).toBeLessThanOrEqual(Math.ceil(r.total_rows * 0.5));
          }
        }
      ),
      { numRuns: 1_000 }
    );
  });

  it("anomaly detection never throws on valid numeric CSV", () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true }), { minLength: 3, maxLength: 100 }),
        (values) => {
          const csv = "value\n" + values.map(v => v.toFixed(4)).join("\n");
          expect(() => flowAnomalyDetect({
            csv_content: csv,
            numeric_columns: ["value"],
            method: "zscore",
            threshold: 3,
          })).not.toThrow();
        }
      ),
      { numRuns: 1_000 }
    );
  });
});

// ============================================================================
// 4. Scale dataset bounds: output row count <= input row count
// ============================================================================

describe("Property: Scale dataset bounds", () => {
  it("output rows <= input rows for any reduce operation", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 200 }),
        fc.integer({ min: 1, max: 50 }),
        (numRows, targetRows) => {
          const headers = ["id", "value", "category"];
          const rows = Array.from({ length: numRows }, (_, i) => [
            String(i),
            (Math.random() * 100).toFixed(2),
            ["A", "B", "C"][i % 3],
          ]);
          const csv = buildCSV(headers, rows);
          const result = scaleDataset({
            csv_content: csv,
            target_rows: targetRows,
            strategy: "sample",
          });
          if (result.csv && !result.error) {
            const outputLines = result.csv.trim().split("\n");
            const outputRows = outputLines.length - 1; // subtract header
            expect(outputRows).toBeLessThanOrEqual(numRows);
          }
        }
      ),
      { numRuns: 10_000 }
    );
  });
});

// ============================================================================
// 5. Force layout convergence: every node gets x,y,z coordinates
// ============================================================================

describe("Property: Force layout convergence", () => {
  it("produces x,y,z for every node in a small graph", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 30 }),
        (nodeCount) => {
          const nodes = Array.from({ length: nodeCount }, (_, i) => ({ id: `n${i}` }));
          // Create a simple chain graph
          const edges = Array.from({ length: nodeCount - 1 }, (_, i) => ({
            source: `n${i}`,
            target: `n${i + 1}`,
          }));

          const result = precomputeForceLayout({
            nodes,
            edges,
            dimensions: 3,
            iterations: 50,
          });

          expect(result.error).toBeUndefined();
          expect(result.csv).toBeTruthy();

          // Parse the output CSV and verify every node has coordinates
          const lines = result.csv.trim().split("\n");
          const headers = parseCSVLine(lines[0]);
          expect(headers).toContain("x");
          expect(headers).toContain("y");
          expect(headers).toContain("z");

          const xIdx = headers.indexOf("x");
          const yIdx = headers.indexOf("y");
          const zIdx = headers.indexOf("z");

          // Each data row should have finite coordinate values
          for (let i = 1; i < lines.length; i++) {
            const row = parseCSVLine(lines[i]);
            const x = parseFloat(row[xIdx]);
            const y = parseFloat(row[yIdx]);
            const z = parseFloat(row[zIdx]);
            expect(Number.isFinite(x)).toBe(true);
            expect(Number.isFinite(y)).toBe(true);
            expect(Number.isFinite(z)).toBe(true);
          }

          // Node count in output should match input
          expect(lines.length - 1).toBe(nodeCount);
        }
      ),
      { numRuns: 1_000 }
    );
  });
});

// ============================================================================
// 6. Export JSON validity: JSON export should always produce parseable JSON
// ============================================================================

describe("Property: Export JSON validity", () => {
  it("JSON export produces parseable JSON for any valid CSV", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        fc.integer({ min: 1, max: 5 }),
        (numRows, numCols) => {
          const headers = Array.from({ length: numCols }, (_, i) => `col${i}`);
          const rows = Array.from({ length: numRows }, () =>
            Array.from({ length: numCols }, () => String(Math.floor(Math.random() * 100)))
          );
          const csv = buildCSV(headers, rows);

          const result = flowExportFormats({
            csv_content: csv,
            format: "json",
          });

          expect(result.format).toBe("json");
          // Must produce parseable JSON
          expect(() => JSON.parse(result.output)).not.toThrow();
          const parsed = JSON.parse(result.output);
          expect(Array.isArray(parsed)).toBe(true);
          expect(parsed.length).toBe(numRows);
        }
      ),
      { numRuns: 10_000 }
    );
  });
});

// ============================================================================
// 7. Export GeoJSON structure: type="FeatureCollection" with features array
// ============================================================================

describe("Property: Export GeoJSON structure", () => {
  it("GeoJSON export has type FeatureCollection and features array", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(
            fc.double({ min: -90, max: 90, noNaN: true, noDefaultInfinity: true }),
            fc.double({ min: -180, max: 180, noNaN: true, noDefaultInfinity: true }),
            fc.stringMatching(/^[a-j]{1,8}$/),
          ),
          { minLength: 1, maxLength: 50 }
        ),
        (points) => {
          const headers = ["name", "latitude", "longitude"];
          const rows = points.map(([lat, lng, name]) => [
            name as string,
            (lat as number).toFixed(4),
            (lng as number).toFixed(4),
          ]);
          const csv = buildCSV(headers, rows);

          const result = flowExportFormats({
            csv_content: csv,
            format: "geojson",
            options: { lat_column: "latitude", lng_column: "longitude" },
          });

          expect(result.format).toBe("geojson");
          const parsed = JSON.parse(result.output);
          expect(parsed.type).toBe("FeatureCollection");
          expect(Array.isArray(parsed.features)).toBe(true);
          // Every feature should have geometry and properties
          for (const feature of parsed.features) {
            expect(feature.type).toBe("Feature");
            expect(feature.geometry).toBeDefined();
            expect(feature.geometry.type).toBe("Point");
            expect(Array.isArray(feature.geometry.coordinates)).toBe(true);
            expect(feature.geometry.coordinates.length).toBe(2);
            expect(feature.properties).toBeDefined();
          }
        }
      ),
      { numRuns: 1_000 }
    );
  });
});

// ============================================================================
// 8. Time series frame count: frames <= unique timestamps in input
// ============================================================================

describe("Property: Time series frame count", () => {
  it("frame count is bounded and >= 1", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(
            fc.integer({ min: 2020, max: 2025 }),
            fc.integer({ min: 1, max: 12 }),
            fc.double({ min: 0, max: 1000, noNaN: true, noDefaultInfinity: true }),
          ),
          { minLength: 3, maxLength: 50 }
        ),
        (entries) => {
          const headers = ["date", "value"];
          const rows = entries.map(([year, month, value]) => [
            `${year}-${String(month).padStart(2, "0")}-01`,
            value.toFixed(2),
          ]);
          const csv = buildCSV(headers, rows);

          const result = flowTimeSeriesAnimate({
            csv_content: csv,
            time_column: "date",
            frame_count: 200, // high cap to test natural limit
          });

          // The actual frame count used is clamped to min(frame_count, 200)
          // and rows are binned into frames, so output frame count <= frame_count
          expect(result.frame_count).toBeLessThanOrEqual(200);
          expect(result.frame_count).toBeGreaterThanOrEqual(1);
        }
      ),
      { numRuns: 1_000 }
    );
  });
});

// ============================================================================
// 9. Merge datasets symmetry: inner join of A,B = same row count as B,A
// ============================================================================

describe("Property: Merge datasets symmetry", () => {
  it("inner join of A,B produces same row count as inner join of B,A (unique keys)", () => {
    fc.assert(
      fc.property(
        // Generate unique IDs for each dataset to avoid duplicate-key asymmetry
        fc.integer({ min: 2, max: 15 }),
        fc.integer({ min: 2, max: 15 }),
        (sizeA, sizeB) => {
          // Unique keys per dataset
          const idsA = Array.from({ length: sizeA }, (_, i) => `a${i}`);
          const idsB = Array.from({ length: sizeB }, (_, i) => `b${i}`);
          // Ensure some overlap: share first few IDs
          const overlap = Math.min(3, sizeA, sizeB);
          for (let i = 0; i < overlap; i++) {
            idsA[i] = `shared${i}`;
            idsB[i] = `shared${i}`;
          }

          const csvA = "id,val_a\n" + idsA.map((id, i) => `${id},${i}`).join("\n");
          const csvB = "id,val_b\n" + idsB.map((id, i) => `${id},${i * 10}`).join("\n");

          const resultAB = flowMergeDatasets({
            datasets: [
              { csv_content: csvA, label: "A" },
              { csv_content: csvB, label: "B" },
            ],
            join_type: "inner",
            join_columns: ["id"],
            add_source_column: false,
          });

          const resultBA = flowMergeDatasets({
            datasets: [
              { csv_content: csvB, label: "B" },
              { csv_content: csvA, label: "A" },
            ],
            join_type: "inner",
            join_columns: ["id"],
            add_source_column: false,
          });

          expect(resultAB.rows_output).toBe(resultBA.rows_output);
        }
      ),
      { numRuns: 1_000 }
    );
  });

  it("inner join cross-product is symmetric with duplicate keys", () => {
    // Fixed asymmetry bug: inner join now does true cross-product
    const csvA = "id,val_a\na,0\na,0";
    const csvB = "id,val_b\na,0";

    const resultAB = flowMergeDatasets({
      datasets: [
        { csv_content: csvA, label: "A" },
        { csv_content: csvB, label: "B" },
      ],
      join_type: "inner",
      join_columns: ["id"],
      add_source_column: false,
    });

    const resultBA = flowMergeDatasets({
      datasets: [
        { csv_content: csvB, label: "B" },
        { csv_content: csvA, label: "A" },
      ],
      join_type: "inner",
      join_columns: ["id"],
      add_source_column: false,
    });

    // AB: 2 left "a" × 1 right "a" = 2 rows
    // BA: 1 left "a" × 2 right "a" = 2 rows
    expect(resultAB.rows_output).toBe(2);
    expect(resultBA.rows_output).toBe(2);
  });

  it("inner join cross-product produces m×n rows for duplicate keys", () => {
    // 2 left rows × 3 right rows = 6 output rows
    const csvA = "id,val_a\na,1\na,2";
    const csvB = "id,val_b\na,x\na,y\na,z";

    const result = flowMergeDatasets({
      datasets: [
        { csv_content: csvA, label: "A" },
        { csv_content: csvB, label: "B" },
      ],
      join_type: "inner",
      join_columns: ["id"],
      add_source_column: false,
    });

    expect(result.rows_output).toBe(6);
  });
});

// ============================================================================
// 10. Network graph transform: output rows have id and connections columns
// ============================================================================

describe("Property: Network graph transform", () => {
  it("output has id and connections columns for any valid edge list", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(
            fc.stringMatching(/^[a-j]{1,5}$/),
            fc.stringMatching(/^[a-j]{1,5}$/),
          ),
          { minLength: 1, maxLength: 30 }
        ),
        (edgePairs) => {
          const edges = edgePairs.filter(([s, t]) => s !== t);
          if (edges.length === 0) return;

          const csv = "source,target\n" + edges.map(([s, t]) => `${s},${t}`).join("\n");

          const result = transformToNetworkGraph({
            source_column: "source",
            target_column: "target",
            sample_data: csv,
          });

          expect(typeof result).toBe("string");
          const resultStr = result as string;
          if (resultStr.startsWith("Error:")) return;

          const csvMatch = resultStr.match(/```csv\n([\s\S]*?)```/);
          expect(csvMatch).toBeTruthy();
          if (!csvMatch) return;

          const outputCsv = csvMatch[1].trim();
          const outputLines = outputCsv.split("\n");
          const outputHeaders = parseCSVLine(outputLines[0]);

          expect(outputHeaders).toContain("id");
          expect(outputHeaders).toContain("connections by id");

          for (let i = 1; i < outputLines.length; i++) {
            const row = parseCSVLine(outputLines[i]);
            const idIdx = outputHeaders.indexOf("id");
            expect(row[idIdx]).toBeTruthy();
          }
        }
      ),
      { numRuns: 1_000 }
    );
  });
});

// ============================================================================
// 11. Geo enhance idempotency
// ============================================================================

describe("Property: Geo enhance idempotency", () => {
  const knownCities = ["New York", "London", "Tokyo", "Paris", "Berlin", "Sydney", "Dubai", "Mumbai", "Toronto", "Seoul"];

  it("running geo_enhance twice produces identical results", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...knownCities), { minLength: 1, maxLength: 10 }),
        (cities) => {
          const csv = "city,value\n" + cities.map((c, i) => `${c},${i}`).join("\n");
          const result1 = flowGeoEnhance({ csv_content: csv, location_columns: ["city"] });
          const result2 = flowGeoEnhance({ csv_content: csv, location_columns: ["city"] });
          expect(result1.csv).toBe(result2.csv);
          expect(result1.stats.resolved).toBe(result2.stats.resolved);
        }
      ),
      { numRuns: 500 }
    );
  });

  it("output CSV has _latitude, _longitude, _geo_confidence columns", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...knownCities), { minLength: 1, maxLength: 10 }),
        (cities) => {
          const csv = "city,value\n" + cities.map((c, i) => `${c},${i}`).join("\n");
          const result = flowGeoEnhance({ csv_content: csv, location_columns: ["city"] });
          const headers = parseCSVLine(result.csv.split("\n")[0]);
          expect(headers).toContain("_latitude");
          expect(headers).toContain("_longitude");
          expect(headers).toContain("_geo_confidence");
        }
      ),
      { numRuns: 500 }
    );
  });

  it("resolved + unresolved = total rows", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...knownCities, "UnknownPlace99", "Atlantis"), { minLength: 1, maxLength: 15 }),
        (cities) => {
          const csv = "city,value\n" + cities.map((c, i) => `${c},${i}`).join("\n");
          const result = flowGeoEnhance({ csv_content: csv, location_columns: ["city"] });
          expect(result.stats.resolved + result.stats.unresolved).toBe(result.stats.total_rows);
        }
      ),
      { numRuns: 500 }
    );
  });
});

// ============================================================================
// 12. Additional anomaly detection properties
// ============================================================================

describe("Property: Anomaly detection additional", () => {
  it("constant-value data produces zero anomalies", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 100 }),
        fc.double({ min: -1000, max: 1000, noNaN: true, noDefaultInfinity: true }),
        (n, constVal) => {
          const csv = "value\n" + Array(n).fill(constVal.toFixed(4)).join("\n");
          const result = flowAnomalyDetect({
            csv_content: csv,
            numeric_columns: ["value"],
            method: "zscore",
            threshold: 2.5,
            output_mode: "summary",
          });
          const summary = result as { anomaly_count: number };
          expect(summary.anomaly_count).toBe(0);
        }
      ),
      { numRuns: 500 }
    );
  });

  it("annotated mode CSV always has 3 extra columns", () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: -1e4, max: 1e4, noNaN: true, noDefaultInfinity: true }), { minLength: 5, maxLength: 30 }),
        (values) => {
          const csv = "value\n" + values.map(v => v.toFixed(4)).join("\n");
          const result = flowAnomalyDetect({
            csv_content: csv,
            numeric_columns: ["value"],
            method: "zscore",
            threshold: 2.5,
          }) as { csv: string };
          const lines = result.csv.trim().split("\n");
          const headers = parseCSVLine(lines[0]);
          expect(headers).toContain("_anomaly_score");
          expect(headers).toContain("_is_anomaly");
          expect(headers).toContain("_anomaly_reasons");
        }
      ),
      { numRuns: 500 }
    );
  });

  it("multi-column anomaly detection never crashes", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 30 }),
        fc.integer({ min: 2, max: 5 }),
        (nRows, nCols) => {
          const headers = Array.from({ length: nCols }, (_, i) => `col_${i}`);
          const rows: string[] = [];
          for (let r = 0; r < nRows; r++) {
            rows.push(Array.from({ length: nCols }, () => (Math.random() * 100).toFixed(2)).join(","));
          }
          const csv = headers.join(",") + "\n" + rows.join("\n");
          expect(() => flowAnomalyDetect({
            csv_content: csv,
            method: "zscore",
            threshold: 2.5,
            output_mode: "summary",
          })).not.toThrow();
        }
      ),
      { numRuns: 500 }
    );
  });
});

// ============================================================================
// 13. Additional force layout properties
// ============================================================================

describe("Property: Force layout additional", () => {
  it("2D layout produces x,y but not z", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 20 }),
        (n) => {
          const nodes = Array.from({ length: n }, (_, i) => ({ id: `n${i}` }));
          const edges = [{ source: "n0", target: "n1" }];
          const result = precomputeForceLayout({ nodes, edges, iterations: 30, dimensions: 2 });
          expect(result.error).toBeUndefined();
          const headers = parseCSVLine(result.csv.trim().split("\n")[0]);
          expect(headers).toContain("x");
          expect(headers).toContain("y");
          expect(headers).not.toContain("z");
        }
      ),
      { numRuns: 500 }
    );
  });

  it("node attributes appear as columns in output CSV", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 15 }),
        (n) => {
          const nodes = Array.from({ length: n }, (_, i) => ({
            id: `n${i}`, label: `Node ${i}`, category: `cat_${i % 3}`,
          }));
          const edges = [{ source: "n0", target: "n1" }];
          const result = precomputeForceLayout({ nodes, edges, iterations: 30 });
          const headers = parseCSVLine(result.csv.trim().split("\n")[0]);
          expect(headers).toContain("id");
          expect(headers).toContain("label");
          expect(headers).toContain("category");
        }
      ),
      { numRuns: 200 }
    );
  });

  it("star graph produces correct node count", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 20 }),
        (n) => {
          const nodes = Array.from({ length: n }, (_, i) => ({ id: `n${i}` }));
          const edges = Array.from({ length: n - 1 }, (_, i) => ({
            source: "n0", target: `n${i + 1}`,
          }));
          const result = precomputeForceLayout({ nodes, edges, iterations: 50 });
          const lines = result.csv.trim().split("\n");
          expect(lines.length).toBe(n + 1);
        }
      ),
      { numRuns: 200 }
    );
  });
});

// ============================================================================
// 14. Additional time series properties
// ============================================================================

describe("Property: Time series additional", () => {
  it("all same timestamp produces single frame", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 20 }),
        (n) => {
          const csv = "date,value\n" + Array(n).fill("2020-01-01,42").join("\n");
          const result = flowTimeSeriesAnimate({ csv_content: csv, time_column: "date" });
          expect(result.frame_count).toBe(1);
        }
      ),
      { numRuns: 200 }
    );
  });

  it("output CSV always has _frame and _time_label columns", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 15 }),
        (n) => {
          const rows = Array.from({ length: n }, (_, i) => `${2000 + i},${i * 10}`);
          const csv = "year,value\n" + rows.join("\n");
          const result = flowTimeSeriesAnimate({ csv_content: csv, time_column: "year" });
          const headers = parseCSVLine(result.csv.split("\n")[0]);
          expect(headers).toContain("_frame");
          expect(headers).toContain("_time_label");
        }
      ),
      { numRuns: 500 }
    );
  });

  it("rows_output is always positive for valid input", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 15 }),
        (n) => {
          const rows = Array.from({ length: n }, (_, i) => `${2020 + i}-01-01,${i * 5}`);
          const csv = "date,value\n" + rows.join("\n");
          const result = flowTimeSeriesAnimate({ csv_content: csv, time_column: "date" });
          expect(result.rows_output).toBeGreaterThan(0);
        }
      ),
      { numRuns: 500 }
    );
  });
});

// ============================================================================
// 15. Additional merge properties
// ============================================================================

describe("Property: Merge datasets additional", () => {
  it("concatenation row count equals sum of input rows", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 15 }),
        fc.integer({ min: 1, max: 15 }),
        (nA, nB) => {
          const csvA = "id,value\n" + Array.from({ length: nA }, (_, i) => `a${i},${i}`).join("\n");
          const csvB = "id,value\n" + Array.from({ length: nB }, (_, i) => `b${i},${i}`).join("\n");
          const result = flowMergeDatasets({
            datasets: [{ csv_content: csvA, label: "A" }, { csv_content: csvB, label: "B" }],
            join_type: "concatenate",
          });
          expect(result.rows_output).toBe(nA + nB);
        }
      ),
      { numRuns: 500 }
    );
  });

  it("inner join with identical datasets returns same row count", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 15 }),
        (n) => {
          const csv = "id,value\n" + Array.from({ length: n }, (_, i) => `k${i},${i}`).join("\n");
          const result = flowMergeDatasets({
            datasets: [{ csv_content: csv, label: "A" }, { csv_content: csv, label: "B" }],
            join_type: "inner",
            join_columns: ["id"],
          });
          expect(result.rows_output).toBe(n);
        }
      ),
      { numRuns: 500 }
    );
  });

  it("left join row count >= inner join row count", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 10 }),
        fc.integer({ min: 2, max: 10 }),
        (nA, nB) => {
          const csvA = "id,va\n" + Array.from({ length: nA }, (_, i) => `key_${i},${i}`).join("\n");
          const csvB = "id,vb\n" + Array.from({ length: nB }, (_, i) => `key_${i},${i * 10}`).join("\n");
          const inner = flowMergeDatasets({
            datasets: [{ csv_content: csvA, label: "A" }, { csv_content: csvB, label: "B" }],
            join_type: "inner", join_columns: ["id"],
          });
          const left = flowMergeDatasets({
            datasets: [{ csv_content: csvA, label: "A" }, { csv_content: csvB, label: "B" }],
            join_type: "left", join_columns: ["id"],
          });
          expect(left.rows_output).toBeGreaterThanOrEqual(inner.rows_output);
        }
      ),
      { numRuns: 500 }
    );
  });

  it("outer join row count >= left join row count", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 10 }),
        fc.integer({ min: 2, max: 10 }),
        (nA, nB) => {
          const csvA = "id,va\n" + Array.from({ length: nA }, (_, i) => `key_${i},${i}`).join("\n");
          const csvB = "id,vb\n" + Array.from({ length: nB }, (_, i) => `key_${i},${i * 10}`).join("\n");
          const left = flowMergeDatasets({
            datasets: [{ csv_content: csvA, label: "A" }, { csv_content: csvB, label: "B" }],
            join_type: "left", join_columns: ["id"],
          });
          const outer = flowMergeDatasets({
            datasets: [{ csv_content: csvA, label: "A" }, { csv_content: csvB, label: "B" }],
            join_type: "outer", join_columns: ["id"],
          });
          expect(outer.rows_output).toBeGreaterThanOrEqual(left.rows_output);
        }
      ),
      { numRuns: 500 }
    );
  });
});

// ============================================================================
// 16. Additional scale dataset properties
// ============================================================================

describe("Property: Scale dataset additional", () => {
  it("when target >= input size, no reduction occurs", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 50 }),
        (n) => {
          const rows = Array.from({ length: n }, (_, i) => `item_${i},${i}`);
          const csv = "name,value\n" + rows.join("\n");
          const result = scaleDataset({ csv_content: csv, target_rows: n + 100, strategy: "sample" });
          expect(result.stats.strategy).toBe("none_needed");
        }
      ),
      { numRuns: 500 }
    );
  });

  it("output preserves headers from input", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 20, max: 100 }),
        fc.integer({ min: 5, max: 15 }),
        (inputRows, targetRows) => {
          const rows = Array.from({ length: inputRows }, (_, i) => `item_${i},${i},category_${i % 3}`);
          const csv = "name,value,category\n" + rows.join("\n");
          const result = scaleDataset({ csv_content: csv, target_rows: targetRows, strategy: "sample" });
          if (result.error) return;
          const outputHeaders = parseCSVLine(result.csv.trim().split("\n")[0]);
          expect(outputHeaders).toContain("name");
          expect(outputHeaders).toContain("value");
          expect(outputHeaders).toContain("category");
        }
      ),
      { numRuns: 500 }
    );
  });
});

// ============================================================================
// 17. CSV escaping additional
// ============================================================================

describe("Property: CSV escaping additional", () => {
  it("csvEscapeField never throws on any string", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 100 }),
        (s) => { expect(() => csvEscapeField(s)).not.toThrow(); }
      ),
      { numRuns: 1_000 }
    );
  });

  it("parseCSVLine never throws even on malformed input", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 200 }),
        (raw) => { expect(() => parseCSVLine(raw)).not.toThrow(); }
      ),
      { numRuns: 1_000 }
    );
  });

  it("escaped field with special chars is always quoted", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 50 }),
        (s) => {
          if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("|")) {
            const escaped = csvEscapeField(s);
            expect(escaped.startsWith('"')).toBe(true);
            expect(escaped.endsWith('"')).toBe(true);
          }
        }
      ),
      { numRuns: 1_000 }
    );
  });
});

// ============================================================================
// 18. Export format metadata consistency
// ============================================================================

describe("Property: Export format metadata", () => {
  it("JSON objects have all header keys", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        (numRows) => {
          const headers = ["name", "value", "category"];
          const rows = Array.from({ length: numRows }, (_, i) => [`item${i}`, String(i * 10), "cat"]);
          const csv = buildCSV(headers, rows);
          const result = flowExportFormats({ csv_content: csv, format: "json" });
          const parsed = JSON.parse(result.output);
          for (const obj of parsed) {
            for (const h of headers) { expect(h in obj).toBe(true); }
          }
        }
      ),
      { numRuns: 500 }
    );
  });

  it("summary metadata row count matches actual data rows", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 30 }),
        (n) => {
          const csv = "name,x,y\n" + Array.from({ length: n }, (_, i) => `item_${i},${i},${i * 2}`).join("\n");
          const result = flowExportFormats({ csv_content: csv, format: "summary" });
          expect(result.metadata.rows).toBe(n);
        }
      ),
      { numRuns: 500 }
    );
  });
});

// ============================================================================
// 19. Network graph unique node count
// ============================================================================

describe("Property: Network graph node count", () => {
  it("unique node count equals output data row count", () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(arbId, arbId), { minLength: 1, maxLength: 20 }),
        (edgePairs) => {
          const edges = edgePairs.filter(([s, t]) => s !== t && s.trim() && t.trim());
          if (edges.length === 0) return;

          const csv = "source,target\n" + edges.map(([s, t]) => `${s},${t}`).join("\n");
          const result = transformToNetworkGraph({
            source_column: "source", target_column: "target", sample_data: csv,
          });

          const resultStr = result as string;
          if (resultStr.startsWith("Error:")) return;

          const csvMatch = resultStr.match(/```csv\n([\s\S]*?)```/);
          if (!csvMatch) return;

          const outputCsv = csvMatch[1].trim();
          const outputLines = outputCsv.split("\n").filter(l => l.trim());
          const outputNodeCount = outputLines.length - 1;

          const uniqueNodes = new Set<string>();
          for (const [s, t] of edges) { uniqueNodes.add(s.trim()); uniqueNodes.add(t.trim()); }

          expect(outputNodeCount).toBe(uniqueNodes.size);
        }
      ),
      { numRuns: 500 }
    );
  });
});

// ============================================================================
// 19. Correlation matrix properties
// ============================================================================

describe("Property: Correlation matrix", () => {
  it("diagonal is always 1.0 for any numeric data", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 30 }),
        fc.integer({ min: 2, max: 5 }),
        (nRows, nCols) => {
          const headers = Array.from({ length: nCols }, (_, i) => `col_${i}`);
          const rows = Array.from({ length: nRows }, () =>
            Array.from({ length: nCols }, () => (Math.random() * 100 - 50).toFixed(2))
          );
          const csv = buildCSV(headers, rows);
          const result = flowCorrelationMatrix({ csv_content: csv });
          for (let i = 0; i < result.matrix.length; i++) {
            expect(result.matrix[i][i]).toBeCloseTo(1.0, 3);
          }
        }
      ),
      { numRuns: 500 }
    );
  });

  it("matrix is symmetric for any input", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 20 }),
        (nRows) => {
          const csv = "a,b,c\n" + Array.from({ length: nRows }, () =>
            `${(Math.random() * 100).toFixed(2)},${(Math.random() * 100).toFixed(2)},${(Math.random() * 100).toFixed(2)}`
          ).join("\n");
          const result = flowCorrelationMatrix({ csv_content: csv });
          const n = result.matrix.length;
          for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
              expect(result.matrix[i][j]).toBeCloseTo(result.matrix[j][i], 3);
            }
          }
        }
      ),
      { numRuns: 500 }
    );
  });

  it("all values between -1 and 1 for random data", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 30 }),
        (nRows) => {
          const csv = "x,y\n" + Array.from({ length: nRows }, () =>
            `${(Math.random() * 200 - 100).toFixed(2)},${(Math.random() * 200 - 100).toFixed(2)}`
          ).join("\n");
          const result = flowCorrelationMatrix({ csv_content: csv });
          for (const row of result.matrix) {
            for (const val of row) {
              expect(val).toBeGreaterThanOrEqual(-1.001);
              expect(val).toBeLessThanOrEqual(1.001);
            }
          }
        }
      ),
      { numRuns: 500 }
    );
  });
});

// ============================================================================
// 20. Clustering properties
// ============================================================================

describe("Property: Clustering", () => {
  it("every point gets assigned a cluster in range [0, k)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 30 }),
        fc.integer({ min: 2, max: 4 }),
        (nRows, k) => {
          const csv = "x,y\n" + Array.from({ length: nRows }, () =>
            `${(Math.random() * 100).toFixed(2)},${(Math.random() * 100).toFixed(2)}`
          ).join("\n");
          const result = flowClusterData({ csv_content: csv, k, columns: ["x", "y"] });
          expect(result.k).toBe(k);
          expect(result.rows).toBe(nRows);
          // Check all clusters are in range
          const lines = result.csv.split("\n");
          const header = lines[0].split(",");
          const clusterIdx = header.indexOf("_cluster");
          expect(clusterIdx).toBeGreaterThan(-1);
          for (const line of lines.slice(1)) {
            if (!line.trim()) continue;
            const cluster = Number(line.split(",")[clusterIdx]);
            expect(cluster).toBeGreaterThanOrEqual(0);
            expect(cluster).toBeLessThan(k);
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it("centroid sizes sum to total rows", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 30 }),
        (nRows) => {
          const csv = "x,y\n" + Array.from({ length: nRows }, () =>
            `${(Math.random() * 100).toFixed(2)},${(Math.random() * 100).toFixed(2)}`
          ).join("\n");
          const result = flowClusterData({ csv_content: csv, k: 3, columns: ["x", "y"] });
          const totalSize = result.centroids.reduce((s, c) => s + c.size, 0);
          expect(totalSize).toBe(result.rows);
        }
      ),
      { numRuns: 200 }
    );
  });
});

// ============================================================================
// 21. Hierarchy properties
// ============================================================================

describe("Property: Hierarchical data", () => {
  it("total nodes >= number of unique values at each level + 1 root", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 20 }),
        (nRows) => {
          const regions = ["North", "South", "East", "West"];
          const cities = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon"];
          const rows = Array.from({ length: nRows }, (_, i) => [
            regions[i % regions.length],
            cities[i % cities.length],
            String(i * 10),
          ]);
          const csv = buildCSV(["region", "city", "value"], rows);
          const result = flowHierarchicalData({
            csv_content: csv,
            hierarchy_columns: ["region", "city"],
            value_column: "value",
          });
          // At minimum: 1 root + some unique regions + some unique region/city combos
          expect(result.total_nodes).toBeGreaterThanOrEqual(2);
          expect(result.depth).toBe(3); // root → region → city
        }
      ),
      { numRuns: 200 }
    );
  });

  it("output CSV always has id, connections, label, level columns", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 10 }),
        (nRows) => {
          const csv = "group,item\n" + Array.from({ length: nRows }, (_, i) =>
            `G${i % 3},Item${i}`
          ).join("\n");
          const result = flowHierarchicalData({
            csv_content: csv,
            hierarchy_columns: ["group", "item"],
          });
          const headers = parseCSVLine(result.csv.split("\n")[0]);
          expect(headers).toContain("id");
          expect(headers).toContain("connections");
          expect(headers).toContain("label");
          expect(headers).toContain("level");
        }
      ),
      { numRuns: 200 }
    );
  });
});

// ============================================================================
// 22. Compare datasets properties
// ============================================================================

describe("Property: Compare datasets", () => {
  it("added + removed + changed + unchanged = total unique keys", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 15 }),
        fc.integer({ min: 2, max: 15 }),
        (nA, nB) => {
          const csvA = "id,val\n" + Array.from({ length: nA }, (_, i) => `k${i},${i}`).join("\n");
          const csvB = "id,val\n" + Array.from({ length: nB }, (_, i) => `k${i + Math.floor(nA / 2)},${i * 10}`).join("\n");
          const result = flowCompareDatasets({ csv_a: csvA, csv_b: csvB, key_column: "id" });
          const total = result.added_rows + result.removed_rows + result.changed_rows + result.unchanged_rows;
          // Total should equal number of unique keys across both datasets
          const keysA = new Set(Array.from({ length: nA }, (_, i) => `k${i}`));
          const keysB = new Set(Array.from({ length: nB }, (_, i) => `k${i + Math.floor(nA / 2)}`));
          const allKeys = new Set([...keysA, ...keysB]);
          expect(total).toBe(allKeys.size);
        }
      ),
      { numRuns: 500 }
    );
  });

  it("comparing identical datasets has zero added/removed/changed", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 15 }),
        (n) => {
          const csv = "id,value\n" + Array.from({ length: n }, (_, i) => `k${i},${i}`).join("\n");
          const result = flowCompareDatasets({ csv_a: csv, csv_b: csv, key_column: "id" });
          expect(result.added_rows).toBe(0);
          expect(result.removed_rows).toBe(0);
          expect(result.changed_rows).toBe(0);
          expect(result.unchanged_rows).toBe(n);
        }
      ),
      { numRuns: 500 }
    );
  });

  it("output CSV has _diff_status column for any input", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 10 }),
        fc.integer({ min: 2, max: 10 }),
        (nA, nB) => {
          const csvA = "id,val\n" + Array.from({ length: nA }, (_, i) => `a${i},${i}`).join("\n");
          const csvB = "id,val\n" + Array.from({ length: nB }, (_, i) => `b${i},${i}`).join("\n");
          const result = flowCompareDatasets({ csv_a: csvA, csv_b: csvB, key_column: "id" });
          const headers = parseCSVLine(result.csv.split("\n")[0]);
          expect(headers).toContain("_diff_status");
        }
      ),
      { numRuns: 500 }
    );
  });
});

// =============================================================================
// Section 23: flow_pivot_table — property tests
// =============================================================================

describe("flow_pivot_table properties", () => {
  it("row count equals number of distinct group keys", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 20 }),
        fc.integer({ min: 1, max: 5 }),
        (nRows, nGroups) => {
          const groups = Array.from({ length: nGroups }, (_, i) => `g${i}`);
          const csv = "group,value\n" + Array.from({ length: nRows }, (_, i) =>
            `${groups[i % nGroups]},${i * 10}`
          ).join("\n");
          const result = flowPivotTable({
            csv_content: csv,
            group_by: ["group"],
            aggregations: { value: "sum" },
          });
          expect(result.row_count).toBe(Math.min(nGroups, nRows));
        }
      ),
      { numRuns: 500 }
    );
  });

  it("sum aggregation equals total of column values per group", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 2, maxLength: 20 }),
        (values) => {
          const csv = "cat,val\n" + values.map((v, i) => `${i % 2 === 0 ? "A" : "B"},${v}`).join("\n");
          const result = flowPivotTable({
            csv_content: csv,
            group_by: ["cat"],
            aggregations: { val: "sum" },
          });
          const lines = result.csv.split("\n");
          const headers = lines[0].split(",");
          const sumIdx = headers.indexOf("val_sum");
          let total = 0;
          for (let i = 1; i < lines.length; i++) {
            total += Number(lines[i].split(",")[sumIdx]);
          }
          expect(total).toBe(values.reduce((s, v) => s + v, 0));
        }
      ),
      { numRuns: 500 }
    );
  });

  it("_group_size values sum to total input rows", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 30 }),
        (n) => {
          const csv = "cat,val\n" + Array.from({ length: n }, (_, i) => `g${i % 3},${i}`).join("\n");
          const result = flowPivotTable({
            csv_content: csv,
            group_by: ["cat"],
            aggregations: { val: "count" },
          });
          const lines = result.csv.split("\n");
          const headers = lines[0].split(",");
          const sizeIdx = headers.indexOf("_group_size");
          let totalSize = 0;
          for (let i = 1; i < lines.length; i++) {
            totalSize += Number(lines[i].split(",")[sizeIdx]);
          }
          expect(totalSize).toBe(n);
        }
      ),
      { numRuns: 500 }
    );
  });
});

// =============================================================================
// Section 24: flow_regression_analysis — property tests
// =============================================================================

describe("flow_regression_analysis properties", () => {
  it("R² is between 0 and 1 for any valid data", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(fc.integer({ min: -100, max: 100 }), fc.integer({ min: -100, max: 100 })),
          { minLength: 3, maxLength: 20 }
        ),
        (pairs) => {
          const csv = "x,y\n" + pairs.map(([x, y]) => `${x},${y}`).join("\n");
          const result = flowRegressionAnalysis({ csv_content: csv, x_column: "x", y_column: "y" });
          expect(result.r_squared).toBeGreaterThanOrEqual(0);
          expect(result.r_squared).toBeLessThanOrEqual(1);
        }
      ),
      { numRuns: 500 }
    );
  });

  it("residuals sum to approximately zero", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(fc.integer({ min: 1, max: 50 }), fc.integer({ min: 1, max: 200 })),
          { minLength: 3, maxLength: 15 }
        ),
        (pairs) => {
          const csv = "x,y\n" + pairs.map(([x, y]) => `${x},${y}`).join("\n");
          const result = flowRegressionAnalysis({ csv_content: csv, x_column: "x", y_column: "y" });
          const lines = result.csv.split("\n");
          const headers = lines[0].split(",");
          const resIdx = headers.indexOf("_residual");
          let sum = 0;
          for (let i = 1; i < lines.length; i++) {
            const val = Number(lines[i].split(",")[resIdx]);
            if (!isNaN(val)) sum += val;
          }
          expect(Math.abs(sum)).toBeLessThan(1); // rounding tolerance
        }
      ),
      { numRuns: 500 }
    );
  });

  it("perfect linear data gives R² = 1", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -10, max: 10 }),
        fc.integer({ min: -10, max: 10 }).filter(s => s !== 0),
        fc.integer({ min: 3, max: 10 }),
        (intercept, slope, n) => {
          const csv = "x,y\n" + Array.from({ length: n }, (_, i) =>
            `${i},${slope * i + intercept}`
          ).join("\n");
          const result = flowRegressionAnalysis({ csv_content: csv, x_column: "x", y_column: "y" });
          expect(result.r_squared).toBeCloseTo(1, 3);
          expect(result.slope).toBeCloseTo(slope, 2);
        }
      ),
      { numRuns: 200 }
    );
  });

  it("n_points matches input row count", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 20 }),
        (n) => {
          const csv = "x,y\n" + Array.from({ length: n }, (_, i) => `${i},${i * 2}`).join("\n");
          const result = flowRegressionAnalysis({ csv_content: csv, x_column: "x", y_column: "y" });
          expect(result.n_points).toBe(n);
        }
      ),
      { numRuns: 200 }
    );
  });
});

// =============================================================================
// Section 25: flow_normalize_data — property tests
// =============================================================================

describe("flow_normalize_data properties", () => {
  it("min-max values are always in [0,1]", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -1000, max: 1000 }), { minLength: 2, maxLength: 30 }),
        (values) => {
          const csv = "val\n" + values.join("\n");
          const result = flowNormalizeData({ csv_content: csv, columns: ["val"], method: "min_max" });
          const lines = result.csv.split("\n");
          const headers = lines[0].split(",");
          const normIdx = headers.indexOf("val_normalized");
          for (let i = 1; i < lines.length; i++) {
            const v = Number(lines[i].split(",")[normIdx]);
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThanOrEqual(1);
          }
        }
      ),
      { numRuns: 500 }
    );
  });

  it("z-score mean is approximately zero", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -100, max: 100 }), { minLength: 3, maxLength: 20 }),
        (values) => {
          const csv = "val\n" + values.join("\n");
          const result = flowNormalizeData({ csv_content: csv, columns: ["val"], method: "z_score" });
          const lines = result.csv.split("\n");
          const headers = lines[0].split(",");
          const normIdx = headers.indexOf("val_normalized");
          const normalized: number[] = [];
          for (let i = 1; i < lines.length; i++) {
            normalized.push(Number(lines[i].split(",")[normIdx]));
          }
          const mean = normalized.reduce((s, v) => s + v, 0) / normalized.length;
          expect(Math.abs(mean)).toBeLessThan(0.1);
        }
      ),
      { numRuns: 500 }
    );
  });

  it("row count is preserved after normalization", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 30 }),
        (n) => {
          const csv = "val\n" + Array.from({ length: n }, (_, i) => `${i}`).join("\n");
          const result = flowNormalizeData({ csv_content: csv, columns: ["val"], method: "min_max" });
          expect(result.row_count).toBe(n);
        }
      ),
      { numRuns: 200 }
    );
  });
});

// =============================================================================
// Section 26: flow_deduplicate_rows — property tests
// =============================================================================

describe("flow_deduplicate_rows properties", () => {
  it("unique_rows + duplicates_removed = total_rows", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 5 }), { minLength: 2, maxLength: 20 }),
        (values) => {
          const csv = "val\n" + values.join("\n");
          const result = flowDeduplicateRows({ csv_content: csv, columns: ["val"] });
          expect(result.unique_rows + result.duplicates_removed).toBe(result.total_rows);
        }
      ),
      { numRuns: 500 }
    );
  });

  it("unique_rows <= total_rows", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 3 }), { minLength: 1, maxLength: 20 }),
        (values) => {
          const csv = "val\n" + values.join("\n");
          const result = flowDeduplicateRows({ csv_content: csv, columns: ["val"] });
          expect(result.unique_rows).toBeLessThanOrEqual(result.total_rows);
        }
      ),
      { numRuns: 500 }
    );
  });

  it("all-unique input has zero duplicates_removed", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 20 }),
        (n) => {
          const csv = "val\n" + Array.from({ length: n }, (_, i) => `${i}`).join("\n");
          const result = flowDeduplicateRows({ csv_content: csv, columns: ["val"] });
          expect(result.duplicates_removed).toBe(0);
          expect(result.unique_rows).toBe(n);
        }
      ),
      { numRuns: 200 }
    );
  });
});
