// Renders the assistant's plain-text replies: paragraphs, "- " bullet lists
// and **bold**. Everything else is shown as text (never as HTML).
function inline(text: string, key: string) {
  return text.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <b key={`${key}-${i}`} style={{ color: '#F2F4F8' }}>
          {part.slice(2, -2)}
        </b>
      )
    }
    if (part.length > 2 && part.startsWith('*') && part.endsWith('*')) return <i key={`${key}-${i}`}>{part.slice(1, -1)}</i>
    return <span key={`${key}-${i}`}>{part}</span>
  })
}

export default function RichText({ text }: { text: string }) {
  const blocks = text.trim().split(/\n{2,}/)
  return (
    <>
      {blocks.map((block, bi) => {
        const lines = block.split('\n')
        const bullets = lines.every((l) => /^\s*([-*•]|\d+\.)\s+/.test(l))
        if (bullets) {
          return (
            <ul key={bi} style={{ margin: '0 0 8px', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {lines.map((l, li) => (
                <li key={li}>{inline(l.replace(/^\s*([-*•]|\d+\.)\s+/, ''), `${bi}-${li}`)}</li>
              ))}
            </ul>
          )
        }
        return (
          <p key={bi} style={{ margin: '0 0 8px' }}>
            {lines.map((l, li) => (
              <span key={li}>
                {li > 0 && <br />}
                {inline(l, `${bi}-${li}`)}
              </span>
            ))}
          </p>
        )
      })}
    </>
  )
}
