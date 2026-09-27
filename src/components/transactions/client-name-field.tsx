/**
 * AWB Client Name: typeahead + search (Customer Help) + pencil (Customer Details).
 */
import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SearchableLookupPair, type LookupPairValue } from "@/components/masters/searchable-lookup-pair";
import { CustomerDetailsDialog } from "@/components/transactions/customer-details-dialog";
import { CustomerHelpDialog } from "@/components/transactions/customer-help-dialog";
import { useErpNavCommit } from "@/components/forms/erp-form-nav-context";
import { AWB_NAV } from "@/lib/forms/awb-entry-nav-order";
import { ERP_NAV_SKIP } from "@/lib/forms/erp-keyboard-nav";
import { cn } from "@/lib/utils";

export function ClientNameField({
  value,
  onDraftChange,
  onSelect,
  disabled,
}: {
  value: LookupPairValue;
  onDraftChange: (v: LookupPairValue) => void;
  onSelect: (v: LookupPairValue) => void;
  disabled?: boolean;
}) {
  const onCommit = useErpNavCommit();
  const [helpOpen, setHelpOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createName, setCreateName] = useState("");

  const canEdit = Boolean(value.id || value.code.trim());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || (e.key !== "e" && e.key !== "E")) return;
      if (disabled || !canEdit || helpOpen || detailsOpen) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "TEXTAREA") return;
      e.preventDefault();
      setCreating(false);
      setDetailsOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [disabled, canEdit, helpOpen, detailsOpen]);

  const pencil = (
    <Button
      size="icon"
      variant="outline"
      type="button"
      disabled={disabled || !canEdit}
      className="h-8 w-8 shrink-0"
      aria-label={canEdit ? "Edit customer details (Alt+E)" : "Select a customer before editing"}
      title={canEdit ? "Edit customer (Alt+E)" : "Select a customer first"}
      {...{ [ERP_NAV_SKIP]: "" }}
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onClick={() => {
        if (disabled || !canEdit) return;
        setCreating(false);
        setDetailsOpen(true);
      }}
    >
      <Pencil className={cn("h-3.5 w-3.5", !canEdit && "opacity-50")} />
    </Button>
  );

  return (
    <>
      <SearchableLookupPair
        value={value}
        onChange={onDraftChange}
        onSelect={onSelect}
        lookup="customer"
        disabled={disabled}
        compact
        splitCode
        manualSearch
        minChars={1}
        navOrder={AWB_NAV.CLIENT}
        onCommit={onCommit}
        displayVariant="client"
        emptySearchMessage="Please enter a client name."
        namePlaceholder=""
        codePlaceholder=""
        searchPlaceholder=""
        onBrowseSearch={() => setHelpOpen(true)}
        endAdornment={pencil}
      />
      <CustomerHelpDialog
        open={helpOpen}
        onOpenChange={setHelpOpen}
        initialQuery={value.name || value.code}
        onSelect={(row) => onSelect({ id: row.id, code: row.code, name: row.name })}
        onAddNew={(query) => {
          setHelpOpen(false);
          setCreating(true);
          setCreateName(query);
          setDetailsOpen(true);
        }}
      />
      <CustomerDetailsDialog
        open={detailsOpen}
        onOpenChange={(o) => {
          setDetailsOpen(o);
          if (!o) setCreating(false);
        }}
        customer={creating ? { code: "", name: createName } : value}
        createName={creating ? createName : undefined}
        onSaved={(row) => onSelect({ id: row.id, code: row.code, name: row.name })}
      />
    </>
  );
}
