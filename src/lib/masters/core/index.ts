/**
 * Public API for the master core layer.
 *
 * Import from `@/lib/masters/core` rather than reaching into individual files.
 * These modules are fully generic — a new master never needs to touch them.
 */
export * from "./baseCrud";
export * from "./lookup";
export * from "./import";
export * from "./csv";
export * from "./queryKeys";
export * from "./useMasterResource";
