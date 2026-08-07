import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import SearchIcon from '@mui/icons-material/Search';

import FacilityList from './FacilityList';
import { BUCKETS, formatCapacity } from '../lib/status';
import { VOLTAGE_FLOORS } from '../lib/power';
import type { Bucket, DatasetMetadata, FacilityFeature } from '../types';

export interface BucketTally {
  count: number;
  mw: number;
}

interface Props {
  metadata: DatasetMetadata;
  visible: Bucket[];
  onToggle: (bucket: Bucket) => void;
  tallies: Record<Bucket, BucketTally>;
  states: string[];
  stateFilter: string;
  onStateFilter: (value: string) => void;
  search: string;
  onSearch: (value: string) => void;
  visibleMw: number;
  features: FacilityFeature[];
  selectedId: string | null;
  onSelectFacility: (feature: FacilityFeature) => void;
  hoveredId: string | null;
  onHoverFacility: (id: string | null) => void;
  powerOn: boolean;
  onPowerToggle: (on: boolean) => void;
  voltageFloor: number;
  onVoltageFloor: (kv: number) => void;
  imagery: boolean;
  onImageryToggle: (on: boolean) => void;
  compareOn: boolean;
  onCompareToggle: (on: boolean) => void;
  compareCount: number;
  /** Raw operator string -> compare colour. Empty unless comparing. */
  colorByOperator: Map<string, string>;
}

export default function Sidebar({
  metadata,
  visible,
  onToggle,
  tallies,
  states,
  stateFilter,
  onStateFilter,
  search,
  onSearch,
  visibleMw,
  features,
  selectedId,
  onSelectFacility,
  hoveredId,
  onHoverFacility,
  powerOn,
  onPowerToggle,
  voltageFloor,
  onVoltageFloor,
  imagery,
  onImageryToggle,
  compareOn,
  onCompareToggle,
  compareCount,
  colorByOperator,
}: Props) {
  return (
    <Stack sx={{ height: '100%', minHeight: 0 }}>
      <Box sx={{ p: 2, pb: 1.5 }}>
        <Typography variant="h6" component="h1">
          US Data Center Buildout
        </Typography>
        <Typography variant="caption" component="p">
          {metadata.count.toLocaleString()} facilities · updated{' '}
          {new Date(metadata.asOf).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          })}
        </Typography>
      </Box>

      <Divider />

      <Box sx={{ px: 2, py: 1.5 }}>
        <Typography variant="subtitle2" gutterBottom>
          Status
        </Typography>
        {BUCKETS.map((bucket) => {
          const tally = tallies[bucket.id] ?? { count: 0, mw: 0 };
          return (
            <Tooltip key={bucket.id} title={bucket.description} placement="right">
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={visible.includes(bucket.id)}
                    onChange={() => onToggle(bucket.id)}
                    sx={{ color: bucket.color, '&.Mui-checked': { color: bucket.color }, py: 0.4 }}
                  />
                }
                label={
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'baseline',
                      justifyContent: 'space-between',
                      width: '100%',
                      gap: 1,
                    }}
                  >
                    <Typography variant="body2">{bucket.label}</Typography>
                    <Typography variant="caption" sx={{ whiteSpace: 'nowrap' }}>
                      {tally.count.toLocaleString()} · {formatCapacity(tally.mw || null)}
                    </Typography>
                  </Box>
                }
                sx={{ mr: 0, display: 'flex', '& .MuiFormControlLabel-label': { flex: 1 } }}
              />
            </Tooltip>
          );
        })}
      </Box>

      <Divider />

      <Box sx={{ px: 2, py: 1 }}>
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={imagery}
              onChange={(e) => onImageryToggle(e.target.checked)}
            />
          }
          label={<Typography variant="subtitle2">Satellite imagery</Typography>}
          sx={{ ml: -0.5 }}
        />
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={compareOn}
              onChange={(e) => onCompareToggle(e.target.checked)}
            />
          }
          label={
            <Typography variant="subtitle2">
              Compare operators
              {compareCount > 0 && (
                <Typography component="span" variant="caption">
                  {' '}
                  · {compareCount} selected
                </Typography>
              )}
            </Typography>
          }
          sx={{ ml: -0.5, display: 'flex' }}
        />
        {compareOn && compareCount > 0 && (
          <Typography variant="caption" component="p" sx={{ pl: 0.5 }}>
            Map and list are filtered to the selected operators.
          </Typography>
        )}
      </Box>

      <Divider />

      <Box sx={{ px: 2, py: 1.5 }}>
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={powerOn}
              onChange={(e) => onPowerToggle(e.target.checked)}
            />
          }
          label={<Typography variant="subtitle2">Power grid</Typography>}
          sx={{ ml: -0.5, mb: powerOn ? 1 : 0 }}
        />
        {powerOn && (
          <Stack spacing={1.25}>
            <TextField
              select
              size="small"
              fullWidth
              label="Minimum line voltage"
              value={voltageFloor}
              onChange={(e) => onVoltageFloor(Number(e.target.value))}
            >
              {VOLTAGE_FLOORS.map((f) => (
                <MenuItem key={f.value} value={f.value}>
                  {f.label}
                </MenuItem>
              ))}
            </TextField>
            <Typography variant="caption" component="p">
              {VOLTAGE_FLOORS.find((f) => f.value === voltageFloor)?.hint}
            </Typography>
            <Typography variant="caption" component="p">
              Lines coloured and weighted by kV; substations by voltage, plants by MW output.
            </Typography>
          </Stack>
        )}
      </Box>

      <Divider />

      <Stack spacing={1.5} sx={{ p: 2 }}>
        <TextField
          size="small"
          fullWidth
          placeholder="Name, operator, or city"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
        />
        <TextField
          select
          size="small"
          fullWidth
          label="State"
          value={stateFilter}
          onChange={(e) => onStateFilter(e.target.value)}
        >
          <MenuItem value="">All states</MenuItem>
          {states.map((s) => (
            <MenuItem key={s} value={s}>
              {s}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      <Divider />

      <Box
        sx={{
          px: 2,
          py: 1,
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 1,
        }}
      >
        <Typography variant="subtitle2">
          {features.length.toLocaleString()} shown
        </Typography>
        <Tooltip
          title="Sum of disclosed capacity. Many sites publish no megawatt figure, so this is a floor, not a total."
          placement="left"
        >
          <Typography variant="caption" sx={{ whiteSpace: 'nowrap' }}>
            {formatCapacity(visibleMw || null)}
          </Typography>
        </Tooltip>
      </Box>

      <Divider />

      <FacilityList
        features={features}
        selectedId={selectedId}
        onSelect={onSelectFacility}
        hoveredId={hoveredId}
        onHover={onHoverFacility}
        colorByOperator={colorByOperator}
      />

      <Divider />
      <Box sx={{ px: 2, py: 1.25 }}>
        <Typography variant="caption" component="p">
          Facilities from{' '}
          <a
            href="https://www.compute-atlas.com"
            target="_blank"
            rel="noreferrer"
            style={{ color: '#60a5fa' }}
          >
            Compute Atlas
          </a>{' '}
          (CC BY 4.0). Grid from{' '}
          <a
            href="https://openinframap.org"
            target="_blank"
            rel="noreferrer"
            style={{ color: '#60a5fa' }}
          >
            OpenInfraMap
          </a>{' '}
          / OpenStreetMap.
        </Typography>
      </Box>
    </Stack>
  );
}
