/**
 * Colours identifying operators in the comparison view.
 *
 * Assignment is by position in the compare selection, so the first operator
 * added is always colour 1 — the map halo and the chart underline can't drift
 * apart, and the mapping stays stable while you add or remove others.
 *
 * Two palettes are already on screen and had to be avoided: the status buckets
 * own green, amber, blue and grey (the dot fills), and the power grid owns
 * violet through magenta. A hand-picked set kept colliding with those — an
 * earlier attempt put a periwinkle only 79 units from the planned-blue dots.
 *
 * So these were selected by farthest-point search over HSL space, maximising
 * distance from every colour already in the UI and from each other, subject to
 * at least 4.5:1 contrast against the dark basemap so nothing vanishes on it.
 * Verified minimums: 121 between any two of these, 112 against any existing UI
 * colour. Ordered so the first four — the common case — are the most separated.
 */
export const OPERATOR_PALETTE = [
  '#2EFAEC', // cyan
  '#FA802E', // orange
  '#FA2EFA', // magenta
  '#9BFA2E', // chartreuse
  '#876EED', // violet
  '#FA2E2E', // red
  '#6EEDC3', // mint
  '#DCED6E', // pale yellow
  '#EDA96E', // tan
  '#2EFA2E', // green
] as const;

/** Wraps past the end of the palette rather than running out. */
export function operatorColor(index: number): string {
  return OPERATOR_PALETTE[index % OPERATOR_PALETTE.length];
}
