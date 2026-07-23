import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { useAuth } from "@/lib/auth";
import { getPincodesByPrefix } from "@/lib/pincodes/pincode.controller";
import {
  PINCODE_DEBOUNCE_MS,
  PINCODE_MIN_PREFIX_LENGTH,
  type PincodeRecord,
} from "@/lib/pincodes/pincode.types";

export const pincodeQueryKeys = {
  all: ["postal-pincodes"] as const,
  prefix: (countryCode: string, prefix: string) =>
    [...pincodeQueryKeys.all, countryCode, prefix] as const,
};

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export type UsePincodeAutocompleteOptions = {
  value: string;
  countryCode?: string;
  disabled?: boolean;
  minPrefixLength?: number;
  debounceMs?: number;
  onValueChange: (pincode: string) => void;
};

export function usePincodeAutocomplete({
  value,
  countryCode = "IN",
  disabled = false,
  minPrefixLength = PINCODE_MIN_PREFIX_LENGTH,
  debounceMs = PINCODE_DEBOUNCE_MS,
  onValueChange,
}: UsePincodeAutocompleteOptions) {
  const { isAuthenticated: live } = useAuth();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [focused, setFocused] = useState(false);

  const trimmed = value.trim();
  const debouncedPrefix = useDebouncedValue(trimmed, debounceMs);
  const canSearch =
    !disabled && debouncedPrefix.length >= minPrefixLength && /^\d+$/.test(debouncedPrefix);

  const query = useQuery({
    queryKey: pincodeQueryKeys.prefix(countryCode, debouncedPrefix),
    queryFn: async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      return getPincodesByPrefix(
        { prefix: debouncedPrefix, countryCode },
        { live, signal: controller.signal },
      );
    },
    enabled: canSearch && (focused || open),
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });

  const results: PincodeRecord[] = useMemo(() => query.data ?? [], [query.data]);
  const showDropdown =
    open && focused && trimmed.length >= minPrefixLength && results.length > 0;
  const isLoading = query.isFetching && canSearch;
  const hasQueried = canSearch && !query.isFetching && query.fetchStatus !== "idle";
  const noResults = showDropdown && hasQueried && results.length === 0;

  useEffect(() => {
    setHighlight(0);
  }, [debouncedPrefix, results.length]);

  useEffect(() => {
    if (!showDropdown) return;
    const active = listRef.current?.querySelector<HTMLElement>(
      `[data-pincode-option="${highlight}"]`,
    );
    active?.scrollIntoView({ block: "nearest" });
  }, [highlight, showDropdown]);

  useEffect(() => {
    const onDocMouseDown = (event: MouseEvent) => {
      if (!(event.target instanceof Node)) return;
      if (wrapRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  const openDropdown = useCallback(() => {
    if (disabled) return;
    setOpen(true);
  }, [disabled]);

  const handleFocus = useCallback(() => {
    setFocused(true);
    if (trimmed.length >= minPrefixLength) setOpen(true);
  }, [minPrefixLength, trimmed.length]);

  const handleBlur = useCallback(() => {
    setFocused(false);
  }, []);

  const handleInputChange = useCallback(
    (next: string) => {
      const digitsOnly = next.replace(/\D/g, "");
      onValueChange(digitsOnly);
      if (digitsOnly.length >= minPrefixLength) setOpen(true);
      else setOpen(false);
    },
    [minPrefixLength, onValueChange],
  );

  const selectRow = useCallback(
    (row: PincodeRecord) => {
      onValueChange(row.pincode);
      setOpen(false);
      return row;
    },
    [onValueChange],
  );

  const moveHighlight = useCallback(
    (delta: number) => {
      if (results.length === 0) return;
      setOpen(true);
      setHighlight((current) => {
        const next = current + delta;
        if (next < 0) return results.length - 1;
        if (next >= results.length) return 0;
        return next;
      });
    },
    [results.length],
  );

  return {
    wrapRef,
    listRef,
    open,
    showDropdown,
    highlight,
    results,
    isLoading,
    noResults,
    canSearch,
    debouncedPrefix,
    close,
    openDropdown,
    handleFocus,
    handleBlur,
    handleInputChange,
    selectRow,
    moveHighlight,
    setHighlight,
    setOpen,
  };
}
