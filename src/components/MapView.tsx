import { Fragment, useCallback, useEffect, useMemo, useState, type RefObject } from 'react';
import Map, {
  Layer,
  NavigationControl,
  Popup,
  ScaleControl,
  Source,
} from 'react-map-gl/mapbox';
// Layer types are the style-spec names, not the `CircleLayer` aliases shown in
// the react-map-gl docs — those belong to a different major version and are not
// exported by v8. `ExpressionSpecification` comes straight from mapbox-gl,
// which react-map-gl does not re-export.
import type {
  CircleLayerSpecification,
  MapMouseEvent,
  MapRef,
  RasterLayerSpecification,
} from 'react-map-gl/mapbox';
import type { ExpressionSpecification } from 'mapbox-gl';

import PowerLayers from './PowerLayers';
import { BUCKETS, BUCKET_BY_ID, RAW_STATUS_LABEL, formatCapacity } from '../lib/status';
import { POWER_LAYER_IDS, describePowerAsset } from '../lib/power';
import type { FacilityFeature, FacilityProperties } from '../types';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

const INITIAL_VIEW = { longitude: -98.5, latitude: 39.5, zoom: 3.6 };

/**
 * Radius scales with the square root of capacity, so circle *area* tracks
 * megawatts rather than radius doing so — otherwise a 10 GW campus would swamp
 * the map. Capped so the handful of gigawatt-scale sites stay legible, and
 * floored so capacity-undisclosed sites are still clickable.
 */
function capacityRadius(scale: number, offset: number, floor: number): ExpressionSpecification {
  return [
    '+',
    offset,
    [
      'max',
      floor * scale,
      [
        'min',
        30 * scale,
        ['+', 3.5 * scale, ['*', 0.34 * scale, ['sqrt', ['coalesce', ['get', 'capacityMw'], 0]]]],
      ],
    ],
  ];
}

/**
 * Radius as a function of zoom, with an optional constant offset for the rings
 * drawn around a dot.
 *
 * The offset is applied *inside* each interpolate output rather than wrapping
 * the whole expression. Mapbox permits `["zoom"]` only as the direct input to a
 * top-level `step` or `interpolate`, so `['+', <zoom interpolate>, 6]` is
 * invalid and makes the entire layer fail to load — silently, as far as the map
 * is concerned. That mistake is why the halo layers rendered nothing.
 */
function radiusByZoom(offset = 0, floor = 0): ExpressionSpecification {
  return [
    'interpolate',
    ['linear'],
    ['zoom'],
    3,
    capacityRadius(0.75, offset, floor),
    6,
    capacityRadius(1.1, offset, floor),
    10,
    capacityRadius(1.8, offset, floor),
  ];
}

/**
 * Minimum dot radius while comparing. A large share of facilities disclose no
 * capacity and would otherwise render at ~3px, where no colour is legible. The
 * floor scales with zoom so it doesn't clutter the national view.
 */
const COMPARE_RADIUS_FLOOR = 7;

// `match` takes alternating (label, value) pairs then a fallback. Built from
// BUCKETS so the legend and the map can never disagree about a colour.
const COLOR_BY_BUCKET = [
  'match',
  ['get', 'bucket'],
  ...BUCKETS.flatMap((b) => [b.id, b.color]),
  '#94a3b8',
] as unknown as ExpressionSpecification;

const DEFAULT_RADIUS = radiusByZoom();

const satelliteLayer: RasterLayerSpecification = {
  id: 'satellite',
  type: 'raster',
  source: 'satellite',
  paint: {
    'raster-opacity': 1,
    // Imagery is much brighter than the dark basemap. Knocking the highlights
    // down keeps the status dots and grid lines readable on top of it.
    'raster-brightness-max': 0.88,
    'raster-saturation': -0.15,
  },
};

/**
 * The parts of a queried map feature this component reads.
 *
 * mapbox-gl types `MapMouseEvent.features` as `GeoJSONFeature[]`, which extends
 * `GeoJSON.Feature` — but mapbox-gl neither depends on nor references
 * `@types/geojson`, so that namespace resolves to nothing and the inherited
 * `properties`, `geometry` and `id` are invisible to consumers. `skipLibCheck`
 * hides the underlying error inside the library and surfaces it here instead.
 *
 * Declaring the handful of fields we actually touch avoids adding a dependency
 * purely to repair another package's types.
 */
interface MapHit {
  layer?: { id?: string };
  properties?: Record<string, unknown> | null;
  geometry?: { coordinates?: [number, number] };
  id?: string | number;
}

/** Features under the cursor, narrowed to the fields this component reads. */
function hitsOf(event: MapMouseEvent): MapHit[] {
  return (event.features ?? []) as unknown as MapHit[];
}

type PopupState =
  | { kind: 'facility'; longitude: number; latitude: number; properties: FacilityProperties }
  | {
      kind: 'power';
      longitude: number;
      latitude: number;
      layerId: string;
      key: string;
      properties: Record<string, unknown>;
    };

interface Props {
  features: FacilityFeature[];
  selectedId: string | null;
  onSelect: (facility: FacilityProperties | null) => void;
  /** Owned by App so the sidebar list can fly the map to a facility. */
  mapRef: RefObject<MapRef | null>;
  powerOn: boolean;
  voltageFloor: number;
  /** Hover is driven by either the map or the list; App holds the single value. */
  hoveredId: string | null;
  onHover: (id: string | null) => void;
  imagery: boolean;
  /** Compared operators, in selection order, with their assigned colour. */
  operatorHalos: Array<{ variants: string[]; color: string }>;
}

export default function MapView({
  features,
  selectedId,
  onSelect,
  mapRef,
  powerOn,
  voltageFloor,
  hoveredId,
  onHover,
  imagery,
  operatorHalos,
}: Props) {
  const [popup, setPopup] = useState<PopupState | null>(null);
  // Id of the first symbol layer in the basemap. The imagery raster is inserted
  // before it so place labels stay legible on top of the photography.
  const [firstSymbolId, setFirstSymbolId] = useState<string | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);

  const geojson = useMemo(
    () => ({ type: 'FeatureCollection' as const, features }),
    [features],
  );

  const interactiveLayerIds = useMemo(
    () => (powerOn ? ['facilities', ...POWER_LAYER_IDS] : ['facilities']),
    [powerOn],
  );

  const handleLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const symbol = map.getStyle()?.layers?.find((l) => l.type === 'symbol');
    setFirstSymbolId(symbol?.id);
    setLoaded(true);
  }, [mapRef]);

  /**
   * Keep the canvas matched to its container.
   *
   * mapbox-gl only listens for *window* resize, so any layout change that
   * resizes the container without resizing the window leaves the canvas at its
   * old dimensions — opening or closing the compare panel is exactly that case,
   * and the map visibly fails to reclaim the space. A ResizeObserver covers
   * every such case rather than patching each one.
   */
  useEffect(() => {
    if (!loaded) return;
    const map = mapRef.current?.getMap();
    if (!map) return;

    let frame = 0;
    const observer = new ResizeObserver(() => {
      // Deferred to the next frame: resizing inside the callback can retrigger
      // the observer and trip the "ResizeObserver loop" warning.
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => map.resize());
    });
    observer.observe(map.getContainer());

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [loaded, mapRef]);

  const comparing = operatorHalos.length > 0;

  /**
   * While comparing, the dot fill carries the operator and the outline carries
   * status — the inverse of the default.
   *
   * Fill is a far larger area than an outline, so it belongs to whichever
   * variable is being asked about. In compare mode the map is already filtered
   * to the selected operators, making "whose is this?" the live question, and
   * status stays fully readable in the chart below. An earlier attempt put the
   * operator in a blurred halo, which lost against both the dark basemap and
   * satellite imagery.
   */
  const operatorFill = useMemo(() => {
    if (!comparing) return null;
    // `match` takes alternating label/output pairs. A raw operator string
    // belongs to exactly one group, so labels are unique as match requires.
    const match: unknown[] = ['match', ['get', 'operator']];
    for (const halo of operatorHalos) {
      for (const variant of halo.variants) match.push(variant, halo.color);
    }
    match.push('#94a3b8');
    return match as unknown as ExpressionSpecification;
  }, [comparing, operatorHalos]);

  const radius = useMemo(
    () => (comparing ? radiusByZoom(0, COMPARE_RADIUS_FLOOR) : DEFAULT_RADIUS),
    [comparing],
  );

  const pointLayer = useMemo<CircleLayerSpecification>(
    () => ({
      id: 'facilities',
      type: 'circle',
      source: 'facilities',
      paint: {
        'circle-color': operatorFill ?? COLOR_BY_BUCKET,
        'circle-opacity': comparing ? 0.95 : 0.72,
        'circle-radius': radius,
        // Mapbox draws the stroke outward from the radius, so in compare mode
        // this reads as a status ring around an operator-coloured dot.
        'circle-stroke-width': comparing ? 2.5 : 1,
        'circle-stroke-color': comparing ? COLOR_BY_BUCKET : '#0b0f14',
        'circle-stroke-opacity': comparing ? 1 : 0.9,
      },
    }),
    [comparing, operatorFill, radius],
  );

  // Stroke-only layers drawn over the dots. Selection is a firm white ring,
  // hover a lighter halo, so the two still read differently when both apply.
  // Declared after `comparing` because both radii depend on it.
  const selectedLayer = useMemo<CircleLayerSpecification>(
    () => ({
      id: 'facility-selected',
      type: 'circle',
      source: 'facilities',
      filter: ['==', ['get', 'id'], selectedId ?? ' '],
      paint: {
        'circle-color': 'rgba(0,0,0,0)',
        // Offset clears the status ring so the two outlines don't overlap.
        'circle-radius': radiusByZoom(comparing ? 3 : 0, comparing ? COMPARE_RADIUS_FLOOR : 0),
        'circle-stroke-width': 2.5,
        'circle-stroke-color': '#ffffff',
      },
    }),
    [selectedId, comparing],
  );

  const hoveredLayer = useMemo<CircleLayerSpecification>(
    () => ({
      id: 'facility-hovered',
      type: 'circle',
      source: 'facilities',
      filter: ['==', ['get', 'id'], hoveredId ?? ' '],
      paint: {
        'circle-color': 'rgba(255,255,255,0.15)',
        'circle-radius': radiusByZoom(comparing ? 6 : 3, comparing ? COMPARE_RADIUS_FLOOR : 0),
        'circle-stroke-width': 1.5,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-opacity': 0.75,
      },
    }),
    [hoveredId, comparing],
  );

  const setCursor = useCallback(
    (cursor: string) => {
      const canvas = mapRef.current?.getMap()?.getCanvas();
      if (canvas) canvas.style.cursor = cursor;
    },
    [mapRef],
  );

  const handleClick = useCallback(
    (event: MapMouseEvent) => {
      // Only facilities are selectable; clicking a power line shouldn't clear
      // the currently open facility.
      const hits = hitsOf(event);
      const facility = hits.find((f) => f.layer?.id === 'facilities');
      if (facility) {
        onSelect(facility.properties as unknown as FacilityProperties);
        return;
      }
      const power = hits.some((f) => f.layer?.id?.startsWith('oim-power'));
      if (!power) onSelect(null);
    },
    [onSelect],
  );

  const handleMouseMove = useCallback(
    (event: MapMouseEvent) => {
      const hits = hitsOf(event);

      // Facilities win any overlap — they're the subject of the map, and a
      // transmission line crossing a campus shouldn't hide the campus.
      const facility = hits.find((f) => f.layer?.id === 'facilities');

      if (facility) {
        setCursor('pointer');
        const properties = facility.properties as unknown as FacilityProperties;
        // mousemove fires continuously; bail unless the target actually changed,
        // otherwise every pixel of movement re-renders the map subtree.
        if (popup?.kind === 'facility' && popup.properties.id === properties.id) return;

        const coordinates = facility.geometry?.coordinates;
        if (!coordinates) return;
        const [longitude, latitude] = coordinates;
        setPopup({ kind: 'facility', longitude, latitude, properties });
        onHover(properties.id);
        return;
      }

      const power = hits.find((f) => f.layer?.id?.startsWith('oim-power'));

      if (power) {
        setCursor('pointer');
        const layerId = power.layer?.id ?? 'oim-power';
        const key = `${layerId}:${power.id ?? power.properties?.name ?? 'x'}`;
        if (popup?.kind === 'power' && popup.key === key) return;

        // Lines are long; there is no single sensible anchor point, so power
        // tooltips sit where the cursor entered the feature.
        setPopup({
          kind: 'power',
          longitude: event.lngLat.lng,
          latitude: event.lngLat.lat,
          layerId,
          key,
          properties: (power.properties ?? {}) as Record<string, unknown>,
        });
        if (hoveredId) onHover(null);
        return;
      }

      setCursor('');
      if (popup) {
        setPopup(null);
        onHover(null);
      }
    },
    [hoveredId, onHover, popup, setCursor],
  );

  const handleMouseLeave = useCallback(() => {
    setCursor('');
    setPopup(null);
    onHover(null);
  }, [onHover, setCursor]);

  if (!MAPBOX_TOKEN) {
    return (
      <div
        style={{
          height: '100%',
          display: 'grid',
          placeItems: 'center',
          color: '#93a1b1',
          padding: 32,
          textAlign: 'center',
          font: '14px/1.6 system-ui, sans-serif',
        }}
      >
        <div>
          <strong style={{ color: '#e6edf3' }}>No Mapbox token found.</strong>
          <br />
          Add <code>VITE_MAPBOX_TOKEN</code> to <code>.env.local</code>, then restart the dev
          server.
        </div>
      </div>
    );
  }

  const facilityHover = popup?.kind === 'facility' ? popup.properties : null;
  const facilityBucket = facilityHover ? BUCKET_BY_ID[facilityHover.bucket] : null;
  const powerInfo =
    popup?.kind === 'power' ? describePowerAsset(popup.layerId, popup.properties) : null;

  return (
    <Map
      ref={mapRef}
      mapboxAccessToken={MAPBOX_TOKEN}
      initialViewState={INITIAL_VIEW}
      mapStyle="mapbox://styles/mapbox/dark-v11"
      style={{ width: '100%', height: '100%' }}
      interactiveLayerIds={interactiveLayerIds}
      onLoad={handleLoad}
      onClick={handleClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      reuseMaps
    >
      <NavigationControl position="top-right" showCompass={false} />
      <ScaleControl position="bottom-right" unit="imperial" />

      {/* Imagery is overlaid on the dark style rather than swapping `mapStyle`.
          A style swap tears down every custom source and layer, which would drop
          the facilities and the power grid on each toggle. Inserting before the
          first symbol layer keeps place labels above the photography. */}
      {imagery && (
        <Source id="satellite" type="raster" url="mapbox://mapbox.satellite" tileSize={256}>
          <Layer {...satelliteLayer} beforeId={firstSymbolId} />
        </Source>
      )}

      <Source id="facilities" type="geojson" data={geojson}>
        <Layer {...pointLayer} />
        <Layer {...hoveredLayer} />
        <Layer {...selectedLayer} />
      </Source>

      {/* Mounted after the facilities source so `beforeId` can slot the grid
          underneath it — the grid is context, the facilities are the subject. */}
      {powerOn && <PowerLayers voltageFloor={voltageFloor} beforeId="facilities" />}

      {popup && (
        <Popup
          longitude={popup.longitude}
          latitude={popup.latitude}
          closeButton={false}
          closeOnClick={false}
          // No fixed `anchor`: Mapbox then picks the corner with room, flipping
          // the tooltip below or beside the point near a viewport edge. Pinning
          // it to "bottom" pushed it off-screen for anything near the top.
          offset={14}
          maxWidth="290px"
          className="facility-tooltip"
        >
          {facilityHover && (
            <div style={{ display: 'grid', gap: 4 }}>
              <strong style={{ fontSize: 13, lineHeight: 1.3 }}>{facilityHover.name}</strong>
              {facilityHover.operator && (
                <span style={{ fontSize: 12, color: '#b9c6d4' }}>{facilityHover.operator}</span>
              )}
              <span style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: facilityBucket?.color ?? '#94a3b8',
                    flexShrink: 0,
                  }}
                />
                {RAW_STATUS_LABEL[facilityHover.rawStatus] ?? facilityHover.rawStatus}
                <span style={{ color: '#7f8c9b' }}>·</span>
                {formatCapacity(facilityHover.capacityMw)}
              </span>
            </div>
          )}

          {powerInfo && (
            <div style={{ display: 'grid', gap: 4 }}>
              <span
                style={{
                  fontSize: 10,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: '#cf8ce0',
                }}
              >
                {powerInfo.kind}
              </span>
              <strong style={{ fontSize: 13, lineHeight: 1.3 }}>{powerInfo.title}</strong>
              {powerInfo.rows.length > 0 && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'auto 1fr',
                    columnGap: 10,
                    rowGap: 2,
                    fontSize: 12,
                    marginTop: 2,
                  }}
                >
                  {powerInfo.rows.map(([label, value]) => (
                    <Fragment key={label}>
                      <span style={{ color: '#8b98a8' }}>{label}</span>
                      <span>{value}</span>
                    </Fragment>
                  ))}
                </div>
              )}
              {powerInfo.rows.length === 0 && (
                <span style={{ fontSize: 12, color: '#8b98a8' }}>
                  No further detail tagged in OpenStreetMap.
                </span>
              )}
            </div>
          )}
        </Popup>
      )}
    </Map>
  );
}
