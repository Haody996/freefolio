import { describe, it, expect, beforeAll } from 'vitest'
import express from 'express'
import compression from 'compression'
import http from 'http'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { serveClient } from './serveClient'
import { securityHeaders } from './lib/security'

let port = 0
const get = async (p: string, headers: Record<string, string> = {}) => {
  const r = await fetch(`http://127.0.0.1:${port}${p}`, { headers })
  return { status: r.status, headers: r.headers, body: await r.text() }
}

beforeAll(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ff-serve-'))
  fs.mkdirSync(path.join(dir, 'assets'))
  fs.writeFileSync(path.join(dir, 'assets', 'index-abc123.js'), `console.log(${JSON.stringify('x'.repeat(5000))})`)
  fs.writeFileSync(path.join(dir, 'robots.txt'), 'User-agent: *\n')
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><html><head><meta name="description" content="Generic" /><title>getfreefolio</title></head><body><div id="root"></div></body></html>')

  const app = express()
  app.use(securityHeaders)
  app.use(compression())
  serveClient(app, dir)
  const server = http.createServer(app).listen(0)
  await new Promise((r) => server.once('listening', r))
  port = (server.address() as { port: number }).port
  return () => server.close()
})

describe('serving the built client', () => {
  it('caches hashed bundles forever and other files briefly', async () => {
    const asset = await get('/assets/index-abc123.js')
    expect(asset.status).toBe(200)
    expect(asset.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
    expect((await get('/robots.txt')).headers.get('cache-control')).toBe('public, max-age=3600')
  })

  it('always revalidates HTML and adds per-page SEO tags', async () => {
    const home = await get('/')
    expect(home.headers.get('cache-control')).toBe('no-cache')
    expect(home.headers.get('content-type')).toMatch(/text\/html/)
    expect(home.body).toContain('<div id="root">')
    expect((await get('/calculators/fire')).body).toContain('<title>FIRE Calculator')
    expect((await get('/debts')).body).toContain('<title>getfreefolio</title>') // SPA route
  })

  it('compresses text responses when the browser asks', async () => {
    const plain = await fetch(`http://127.0.0.1:${port}/assets/index-abc123.js`, { headers: { 'Accept-Encoding': 'identity' } })
    const gzipped = await fetch(`http://127.0.0.1:${port}/assets/index-abc123.js`, { headers: { 'Accept-Encoding': 'gzip' } })
    expect(plain.headers.get('content-encoding')).toBeNull()
    expect(gzipped.headers.get('content-encoding')).toBe('gzip')
  })
})

describe('security headers', () => {
  it('sets the standard protections on every response', async () => {
    const h = (await get('/')).headers
    expect(h.get('x-content-type-options')).toBe('nosniff')
    expect(h.get('x-frame-options')).toBe('DENY')
    expect(h.get('referrer-policy')).toBe('strict-origin-when-cross-origin')
    expect(h.get('permissions-policy')).toContain('geolocation=()')
    expect(h.get('cross-origin-opener-policy')).toBe('same-origin-allow-popups')
  })

  it('allows Google sign-in, Google Fonts and remote images in the CSP', async () => {
    const csp = (await get('/')).headers.get('content-security-policy')!
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("script-src 'self' https://accounts.google.com")
    expect(csp).toContain('https://fonts.gstatic.com')
    expect(csp).toMatch(/style-src[^;]*https:\/\/accounts\.google\.com/) // Google sign-in stylesheet
    expect(csp).toContain("img-src 'self' data: https:")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("object-src 'none'")
  })

  it('sends HSTS only over HTTPS', async () => {
    expect((await get('/')).headers.get('strict-transport-security')).toBeNull()
    const proxied = await get('/', { 'X-Forwarded-Proto': 'https' })
    expect(proxied.headers.get('strict-transport-security')).toBe('max-age=63072000; includeSubDomains')
  })
})
