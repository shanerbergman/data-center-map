import type { Bucket } from '../types';

export interface BucketConfig {
  id: Bucket;
  label: string;
  /** Hex, because Mapbox GL paint expressions cannot read CSS variables. */
  color: string;
  description: string;
  /** Cancelled projects are noise on a buildout map, so they start hidden. */
  defaultVisible: boolean;
}

export const BUCKETS: BucketConfig[] = [
  {
    id: 'operational',
    label: 'Operational',
    color: '#4ade80',
    description: 'Built and running',
    defaultVisible: true,
  },
  {
    id: 'under_construction',
    label: 'Under construction',
    color: '#fbbf24',
    description: 'Ground broken, not yet online',
    defaultVisible: true,
  },
  {
    id: 'planned',
    label: 'Planned',
    color: '#60a5fa',
    description: 'Proposed or permitted, not yet building',
    defaultVisible: true,
  },
  {
    id: 'cancelled',
    label: 'Cancelled',
    color: '#94a3b8',
    description: 'Announced then abandoned',
    defaultVisible: false,
  },
];

export const BUCKET_BY_ID = Object.fromEntries(BUCKETS.map((b) => [b.id, b])) as Record<
  Bucket,
  BucketConfig
>;

export const DEFAULT_VISIBLE: Bucket[] = BUCKETS.filter((b) => b.defaultVisible).map((b) => b.id);

/** Human labels for the underlying Compute Atlas status values. */
export const RAW_STATUS_LABEL: Record<string, string> = {
  operational: 'Operational',
  under_construction: 'Under construction',
  proposed: 'Proposed',
  permitted: 'Permitted',
  cancelled: 'Cancelled',
};

export const CONFIDENCE_LABEL: Record<string, string> = {
  confirmed: 'Confirmed',
  reported: 'Reported',
  rumored: 'Rumored',
};

export function formatCapacity(mw: number | null | undefined): string {
  if (mw == null) return 'Not disclosed';
  if (mw >= 1000) return `${(mw / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })} GW`;
  return `${mw.toLocaleString(undefined, { maximumFractionDigits: 1 })} MW`;
}
