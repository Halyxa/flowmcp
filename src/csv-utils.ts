/**
 * Shared CSV utilities for parsing and escaping.
 *
 * Used by both index.ts (main thread) and worker-force.ts (worker threads).
 * Single source of truth to prevent drift between duplicated implementations.
 */

/** Parse a CSV line handling quoted fields with embedded commas, newlines, and escaped quotes. */
export function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          // Escaped quote ""
          current += '"';
          i += 2;
        } else {
          // End of quoted field
          inQuotes = false;
          i++;
        }
      } else {
        current += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === ',') {
        fields.push(current.trim());
        current = "";
        i++;
      } else {
        current += ch;
        i++;
      }
    }
  }
  fields.push(current.trim());
  return fields;
}

/** Escape a CSV field — wrap in quotes if it contains comma, double-quote, newline, or pipe. */
export function csvEscapeField(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n") || val.includes("|")) {
    return '"' + val.replace(/"/g, '""') + '"';
  }
  return val;
}

/** Parse CSV content into headers and rows arrays. Handles empty content and blank lines. */
export function parseCsvToRows(csvContent: string): { headers: string[]; rows: string[][] } {
  const lines = csvContent.trim().split("\n");
  if (lines.length < 1 || (lines.length === 1 && lines[0].trim() === "")) {
    return { headers: [], rows: [] };
  }
  const headers = parseCSVLine(lines[0]);
  if (lines.length < 2) {
    return { headers, rows: [] };
  }
  const rows = lines.slice(1).filter((l) => l.trim() !== "").map((line) => parseCSVLine(line));
  return { headers, rows };
}

/** Detect if a string value looks like a date (YYYY-MM-DD, M/D/YYYY, ISO 8601, etc.). */
export function isDateLike(val: string): boolean {
  if (!val || val.trim() === "") return false;
  const datePatterns = [
    /^\d{4}-\d{2}-\d{2}$/,
    /^\d{1,2}\/\d{1,2}\/\d{2,4}$/,
    /^\d{4}\/\d{2}\/\d{2}$/,
    /^\d{4}-\d{2}-\d{2}T/,
    /^[A-Z][a-z]{2}\s+\d{1,2},?\s+\d{4}$/,
  ];
  return datePatterns.some((p) => p.test(val.trim()));
}

/**
 * Normalize CSV argument names so tools accept both csv_content and csv_data.
 * Tools 1-57 expect csv_content; tools 58-70 expect csv_data.
 * This bridge ensures AI clients can use either name with any tool.
 */
export function normalizeCsvArgs(args: Record<string, unknown>): Record<string, unknown> {
  if (args.csv_content && !args.csv_data) {
    args.csv_data = args.csv_content;
  } else if (args.csv_data && !args.csv_content) {
    args.csv_content = args.csv_data;
  }
  return args;
}

/** Detect if a column is an ID-like column based on name or uniqueness of values. */
export function isIdLike(name: string, values: string[], totalRows: number): boolean {
  const nameLower = name.toLowerCase();
  if (nameLower === "id" || nameLower.endsWith("_id") || nameLower === "key" || nameLower === "name") {
    return true;
  }
  const uniqueSet = new Set(values.filter((v) => v.trim() !== ""));
  return uniqueSet.size === totalRows && totalRows > 1;
}
