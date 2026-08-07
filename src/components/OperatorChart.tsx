import { useLayoutEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

import { BUCKETS } from '../lib/status';
import { operatorColor } from '../lib/palette';
import type { OperatorGroup } from '../lib/operators';

const MARGIN = { top: 8, right: 8, bottom: 52, left: 52 };
const HEIGHT = 260;
const BAR_GAP = 2;
const GROUP_PAD = 0.28;

/** Rounds an axis maximum up to a readable 1/2/5 × 10ⁿ step. */
function niceScale(max: number): { max: number; ticks: number[] } {
  if (max <= 0) return { max: 1, ticks: [0, 0.5, 1] };
  const targetSteps = 4;
  const rough = max / targetSteps;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const norm = rough / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  // Rounded because float multiplication of fractional steps drifts — without
  // this a 0.24 GW maximum yields an axis top of 0.30000000000000004.
  const top = Number((Math.ceil(max / step) * step).toFixed(10));
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(Number(v.toFixed(10)));
  return { max: top, ticks };
}

function formatGw(gw: number): string {
  if (gw === 0) return '0';
  if (gw >= 10) return gw.toFixed(0);
  if (gw >= 1) return gw.toFixed(1);
  return gw.toFixed(2);
}

interface Props {
  groups: OperatorGroup[];
}

export default function OperatorChart({ groups }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(320, el.clientWidth));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const innerWidth = Math.max(120, width - MARGIN.left - MARGIN.right);
  const innerHeight = HEIGHT - MARGIN.top - MARGIN.bottom;

  const maxGw = Math.max(
    0,
    ...groups.flatMap((g) => BUCKETS.map((b) => (g.byBucket[b.id]?.mw ?? 0) / 1000)),
  );
  const scale = niceScale(maxGw);
  const y = (gw: number) => innerHeight - (gw / scale.max) * innerHeight;

  const groupWidth = innerWidth / Math.max(1, groups.length);
  const barsWidth = groupWidth * (1 - GROUP_PAD);
  const barWidth = Math.max(2, barsWidth / BUCKETS.length - BAR_GAP);

  return (
    <Box ref={wrapRef} sx={{ width: '100%' }}>
      <svg
        width={width}
        height={HEIGHT}
        role="img"
        aria-label="Disclosed capacity in gigawatts by operator and project status"
      >
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {scale.ticks.map((t) => (
            <g key={t} transform={`translate(0,${y(t)})`}>
              <line
                x1={0}
                x2={innerWidth}
                stroke="currentColor"
                strokeOpacity={t === 0 ? 0.35 : 0.12}
                strokeWidth={1}
              />
              <text
                x={-8}
                dy="0.32em"
                textAnchor="end"
                fontSize={11}
                fill="currentColor"
                fillOpacity={0.6}
              >
                {formatGw(t)}
              </text>
            </g>
          ))}

          <text
            transform={`translate(${-MARGIN.left + 12},${innerHeight / 2}) rotate(-90)`}
            textAnchor="middle"
            fontSize={11}
            fill="currentColor"
            fillOpacity={0.6}
          >
            GW
          </text>

          {groups.map((group, gi) => {
            const gx = gi * groupWidth + (groupWidth * GROUP_PAD) / 2;
            return (
              <g key={group.key} transform={`translate(${gx},0)`}>
                {BUCKETS.map((bucket, bi) => {
                  const gw = (group.byBucket[bucket.id]?.mw ?? 0) / 1000;
                  const count = group.byBucket[bucket.id]?.count ?? 0;
                  const barX = bi * (barWidth + BAR_GAP);
                  const barY = y(gw);
                  const barH = Math.max(gw > 0 ? 1.5 : 0, innerHeight - barY);
                  return (
                    <g key={bucket.id}>
                      {/* Full-height hit area so zero-capacity bars are hoverable */}
                      <rect
                        x={barX}
                        y={0}
                        width={barWidth}
                        height={innerHeight}
                        fill="transparent"
                      >
                        <title>
                          {`${group.label} — ${bucket.label}\n${formatGw(gw)} GW disclosed across ${count} ${
                            count === 1 ? 'facility' : 'facilities'
                          }`}
                        </title>
                      </rect>
                      <rect
                        x={barX}
                        y={barY}
                        width={barWidth}
                        height={barH}
                        fill={bucket.color}
                        fillOpacity={0.85}
                        rx={1.5}
                        pointerEvents="none"
                      />
                    </g>
                  );
                })}

                {/* Operator colour bar — the same colour as this operator's
                    halo on the map, which is what ties the two views together. */}
                <rect
                  x={0}
                  y={innerHeight + 6}
                  width={barsWidth}
                  height={3}
                  rx={1.5}
                  fill={operatorColor(gi)}
                />

                <text
                  x={barsWidth / 2}
                  y={innerHeight + 23}
                  textAnchor="middle"
                  fontSize={11}
                  fill="currentColor"
                  fillOpacity={0.85}
                >
                  {group.label.length > 18 ? `${group.label.slice(0, 17)}…` : group.label}
                  <title>{group.label}</title>
                </text>
                <text
                  x={barsWidth / 2}
                  y={innerHeight + 37}
                  textAnchor="middle"
                  fontSize={10}
                  fill="currentColor"
                  fillOpacity={0.45}
                >
                  {group.facilityCount} sites
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mt: 0.5, px: `${MARGIN.left}px` }}>
        {BUCKETS.map((b) => (
          <Box key={b.id} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Box sx={{ width: 9, height: 9, borderRadius: 0.4, bgcolor: b.color }} />
            <Typography variant="caption">{b.label}</Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
