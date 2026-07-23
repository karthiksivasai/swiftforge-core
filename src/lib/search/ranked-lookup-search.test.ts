import { describe, expect, it } from "vitest";

import {
  rankLookupResults,
  scoreRankedSearch,
} from "@/lib/search/ranked-lookup-search";

type Country = { code: string; name: string };

const COUNTRIES: Country[] = [
  { code: "US", name: "United States of America" },
  { code: "VI", name: "Virgin Islands, US" },
  { code: "AU", name: "Australia" },
  { code: "AT", name: "Austria" },
  { code: "BY", name: "Belarus" },
  { code: "CY", name: "Cyprus" },
  { code: "IN", name: "India" },
  { code: "UG", name: "Uganda" },
  { code: "UA", name: "Ukraine" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "GB", name: "United Kingdom" },
  { code: "UY", name: "Uruguay" },
  { code: "UZ", name: "Uzbekistan" },
  { code: "MU", name: "Mauritius" },
];

const toFields = (item: Country) => ({ code: item.code, name: item.name });

describe("ranked lookup search", () => {
  it("ranks exact code matches first for US", () => {
    const results = rankLookupResults(COUNTRIES, "US", toFields);
    expect(results[0]).toMatchObject({ code: "US" });
  });

  it("ranks name-prefix matches before contains matches for U", () => {
    const results = rankLookupResults(COUNTRIES, "U", toFields);
    const names = results.map((row) => row.name);
    const ugandaIdx = names.indexOf("Uganda");
    const australiaIdx = names.indexOf("Australia");
    expect(ugandaIdx).toBeGreaterThanOrEqual(0);
    expect(australiaIdx).toBeGreaterThan(ugandaIdx);
  });

  it("ranks Australia at the top for AU", () => {
    const results = rankLookupResults(COUNTRIES, "AU", toFields);
    expect(results[0]?.code).toBe("AU");
  });

  it("ranks India for IND via name prefix", () => {
    const results = rankLookupResults(COUNTRIES, "IND", toFields);
    expect(results[0]?.name).toBe("India");
  });

  it("ranks word-prefix matches for Arab", () => {
    const results = rankLookupResults(COUNTRIES, "Arab", toFields);
    expect(results[0]?.name).toBe("United Arab Emirates");
  });

  it("is case-insensitive", () => {
    expect(scoreRankedSearch({ code: "US", name: "USA" }, "us")).toBeGreaterThan(
      scoreRankedSearch({ code: "AU", name: "Australia" }, "us"),
    );
  });

  it("ranks name contains matches for partial text in Australia", () => {
    const results = rankLookupResults(COUNTRIES, "str", toFields);
    expect(results[0]?.name).toBe("Australia");
  });

  it("ranks exact three-letter code AUS above name-prefix matches when code field uses AUS", () => {
    const withAusCode = [
      { code: "AUS", name: "Australia" },
      { code: "AUT", name: "Austria" },
      { code: "ARG", name: "Argentina" },
    ];
    const results = rankLookupResults(withAusCode, "AUS", toFields);
    expect(results[0]?.code).toBe("AUS");
  });
});
