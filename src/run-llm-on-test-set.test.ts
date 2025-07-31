import { describe, expect, it } from "vitest";

import {
  BASE_MODEL_PRICING,
  SUFFIXED_MODEL_PRICING,
  calculateCost,
} from "./run-llm-on-test-set.js";

describe("JavaScript arithmetic behavior", () => {
  it("should use floating-point division", () => {
    expect(5 / 2).toBe(2.5);
  });

  it("should handle decimal multiplication and division", () => {
    expect((1000 * 2.5) / 1_000_000).toBe(0.0025);
  });

  it("should round very small numbers to 0", () => {
    expect(Math.round(0.0025 * 100) / 100).toBe(0);
  });
});

describe("pricing structure", () => {
  it("should have suffixed models in SUFFIXED_MODEL_PRICING", () => {
    expect(SUFFIXED_MODEL_PRICING.has("gpt-4o-mini")).toBe(true);
    expect(SUFFIXED_MODEL_PRICING.has("gpt-4.1-mini")).toBe(true);
    expect(SUFFIXED_MODEL_PRICING.has("gpt-4.1-nano")).toBe(true);
    expect(SUFFIXED_MODEL_PRICING.has("gpt-4-turbo")).toBe(true);
    expect(SUFFIXED_MODEL_PRICING.has("o4-mini")).toBe(true);
  });

  it("should have base models in BASE_MODEL_PRICING", () => {
    expect(BASE_MODEL_PRICING.has("gpt-4o")).toBe(true);
    expect(BASE_MODEL_PRICING.has("gpt-4.1")).toBe(true);
    expect(BASE_MODEL_PRICING.has("gpt-4")).toBe(true);
    expect(BASE_MODEL_PRICING.has("o3")).toBe(true);
  });

  it("should not have overlapping models between sets", () => {
    const suffixedKeys = Array.from(SUFFIXED_MODEL_PRICING.keys());
    const baseKeys = Array.from(BASE_MODEL_PRICING.keys());

    for (const suffixedKey of suffixedKeys) {
      expect(baseKeys).not.toContain(suffixedKey);
    }
  });
});

describe("calculateCost function", () => {
  it("should calculate GPT-4o cost correctly", () => {
    const result = calculateCost("gpt-4o-2024-11-20", 1000, 500);
    // (1000 * 2.5 + 500 * 10.0) / 1,000,000 = 0.0075 -> rounds to 0.01
    expect(result).toBe(0.01);
  });

  it("should calculate GPT-4o-mini cost correctly", () => {
    const result = calculateCost("gpt-4o-mini-2024-07-18", 2000, 300);
    // (2000 * 0.15 + 300 * 0.6) / 1,000,000 = 0.00048 -> rounds to 0.00
    const expected = Math.round(((2000 * 0.15 + 300 * 0.6) / 1_000_000) * 100) / 100;
    expect(result).toBe(expected);
  });

  it("should calculate O3 cost correctly (reasoning tokens not included in cost)", () => {
    const result = calculateCost("o3-2025-04-16", 500, 800, 1500);
    // Only input and output tokens are charged: (500 * 2.0 + 800 * 8.0) / 1,000,000 = 0.0074 -> rounds to 0.01
    const expected = Math.round(((500 * 2.0 + 800 * 8.0) / 1_000_000) * 100) / 100;
    expect(result).toBe(expected);
  });

  it("should return 0 for unknown models", () => {
    const result = calculateCost("unknown-model", 1000, 500);
    expect(result).toBe(0);
  });

  it("should handle very small costs", () => {
    const result = calculateCost("gpt-4o-mini", 10, 5);
    // (10 * 0.15 + 5 * 0.6) / 1,000,000 = 0.0000045 -> rounds to 0.00
    expect(result).toBe(0.0);
  });

  it("should calculate larger costs correctly", () => {
    const result = calculateCost("gpt-4", 10000, 5000);
    // (10000 * 30.0 + 5000 * 60.0) / 1,000,000 = 0.6
    expect(result).toBe(0.6);
  });

  it("should match model prefixes correctly", () => {
    const result = calculateCost("gpt-4o-mini-some-long-snapshot-name", 1000, 100);
    // Should match 'gpt-4o-mini' prefix
    // (1000 * 0.15 + 100 * 0.6) / 1,000,000 = 0.00021 -> rounds to 0.00
    expect(result).toBe(0.0);
  });

  it("should prioritize suffixed models over base models", () => {
    // gpt-4o-mini should match suffixed pricing, not base gpt-4o pricing
    const miniResult = calculateCost("gpt-4o-mini-test", 1000, 1000);
    const regularResult = calculateCost("gpt-4o-test", 1000, 1000);

    // Different pricing should produce different results
    expect(miniResult).not.toBe(regularResult);

    // Verify the specific calculations using actual pricing from maps
    const miniPricing = SUFFIXED_MODEL_PRICING.get("gpt-4o-mini")!;
    const regularPricing = BASE_MODEL_PRICING.get("gpt-4o")!;

    expect(miniResult).toBe(
      Math.round(
        ((1000 * miniPricing.input + 1000 * miniPricing.output) / 1_000_000) * 100,
      ) / 100,
    );
    expect(regularResult).toBe(
      Math.round(
        ((1000 * regularPricing.input + 1000 * regularPricing.output) / 1_000_000) * 100,
      ) / 100,
    );
  });

  it("should handle model variants correctly", () => {
    // Test that gpt-4.1-mini doesn't match gpt-4.1
    const miniResult = calculateCost("gpt-4.1-mini-snapshot", 1000, 1000);
    const baseResult = calculateCost("gpt-4.1-snapshot", 1000, 1000);

    expect(miniResult).not.toBe(baseResult);

    // Verify against actual pricing maps
    const miniPricing = SUFFIXED_MODEL_PRICING.get("gpt-4.1-mini")!;
    const basePricing = BASE_MODEL_PRICING.get("gpt-4.1")!;

    expect(miniResult).toBe(
      Math.round(
        ((1000 * miniPricing.input + 1000 * miniPricing.output) / 1_000_000) * 100,
      ) / 100,
    );
    expect(baseResult).toBe(
      Math.round(
        ((1000 * basePricing.input + 1000 * basePricing.output) / 1_000_000) * 100,
      ) / 100,
    );
  });

  it("should not charge for reasoning tokens", () => {
    const withoutReasoning = calculateCost("o3", 500, 800, 0);
    const withReasoning = calculateCost("o3", 500, 800, 1000);

    // Reasoning tokens should not affect cost - both should be the same
    expect(withReasoning).toBe(withoutReasoning);
    expect(withReasoning).toBe(
      Math.round(((500 * 2.0 + 800 * 8.0) / 1_000_000) * 100) / 100,
    );
  });
});
