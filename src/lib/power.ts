/**
 * OpenInfraMap power overlay configuration.
 *
 * OpenInfraMap serves Mapbox-compatible vector tiles rendered from OpenStreetMap
 * via Tegola. The `power` map exposes the layers named below; `voltage` arrives
 * already converted to kilovolts.
 *
 * This is a volunteer-run service. Keep usage reasonable, leave the layer off by
 * default, and keep the attribution intact.
 */
export const OIM_POWER_TILES = 'https://openinframap.org/map/power/{z}/{x}/{y}.pbf';

export const OIM_ATTRIBUTION =
  'Power infrastructure &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors, via <a href="https://openinframap.org" target="_blank" rel="noreferrer">OpenInfraMap</a>';

/** Source layer names, from OpenInfraMap's tegola/layers.yml. */
export const OIM_LAYERS = {
  line: 'power_line',
  substationPoint: 'power_substation_point',
  substationArea: 'power_substation',
  plantPoint: 'power_plant_point',
  plantArea: 'power_plant',
} as const;

/**
 * US transmission voltage classes: 69 / 115 / 138 / 161 / 230 / 345 / 500 / 765 kV.
 *
 * 115 kV is the default floor rather than a round 120 because 120 would slice
 * through the 115 kV class, which is genuine sub-transmission serving 50–150 MW
 * facilities. It also matches the tiles: OpenInfraMap only carries >100 kV lines
 * below zoom 6, so nothing below that floor exists at national zoom anyway.
 */
export interface VoltageFloor {
  value: number;
  label: string;
  hint: string;
}

export const VOLTAGE_FLOORS: VoltageFloor[] = [
  { value: 69, label: '69 kV+', hint: 'Includes sub-transmission — noisy at national zoom' },
  { value: 115, label: '115 kV+', hint: 'All US transmission classes (default)' },
  { value: 230, label: '230 kV+', hint: 'Serves large data centers, 300 MW and up' },
  { value: 345, label: '345 kV+', hint: 'Backbone corridors and gigawatt campuses' },
  { value: 500, label: '500 kV+', hint: 'Only the highest-capacity long-haul lines' },
];

export const DEFAULT_VOLTAGE_FLOOR = 115;

/**
 * Colour ramp for transmission voltage. Deliberately in the violet/magenta
 * family: the status buckets own green/amber/blue/grey, and the grid needs to
 * read as background context rather than compete with the facilities.
 */
export const VOLTAGE_COLOR_STOPS: Array<[number, string]> = [
  [115, '#6d5a94'],
  [230, '#9457a8'],
  [345, '#c2569f'],
  [500, '#e35f92'],
  [765, '#ff8fb0'],
];

/** Line width in px at a reference zoom, by voltage. */
export const VOLTAGE_WIDTH_STOPS: Array<[number, number]> = [
  [115, 0.5],
  [230, 1.0],
  [345, 1.6],
  [500, 2.4],
  [765, 3.4],
];

export const PLANT_COLOR = '#fb7185';
export const SUBSTATION_COLOR = '#cf8ce0';

/** Interactive layer ids, in the order they should win a hover hit-test. */
export const POWER_LAYER_IDS = [
  'oim-power-substation',
  'oim-power-plant',
  'oim-power-line',
] as const;

export interface PowerAssetInfo {
  kind: string;
  title: string;
  rows: Array<[string, string]>;
}

/** OSM values are strings of varying shape; normalise to something printable. */
function text(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s === '' || s === 'null' ? null : s;
}

function titleCase(value: string): string {
  return value.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

/** Lines carry up to four circuits at different voltages. Show them all. */
function formatVoltages(p: Record<string, unknown>): string | null {
  const kv = [p.voltage, p.voltage_2, p.voltage_3, p.voltage_4]
    .map((v) => (typeof v === 'number' ? v : Number(v)))
    .filter((v) => Number.isFinite(v) && v > 0);
  if (kv.length === 0) return null;
  const unique = [...new Set(kv)].sort((a, b) => b - a);
  return `${unique.map((v) => (Number.isInteger(v) ? v : v.toFixed(1))).join(' / ')} kV`;
}

function lifecycle(p: Record<string, unknown>): string | null {
  if (p.construction === true || p.construction === 'true') return 'Under construction';
  if (p.disused === true || p.disused === 'true') return 'Disused';
  return null;
}

/**
 * Turns a raw OpenInfraMap vector-tile feature into something readable. OSM
 * tagging is uneven — most of these fields are frequently absent, so every row
 * is conditional and an asset with almost nothing tagged still renders sanely.
 */
export function describePowerAsset(
  layerId: string,
  p: Record<string, unknown>,
): PowerAssetInfo {
  const operator = text(p.operator);
  const status = lifecycle(p);
  const voltage = formatVoltages(p);
  const name = text(p.name);

  if (layerId === 'oim-power-line') {
    const rows: Array<[string, string]> = [];
    if (voltage) rows.push(['Voltage', voltage]);
    if (operator) rows.push(['Operator', operator]);

    const circuits = text(p.circuits);
    if (circuits) rows.push(['Circuits', circuits]);

    // frequency 0 means DC — an HVDC intertie, worth calling out by name.
    const freq = Number(p.frequency);
    if (Number.isFinite(freq)) rows.push(['Type', freq === 0 ? 'HVDC' : `AC, ${freq} Hz`]);

    const location = text(p.location);
    if (location) rows.push(['Location', titleCase(location)]);

    const ref = text(p.ref);
    if (ref && ref !== name) rows.push(['Ref', ref]);
    if (status) rows.push(['Status', status]);

    return {
      kind: text(p.line) === 'busbar' ? 'Busbar' : 'Transmission line',
      title: name ?? ref ?? 'Unnamed line',
      rows,
    };
  }

  if (layerId === 'oim-power-substation') {
    const rows: Array<[string, string]> = [];
    if (voltage) rows.push(['Voltage', voltage]);
    if (operator) rows.push(['Operator', operator]);

    const type = text(p.substation);
    if (type) rows.push(['Type', titleCase(type)]);

    const area = Number(p.area);
    if (Number.isFinite(area) && area > 0) {
      rows.push(['Footprint', `${Math.round(area).toLocaleString()} m²`]);
    }
    if (status) rows.push(['Status', status]);

    return { kind: 'Substation', title: name ?? 'Unnamed substation', rows };
  }

  if (layerId === 'oim-power-plant') {
    const rows: Array<[string, string]> = [];

    const output = Number(p.output);
    if (Number.isFinite(output) && output > 0) {
      rows.push([
        'Output',
        output >= 1000 ? `${(output / 1000).toFixed(2)} GW` : `${output.toFixed(0)} MW`,
      ]);
    }

    const source = text(p.source);
    if (source) rows.push(['Fuel', titleCase(source)]);

    const method = text(p.method);
    if (method) rows.push(['Method', titleCase(method)]);
    if (operator) rows.push(['Operator', operator]);
    if (status) rows.push(['Status', status]);

    return { kind: 'Power plant', title: name ?? 'Unnamed plant', rows };
  }

  return { kind: 'Power asset', title: name ?? 'Unnamed', rows: [] };
}
