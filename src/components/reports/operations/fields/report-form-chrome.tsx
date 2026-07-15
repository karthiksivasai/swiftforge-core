import type { ReactNode } from "react";

/** CourierWala report pill + bordered filter chrome. */
export function ReportFormChrome({
  children,
  badgeLabel = "Report",
}: {
  children: ReactNode;
  badgeLabel?: string;
}) {
  return (
    <div className="min-w-0 overflow-hidden rounded-md border bg-card p-4 md:p-6">
      <div className="mb-4">
        <span className="inline-flex rounded-full bg-sidebar px-3 py-0.5 text-sm font-medium text-sidebar-foreground">
          {badgeLabel}
        </span>
      </div>
      {children}
    </div>
  );
}
