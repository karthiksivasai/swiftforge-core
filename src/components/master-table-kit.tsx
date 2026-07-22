import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Link } from "@tanstack/react-router";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

export const PAGE_SIZE = 10;

export function FieldWrapper({
  label,
  required,
  invalid,
  children,
  className,
  dense,
  borderLabel,
  lookupSplit,
}: {
  label: string;
  required?: boolean;
  invalid?: boolean;
  children: React.ReactNode;
  className?: string;
  /** Tighter label/input spacing for high-density forms (e.g. AWB Entry). */
  dense?: boolean;
  /** CourierWala-style: label sits on the field’s top border. */
  borderLabel?: boolean;
  /** Name + separate code box (label sits on name field only). */
  lookupSplit?: boolean;
}) {
  const invalidLookupSplitClass = invalid
    ? "[&_.lookup-name]:border-destructive [&_.lookup-name]:ring-1 [&_.lookup-name]:ring-destructive"
    : undefined;

  if (borderLabel && lookupSplit) {
    const blank = !label.trim();
    return (
      <div className={cn("relative min-w-0", className)}>
        <div className="pt-1.5">
          <div className={cn("relative", invalidLookupSplitClass)}>
            {!blank ? (
              <Label
                className={cn(
                  "pointer-events-none absolute left-1.5 top-0 z-10 -translate-y-1/2 bg-card px-0.5 text-[12px] font-medium leading-none",
                  invalid ? "text-destructive" : "text-foreground",
                )}
              >
                {label}
                {required ? <span className="ml-0.5 text-destructive">*</span> : null}
              </Label>
            ) : null}
            {children}
          </div>
        </div>
      </div>
    );
  }

  if (borderLabel) {
    const blank = !label.trim();
    return (
      <div className={cn("relative min-w-0 pt-1.5", className)}>
        <div
          className={cn(
            "relative flex h-8 w-full min-w-0 items-stretch overflow-visible rounded border bg-background",
            invalid ? "border-destructive ring-1 ring-destructive" : "border-input",
            // Flatten nested controls so the group reads as one outlined field
            "[&_input]:h-8 [&_input]:min-h-8 [&_input]:rounded-none [&_input]:border-0 [&_input]:bg-transparent [&_input]:px-1.5 [&_input]:text-[13px] [&_input]:shadow-none [&_input]:focus-visible:ring-0",
            "[&_button[role=combobox]]:h-8 [&_button[role=combobox]]:rounded-none [&_button[role=combobox]]:border-0 [&_button[role=combobox]]:bg-transparent [&_button[role=combobox]]:px-1.5 [&_button[role=combobox]]:text-[13px] [&_button[role=combobox]]:shadow-none [&_button[role=combobox]]:focus:ring-0",
            "[&_button[aria-label=Search]]:h-8 [&_button[aria-label=Search]]:w-8 [&_button[aria-label=Search]]:shrink-0 [&_button[aria-label=Search]]:rounded-none [&_button[aria-label=Search]]:border-0 [&_button[aria-label=Search]]:border-l [&_button[aria-label=Search]]:border-input",
            "[&>.relative]:min-w-0 [&>.relative]:flex-1 [&_.flex.gap-1]:gap-0",
            "[&_.flex_input:nth-child(2)]:border-l [&_.flex_input:nth-child(2)]:border-input",
          )}
        >
          {!blank ? (
            <Label
              className={cn(
                "pointer-events-none absolute left-1.5 top-0 z-10 -translate-y-1/2 bg-card px-0.5 text-[12px] font-medium leading-none",
                invalid ? "text-destructive" : "text-foreground",
              )}
            >
              {label}
              {required ? <span className="ml-0.5 text-destructive">*</span> : null}
            </Label>
          ) : null}
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col", dense ? "gap-0.5" : "gap-1.5", className)}>
      <Label
        className={cn(
          "font-medium text-muted-foreground",
          dense ? "text-[11px] leading-none" : "text-xs",
        )}
      >
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </Label>
      {children}
    </div>
  );
}

function tooltipStyle(side: "top" | "left" | "right" | "bottom", rect: DOMRect) {
  switch (side) {
    case "left":
      return { top: rect.top + rect.height / 2, left: rect.left - 8, transform: "translate(-100%, -50%)" };
    case "right":
      return { top: rect.top + rect.height / 2, left: rect.right + 8, transform: "translateY(-50%)" };
    case "bottom":
      return { top: rect.bottom + 8, left: rect.left + rect.width / 2, transform: "translateX(-50%)" };
    default:
      return { top: rect.top - 8, left: rect.left + rect.width / 2, transform: "translate(-50%, -100%)" };
  }
}

export function IconTooltipBubble({
  anchorRef,
  label,
  visible,
  side = "top",
}: {
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  label: string;
  visible: boolean;
  side?: "top" | "left" | "right" | "bottom";
}) {
  const [, setTick] = useState(0);

  useLayoutEffect(() => {
    if (!visible) return;
    const update = () => setTick((n) => n + 1);
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [visible, label]);

  if (!visible || typeof document === "undefined") return null;

  const el = anchorRef.current;
  if (!el) return null;
  const rect = el.getBoundingClientRect();

  return createPortal(
    <div
      role="tooltip"
      className="pointer-events-none fixed z-[9999] max-w-xs whitespace-nowrap rounded-md bg-foreground px-2.5 py-1 text-xs font-medium text-background shadow-md"
      style={tooltipStyle(side, rect)}
    >
      {label}
    </div>,
    document.body,
  );
}

export function IconButton({
  label,
  onClick,
  children,
  variant = "outline",
  className,
  size = "toolbar",
  tooltipSide = "top",
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  variant?: "outline" | "ghost";
  className?: string;
  size?: "toolbar" | "row";
  tooltipSide?: "top" | "left" | "right" | "bottom";
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [hover, setHover] = useState(false);

  return (
    <>
      <Button
        ref={btnRef}
        size="icon"
        variant={variant}
        className={cn(
          size === "toolbar" && "h-9 w-9 bg-background",
          size === "row" && "h-7 w-7",
          className,
        )}
        onClick={onClick}
        aria-label={label}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onPointerEnter={() => setHover(true)}
        onPointerLeave={() => setHover(false)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
      >
        {children}
      </Button>
      <IconTooltipBubble anchorRef={btnRef} label={label} visible={hover} side={tooltipSide} />
    </>
  );
}

function PagerButton({
  disabled,
  onClick,
  children,
}: {
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function CompactPager({
  total,
  current,
  onSelect,
}: {
  total: number;
  current: number;
  onSelect: (n: number) => void;
}) {
  const pages: (number | "…")[] = [];
  if (total <= 7) {
    for (let i = 1; i <= total; i++) pages.push(i);
  } else {
    pages.push(1);
    if (current > 3) pages.push("…");
    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (current < total - 2) pages.push("…");
    pages.push(total);
  }
  return (
    <>
      {pages.map((p, i) =>
        p === "…" ? (
          <span key={`e${i}`} className="px-1 text-muted-foreground">
            …
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onSelect(p)}
            className={`h-8 min-w-8 rounded-md px-2 text-sm font-medium transition-colors ${
              p === current
                ? "bg-primary text-primary-foreground"
                : "text-foreground hover:bg-accent"
            }`}
          >
            {p}
          </button>
        ),
      )}
    </>
  );
}

export function TablePager({
  totalPages,
  currentPage,
  setPage,
  startIdx,
  endIdx,
  total,
}: {
  totalPages: number;
  currentPage: number;
  setPage: (n: number) => void;
  startIdx: number;
  endIdx: number;
  total: number;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm text-muted-foreground">
      <span>
        Showing {startIdx} to {endIdx} of {total} entries
      </span>
      <div className="flex items-center gap-1">
        <PagerButton disabled={currentPage === 1} onClick={() => setPage(1)}>
          <ChevronsLeft className="h-4 w-4" />
        </PagerButton>
        <PagerButton disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </PagerButton>
        <CompactPager total={totalPages} current={currentPage} onSelect={setPage} />
        <PagerButton disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}>
          <ChevronRight className="h-4 w-4" />
        </PagerButton>
        <PagerButton disabled={currentPage === totalPages} onClick={() => setPage(totalPages)}>
          <ChevronsRight className="h-4 w-4" />
        </PagerButton>
      </div>
    </div>
  );
}

export function MasterBreadcrumb({ trail }: { trail: string[] }) {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link to="/dashboard">Home</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        {trail.slice(0, -1).map((t) => (
          <span key={t} className="contents">
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <span className="text-muted-foreground">{t}</span>
            </BreadcrumbItem>
          </span>
        ))}
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>{trail[trail.length - 1]}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}

export function StatusPill({ status }: { status: "Active" | "In-Active" }) {
  return (
    <span
      className={
        status === "Active"
          ? "inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400"
          : "inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
      }
    >
      {status}
    </span>
  );
}

export function downloadCsv(filename: string, header: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = [header.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
