import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type UIEvent,
} from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

import { BUCKET_BY_ID, formatCapacity } from '../lib/status';
import type { FacilityFeature } from '../types';

const ROW_HEIGHT = 58;
const OVERSCAN = 8;

interface Props {
  features: FacilityFeature[];
  selectedId: string | null;
  onSelect: (feature: FacilityFeature) => void;
  hoveredId: string | null;
  onHover: (id: string | null) => void;
  /** Raw operator string -> compare colour. Empty unless comparing. */
  colorByOperator: Map<string, string>;
}

/**
 * A windowed list. Only the rows intersecting the viewport are mounted, which
 * keeps ~900 facilities (and any future growth) off the DOM. Hand-rolled rather
 * than pulling in a virtualization dependency — the fixed-height case is a few
 * lines and avoids a library whose API churns between majors.
 */
export default function FacilityList({
  features,
  selectedId,
  onSelect,
  hoveredId,
  onHover,
  colorByOperator,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setViewportHeight(el.clientHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleScroll = useCallback((e: UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  // When a facility is picked on the map, bring its row into view so the list
  // and the map never disagree about what is selected.
  useEffect(() => {
    if (!selectedId) return;
    const el = scrollRef.current;
    if (!el) return;
    const index = features.findIndex((f) => f.properties.id === selectedId);
    if (index < 0) return;

    const top = index * ROW_HEIGHT;
    const bottom = top + ROW_HEIGHT;
    if (top < el.scrollTop || bottom > el.scrollTop + el.clientHeight) {
      el.scrollTo({ top: top - el.clientHeight / 2 + ROW_HEIGHT / 2, behavior: 'smooth' });
    }
  }, [selectedId, features]);

  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const end = Math.min(
    features.length,
    Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN,
  );
  const visible = features.slice(start, end);

  if (features.length === 0) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="body2" color="text.secondary">
          No facilities match these filters.
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      ref={scrollRef}
      onScroll={handleScroll}
      role="listbox"
      aria-label="Data centers"
      onMouseLeave={() => onHover(null)}
      sx={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain' }}
    >
      <Box sx={{ height: features.length * ROW_HEIGHT, position: 'relative' }}>
        {visible.map((feature, i) => {
          const index = start + i;
          const p = feature.properties;
          const selected = p.id === selectedId;
          const hovered = p.id === hoveredId;
          const bucket = BUCKET_BY_ID[p.bucket];
          const place = [p.city, p.state].filter(Boolean).join(', ');
          const operatorTint = p.operator ? colorByOperator.get(p.operator) : undefined;

          return (
            <Box
              key={p.id}
              role="option"
              aria-selected={selected}
              tabIndex={0}
              onClick={() => onSelect(feature)}
              onMouseEnter={() => onHover(p.id)}
              // Keyboard focus drives the same highlight, so tabbing the list
              // lights up the map the way hovering does.
              onFocus={() => onHover(p.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(feature);
                }
              }}
              sx={{
                position: 'absolute',
                top: index * ROW_HEIGHT,
                left: 0,
                right: 0,
                height: ROW_HEIGHT,
                px: 2,
                display: 'flex',
                alignItems: 'center',
                gap: 1.25,
                cursor: 'pointer',
                borderLeft: '3px solid',
                borderLeftColor: selected
                  ? bucket?.color ?? 'transparent'
                  : hovered
                    ? `${bucket?.color ?? '#94a3b8'}80`
                    : 'transparent',
                bgcolor: selected
                  ? 'action.selected'
                  : hovered
                    ? 'action.hover'
                    : 'transparent',
                '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' },
              }}
            >
              {/* Status stays in the dot; the compare colour rings it, mirroring
                  how the map draws an operator halo around a status-coloured dot. */}
              <Box
                aria-hidden
                sx={{
                  width: 8,
                  height: 8,
                  flexShrink: 0,
                  borderRadius: '50%',
                  bgcolor: bucket?.color ?? 'grey.500',
                  boxShadow: operatorTint ? `0 0 0 2.5px ${operatorTint}` : 'none',
                  mx: operatorTint ? '2.5px' : 0,
                }}
              />
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="body2" noWrap title={p.name}>
                  {p.name}
                </Typography>
                <Typography variant="caption" component="div" noWrap>
                  {[place, p.operator].filter(Boolean).join(' · ')}
                </Typography>
              </Box>
              {p.capacityMw != null && (
                <Typography variant="caption" sx={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
                  {formatCapacity(p.capacityMw)}
                </Typography>
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
