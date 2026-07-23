export default function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0E0F13',
        padding: 16,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 380,
          background: '#16181F',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 20,
          padding: 32,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
          <svg width="20" height="20" viewBox="0 0 18 18">
            <rect x="9" y="0" width="12.7" height="12.7" transform="rotate(45 9 9)" fill="#22E38A" />
          </svg>
          <span style={{ fontFamily: "'Space Grotesk'", fontWeight: 700, fontSize: 20, letterSpacing: -0.5 }}>getfreefolio</span>
        </div>
        <h1 style={{ margin: '0 0 4px', fontFamily: "'Space Grotesk'", fontSize: 19, fontWeight: 700 }}>{title}</h1>
        <p style={{ margin: '0 0 22px', fontSize: 13, color: '#8A90A2' }}>{subtitle}</p>
        {children}
      </div>
    </div>
  )
}
