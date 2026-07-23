import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MASTER_LOOKUPS, type LookupKey, type LookupOption } from "@/lib/master-lookups";
import { lookupHitSearchFields, rankLookupResults } from "@/lib/search/ranked-lookup-search";

export type LookupReturn = "code" | "name" | "code-name";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  lookup: LookupKey;
  onSelect: (value: string, option: LookupOption) => void;
  returnField?: LookupReturn;
}

export function MasterLookupDialog({ open, onOpenChange, lookup, onSelect, returnField = "name" }: Props) {
  const cfg = MASTER_LOOKUPS[lookup];
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    return rankLookupResults(cfg.options, query, lookupHitSearchFields);
  }, [cfg.options, query]);

  const handlePick = (o: LookupOption) => {
    const value =
      returnField === "code" ? o.code : returnField === "code-name" ? `${o.code} - ${o.name}` : o.name;
    onSelect(value, o);
    onOpenChange(false);
    setQuery("");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setQuery(""); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{cfg.title}</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by code or name..."
            className="pl-8"
          />
        </div>
        <div className="max-h-[420px] overflow-y-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-sidebar text-sidebar-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium w-24">Code</th>
                <th className="px-3 py-2 text-left font-medium">Name</th>
                {cfg.hintLabel && <th className="px-3 py-2 text-left font-medium w-32">{cfg.hintLabel}</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={cfg.hintLabel ? 3 : 2} className="px-3 py-6 text-center text-muted-foreground">
                    No matches
                  </td>
                </tr>
              ) : (
                filtered.map((o) => (
                  <tr
                    key={o.code + o.name}
                    className="cursor-pointer border-t hover:bg-muted/60"
                    onClick={() => handlePick(o)}
                  >
                    <td className="px-3 py-2 font-mono text-xs">{o.code}</td>
                    <td className="px-3 py-2">{o.name}</td>
                    {cfg.hintLabel && <td className="px-3 py-2 text-muted-foreground">{o.hint ?? ""}</td>}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
