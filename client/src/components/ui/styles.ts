// Shared inline-style tokens for the dark "Compound" UI.

export const panel: React.CSSProperties = {
  background: '#16181F',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 18,
  padding: 24,
}

export const panelTitle: React.CSSProperties = {
  fontFamily: "'Space Grotesk'",
  fontSize: 16,
  fontWeight: 600,
  marginBottom: 14,
}

export const pageTitle: React.CSSProperties = {
  margin: 0,
  fontFamily: "'Space Grotesk'",
  fontSize: 25,
  fontWeight: 700,
  letterSpacing: -0.5,
}

export const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 10,
  padding: '11px 13px',
  color: '#F2F4F8',
  fontFamily: 'inherit',
  fontSize: 14,
  fontVariantNumeric: 'tabular-nums',
}

export const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 0.4,
  color: '#8A90A2',
  textTransform: 'uppercase',
}

export const primaryBtn: React.CSSProperties = {
  padding: '11px 18px',
  borderRadius: 10,
  border: 'none',
  background: '#22E38A',
  color: '#04140C',
  fontWeight: 700,
  fontSize: 13,
  fontFamily: 'inherit',
  cursor: 'pointer',
}

export const secondaryBtn: React.CSSProperties = {
  padding: '11px 16px',
  borderRadius: 10,
  border: '1px solid rgba(255,255,255,0.1)',
  background: 'rgba(255,255,255,0.05)',
  color: '#F2F4F8',
  fontWeight: 600,
  fontSize: 13,
  fontFamily: 'inherit',
  cursor: 'pointer',
}

export const dangerBtn: React.CSSProperties = {
  padding: '11px 16px',
  borderRadius: 10,
  border: '1px solid rgba(255,84,112,0.35)',
  background: 'rgba(255,84,112,0.1)',
  color: '#FF5470',
  fontWeight: 700,
  fontSize: 13,
  fontFamily: 'inherit',
  cursor: 'pointer',
}

export const statTile: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)',
  borderRadius: 14,
  padding: 16,
}

export const statLabel: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: 0.8,
  color: '#8A90A2',
  fontWeight: 700,
  textTransform: 'uppercase',
}

export const statValue: React.CSSProperties = {
  fontFamily: "'Space Grotesk'",
  fontSize: 23,
  fontWeight: 700,
  margin: '7px 0 3px',
  fontVariantNumeric: 'tabular-nums',
}

export function segmented(active: boolean): React.CSSProperties {
  return {
    padding: '5px 11px',
    borderRadius: 7,
    border: 'none',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
    fontFamily: 'inherit',
    background: active ? 'rgba(34,227,138,0.16)' : 'transparent',
    color: active ? '#22E38A' : '#8A90A2',
    whiteSpace: 'nowrap',
  }
}

export const segmentedWrap: React.CSSProperties = {
  display: 'flex',
  gap: 3,
  background: 'rgba(255,255,255,0.04)',
  padding: 3,
  borderRadius: 9,
  flexWrap: 'wrap',
}

export const modalBackdrop: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 50,
  background: 'rgba(6,7,10,0.65)',
  backdropFilter: 'blur(5px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
}

export const modalCard: React.CSSProperties = {
  width: 460,
  maxWidth: '100%',
  maxHeight: 'calc(100vh - 32px)',
  overflowY: 'auto',
  background: '#16181F',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 20,
  padding: 24,
  boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
}

export const closeBtn: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 9,
  border: 'none',
  background: 'rgba(255,255,255,0.06)',
  color: '#8A90A2',
  fontSize: 18,
  cursor: 'pointer',
  lineHeight: 1,
}
