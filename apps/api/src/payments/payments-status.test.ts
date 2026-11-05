import { describe, expect, it } from "vitest";
import { canAdvancePaymentStatus } from "./payments.service";

describe("Payment webhook transition safety", () => {
  it("accepts first successful settlement", () => {
    expect(canAdvancePaymentStatus("created", "paid")).toBe(true);
    expect(canAdvancePaymentStatus("pending", "paid")).toBe(true);
    expect(canAdvancePaymentStatus("authorized", "paid")).toBe(true);
  });
  it("never demotes a settled payment because of a delayed failure", () => {
    for (const next of ["created", "pending", "authorized", "failed", "cancelled", "paid"]) {
      expect(canAdvancePaymentStatus("paid", next)).toBe(false);
    }
  });
  it("allows partial and final refunds but not backwards transitions", () => {
    expect(canAdvancePaymentStatus("paid", "partially_refunded")).toBe(true);
    expect(canAdvancePaymentStatus("partially_refunded", "refunded")).toBe(true);
    expect(canAdvancePaymentStatus("partially_refunded", "paid")).toBe(false);
    expect(canAdvancePaymentStatus("refunded", "paid")).toBe(false);
  });
  it("does not resurrect cancelled or failed payments", () => {
    expect(canAdvancePaymentStatus("cancelled", "paid")).toBe(false);
    expect(canAdvancePaymentStatus("failed", "paid")).toBe(false);
    expect(canAdvancePaymentStatus("unknown", "paid")).toBe(false);
  });
});
