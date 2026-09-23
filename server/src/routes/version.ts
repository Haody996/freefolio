import { Router, Response } from 'express'
import fs from 'fs'
import path from 'path'

// The filename of the current client build (content-hashed by Vite). Browsers
// compare it with the bundle they are running to notice a new deploy.
export function currentAsset(clientDist: string, read = fs.readFileSync): string | null {
  try {
    const html = String(read(path.join(clientDist, 'index.html')))
    return html.match(/\/assets\/(index-[A-Za-z0-9_-]+\.js)/)?.[1] ?? null
  } catch {
    return null
  }
}

export function versionRouter(clientDist: string | null): Router {
  const router = Router()
  let cached: { at: number; asset: string | null } | null = null

  // GET /api/version → { asset } — null in development, where Vite serves the app.
  router.get('/', (_req, res: Response): void => {
    if (!clientDist) {
      res.json({ asset: null })
      return
    }
    if (!cached || Date.now() - cached.at > 30_000) cached = { at: Date.now(), asset: currentAsset(clientDist) }
    res.set('Cache-Control', 'no-store').json({ asset: cached.asset })
  })
  return router
}
