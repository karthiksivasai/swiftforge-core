import type { KeyboardEvent, ReactNode } from "react";

import { cn } from "@/lib/utils";
import { normalizeSearchText } from "@/lib/search/ranked-lookup-search";

/** AWB Entry autocomplete defaults */
export const AWB_LOOKUP_RESULT_LIMIT = 20;
export const AWB_LOOKUP_DEBOUNCE_MS = 280;
export const AWB_LOOKUP_NO_RESULTS = "No matching records found.";

export type LookupDisplayVariant = "standard" | "client" | "company" | "service";

/** Shared Enter/Tab/Esc handling for ERP lookup fields. */
export function handleLookupCommitKeyDown(
  e: KeyboardEvent<HTMLInputElement>,
  options: {
    dropdownOpen: boolean;
    resultsAvailable: boolean;
    highlightedIndex: number;
    onPickHighlighted: () => void;
    onCommitTyped: () => void;
    onDismissDropdown: () => void;
    onBrowseSearch?: () => void;
    manualSearchMode?: boolean;
  },
): boolean {
  const {
    dropdownOpen,
    resultsAvailable,
    highlightedIndex,
    onPickHighlighted,
    onCommitTyped,
    onDismissDropdown,
    onBrowseSearch,
    manualSearchMode = false,
  } = options;

  if (manualSearchMode && e.key === "F2") {
    e.preventDefault();
    onBrowseSearch?.();
    return true;
  }

  if (dropdownOpen && e.key === "Escape") {
    e.preventDefault();
    onDismissDropdown();
    return true;
  }

  const hasActiveHighlight =
    dropdownOpen && resultsAvailable && highlightedIndex >= 0;

  if (e.key === "Enter" || e.key === "Tab") {
    e.preventDefault();
    if (hasActiveHighlight) {
      onPickHighlighted();
    } else {
      onDismissDropdown();
      onCommitTyped();
    }
    return true;
  }

  return false;
}

/** Case-insensitive highlight of the first matching substring. */
export function highlightSearchMatch(text: string, query: string): ReactNode {
  if (!text || !query.trim()) return text;

  const q = query.trim();
  const lowerText = text.toLowerCase();
  const lowerQuery = q.toLowerCase();
  let start = lowerText.indexOf(lowerQuery);

  if (start < 0) {
    const normalizedText = normalizeSearchText(text);
    const normalizedQuery = normalizeSearchText(q);
    const normStart = normalizedText.indexOf(normalizedQuery);
    if (normStart < 0) return text;
    start = normStart;
  }

  const end = Math.min(start + q.length, text.length);
  return (
    <>
      {text.slice(0, start)}
      <mark className="rounded-sm bg-amber-200/90 px-0.5 text-foreground dark:bg-amber-500/35">
        {text.slice(start, end)}
      </mark>
      {text.slice(end)}
    </>
  );
}

export function LookupAutocompleteLoading() {
  return (
    <div className="px-3 py-4 text-center text-sm text-muted-foreground">Searching…</div>
  );
}

export function LookupAutocompleteEmpty({ message = AWB_LOOKUP_NO_RESULTS }: { message?: string }) {
  return <div className="px-3 py-4 text-center text-sm text-muted-foreground">{message}</div>;
}

export function LookupAutocompleteStandardRow({
  name,
  code,
  query,
  hint,
  highlighted,
}: {
  name: string;
  code?: string | null;
  query: string;
  hint?: string | null;
  highlighted?: boolean;
}) {
  const codePart = code?.trim();
  return (
    <div
      className={cn(
        "flex w-full min-w-0 items-start justify-between gap-2 text-left",
        highlighted && "text-accent-foreground",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium leading-snug">
          {codePart ? (
            <>
              {highlightSearchMatch(name, query)}
              <span className="font-normal text-muted-foreground">
                {" "}
                ({highlightSearchMatch(codePart, query)})
              </span>
            </>
          ) : (
            highlightSearchMatch(name, query)
          )}
        </div>
        {hint ? (
          <div className="truncate text-[11px] text-muted-foreground">{highlightSearchMatch(hint, query)}</div>
        ) : null}
      </div>
    </div>
  );
}

export function LookupAutocompleteClientRow({
  name,
  code,
  query,
  highlighted,
}: {
  name: string;
  code?: string | null;
  query: string;
  highlighted?: boolean;
}) {
  return (
    <div className={cn("min-w-0 text-left", highlighted && "text-accent-foreground")}>
      <div className="truncate text-sm font-medium leading-snug">{highlightSearchMatch(name, query)}</div>
      {code?.trim() ? (
        <div className="truncate text-[11px] text-muted-foreground">
          Client Code: {highlightSearchMatch(code.trim(), query)}
        </div>
      ) : null}
    </div>
  );
}

export function LookupAutocompleteCompanyRow({
  name,
  code,
  query,
  highlighted,
}: {
  name: string;
  code?: string | null;
  query: string;
  highlighted?: boolean;
}) {
  return (
    <div className={cn("min-w-0 text-left", highlighted && "text-accent-foreground")}>
      <div className="truncate text-sm font-medium leading-snug">{highlightSearchMatch(name, query)}</div>
      {code?.trim() ? (
        <div className="truncate text-[11px] text-muted-foreground">
          Code: {highlightSearchMatch(code.trim(), query)}
        </div>
      ) : null}
    </div>
  );
}

export function LookupAutocompleteServiceRow({
  name,
  code,
  query,
  hint,
  highlighted,
}: {
  name: string;
  code?: string | null;
  query: string;
  hint?: string | null;
  highlighted?: boolean;
}) {
  return (
    <div className={cn("min-w-0 text-left", highlighted && "text-accent-foreground")}>
      <div className="truncate text-sm font-medium leading-snug">{highlightSearchMatch(name, query)}</div>
      {hint ? (
        <div className="truncate text-[11px] text-muted-foreground">{highlightSearchMatch(hint, query)}</div>
      ) : code?.trim() ? (
        <div className="truncate text-[11px] font-mono text-muted-foreground">
          {highlightSearchMatch(code.trim(), query)}
        </div>
      ) : null}
    </div>
  );
}
