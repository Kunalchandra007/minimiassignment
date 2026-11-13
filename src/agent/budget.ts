import type { DateAnchor } from "../types.js";

export const MAX_SEARCHES = 8;
export const MAX_SEARCH_ROUNDS = 3;
export const MAX_MODEL_STEPS = MAX_SEARCH_ROUNDS + 1;

const CHANGE = /\b(changed|changes|change|still correct|shipped|pricing|priced|price)\b/i;

export function isChangeQuestion(text: string): boolean {
  return CHANGE.test(text) || /\bsince\b/i.test(text);
}

/** The day a change-check should search from. Today is a ceiling, not a baseline. */
export function baselineDate(anchors: DateAnchor[]): string | null {
  const pick = (rule: string) => anchors.find((anchor) => anchor.rule === rule && anchor.date)?.date ?? null;
  return (
    pick("since-then") ??
    pick("last-weekday") ??
    pick("bare-weekday") ??
    pick("explicit-date") ??
    pick("iso-date") ??
    pick("yesterday") ??
    null
  );
}
