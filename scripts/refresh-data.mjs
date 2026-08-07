#!/usr/bin/env node
/**
 * refresh-data.mjs — pull the Compute Atlas dataset and write a static GeoJSON
 * snapshot to public/data/facilities.geojson.
 *
 * The app has no backend. This script is the entire data pipeline: run it
 * whenever you want fresh data, commit the resulting snapshot, deploy.
 *
 *   npm run data:refresh                 # data centers only (excludes crypto mining)
 *   npm run data:refresh:crypto          # include crypto mining sites
 *   node scripts/refresh-data.mjs --from ./local.json   # rebuild offline from a file
 *
 * Flags:
 *   --max-age <hours>  Skip entirely if the existing snapshot is younger than this.
 *   --soft             Never fail. On error, keep whatever snapshot already exists.
 *
 * `npm run dev` and `npm run build` invoke this with `--max-age 12 --soft`, so the
 * data stays current on its own and a network failure can never stop the app from
 * starting with the data it already has.
 *
 * Data: Compute Atlas (https://www.compute-atlas.com), CC BY 4.0.
 */

import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'public', 'data');
const OUT_FILE = join(OUT_DIR, 'facilities.geojson');

const API_URL = 'https://www.compute-atlas.com/api/facilities';
// Fallback: the CC-BY snapshot published in the project's GitHub repo. Used only
// if the live API is unreachable, so a refresh degrades rather than fails.
const FALLBACK_URL =
  'https://cdn.jsdelivr.net/gh/ek33450505/compute-atlas@main/data/facilities.json';

const INCLUDE_CRYPTO = process.argv.includes('--include-crypto');

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : null;
}

/** `--from <path>` rebuilds from a local JSON file instead of the network. */
const FROM_FILE = argValue('--from');

/** `--soft` downgrades any failure to a warning, preserving the existing snapshot. */
const SOFT = process.argv.includes('--soft');

/** `--max-age <hours>` skips the refresh entirely if the snapshot is still fresh. */
const MAX_AGE_HOURS = (() => {
  const raw = argValue('--max-age');
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
})();

/**
 * Compute Atlas uses five statuses. We collapse `proposed` and `permitted`
 * into a single "planned" bucket — both mean announced-but-not-yet-building,
 * and the permitted/unpermitted distinction is preserved in `rawStatus`.
 */
const BUCKET_BY_STATUS = {
  operational: 'operational',
  under_construction: 'under_construction',
  proposed: 'planned',
  permitted: 'planned',
  cancelled: 'cancelled',
};

async function fetchJson(url, label) {
  const res = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': 'data-center-map/0.1' },
  });
  if (!res.ok) throw new Error(`${label} responded ${res.status} ${res.statusText}`);
  return res.json();
}

async function loadFacilities() {
  if (FROM_FILE) {
    const body = JSON.parse(await readFile(FROM_FILE, 'utf8'));
    const facilities = Array.isArray(body) ? body : body.facilities;
    if (!Array.isArray(facilities)) throw new Error(`${FROM_FILE}: unexpected shape`);
    console.log(`Reading ${FROM_FILE} … ok (${facilities.length} records)`);
    return { facilities, source: `file://${FROM_FILE}` };
  }

  try {
    process.stdout.write(`Fetching ${API_URL} … `);
    const body = await fetchJson(API_URL, 'Compute Atlas API');
    const facilities = Array.isArray(body) ? body : body.facilities;
    if (!Array.isArray(facilities)) throw new Error('unexpected response shape');
    console.log(`ok (${facilities.length} records)`);
    return { facilities, source: API_URL };
  } catch (err) {
    console.log('failed');
    console.warn(`  ! ${err.message}`);
    console.warn(`  → falling back to the GitHub snapshot`);
    const facilities = await fetchJson(FALLBACK_URL, 'GitHub snapshot');
    console.log(`  ok (${facilities.length} records)`);
    return { facilities, source: FALLBACK_URL };
  }
}

/**
 * The single capacity figure used for circle size and bucket totals.
 *
 * Which of the two figures is the honest headline depends on the bucket. For an
 * operational site, what is built is the story. For anything not yet finished —
 * including phased campuses that already have a first tranche online — the
 * planned figure is the story, and preferring `operational` there would badly
 * understate the pipeline. Both raw values are kept on the feature regardless.
 */
function bestCapacity(capacityMw, bucket) {
  if (!capacityMw) return null;
  const { operational, planned } = capacityMw;
  return bucket === 'operational'
    ? (operational ?? planned ?? null)
    : (planned ?? operational ?? null);
}

function toFeature(f) {
  const lat = f.location?.lat;
  const lon = f.location?.lon;
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;

  const bucket = BUCKET_BY_STATUS[f.status];
  if (!bucket) return null; // unknown status — skip rather than guess

  return {
    type: 'Feature',
    id: f.id,
    geometry: { type: 'Point', coordinates: [lon, lat] },
    properties: {
      id: f.id,
      name: f.name,
      operator: f.operator ?? null,
      bucket,
      rawStatus: f.status,
      confidence: f.confidence ?? null,
      aiClassification: f.aiClassification ?? null,
      facilityType: f.facilityType ?? 'data_center',
      city: f.location?.city ?? null,
      county: f.location?.county ?? null,
      state: f.location?.state ?? null,
      locationPrecision: f.location?.precision ?? null,
      capacityMw: bestCapacity(f.capacityMw, bucket),
      capacityPlannedMw: f.capacityMw?.planned ?? null,
      capacityOperationalMw: f.capacityMw?.operational ?? null,
      utility: f.energy?.utility ?? null,
      poweredBy: f.poweredBy ?? null,
      communityStatus: f.community?.status ?? null,
      notes: f.notes ?? null,
      lastUpdated: f.lastUpdated ?? null,
      // Mapbox GL flattens nested property objects unpredictably, so nested
      // data is carried as a JSON string and parsed on demand in the UI.
      sourcesJson: JSON.stringify(f.sources ?? []),
      statusHistoryJson: JSON.stringify(f.statusHistory ?? []),
    },
  };
}

/** Reads the existing snapshot, or null if there isn't a usable one. */
async function readExistingSnapshot() {
  try {
    return JSON.parse(await readFile(OUT_FILE, 'utf8'));
  } catch {
    return null;
  }
}

async function main() {
  // Freshness check happens before any network call, so a `npm run dev` with a
  // recent snapshot costs nothing and doesn't pester the upstream API.
  if (MAX_AGE_HOURS != null && !FROM_FILE) {
    const existing = await readExistingSnapshot();
    const asOf = existing?.metadata?.asOf ? Date.parse(existing.metadata.asOf) : NaN;
    if (Number.isFinite(asOf)) {
      const ageHours = (Date.now() - asOf) / 3_600_000;
      if (ageHours < MAX_AGE_HOURS) {
        console.log(
          `Snapshot is ${ageHours.toFixed(1)}h old (limit ${MAX_AGE_HOURS}h) — skipping refresh.`,
        );
        return;
      }
    }
  }

  const { facilities, source } = await loadFacilities();

  const kept = [];
  const skipped = { noStatus: 0, noCoords: 0, crypto: 0 };

  for (const f of facilities) {
    if (!INCLUDE_CRYPTO && f.facilityType === 'crypto_mining') {
      skipped.crypto++;
      continue;
    }
    const feature = toFeature(f);
    if (!feature) {
      if (typeof f.location?.lat !== 'number') skipped.noCoords++;
      else skipped.noStatus++;
      continue;
    }
    kept.push(feature);
  }

  const byBucket = {};
  const mwByBucket = {};
  for (const f of kept) {
    const b = f.properties.bucket;
    byBucket[b] = (byBucket[b] ?? 0) + 1;
    mwByBucket[b] = (mwByBucket[b] ?? 0) + (f.properties.capacityMw ?? 0);
  }

  // Hash the features alone, excluding metadata. A daily cron would otherwise
  // rewrite `asOf` on every run and commit a diff even when nothing changed,
  // so an unchanged dataset must be a genuine no-op.
  const contentHash = createHash('sha256').update(JSON.stringify(kept)).digest('hex').slice(0, 16);

  const previous = await readExistingSnapshot();

  if (previous?.metadata?.contentHash === contentHash) {
    console.log('');
    console.log(`No change (${kept.length} facilities, hash ${contentHash}). Snapshot left as-is.`);
    return;
  }

  const collection = {
    type: 'FeatureCollection',
    // Foreign members are legal GeoJSON and let the app show provenance.
    metadata: {
      asOf: new Date().toISOString(),
      contentHash,
      source,
      attribution:
        'Data center data from Compute Atlas by Edward Kubiak, licensed under CC BY 4.0 — https://github.com/ek33450505/compute-atlas',
      license: 'CC-BY-4.0',
      includesCryptoMining: INCLUDE_CRYPTO,
      count: kept.length,
      countByBucket: byBucket,
      disclosedCapacityMwByBucket: mwByBucket,
    },
    features: kept,
  };

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(collection), 'utf8');

  console.log('');
  console.log(`Wrote ${kept.length} facilities → public/data/facilities.geojson`);
  for (const [bucket, n] of Object.entries(byBucket).sort((a, b) => b[1] - a[1])) {
    const gw = (mwByBucket[bucket] / 1000).toFixed(1);
    console.log(`  ${bucket.padEnd(20)} ${String(n).padStart(4)} sites   ${gw.padStart(7)} GW disclosed`);
  }
  const skippedTotal = skipped.crypto + skipped.noCoords + skipped.noStatus;
  if (skippedTotal > 0) {
    console.log(
      `  skipped: ${skipped.crypto} crypto, ${skipped.noCoords} without coordinates, ${skipped.noStatus} with unmapped status`,
    );
  }
}

main().catch((err) => {
  // Under `--soft` a refresh failure must never stop the app from starting. If a
  // snapshot already exists it is left untouched and the app opens with it —
  // slightly stale data beats no data.
  if (SOFT) {
    console.warn(`\nRefresh failed: ${err.message}`);
    console.warn(
      existsSync(OUT_FILE)
        ? 'Keeping the existing snapshot — the app will start with the data it already has.'
        : 'No existing snapshot to fall back on. Run `npm run data:refresh` once you have a connection.',
    );
    process.exit(0);
  }

  console.error('\nRefresh failed:', err.message);
  process.exit(1);
});
