import { useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";

import { Loader3 } from "@/components/ui/loader-3";

const MIN_VISIBLE_MS = 700;

/** Inline fallback while a route segment is loading (Suspense). */
export function RoutePendingLoader() {
  return (
    <div className="flex min-h-[50vh] w-full items-center justify-center">
      <Loader3 />
    </div>
  );
}

/** Full-screen overlay for refresh and in-app navigation. */
export function GlobalRouteLoader() {
  const routeBusy = useRouterState({
    select: (s) => s.isLoading || s.status === "pending",
  });

  const [visible, setVisible] = useState(true);
  const shownAt = useRef(Date.now());

  useEffect(() => {
    if (routeBusy) {
      setVisible(true);
      shownAt.current = Date.now();
      return;
    }

    const elapsed = Date.now() - shownAt.current;
    const remaining = Math.max(0, MIN_VISIBLE_MS - elapsed);
    const timer = window.setTimeout(() => setVisible(false), remaining);
    return () => window.clearTimeout(timer);
  }, [routeBusy]);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/90 backdrop-blur-[1px]"
      role="status"
      aria-live="polite"
      aria-label="Loading page"
    >
      <Loader3 />
    </div>
  );
}
