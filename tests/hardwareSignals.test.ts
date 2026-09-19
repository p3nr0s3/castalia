import { describe, it, expect, vi, afterEach } from "vitest";
import { getBatterySignal, isBatteryConstrained, BatterySignal } from "../lib/hardwareSignals";

describe("isBatteryConstrained", () => {
  it("is false when there's no signal at all (e.g. unsupported browser)", () => {
    expect(isBatteryConstrained(null)).toBe(false);
  });

  it("is false when charging, even at a very low level — a plugged-in laptop isn't hardware-constrained", () => {
    const signal: BatterySignal = { level: 0.05, charging: true };
    expect(isBatteryConstrained(signal)).toBe(false);
  });

  it("is false when unplugged but comfortably charged", () => {
    const signal: BatterySignal = { level: 0.8, charging: false };
    expect(isBatteryConstrained(signal)).toBe(false);
  });

  it("is true when unplugged and below the low-battery threshold", () => {
    const signal: BatterySignal = { level: 0.15, charging: false };
    expect(isBatteryConstrained(signal)).toBe(true);
  });

  it("treats the threshold boundary consistently (not constrained exactly at 20%)", () => {
    const signal: BatterySignal = { level: 0.2, charging: false };
    expect(isBatteryConstrained(signal)).toBe(false);
  });
});

describe("getBatterySignal", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null when navigator.getBattery doesn't exist (Firefox, Safari — expected, not an error)", async () => {
    vi.stubGlobal("navigator", {});
    const signal = await getBatterySignal();
    expect(signal).toBeNull();
  });

  it("returns level/charging when the Battery Status API is available (Chrome/Edge)", async () => {
    vi.stubGlobal("navigator", {
      getBattery: vi.fn().mockResolvedValue({ level: 0.42, charging: true }),
    });
    const signal = await getBatterySignal();
    expect(signal).toEqual({ level: 0.42, charging: true });
  });

  it("returns null (not a throw) when the browser refuses the promise (Permissions-Policy, insecure context)", async () => {
    vi.stubGlobal("navigator", {
      getBattery: vi.fn().mockRejectedValue(new Error("blocked by permissions policy")),
    });
    const signal = await getBatterySignal();
    expect(signal).toBeNull();
  });
});
