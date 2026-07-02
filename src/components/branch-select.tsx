import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface BranchSelectProps {
  value?: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
}

const INITIAL_CHUNK = 200;
const CHUNK_SIZE = 400;

export function BranchSelect({
  value,
  onChange,
  options,
  placeholder = "Select",
  className,
}: BranchSelectProps) {
  const [open, setOpen] = useState(false);
  const [rendered, setRendered] = useState(INITIAL_CHUNK);

  // Ensure the currently selected value is always rendered so Radix can show it.
  const selectedIndex = value ? options.indexOf(value) : -1;
  const effectiveCount = Math.max(rendered, selectedIndex + 1);
  const visible = options.slice(0, Math.min(effectiveCount, options.length));

  // Progressively expand the list after opening so the popover paints fast,
  // then fills the rest in the background — the auto-scroll arrows still work.
  useEffect(() => {
    if (!open) {
      setRendered(INITIAL_CHUNK);
      return;
    }
    if (rendered >= options.length) return;
    const idle: (cb: () => void) => number =
      (window as unknown as { requestIdleCallback?: (cb: () => void) => number })
        .requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 16));
    const cancel: (id: number) => void =
      (window as unknown as { cancelIdleCallback?: (id: number) => void })
        .cancelIdleCallback ?? ((id: number) => window.clearTimeout(id));
    const id = idle(() => {
      setRendered((r) => Math.min(options.length, r + CHUNK_SIZE));
    });
    return () => cancel(id);
  }, [open, rendered, options.length]);

  return (
    <Select
      value={value || undefined}
      onValueChange={onChange}
      open={open}
      onOpenChange={setOpen}
    >
      <SelectTrigger className={cn("h-10", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {visible.map((opt) => (
          <SelectItem key={opt} value={opt}>
            {opt}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
