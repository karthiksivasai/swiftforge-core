/**
 * Customer Help — Name | Code | Select table used from AWB Client Name search.
 */
import { useEffect, useId, useState } from "react";
import { Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toErrorMessage } from "@/lib/masters/screen";
import { searchCustomersForHelp } from "@/lib/transactions/resources/customerQuickEdit";
import { cn } from "@/lib/utils";

export type CustomerHelpRow = { id: string; code: string; name: string };

export function CustomerHelpDialog({
  open,
  onOpenChange,
  initialQuery = "",
  onSelect,
  onAddNew,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialQuery?: string;
  onSelect: (row: CustomerHelpRow) => void;
  onAddNew?: (query: string) => void;
}) {
  const searchId = useId();
  const [query, setQuery] = useState(initialQuery);
  const [debounced, setDebounced] = useState(initialQuery);
  const [rows, setRows] = useState<CustomerHelpRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery(initialQuery);
    setDebounced(initialQuery);
  }, [open, initialQuery]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => setDebounced(query), 300);
    return () => window.clearTimeout(t);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void searchCustomersForHelp(debounced)
      .then((next) => {
        if (cancelled) return;
        setRows(next);
      })
      .catch((e) => {
        if (cancelled) return;
        const msg = toErrorMessage(e, "Failed to search customers");
        setError(msg);
        setRows([]);
        toast.error(msg);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 overflow-hidden p-0 [&>button]:top-2.5 [&>button]:right-3 [&>button]:text-sidebar-foreground">
        <div className="bg-sidebar px-4 py-2.5 pr-12 text-sidebar-foreground">
          <DialogTitle className="text-base font-semibold text-sidebar-foreground">
            Customer Help
          </DialogTitle>
          <DialogDescription className="sr-only">
            Search customers by name or code, then select a row to fill the AWB client.
          </DialogDescription>
        </div>
        <div className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            <label htmlFor={searchId} className="sr-only">
              Search customers by name or code
            </label>
            <Input
              id={searchId}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-8 text-[13px]"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  setDebounced(query);
                }
              }}
            />
            <Button
              type="button"
              size="sm"
              className="h-8 shrink-0"
              onClick={() => setDebounced(query)}
            >
              <Search className="h-3.5 w-3.5" />
              Search
            </Button>
            {onAddNew ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 shrink-0"
                onClick={() => onAddNew(query.trim())}
              >
                <Plus className="h-3.5 w-3.5" />
                Add new
              </Button>
            ) : null}
          </div>

          <div className="max-h-80 overflow-auto rounded border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-8 text-xs">Name</TableHead>
                  <TableHead className="h-8 w-28 text-xs">Code</TableHead>
                  <TableHead className="h-8 w-24 text-right text-xs">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-8 text-center text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Searching…
                      </span>
                    </TableCell>
                  </TableRow>
                ) : error ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-8 text-center text-sm text-destructive">
                      {error}
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-8 text-center text-sm text-muted-foreground">
                      No matches
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="py-1.5 text-[13px] font-medium">{row.name}</TableCell>
                      <TableCell className="py-1.5 font-mono text-[12px] text-muted-foreground">
                        {row.code}
                      </TableCell>
                      <TableCell className="py-1.5 text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          onClick={() => {
                            onSelect(row);
                            onOpenChange(false);
                          }}
                        >
                          Select
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className={cn("h-8")}
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
