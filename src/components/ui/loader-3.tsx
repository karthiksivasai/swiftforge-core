import { cn } from "@/lib/utils";

import "./loader-3.css";

const BOX_COUNT = 8;

export function Loader3({ className }: { className?: string }) {
  return (
    <div className={cn("loader-3", className)} role="status" aria-label="Loading">
      {Array.from({ length: BOX_COUNT }, (_, index) => (
        <div key={index} className={`box box${index}`}>
          <div />
        </div>
      ))}
      <div className="ground">
        <div />
      </div>
    </div>
  );
}

/** Alias for shadcn-style demo imports */
export const Component = Loader3;

export function Loader3Screen({ className }: { className?: string }) {
  return (
    <div className={cn("flex min-h-[320px] w-full items-center justify-center", className)}>
      <Loader3 />
    </div>
  );
}
