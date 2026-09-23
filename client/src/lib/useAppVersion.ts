import { useEffect, useState } from 'react'

// Notices a new deploy: compares the bundle this tab is running with the one
// the server currently serves. Checks periodically and when the tab regains
// focus, so a long-open tab doesn't stay on an old version silently.
const CHECK_INTERVAL = 5 * 60 * 1000
const MIN_GAP = 60 * 1000

// "https://host/assets/index-DmsqT4Md.js?x=1" -> "index-DmsqT4Md.js"
export function assetName(src: string | null | undefined): string | null {
  const file = src?.split(/[?#]/)[0].split('/').pop()
  return file && /^index-[A-Za-z0-9_-]+\.js$/.test(file) ? file : null
}

export function runningAsset(): string | null {
  return assetName(document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/index-"]')?.src)
}

export function useAppVersion(): boolean {
  const [stale, setStale] = useState(false)

  useEffect(() => {
    const running = runningAsset()
    if (!running) return // dev server, or the script tag moved
    let last = 0
    let cancelled = false

    async function check() {
      if (cancelled || document.hidden || Date.now() - last < MIN_GAP) return
      last = Date.now()
      try {
        const res = await fetch('/api/version', { cache: 'no-store' })
        if (!res.ok) return
        const { asset } = (await res.json()) as { asset: string | null }
        if (asset && asset !== running) setStale(true)
      } catch {
        // offline or server restarting — try again on the next tick
      }
    }

    const timer = setInterval(check, CHECK_INTERVAL)
    const onVisible = () => {
      if (!document.hidden) check()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      cancelled = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [])

  return stale
}
