export const EDU_THEME = {
  colors: {
    appBgStart: '#0f172a',
    appBgEnd: '#111827',
    surface: 'rgba(15, 23, 42, 0.88)',
    surfaceSoft: 'rgba(30, 41, 59, 0.65)',
    border: 'rgba(148, 163, 184, 0.28)',
    text: '#e2e8f0',
    mutedText: '#94a3b8',
    heading: '#cbd5e1',
    accent: '#22d3ee',
    accentSoft: 'rgba(34, 211, 238, 0.15)',
    primaryAction: '#2563eb',
    primaryActionStrong: '#1d4ed8',
    success: '#22c55e',
    warning: '#f59e0b',
    error: '#ef4444',
  },
  radius: {
    sm: '10px',
    md: '12px',
    lg: '16px',
  },
  spacing: {
    xs: '8px',
    sm: '12px',
    md: '16px',
    lg: '24px',
  },
}

export function mutedCardStyle(extra = {}) {
  return {
    background: EDU_THEME.colors.surfaceSoft,
    border: `1px solid ${EDU_THEME.colors.border}`,
    borderRadius: EDU_THEME.radius.md,
    ...extra,
  }
}
