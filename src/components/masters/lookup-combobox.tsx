/**
 * FK picker backed by the shared `public.lookup` RPC (migration 0017).
 *
 * Used by geo master screens (M6) when authenticated: it replaces the demo
 * static <Select>/dialog pickers with a tenant-safe, trigram-searched
 * autocomplete that returns the real row `id` while showing a human label.
 *
 * Visually it mirrors the existing BranchCombobox (Popover + cmdk Command) so
 * the screens keep their look and feel. `value` is the selected id; `valueLabel`
 * is what to show for it (the screens keep the label alongside the id so the
 * trigger stays populated on edit without an extra fetch).
 */
import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { useLookup, type LookupItem, type LookupKey } from "@/lib/masters/core/lookup";

/** A pickable entity with the same shape the lookup RPC returns. */
export type EntityOption = { id: string; code: string | null; name: string; hint?: string | null };

export function LookupCombobox({
  lookupKey,
  value,
  valueLabel,
  onChange,
  placeholder = "Select",
  disabled,
  className,
}: {
  lookupKey: LookupKey;
  value: string;
  valueLabel?: string;
  onChange: (id: string, item: LookupItem | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { data, isFetching } = useLookup(lookupKey, query, { enabled: open });
  const items = data ?? [];

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("h-10 w-full justify-between font-normal", className)}
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {value ? valueLabel || value : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
        onWheel={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
      >
        {/* shouldFilter=false: results are already filtered server-side by the RPC. */}
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search..." value={query} onValueChange={setQuery} />
          <CommandList className="max-h-72 overflow-y-auto overscroll-contain">
            <CommandEmpty>{isFetching ? "Searching…" : "No matches."}</CommandEmpty>
            <CommandGroup>
              {value ? (
                <CommandItem
                  value="__clear__"
                  onSelect={() => {
                    onChange("", null);
                    setOpen(false);
                  }}
                  className="text-muted-foreground"
                >
                  <Check className="mr-2 h-4 w-4 opacity-0" />
                  Clear selection
                </CommandItem>
              ) : null}
              {items.map((item) => (
                <CommandItem
                  key={item.id}
                  value={item.id}
                  onSelect={() => {
                    onChange(item.id, item);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn("mr-2 h-4 w-4", value === item.id ? "opacity-100" : "opacity-0")}
                  />
                  <span className="truncate">
                    {item.code && item.code !== item.name
                      ? `${item.code} — ${item.name}`
                      : item.name}
                    {item.hint ? (
                      <span className="ml-1 text-xs text-muted-foreground">({item.hint})</span>
                    ) : null}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Same trigger/UX as LookupCombobox but driven by an in-memory list instead of
 * the lookup RPC. Used for FK targets that have no `public.lookup` key (e.g.
 * branches), where the screen loads the options itself. Filtering is client-side.
 */
export function EntityCombobox({
  items,
  value,
  valueLabel,
  onChange,
  placeholder = "Select",
  loading,
  disabled,
  className,
}: {
  items: EntityOption[];
  value: string;
  valueLabel?: string;
  onChange: (id: string, item: EntityOption | null) => void;
  placeholder?: string;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("h-10 w-full justify-between font-normal", className)}
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {value ? valueLabel || value : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
        onWheel={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
      >
        <Command>
          <CommandInput placeholder="Search..." />
          <CommandList className="max-h-72 overflow-y-auto overscroll-contain">
            <CommandEmpty>{loading ? "Loading…" : "No matches."}</CommandEmpty>
            <CommandGroup>
              {value ? (
                <CommandItem
                  value="clear selection"
                  onSelect={() => {
                    onChange("", null);
                    setOpen(false);
                  }}
                  className="text-muted-foreground"
                >
                  <Check className="mr-2 h-4 w-4 opacity-0" />
                  Clear selection
                </CommandItem>
              ) : null}
              {items.map((item) => (
                <CommandItem
                  key={item.id}
                  value={`${item.name} ${item.code ?? ""}`}
                  onSelect={() => {
                    onChange(item.id, item);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn("mr-2 h-4 w-4", value === item.id ? "opacity-100" : "opacity-0")}
                  />
                  <span className="truncate">
                    {item.code && item.code !== item.name
                      ? `${item.code} — ${item.name}`
                      : item.name}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
