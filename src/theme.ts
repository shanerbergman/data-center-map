import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    mode: 'dark',
    background: { default: '#0b0f14', paper: '#121820' },
    primary: { main: '#60a5fa' },
    secondary: { main: '#fbbf24' },
    divider: 'rgba(255,255,255,0.10)',
    text: { primary: '#e6edf3', secondary: '#93a1b1' },
  },
  shape: { borderRadius: 8 },
  typography: {
    fontFamily:
      '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    h6: { fontWeight: 600, letterSpacing: '-0.01em' },
    subtitle2: { fontWeight: 600 },
    body2: { fontSize: '0.8125rem' },
    caption: { color: '#93a1b1' },
  },
  components: {
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiTooltip: { defaultProps: { arrow: true } },
  },
});
