/**
 * Generic results table driven by report column metadata.
 */
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ReportColumnMeta } from "@/lib/reports/types";
import { cn } from "@/lib/utils";

type Props = {
  columns: ReportColumnMeta[];
  rows: Record<string, unknown>[];
  sortBy?: string | null;
  sortDir?: string | null;
  onSort?: (columnKey: string) => void;
  emptyMessage?: string;
};

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function ReportTable({
  columns,
  rows,
  sortBy,
  sortDir,
  onSort,
  emptyMessage = "No rows. Adjust filters and run the report.",
}: Props) {
  if (!columns.length) {
    return (
      <div className="px-4 py-8 text-center text-sm text-muted-foreground">
        No columns defined for this report.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] caption-bottom text-sm">
        <TableHeader>
          <TableRow>
            {columns.map((col) => {
              const active = sortBy === col.key;
              return (
                <TableHead
                  key={col.key}
                  className={cn(onSort && "cursor-pointer select-none hover:text-foreground")}
                  onClick={() => onSort?.(col.key)}
                >
                  {col.label}
                  {active ? (sortDir === "asc" ? " ↑" : " ↓") : null}
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="py-10 text-center text-muted-foreground"
              >
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row, idx) => (
              <TableRow key={idx}>
                {columns.map((col) => (
                  <TableCell key={col.key}>{formatCell(row[col.key])}</TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </table>
    </div>
  );
}
