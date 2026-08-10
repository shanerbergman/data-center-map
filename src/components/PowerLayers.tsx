import { useMemo } from 'react';
import { Layer, Source } from 'react-map-gl/mapbox';
import type {
  CircleLayerSpecification,
  FillLayerSpecification,
  LineLayerSpecification,
} from 'react-map-gl/mapbox';
import type { ExpressionSpecification } from 'mapbox-gl';

import {
  OIM_ATTRIBUTION,
  OIM_LAYERS,
  OIM_POWER_TILES,
  PLANT_COLOR,
  SUBSTATION_COLOR,
  VOLTAGE_COLOR_STOPS,
  VOLTAGE_WIDTH_STOPS,
} from '../lib/power';

/** Voltage in kV, defaulting to 0 when the OSM tag is missing. */
const VOLTAGE: ExpressionSpecification = ['coalesce', ['get', 'voltage'], 0];

const COLOR_BY_VOLTAGE = [
  'interpolate',
  ['linear'],
  VOLTAGE,
  ...VOLTAGE_COLOR_STOPS.flat(),
] as unknown as ExpressionSpecification;

const WIDTH_BY_VOLTAGE = [
  'interpolate',
  ['linear'],
  VOLTAGE,
  ...VOLTAGE_WIDTH_STOPS.flat(),
] as unknown as ExpressionSpecification;

interface Props {
  /** Minimum line voltage in kV. */
  voltageFloor: number;
  /** Layer id to insert beneath, so the grid never covers the facilities. */
  beforeId?: string;
}

export default function PowerLayers({ voltageFloor, beforeId }: Props) {
  const layers = useMemo(() => {
    // `disused:power` features are historical and would misrepresent the grid.
    const live: ExpressionSpecification = ['!=', ['get', 'disused'], true];
    const aboveFloor: ExpressionSpecification = ['>=', VOLTAGE, voltageFloor];

    const lineLayer: LineLayerSpecification = {
      id: 'oim-power-line',
      type: 'line',
      source: 'oim-power',
      'source-layer': OIM_LAYERS.line,
      filter: ['all', live, aboveFloor],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': COLOR_BY_VOLTAGE,
        'line-opacity': 0.65,
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          3,
          ['*', 0.6, WIDTH_BY_VOLTAGE],
          8,
          ['*', 1.4, WIDTH_BY_VOLTAGE],
          13,
          ['*', 2.4, WIDTH_BY_VOLTAGE],
        ],
      },
    };

    // Substations carry the interconnection story, so they stay visible even
    // when their own voltage tag is missing (common in OSM) — the floor is
    // applied only when a voltage is actually recorded.
    const substationFilter: ExpressionSpecification = [
      'any',
      ['==', ['coalesce', ['get', 'voltage'], 0], 0],
      aboveFloor,
    ];

    const substationLayer: CircleLayerSpecification = {
      id: 'oim-power-substation',
      type: 'circle',
      source: 'oim-power',
      'source-layer': OIM_LAYERS.substationPoint,
      filter: ['all', live, substationFilter],
      paint: {
        'circle-color': SUBSTATION_COLOR,
        'circle-opacity': 0.5,
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          5,
          1.5,
          10,
          ['interpolate', ['linear'], VOLTAGE, 0, 2.5, 345, 5, 765, 8],
          14,
          ['interpolate', ['linear'], VOLTAGE, 0, 4, 345, 9, 765, 14],
        ],
        'circle-stroke-width': 0.6,
        'circle-stroke-color': '#f0d9ff',
        'circle-stroke-opacity': 0.5,
      },
    };

    const substationAreaLayer: FillLayerSpecification = {
      id: 'oim-power-substation-area',
      type: 'fill',
      source: 'oim-power',
      'source-layer': OIM_LAYERS.substationArea,
      minzoom: 13,
      filter: live,
      paint: { 'fill-color': SUBSTATION_COLOR, 'fill-opacity': 0.22 },
    };

    // Generation is sized by output in MW, which is what actually matters for
    // whether a campus can be fed.
    const plantLayer: CircleLayerSpecification = {
      id: 'oim-power-plant',
      type: 'circle',
      source: 'oim-power',
      'source-layer': OIM_LAYERS.plantPoint,
      filter: live,
      paint: {
        'circle-color': PLANT_COLOR,
        'circle-opacity': 0.45,
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          4,
          ['min', 8, ['+', 1.5, ['*', 0.09, ['sqrt', ['coalesce', ['get', 'output'], 0]]]]],
          9,
          ['min', 20, ['+', 2.5, ['*', 0.24, ['sqrt', ['coalesce', ['get', 'output'], 0]]]]],
          13,
          ['min', 34, ['+', 4, ['*', 0.45, ['sqrt', ['coalesce', ['get', 'output'], 0]]]]],
        ],
        'circle-stroke-width': 0.6,
        'circle-stroke-color': '#ffd7de',
        'circle-stroke-opacity': 0.45,
      },
    };

    const plantAreaLayer: FillLayerSpecification = {
      id: 'oim-power-plant-area',
      type: 'fill',
      source: 'oim-power',
      'source-layer': OIM_LAYERS.plantArea,
      minzoom: 12,
      filter: live,
      paint: { 'fill-color': PLANT_COLOR, 'fill-opacity': 0.16 },
    };

    return { lineLayer, substationLayer, substationAreaLayer, plantLayer, plantAreaLayer };
  }, [voltageFloor]);

  return (
    <Source
      id="oim-power"
      type="vector"
      tiles={[OIM_POWER_TILES]}
      minzoom={0}
      maxzoom={16}
      attribution={OIM_ATTRIBUTION}
    >
      <Layer {...layers.plantAreaLayer} beforeId={beforeId} />
      <Layer {...layers.substationAreaLayer} beforeId={beforeId} />
      <Layer {...layers.lineLayer} beforeId={beforeId} />
      <Layer {...layers.plantLayer} beforeId={beforeId} />
      <Layer {...layers.substationLayer} beforeId={beforeId} />
    </Source>
  );
}
