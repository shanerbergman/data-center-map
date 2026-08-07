import { useMemo } from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

import OperatorChart from './OperatorChart';
import { operatorColor } from '../lib/palette';
import type { OperatorGroup } from '../lib/operators';

interface Props {
  /** Every operator group in the dataset, already aggregated. */
  options: OperatorGroup[];
  selectedKeys: string[];
  onChange: (keys: string[]) => void;
  mergeVariants: boolean;
  onMergeVariantsChange: (merge: boolean) => void;
}

export default function ComparePanel({
  options,
  selectedKeys,
  onChange,
  mergeVariants,
  onMergeVariantsChange,
}: Props) {
  const byKey = useMemo(() => new Map(options.map((o) => [o.key, o])), [options]);

  const selected = useMemo(
    () => selectedKeys.map((k) => byKey.get(k)).filter((g): g is OperatorGroup => Boolean(g)),
    [selectedKeys, byKey],
  );

  const undisclosed = selected.reduce((n, g) => n + g.undisclosedCount, 0);
  const totalSites = selected.reduce((n, g) => n + g.facilityCount, 0);

  return (
    <Stack sx={{ height: '100%', minHeight: 0, overflowY: 'auto', p: 2, gap: 1.5 }}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        gap={2}
        alignItems={{ md: 'flex-start' }}
      >
        <Autocomplete
          multiple
          disableCloseOnSelect
          sx={{ flex: 1, minWidth: 280 }}
          options={options}
          value={selected}
          onChange={(_, next) => onChange(next.map((g) => g.key))}
          getOptionLabel={(g) => g.label}
          isOptionEqualToValue={(a, b) => a.key === b.key}
          renderOption={(props, group) => {
            const { key, ...rest } = props;
            return (
              <li key={key} {...rest}>
                <Box sx={{ display: 'flex', width: '100%', gap: 1, alignItems: 'baseline' }}>
                  <Typography variant="body2" sx={{ flex: 1 }}>
                    {group.label}
                  </Typography>
                  <Typography variant="caption" sx={{ whiteSpace: 'nowrap' }}>
                    {group.facilityCount} sites ·{' '}
                    {group.totalMw > 0 ? `${(group.totalMw / 1000).toFixed(1)} GW` : 'no MW'}
                  </Typography>
                </Box>
              </li>
            );
          }}
          renderTags={(value, getTagProps) =>
            value.map((group, index) => {
              const { key, ...tagProps } = getTagProps({ index });
              return (
                <Tooltip
                  key={key}
                  placement="top"
                  title={
                    group.variants.length > 1
                      ? `Merged from ${group.variants.length} name variants: ${group.variants.join(' · ')}`
                      : group.label
                  }
                >
                  <Chip
                    size="small"
                    // Colour matches this operator's map halo and chart underline.
                    icon={
                      <Box
                        sx={{
                          width: 9,
                          height: 9,
                          borderRadius: '50%',
                          bgcolor: operatorColor(index),
                          ml: '8px !important',
                          flexShrink: 0,
                        }}
                      />
                    }
                    label={
                      group.variants.length > 1
                        ? `${group.label} (${group.variants.length})`
                        : group.label
                    }
                    sx={{ borderColor: operatorColor(index) }}
                    variant="outlined"
                    {...tagProps}
                  />
                </Tooltip>
              );
            })
          }
          renderInput={(params) => (
            <TextField
              {...params}
              size="small"
              label="Operators to compare"
              placeholder={selected.length ? '' : 'Search operators…'}
            />
          )}
        />

        <Tooltip
          placement="left"
          title="The source records operators as free text, so one company can appear under several spellings — QTS shows up as “QTS”, “QTS Data Centers” and “QTS (Blackstone)”. Merging folds them together. Turn this off to compare the raw strings exactly as recorded."
        >
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={mergeVariants}
                onChange={(e) => onMergeVariantsChange(e.target.checked)}
              />
            }
            label={<Typography variant="body2">Merge name variants</Typography>}
            sx={{ mr: 0, mt: { md: 0.5 } }}
          />
        </Tooltip>
      </Stack>

      {selected.length === 0 ? (
        <Box
          sx={{
            flex: 1,
            minHeight: 160,
            display: 'grid',
            placeItems: 'center',
            border: '1px dashed',
            borderColor: 'divider',
            borderRadius: 1,
          }}
        >
          <Typography variant="body2" color="text.secondary">
            Add operators above to compare their pipelines. The map filters to match.
          </Typography>
        </Box>
      ) : (
        <>
          <OperatorChart groups={selected} />
          <Typography variant="caption" component="p">
            Disclosed capacity only. {undisclosed} of {totalSites} facilities across these
            operators publish no megawatt figure, so bars are a floor rather than a total — an
            operator with many undisclosed sites will look smaller than it is.
          </Typography>
        </>
      )}
    </Stack>
  );
}
