// lib/hardwareSignals.ts
//
// Battery signal for the "hardware-aware fallback" hint (see the VRAM
// pressure section of lib/ollama.ts for the other half of this feature).
// This is intentionally a bonus signal, never a hard dependency: the
// Battery Status API (navigator.getBattery) is NOT Baseline — per MDN,
// Firefox removed it and Safari never implemented it, both citing
// fingerprinting/privacy concerns, so it only ever resolves on
// Chrome/Edge/Android Chrome. Feature-detected below; every other browser
// gets `null` here, not an error, and the hint that uses this falls back
// to the VRAM signal alone.

export interface BatterySignal {
  level: number; // 0..1
  charging: boolean;
}

export async function getBatterySignal(): Promise<BatterySignal | null> {
  if (typeof navigator === "undefined") return null;

  const getBattery = (navigator as Navigator & { getBattery?: () => Promise<any> }).getBattery;
  if (typeof getBattery !== "function") return null; // Firefox/Safari/older browsers — expected, not an error

  try {
    const battery = await getBattery.call(navigator);
    return { level: battery.level, charging: battery.charging };
  } catch {
    // Blocked by a Permissions-Policy directive, insecure (non-HTTPS)
    // context, or any other reason the browser refuses the promise.
    return null;
  }
}

// Below this level, and only while unplugged, battery is treated as a
// contributing reason to suggest a lighter/cloud model — chosen loosely as
// "commonly-understood low battery", not derived from measurement the way
// the VRAM threshold at least partly is.
const LOW_BATTERY_THRESHOLD = 0.2;

/** Pure — unit-testable without touching navigator at all. */
export function isBatteryConstrained(signal: BatterySignal | null): boolean {
  if (!signal) return false;
  return !signal.charging && signal.level < LOW_BATTERY_THRESHOLD;
}
