import type { Bucket, FacilityFeature } from '../types';
import { BUCKETS } from './status';

export interface BucketTotals {
  count: number;
  mw: number;
}

export interface OperatorGroup {
  /** Stable identity for selection state. */
  key: string;
  /** Name shown in the UI — the shortest clean variant. */
  label: string;
  /** Every raw `operator` string folded into this group. */
  variants: string[];
  facilityCount: number;
  /** Facilities in this group that disclose no capacity figure at all. */
  undisclosedCount: number;
  byBucket: Record<Bucket, BucketTotals>;
  totalMw: number;
}

/**
 * Reduces a raw `operator` string to a comparison key.
 *
 * Compute Atlas records operators as free text, and the same company appears
 * under several spellings — "QTS", "QTS Data Centers", "QTS (Blackstone)". Left
 * alone, comparing QTS would show 10 facilities when it actually runs 25.
 *
 * Deliberately conservative: it drops parenthetical asides and legal suffixes,
 * but does not strip generic words like "Digital" or "Technologies", because
 * that risks colliding genuinely different companies ("Digital Realty" would
 * reduce to "realty"). Remaining variants are folded by the prefix pass below.
 */
export function normalizeOperator(raw: string): string {
  return raw
    .replace(/\([^)]*\)/g, ' ') // parenthetical asides: "(Blackstone)", "(via X)"
    .split(/\s*[;/,]\s*|\s+\+\s+|\s+with\s+/i)[0] // joint ventures: lead party only
    .replace(/\b(l\.?l\.?c\.?|inc\.?|corp\.?|corporation|ltd\.?|l\.?p\.?|plc|holdings)\b/gi, ' ')
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * The same trimming as `normalizeOperator` but preserving original casing, so a
 * merged group can show "OpenAI" rather than "OpenAI / Oracle / Crusoe" or a
 * title-cased key like "Openai".
 */
function displayName(raw: string): string {
  const trimmed = raw
    .replace(/\([^)]*\)/g, ' ')
    .split(/\s*[;/,]\s*|\s+\+\s+|\s+with\s+/i)[0]
    .replace(/\s+/g, ' ')
    .trim();
  return trimmed || raw;
}

/**
 * Folds "qts data centers" into "qts" when one key extends another at a token
 * boundary. Token boundary matters: without it "core" would swallow "coreweave".
 */
function rootKey(key: string, allKeys: Set<string>): string {
  const tokens = key.split(' ');
  for (let i = 1; i < tokens.length; i++) {
    const candidate = tokens.slice(0, i).join(' ');
    if (allKeys.has(candidate)) return candidate;
  }
  return key;
}

const EMPTY_BUCKETS = (): Record<Bucket, BucketTotals> =>
  Object.fromEntries(BUCKETS.map((b) => [b.id, { count: 0, mw: 0 }])) as Record<
    Bucket,
    BucketTotals
  >;

/**
 * Aggregates facilities by operator.
 *
 * `merge` folds name variants together. Turning it off compares the raw strings
 * exactly as the source records them — truer to the data, but it splits
 * companies across several entries.
 */
export function buildOperatorGroups(
  features: FacilityFeature[],
  merge: boolean,
): OperatorGroup[] {
  // Raw string -> facilities, so a group can report which variants it folded.
  const byRaw = new Map<string, FacilityFeature[]>();
  for (const f of features) {
    const raw = f.properties.operator?.trim();
    if (!raw) continue;
    const list = byRaw.get(raw);
    if (list) list.push(f);
    else byRaw.set(raw, [f]);
  }

  const keyForRaw = new Map<string, string>();

  if (merge) {
    for (const raw of byRaw.keys()) keyForRaw.set(raw, normalizeOperator(raw) || raw.toLowerCase());
    const allKeys = new Set(keyForRaw.values());
    for (const [raw, key] of keyForRaw) keyForRaw.set(raw, rootKey(key, allKeys));
  } else {
    for (const raw of byRaw.keys()) keyForRaw.set(raw, raw);
  }

  const groups = new Map<string, OperatorGroup>();

  for (const [raw, facilities] of byRaw) {
    const key = keyForRaw.get(raw)!;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        label: raw,
        variants: [],
        facilityCount: 0,
        undisclosedCount: 0,
        byBucket: EMPTY_BUCKETS(),
        totalMw: 0,
      };
      groups.set(key, group);
    }

    group.variants.push(raw);
    for (const f of facilities) {
      const p = f.properties;
      const totals = group.byBucket[p.bucket];
      if (totals) {
        totals.count += 1;
        totals.mw += p.capacityMw ?? 0;
      }
      group.facilityCount += 1;
      group.totalMw += p.capacityMw ?? 0;
      if (p.capacityMw == null) group.undisclosedCount += 1;
    }
  }

  for (const group of groups.values()) {
    // Shortest variant is the cleanest label: "QTS" over "QTS Data Centers
    // (Blackstone)". Ties broken alphabetically so the label is deterministic.
    group.variants.sort((a, b) => a.length - b.length || a.localeCompare(b));
    // Unmerged mode is meant to show the source strings verbatim, so only tidy
    // the label when variants were actually folded together.
    group.label = merge ? displayName(group.variants[0]) : group.variants[0];
  }

  return [...groups.values()].sort(
    (a, b) => b.totalMw - a.totalMw || b.facilityCount - a.facilityCount,
  );
}
