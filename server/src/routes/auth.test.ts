import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import http from 'http'

const db = vi.hoisted(() => ({ user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() } }))
vi.mock('../lib/prisma', () => ({ default: db }))

import authRoutes from './auth'
import { clear } from '../lib/rateLimit'
import bcrypt from 'bcryptjs'

async function post(path: string, body: unknown, ip = '203.0.113.1'): Promise<{ status: number; json: any }> {
  const app = express()
  app.set('trust proxy', true)
  app.use(express.json())
  app.use('/api/auth', authRoutes)
  const server = http.createServer(app).listen(0)
  try {
    const r = await fetch(`http://127.0.0.1:${(server.address() as { port: number }).port}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
      body: JSON.stringify(body),
    })
    return { status: r.status, json: await r.json().catch(() => ({})) }
  } finally {
    server.close()
  }
}

const creds = { email: 'someone@example.com', password: 'hunter2hunter2' }

describe('sign-in brute-force protection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clear('auth:198.51.100.7')
    clear('login:someone@example.com')
    clear('register:198.51.100.7')
  })

  it('blocks an account after repeated wrong passwords, and a correct one resets it', async () => {
    db.user.findUnique.mockResolvedValue({ id: 'u1', email: creds.email, password: await bcrypt.hash(creds.password, 4), isAdmin: false })
    for (let i = 0; i < 8; i++) expect((await post('/api/auth/login', { ...creds, password: 'wrong' }, '198.51.100.7')).status).toBe(401)
    const blocked = await post('/api/auth/login', { ...creds, password: 'wrong' }, '198.51.100.7')
    expect(blocked.status).toBe(429)
    expect(blocked.json.error).toMatch(/Too many attempts/)
    // Even the right password is refused while blocked.
    expect((await post('/api/auth/login', creds, '198.51.100.7')).status).toBe(429)

    clear('login:someone@example.com')
    expect((await post('/api/auth/login', creds, '198.51.100.7')).status).toBe(200)
    // The counter was reset by the successful sign-in.
    expect((await post('/api/auth/login', { ...creds, password: 'wrong' }, '198.51.100.7')).status).toBe(401)
  })

  it('caps attempts per IP across accounts', async () => {
    db.user.findUnique.mockResolvedValue(null)
    const ip = '198.51.100.8'
    clear(`auth:${ip}`)
    for (let i = 0; i < 30; i++) await post('/api/auth/login', { email: `user${i}@example.com`, password: 'x' }, ip)
    expect((await post('/api/auth/login', { email: 'fresh@example.com', password: 'x' }, ip)).status).toBe(429)
    expect((await post('/api/auth/google', { credential: 'x' }, ip)).status).toBe(429)
    expect((await post('/api/auth/login', { email: 'fresh@example.com', password: 'x' }, '198.51.100.9')).status).toBe(401)
  })

  it('limits new accounts per IP', async () => {
    db.user.findUnique.mockResolvedValue(null)
    db.user.create.mockImplementation(async () => ({ id: 'new', email: 'x@example.com', isAdmin: false }))
    const ip = '198.51.100.10'
    clear(`auth:${ip}`)
    clear(`register:${ip}`)
    for (let i = 0; i < 5; i++) expect((await post('/api/auth/register', { email: `new${i}@example.com`, password: 'hunter2hunter2' }, ip)).status).toBe(201)
    expect((await post('/api/auth/register', { email: 'more@example.com', password: 'hunter2hunter2' }, ip)).status).toBe(429)
  })

  it('still rejects missing fields before any limiting', async () => {
    expect((await post('/api/auth/login', { email: '' }, '198.51.100.11')).status).toBe(400)
  })
})
