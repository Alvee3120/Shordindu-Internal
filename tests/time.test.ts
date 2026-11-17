import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  dhakaDayEndUtc,
  dhakaDayStartUtc,
  dhakaToday,
  isSameDhakaDay,
  isWeekend,
  toDhakaDate,
} from "@/lib/time";

describe("lib/time", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the Dhaka date after UTC midnight has passed", () => {
    vi.setSystemTime(new Date("2026-11-17T19:00:00Z")); // 01:00 on 18 Nov in Dhaka
    expect(dhakaToday()).toBe("2026-11-18");
  });

  it("keeps the same day just before Dhaka midnight", () => {
    vi.setSystemTime(new Date("2026-11-17T17:59:00Z")); // 23:59 on 17 Nov in Dhaka
    expect(dhakaToday()).toBe("2026-11-17");
  });

  it("converts UTC instants to the Dhaka calendar date", () => {
    expect(toDhakaDate(new Date("2026-11-17T18:00:00Z"))).toBe("2026-11-18");
    expect(toDhakaDate("2026-11-17T17:59:59Z")).toBe("2026-11-17");
  });

  it("keeps date-only values on the intended day", () => {
    expect(toDhakaDate("2026-11-17")).toBe("2026-11-17");
  });

  it("compares Dhaka days across the UTC midnight boundary", () => {
    expect(
      isSameDhakaDay("2026-11-17T17:59:00Z", "2026-11-17T18:00:00Z"),
    ).toBe(false);
    expect(
      isSameDhakaDay(
        new Date("2026-11-17T18:00:00Z"),
        "2026-11-18T10:00:00+06:00",
      ),
    ).toBe(true);
  });

  it("treats Friday as the only weekend day by default", () => {
    expect(isWeekend("2026-11-20")).toBe(true); // Friday
    expect(isWeekend("2026-11-19")).toBe(false); // Thursday
    expect(isWeekend("2026-11-21")).toBe(false); // Saturday
  });

  it("uses the Dhaka day of an instant for the weekend check", () => {
    // 2026-11-19T19:00Z is 01:00 on Friday 20 Nov in Dhaka
    expect(isWeekend("2026-11-19T19:00:00Z")).toBe(true);
  });

  it("honours a custom weekend setting", () => {
    expect(isWeekend("2026-11-21", [6, 7])).toBe(true); // Saturday
    expect(isWeekend("2026-11-20", [6, 7])).toBe(false); // Friday
  });

  it("rejects invalid dates", () => {
    expect(() => toDhakaDate("not-a-date")).toThrow("Invalid date");
  });

  it("builds Dhaka day bounds as UTC instants", () => {
    expect(dhakaDayStartUtc("2026-11-17").toISOString()).toBe(
      "2026-11-16T18:00:00.000Z",
    );
    expect(dhakaDayEndUtc("2026-11-17").toISOString()).toBe(
      "2026-11-17T17:59:59.999Z",
    );
  });
});
