import { useMemo, type ReactNode } from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import CloseIcon from '@mui/icons-material/Close';

import { BUCKET_BY_ID, CONFIDENCE_LABEL, RAW_STATUS_LABEL, formatCapacity } from '../lib/status';
import type { FacilityProperties, FacilitySource, StatusHistoryEntry } from '../types';

interface Props {
  facility: FacilityProperties | null;
  onClose: () => void;
}

function safeParse<T>(json: string | undefined | null, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  if (value == null || value === '') return null;
  return (
    <Box>
      <Typography variant="caption" component="div">
        {label}
      </Typography>
      <Typography variant="body2">{value}</Typography>
    </Box>
  );
}

export default function FacilityDetail({ facility, onClose }: Props) {
  const sources = useMemo(
    () => safeParse<FacilitySource[]>(facility?.sourcesJson, []),
    [facility?.sourcesJson],
  );
  const history = useMemo(
    () => safeParse<StatusHistoryEntry[]>(facility?.statusHistoryJson, []),
    [facility?.statusHistoryJson],
  );

  const bucket = facility ? BUCKET_BY_ID[facility.bucket] : null;

  const place = facility
    ? [facility.city, facility.county ? `${facility.county} County` : null, facility.state]
        .filter(Boolean)
        .join(', ')
    : '';

  return (
    <Drawer
      anchor="right"
      open={Boolean(facility)}
      onClose={onClose}
      slotProps={{ paper: { sx: { width: { xs: '100%', sm: 400 } } } }}
    >
      {facility && (
        <Stack sx={{ height: '100%', overflowY: 'auto' }}>
          <Box sx={{ p: 2, display: 'flex', alignItems: 'flex-start', gap: 1 }}>
            <Box sx={{ flex: 1 }}>
              <Typography variant="h6" component="h2" sx={{ lineHeight: 1.3 }}>
                {facility.name}
              </Typography>
              {place && (
                <Typography variant="caption" component="p">
                  {place}
                </Typography>
              )}
            </Box>
            <IconButton onClick={onClose} size="small" aria-label="Close details">
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>

          <Box sx={{ px: 2, pb: 2 }}>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {bucket && (
                <Chip
                  size="small"
                  label={RAW_STATUS_LABEL[facility.rawStatus] ?? facility.rawStatus}
                  sx={{
                    bgcolor: `${bucket.color}22`,
                    color: bucket.color,
                    border: `1px solid ${bucket.color}66`,
                  }}
                />
              )}
              {facility.confidence && (
                <Chip
                  size="small"
                  variant="outlined"
                  label={CONFIDENCE_LABEL[facility.confidence] ?? facility.confidence}
                />
              )}
              {facility.aiClassification && (
                <Chip
                  size="small"
                  variant="outlined"
                  label={`AI: ${facility.aiClassification.replace('_', ' ')}`}
                />
              )}
              {facility.facilityType === 'crypto_mining' && (
                <Chip size="small" variant="outlined" label="Crypto mining" />
              )}
            </Stack>
          </Box>

          <Divider />

          <Stack spacing={2} sx={{ p: 2 }}>
            <Field label="Operator" value={facility.operator} />
            <Field
              label="Capacity"
              value={
                facility.capacityOperationalMw != null || facility.capacityPlannedMw != null ? (
                  <>
                    {facility.capacityOperationalMw != null && (
                      <div>{formatCapacity(facility.capacityOperationalMw)} operational</div>
                    )}
                    {facility.capacityPlannedMw != null && (
                      <div>{formatCapacity(facility.capacityPlannedMw)} planned</div>
                    )}
                  </>
                ) : (
                  'Not disclosed'
                )
              }
            />
            <Field label="Utility" value={facility.utility} />
            <Field label="Power" value={facility.poweredBy} />
            <Field
              label="Community"
              value={
                facility.communityStatus && facility.communityStatus !== 'unknown'
                  ? facility.communityStatus
                  : null
              }
            />
            <Field
              label="Coordinate precision"
              value={facility.locationPrecision}
            />
            <Field label="Last updated" value={facility.lastUpdated} />
          </Stack>

          {history.length > 0 && (
            <>
              <Divider />
              <Box sx={{ p: 2 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Status history
                </Typography>
                <Stack spacing={0.75}>
                  {history.map((entry, i) => (
                    <Typography key={i} variant="body2">
                      {RAW_STATUS_LABEL[entry.status] ?? entry.status}
                      {entry.date && (
                        <Typography component="span" variant="caption">
                          {' '}
                          — {entry.date}
                        </Typography>
                      )}
                    </Typography>
                  ))}
                </Stack>
              </Box>
            </>
          )}

          {facility.notes && (
            <>
              <Divider />
              <Box sx={{ p: 2 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Notes
                </Typography>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                  {facility.notes}
                </Typography>
              </Box>
            </>
          )}

          {sources.length > 0 && (
            <>
              <Divider />
              <Box sx={{ p: 2 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Sources ({sources.length})
                </Typography>
                <Stack spacing={1.25}>
                  {sources.map((source, i) => (
                    <Box key={i}>
                      <Link
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                        variant="body2"
                        underline="hover"
                      >
                        {source.label || source.url}
                      </Link>
                      <Typography variant="caption" component="div">
                        {[source.publisher, source.retrievedAt].filter(Boolean).join(' · ')}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              </Box>
            </>
          )}
        </Stack>
      )}
    </Drawer>
  );
}
