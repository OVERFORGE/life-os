import { DEFAULT_SYSTEM_SETTINGS } from "./defaultSystemSettings";

function deepMerge(base: any, next: any): any {
  if (!next) return base;
  if (typeof base !== "object" || typeof next !== "object") return next;

  const out = { ...base };
  for (const k of Object.keys(next)) {
    out[k] =
      k in base ? deepMerge(base[k], next[k]) : next[k];
  }
  return out;
}

export function getEffectiveSettings({
  learned,
  overrides,
}: {
  learned?: any;
  overrides?: any;
}) {
  return deepMerge(
    deepMerge(DEFAULT_SYSTEM_SETTINGS, learned),
    overrides
  );
}
