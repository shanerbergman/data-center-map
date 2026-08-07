import { useEffect, useState } from 'react';
import type { FacilityCollection } from '../types';

type State =
  | { status: 'loading' }
  | { status: 'ready'; data: FacilityCollection }
  | { status: 'error'; message: string };

const DATA_URL = `${import.meta.env.BASE_URL}data/facilities.geojson`;

const MISSING_SNAPSHOT =
  'No data snapshot found at public/data/facilities.geojson. Run the refresh script to download one:';

/**
 * Loads the static snapshot written by `npm run data:refresh`. There is no
 * backend — this fetch hits a file served from /public.
 */
export function useFacilities(): State {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    fetch(DATA_URL)
      .then(async (res) => {
        if (res.status === 404) throw new Error(MISSING_SNAPSHOT);
        if (!res.ok) throw new Error(`Failed to load data (HTTP ${res.status}).`);

        // The Vite dev server answers unknown paths with index.html and a 200,
        // so a missing snapshot arrives as HTML rather than as a 404. Detect
        // that explicitly instead of letting JSON.parse produce a cryptic error.
        const text = await res.text();
        if (text.trimStart().startsWith('<')) throw new Error(MISSING_SNAPSHOT);

        try {
          return JSON.parse(text) as FacilityCollection;
        } catch {
          throw new Error('The data snapshot is not valid JSON. Re-run the refresh script:');
        }
      })
      .then((data) => {
        if (cancelled) return;
        if (!data?.features?.length) {
          throw new Error('The data snapshot is empty. Re-run the refresh script:');
        }
        setState({ status: 'ready', data });
      })
      .catch((err: Error) => {
        if (!cancelled) setState({ status: 'error', message: err.message });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
