import { describe, expect, it } from "vitest"
import { formatClock } from "@/lib/format"

describe("formatClock", () => {
  it("shows the clock in Qyzylorda, not the city name alone", () => {
    expect(formatClock(new Date("2026-11-01T11:20:00Z"))).toBe("16:20 · Кызылорда")
  })
})
