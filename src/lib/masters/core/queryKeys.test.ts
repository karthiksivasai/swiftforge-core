import { describe, it, expect } from "vitest";

import { masterKeys } from "./queryKeys";

describe("masterKeys", () => {
  it("roots a resource under its key so all() is a prefix of list()/detail()", () => {
    expect(masterKeys.all("countries")).toEqual(["countries"]);
    expect(masterKeys.list("countries").slice(0, 1)).toEqual(masterKeys.all("countries"));
    expect(masterKeys.detail("countries", "id-1").slice(0, 1)).toEqual(masterKeys.all("countries"));
  });

  it("defaults list params to an empty object", () => {
    expect(masterKeys.list("zones")).toEqual(["zones", "list", {}]);
    expect(masterKeys.list("zones", { page: 2 })).toEqual(["zones", "list", { page: 2 }]);
  });

  it("keys details by id", () => {
    expect(masterKeys.detail("states", "abc")).toEqual(["states", "detail", "abc"]);
  });

  it("namespaces lookups separately from resources", () => {
    expect(masterKeys.lookupRoot("zone")).toEqual(["lookup", "zone"]);
    expect(masterKeys.lookup("zone", "del", 20)).toEqual(["lookup", "zone", "del", 20]);
    // lookupRoot is a prefix of a specific lookup query -> broad invalidation works
    expect(masterKeys.lookup("zone", "del", 20).slice(0, 2)).toEqual(masterKeys.lookupRoot("zone"));
  });

  it("keys import jobs", () => {
    expect(masterKeys.import("job-1")).toEqual(["import", "job-1"]);
  });
});
