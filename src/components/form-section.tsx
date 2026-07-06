import type { ReactNode } from "react";

export function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="relative rounded-md border p-4 pt-6">
      <span className="absolute -top-2.5 left-3 rounded-full bg-sidebar px-3 py-0.5 text-sm font-medium text-sidebar-foreground">
        {title}
      </span>
      {children}
    </div>
  );
}
