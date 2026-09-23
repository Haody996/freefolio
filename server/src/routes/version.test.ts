import { describe, it, expect, beforeAll } from 'vitest'
import express from 'express'
import http from 'http'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { currentAsset, versionRouter } from './version'

const INDEX = '<!doctype html><html><head><script type="module" crossorigin src="/assets/index-DmsqT4Md.js"></script><link rel="stylesheet" href="/assets/index-Xy12.css"></head><body></body></html>'

let dir = ''
let port = 0
const getJson = async (p: string) => {
  const r = await fetch(`http://127.0.0.1:${port}${p}`)
  return { status: r.status, cacheControl: r.headers.get('cache-control'), body: await r.json() }
}

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ff-version-'))
  fs.writeFileSync(path.join(dir, 'index.html'), INDEX)
  const app = express()
  app.use('/api/version', versionRouter(dir))
  app.use('/api/dev-version', versionRouter(null))
  const server = http.createServer(app).listen(0)
  await new Promise((r) => server.once('listening', r))
  port = (server.address() as { port: number }).port
})

describe('currentAsset', () => {
  it('reads the hashed entry bundle out of index.html', () => {
    expect(currentAsset(dir)).toBe('index-DmsqT4Md.js')
  })

  it('returns null when there is no build to read', () => {
    expect(currentAsset(path.join(dir, 'missing'))).toBeNull()
  })

  it('returns null when the markup has no entry bundle', () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'ff-version-empty-'))
    fs.writeFileSync(path.join(empty, 'index.html'), '<!doctype html><html><body>no scripts</body></html>')
    expect(currentAsset(empty)).toBeNull()
  })
})

describe('GET /api/version', () => {
  it('serves the current bundle name and is never cached', async () => {
    const res = await getJson('/api/version')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ asset: 'index-DmsqT4Md.js' })
    expect(res.cacheControl).toBe('no-store')
  })

  it('reports no version in development, where Vite serves the app', async () => {
    expect((await getJson('/api/dev-version')).body).toEqual({ asset: null })
  })
})
