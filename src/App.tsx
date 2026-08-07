import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import MenuIcon from '@mui/icons-material/Menu';
import type { MapRef } from 'react-map-gl/mapbox';

import ComparePanel from './components/ComparePanel';
import FacilityDetail from './components/FacilityDetail';
import MapView from './components/MapView';
import Sidebar, { type BucketTally } from './components/Sidebar';
import { DEFAULT_VISIBLE } from './lib/status';
import { DEFAULT_VOLTAGE_FLOOR } from './lib/power';
import { buildOperatorGroups } from './lib/operators';
import { operatorColor } from './lib/palette';
import { useFacilities } from './lib/useFacilities';
import type { Bucket, FacilityFeature, FacilityProperties } from './types';

const SIDEBAR_WIDTH = 340;

/** Zoom used when flying to a facility picked from the list. */
const FOCUS_ZOOM = 11;

/** The national view the map opens at, and returns to when filters are cleared. */
const HOME_VIEW = { center: [-98.5, 39.5] as [number, number], zoom: 3.6 };

export default function App() {
  const state = useFacilities();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const mapRef = useRef<MapRef | null>(null);
  const hadStateFilter = useRef(false);

  const [visible, setVisible] = useState<Bucket[]>(DEFAULT_VISIBLE);
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [selected, setSelected] = useState<FacilityProperties | null>(null);
  // Selection (the ring on the map) is separate from the detail drawer. Picking
  // from the list highlights and flies without opening the panel; only a map
  // click opens it.
  const [detailOpen, setDetailOpen] = useState(false);
  // Hover is shared: the sidebar list and the map both write it, both read it.
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [compareOn, setCompareOn] = useState(false);
  const [compareKeys, setCompareKeys] = useState<string[]>([]);
  const [mergeVariants, setMergeVariants] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [powerOn, setPowerOn] = useState(false);
  const [voltageFloor, setVoltageFloor] = useState(DEFAULT_VOLTAGE_FLOOR);
  const [imagery, setImagery] = useState(false);

  const toggleBucket = useCallback((bucket: Bucket) => {
    setVisible((prev) =>
      prev.includes(bucket) ? prev.filter((b) => b !== bucket) : [...prev, bucket],
    );
  }, []);

  const allFeatures = useMemo(
    () => (state.status === 'ready' ? state.data.features : []),
    [state],
  );

  // Operator groups are built from the whole dataset, not the current filters,
  // so the compare picker always offers every operator and the totals shown are
  // an operator's full footprint rather than whatever happens to be filtered in.
  const operatorGroups = useMemo(
    () => buildOperatorGroups(allFeatures, mergeVariants),
    [allFeatures, mergeVariants],
  );

  // Raw operator string -> group key, for filtering the map by selected groups.
  const groupKeyByOperator = useMemo(() => {
    const map = new Map<string, string>();
    for (const group of operatorGroups) {
      for (const variant of group.variants) map.set(variant, group.key);
    }
    return map;
  }, [operatorGroups]);

  const compareFilterActive = compareOn && compareKeys.length > 0;

  /**
   * Colour per compared operator, assigned by position in the selection so
   * operator 1 is always colour 1. Shared by the map halo, the chart underline
   * and the chips, which is what lets you read a dot back to a bar.
   */
  const operatorHalos = useMemo(() => {
    if (!compareOn) return [];
    return compareKeys
      .map((key, index) => {
        const group = operatorGroups.find((g) => g.key === key);
        return group ? { variants: group.variants, color: operatorColor(index) } : null;
      })
      .filter((h): h is { variants: string[]; color: string } => h !== null);
  }, [compareOn, compareKeys, operatorGroups]);

  /** Raw operator string -> colour, for tinting the sidebar list rows. */
  const colorByOperator = useMemo(() => {
    const map = new Map<string, string>();
    for (const halo of operatorHalos) {
      for (const variant of halo.variants) map.set(variant, halo.color);
    }
    return map;
  }, [operatorHalos]);

  // Tallies are computed over the state/search filter but ignore the status
  // toggles, so each checkbox always shows what turning it on would add.
  const scoped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const keys = new Set(compareKeys);
    return allFeatures.filter((f) => {
      const p = f.properties;
      if (stateFilter && p.state !== stateFilter) return false;
      if (compareFilterActive) {
        const key = p.operator ? groupKeyByOperator.get(p.operator) : undefined;
        if (!key || !keys.has(key)) return false;
      }
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.operator?.toLowerCase().includes(q) ?? false) ||
        (p.city?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [allFeatures, search, stateFilter, compareFilterActive, compareKeys, groupKeyByOperator]);

  const tallies = useMemo(() => {
    const acc = {} as Record<Bucket, BucketTally>;
    for (const f of scoped) {
      const b = f.properties.bucket;
      if (!acc[b]) acc[b] = { count: 0, mw: 0 };
      acc[b].count += 1;
      acc[b].mw += f.properties.capacityMw ?? 0;
    }
    return acc;
  }, [scoped]);

  const filtered = useMemo(
    () => scoped.filter((f) => visible.includes(f.properties.bucket)),
    [scoped, visible],
  );

  // Biggest projects first — on a buildout map that is the natural reading
  // order, and it puts the sites people are looking for at the top.
  const listed = useMemo(
    () =>
      [...filtered].sort((a, b) => {
        const diff = (b.properties.capacityMw ?? -1) - (a.properties.capacityMw ?? -1);
        return diff !== 0 ? diff : a.properties.name.localeCompare(b.properties.name);
      }),
    [filtered],
  );

  const visibleMw = useMemo(
    () => filtered.reduce((sum, f) => sum + (f.properties.capacityMw ?? 0), 0),
    [filtered],
  );

  const states = useMemo(() => {
    const set = new Set<string>();
    for (const f of allFeatures) if (f.properties.state) set.add(f.properties.state);
    return [...set].sort();
  }, [allFeatures]);

  // Selecting a state frames that state's facilities. Bounds come from the data
  // rather than a static state bounding box, so the view is tight around where
  // the buildout actually is instead of including empty desert.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!stateFilter) {
      // Only return home if a state was actually cleared. Without this guard the
      // map would yank back to the national view when the data first loads,
      // undoing any panning the user had already done.
      if (hadStateFilter.current) {
        hadStateFilter.current = false;
        map.flyTo({ ...HOME_VIEW, duration: 1200, essential: true });
      }
      return;
    }
    hadStateFilter.current = true;

    const inState = allFeatures.filter((f) => f.properties.state === stateFilter);
    if (inState.length === 0) return;

    let minLon = Infinity;
    let minLat = Infinity;
    let maxLon = -Infinity;
    let maxLat = -Infinity;
    for (const f of inState) {
      const [lon, lat] = f.geometry.coordinates;
      if (lon < minLon) minLon = lon;
      if (lat < minLat) minLat = lat;
      if (lon > maxLon) maxLon = lon;
      if (lat > maxLat) maxLat = lat;
    }

    // A state with one facility — or several at the same site — gives degenerate
    // bounds that fitBounds would zoom to maximum. Fly to the point instead.
    const span = Math.max(maxLon - minLon, maxLat - minLat);
    if (span < 0.05) {
      map.flyTo({ center: [minLon, minLat], zoom: 9, duration: 1200, essential: true });
      return;
    }

    map.fitBounds(
      [
        [minLon, minLat],
        [maxLon, maxLat],
      ],
      { padding: 64, maxZoom: 9, duration: 1200, essential: true },
    );
  }, [stateFilter, allFeatures]);

  const focusFacility = useCallback(
    (feature: FacilityFeature) => {
      // Highlight and fly, but leave the detail drawer shut — it would cover the
      // map the user just asked to be shown.
      setSelected(feature.properties);
      setDetailOpen(false);
      mapRef.current?.flyTo({
        center: feature.geometry.coordinates,
        zoom: Math.max(mapRef.current.getZoom(), FOCUS_ZOOM),
        duration: 1200,
        essential: true,
      });
      if (isMobile) setDrawerOpen(false);
    },
    [isMobile],
  );

  /** Map clicks do open the detail drawer. */
  const selectFromMap = useCallback((facility: FacilityProperties | null) => {
    setSelected(facility);
    setDetailOpen(Boolean(facility));
  }, []);

  /**
   * Group keys differ between merged and unmerged mode, so a naive toggle would
   * orphan the current selection. Carry it across by the underlying raw operator
   * strings: merging QTS keeps QTS selected, splitting it selects each variant.
   */
  const handleMergeVariantsChange = useCallback(
    (merge: boolean) => {
      const selectedRaw = new Set(
        compareKeys.flatMap(
          (key) => operatorGroups.find((g) => g.key === key)?.variants ?? [],
        ),
      );
      const remapped = buildOperatorGroups(allFeatures, merge)
        .filter((g) => g.variants.some((v) => selectedRaw.has(v)))
        .map((g) => g.key);
      setCompareKeys(remapped);
      setMergeVariants(merge);
    },
    [allFeatures, compareKeys, operatorGroups],
  );

  if (state.status === 'loading') {
    return (
      <Box sx={{ height: '100vh', display: 'grid', placeItems: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (state.status === 'error') {
    return (
      <Box sx={{ height: '100vh', display: 'grid', placeItems: 'center', p: 3 }}>
        <Alert severity="warning" sx={{ maxWidth: 520 }}>
          <AlertTitle>No data yet</AlertTitle>
          {state.message}
          <Box component="pre" sx={{ mt: 1.5, mb: 0, fontSize: 13 }}>
            npm run data:refresh
          </Box>
        </Alert>
      </Box>
    );
  }

  const sidebar = (
    <Sidebar
      metadata={state.data.metadata}
      visible={visible}
      onToggle={toggleBucket}
      tallies={tallies}
      states={states}
      stateFilter={stateFilter}
      onStateFilter={setStateFilter}
      search={search}
      onSearch={setSearch}
      visibleMw={visibleMw}
      features={listed}
      selectedId={selected?.id ?? null}
      onSelectFacility={focusFacility}
      hoveredId={hoveredId}
      onHoverFacility={setHoveredId}
      powerOn={powerOn}
      onPowerToggle={setPowerOn}
      voltageFloor={voltageFloor}
      onVoltageFloor={setVoltageFloor}
      imagery={imagery}
      onImageryToggle={setImagery}
      compareOn={compareOn}
      onCompareToggle={setCompareOn}
      compareCount={compareKeys.length}
      colorByOperator={colorByOperator}
    />
  );

  return (
    <Box sx={{ height: '100vh', display: 'flex', overflow: 'hidden' }}>
      {isMobile ? (
        <>
          <IconButton
            onClick={() => setDrawerOpen(true)}
            aria-label="Open facility list and filters"
            sx={{
              position: 'absolute',
              top: 12,
              left: 12,
              zIndex: 5,
              bgcolor: 'background.paper',
              '&:hover': { bgcolor: 'background.paper' },
            }}
          >
            <MenuIcon />
          </IconButton>
          <Drawer
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            slotProps={{ paper: { sx: { width: SIDEBAR_WIDTH } } }}
          >
            {sidebar}
          </Drawer>
        </>
      ) : (
        <Paper
          square
          elevation={0}
          sx={{
            width: SIDEBAR_WIDTH,
            flexShrink: 0,
            borderRight: 1,
            borderColor: 'divider',
            zIndex: 2,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}
        >
          {sidebar}
        </Paper>
      )}

      {/* With compare open the map gives up vertical space to the panel rather
          than overlaying it, so both stay fully usable. */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Box sx={{ flex: 1, position: 'relative', minHeight: 0 }}>
          <MapView
            features={filtered}
            selectedId={selected?.id ?? null}
            onSelect={selectFromMap}
            mapRef={mapRef}
            powerOn={powerOn}
            voltageFloor={voltageFloor}
            hoveredId={hoveredId}
            onHover={setHoveredId}
            imagery={imagery}
            operatorHalos={operatorHalos}
          />
        </Box>

        {compareOn && (
          <Paper
            square
            elevation={0}
            sx={{
              height: { xs: 340, md: 400 },
              flexShrink: 0,
              borderTop: 1,
              borderColor: 'divider',
              display: 'flex',
              minHeight: 0,
            }}
          >
            <ComparePanel
              options={operatorGroups}
              selectedKeys={compareKeys}
              onChange={setCompareKeys}
              mergeVariants={mergeVariants}
              onMergeVariantsChange={handleMergeVariantsChange}
            />
          </Paper>
        )}
      </Box>

      <FacilityDetail
        facility={detailOpen ? selected : null}
        onClose={() => setDetailOpen(false)}
      />
    </Box>
  );
}
