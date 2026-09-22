import express, { Express } from 'express'
import path from 'path'
import { createIndexRenderer } from './seo'

// Serves the built React app: content-hashed bundles cached forever, other
// files briefly, and index.html revalidated every time (with per-route SEO tags).
export function serveClient(app: Express, clientDist: string): void {
  const renderIndex = createIndexRenderer(path.join(clientDist, 'index.html'))
  app.use('/assets', express.static(path.join(clientDist, 'assets'), { immutable: true, maxAge: '1y' }))
  app.use(express.static(clientDist, { index: false, maxAge: '1h' }))
  app.get('*splat', (req, res) => {
    res.type('html').set('Cache-Control', 'no-cache').send(renderIndex(req.path))
  })
}
