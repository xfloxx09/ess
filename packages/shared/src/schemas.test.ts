import { describe, expect, it } from "vitest";
import {
  antragCreateSchema,
  calendarBookingSchema,
  loginSchema,
  salesEntrySchema,
  shiftCellUpsertSchema,
  userCreateSchema,
} from "./schemas";

describe("loginSchema", () => {
  it("accepts a valid login", () => {
    expect(loginSchema.parse({ email: "user@example.com", password: "secret123" })).toBeTruthy();
  });
  it("rejects short password", () => {
    expect(() => loginSchema.parse({ email: "user@example.com", password: "abc" })).toThrow();
  });
  it("rejects malformed email", () => {
    expect(() => loginSchema.parse({ email: "not-an-email", password: "secret123" })).toThrow();
  });
});

describe("salesEntrySchema", () => {
  it("requires positive quantity", () => {
    expect(() =>
      salesEntrySchema.parse({ projectId: "p", productId: "x", quantity: 0, callDate: "2024-04-01" }),
    ).toThrow();
  });
  it("accepts a minimal entry", () => {
    const parsed = salesEntrySchema.parse({ projectId: "p", productId: "x", quantity: 1, callDate: "2024-04-01" });
    expect(parsed.quantity).toBe(1);
  });
});

describe("calendarBookingSchema", () => {
  it("rejects more than 2 blocks", () => {
    expect(() =>
      calendarBookingSchema.parse({
        date: "2024-04-01",
        bookingTypeId: "bt",
        blocks: [
          { start: "08:00", end: "12:00" },
          { start: "13:00", end: "17:00" },
          { start: "17:00", end: "18:00" },
        ],
      }),
    ).toThrow();
  });
});

describe("shiftCellUpsertSchema", () => {
  it("clamps slot index to 0..95", () => {
    expect(() =>
      shiftCellUpsertSchema.parse({
        agentId: "a",
        date: "2024-04-01",
        slotIndex: 96,
        controllerCode: "A",
        rawCode: "A",
      }),
    ).toThrow();
  });
});

describe("antragCreateSchema", () => {
  it("requires a known type", () => {
    expect(() =>
      antragCreateSchema.parse({ agentId: "a", date: "2024-04-01", fromSlot: 1, toSlot: 2, type: "OTHER" }),
    ).toThrow();
  });
});

describe("userCreateSchema", () => {
  it("rejects short password", () => {
    expect(() =>
      userCreateSchema.parse({
        email: "x@y.com",
        fullName: "X",
        role: "AGENT",
        password: "short",
      }),
    ).toThrow();
  });
});
