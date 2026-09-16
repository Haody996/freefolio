import { useEffect } from 'react'

// Keep <title> and the meta description in sync on client-side navigation.
export function useSeo(title: string, description: string) {
  useEffect(() => {
    const prevTitle = document.title
    document.title = title
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    const created = !meta
    if (!meta) {
      meta = document.createElement('meta')
      meta.name = 'description'
      document.head.appendChild(meta)
    }
    const prevDesc = meta.content
    meta.content = description
    return () => {
      document.title = prevTitle
      if (created) meta?.remove()
      else if (meta) meta.content = prevDesc
    }
  }, [title, description])
}
