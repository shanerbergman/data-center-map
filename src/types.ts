export type Bucket = 'operational' | 'under_construction' | 'planned' | 'cancelled';

export type RawStatus =
  | 'operational'
  | 'under_construction'
  | 'proposed'
  | 'permitted'
  | 'cancelled';

export interface FacilitySource {
  url: string;
  label: string;
  publisher?: string;
  retrievedAt?: string;
  kind?: string;
}

export interface StatusHistoryEntry {
  status: RawStatus;
  date?: string;
  note?: string;
}

/** Flat property bag as written by scripts/refresh-data.mjs. */
export interface FacilityProperties {
  id: string;
  name: string;
  operator: string | null;
  bucket: Bucket;
  rawStatus: RawStatus;
  confidence: 'confirmed' | 'reported' | 'rumored' | null;
  aiClassification: 'confirmed' | 'likely' | 'mixed_use' | null;
  facilityType: string;
  city: string | null;
  county: string | null;
  state: string | null;
  locationPrecision: string | null;
  capacityMw: number | null;
  capacityPlannedMw: number | null;
  capacityOperationalMw: number | null;
  utility: string | null;
  poweredBy: string | null;
  communityStatus: string | null;
  notes: string | null;
  lastUpdated: string | null;
  sourcesJson: string;
  statusHistoryJson: string;
}

export interface FacilityFeature {
  type: 'Feature';
  id: string;
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: FacilityProperties;
}

export interface DatasetMetadata {
  asOf: string;
  /** Hash of the features alone, so an unchanged dataset is a no-op refresh. */
  contentHash: string;
  source: string;
  attribution: string;
  license: string;
  includesCryptoMining: boolean;
  count: number;
  countByBucket: Partial<Record<Bucket, number>>;
  disclosedCapacityMwByBucket: Partial<Record<Bucket, number>>;
}

export interface FacilityCollection {
  type: 'FeatureCollection';
  metadata: DatasetMetadata;
  features: FacilityFeature[];
}
