import { useId, type KeyboardEvent } from "react";
import { Loader2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import { LOOKUP_DROPDOWN_ATTR } from "@/components/masters/lookup-dropdown-portal";
import { usePincodeAutocomplete } from "@/hooks/use-pincode-autocomplete";
import { erpNavOrder } from "@/lib/forms/erp-keyboard-nav";
import {
  toPincodeSelection,
  type PincodeRecord,
  type PincodeSelection,
} from "@/lib/pincodes/pincode.types";
import { cn } from "@/lib/utils";

export type PincodeAutocompleteProps = {
  name?: string;
  label?: string;
  placeholder?: string;
  countryCode?: string;
  disabled?: boolean;
  required?: boolean;
  value: string;
  className?: string;
  navOrder?: number;
  onValueChange: (pincode: string) => void;
  onSelect: (item: PincodeSelection) => void;
  onCommit?: () => void;
};

function HighlightPincode({ pincode, prefix }: { pincode: string; prefix: string }) {
  if (!prefix || !pincode.startsWith(prefix)) {
    return <span className="font-medium tabular-nums">{pincode}</span>;
  }
  return (
    <span className="tabular-nums">
      <span className="font-semibold text-foreground">{prefix}</span>
      <span className="text-muted-foreground">{pincode.slice(prefix.length)}</span>
    </span>
  );
}

function PincodeOptionRow({
  row,
  prefix,
  active,
  index,
  onMouseEnter,
  onSelect,
}: {
  row: PincodeRecord;
  prefix: string;
  active: boolean;
  index: number;
  onMouseEnter: () => void;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      data-pincode-option={index}
      className={cn(
        "flex w-full items-center gap-2 border-b border-border/60 px-3 py-2 text-left text-sm last:border-b-0",
        active ? "bg-accent text-accent-foreground" : "bg-background hover:bg-muted/50",
      )}
      onMouseEnter={onMouseEnter}
      onMouseDown={(event) => {
        event.preventDefault();
        onSelect();
      }}
    >
      <HighlightPincode pincode={row.pincode} prefix={prefix} />
      <span className="text-muted-foreground">|</span>
      <span className="truncate">{row.city}</span>
      <span className="text-muted-foreground">|</span>
      <span className="truncate">{row.state}</span>
    </button>
  );
}

export function PincodeAutocomplete({
  name = "pincode",
  placeholder = "Pincode",
  countryCode = "IN",
  disabled = false,
  value,
  className,
  navOrder,
  onValueChange,
  onSelect,
  onCommit,
}: PincodeAutocompleteProps) {
  const listId = useId();
  const {
    wrapRef,
    listRef,
    showDropdown,
    highlight,
    results,
    isLoading,
    noResults,
    debouncedPrefix,
    close,
    handleFocus,
    handleBlur,
    handleInputChange,
    selectRow,
    moveHighlight,
    setHighlight,
    setOpen,
  } = usePincodeAutocomplete({
    value,
    countryCode,
    disabled,
    onValueChange,
  });

  const commitSelection = (row: PincodeRecord) => {
    selectRow(row);
    onSelect(toPincodeSelection(row));
    onCommit?.();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      if (results.length > 0) {
        event.preventDefault();
        setOpen(true);
        moveHighlight(1);
      }
      return;
    }
    if (event.key === "ArrowUp") {
      if (results.length > 0) {
        event.preventDefault();
        setOpen(true);
        moveHighlight(-1);
      }
      return;
    }
    if (event.key === "Enter") {
      if (showDropdown && results[highlight]) {
        event.preventDefault();
        commitSelection(results[highlight]);
      }
      return;
    }
    if (event.key === "Escape") {
      if (showDropdown) {
        event.preventDefault();
        close();
      }
      return;
    }
    if (event.key === "Tab" && showDropdown && results[highlight]) {
      commitSelection(results[highlight]);
    }
  };

  const navProps = navOrder != null ? erpNavOrder(navOrder) : undefined;

  return (
    <div ref={wrapRef} className="relative w-full min-w-0">
      <div className="relative">
        <Input
          name={name}
          value={value}
          disabled={disabled}
          inputMode="numeric"
          autoComplete="postal-code"
          placeholder={placeholder}
          className={cn(className, isLoading && "pr-8")}
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            showDropdown && results[highlight] ? `${listId}-option-${highlight}` : undefined
          }
          onChange={(event) => handleInputChange(event.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={onKeyDown}
          {...navProps}
        />
        {isLoading ? (
          <Loader2
            aria-hidden
            className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground"
          />
        ) : null}
      </div>

      {showDropdown ? (
        <div
          id={listId}
          ref={listRef}
          role="listbox"
          {...{ [LOOKUP_DROPDOWN_ATTR]: "" }}
          className={cn(
            "absolute left-0 right-0 top-[calc(100%+4px)] z-[9999] max-h-[300px] overflow-y-auto",
            "rounded-md border border-border bg-background shadow-md",
            "animate-in fade-in-0 zoom-in-95 duration-150",
          )}
        >
          {noResults ? (
            <div className="px-3 py-3 text-sm text-muted-foreground">No matching pincodes found.</div>
          ) : (
            results.map((row, index) => (
              <PincodeOptionRow
                key={`${row.id}-${row.pincode}`}
                row={row}
                prefix={debouncedPrefix}
                active={index === highlight}
                index={index}
                onMouseEnter={() => setHighlight(index)}
                onSelect={() => commitSelection(row)}
              />
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
