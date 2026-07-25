import { Router, Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { OAuth2Client } from 'google-auth-library'
import prisma from '../lib/prisma'

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)

const router = Router()

function signToken(userId: string): string {
  return jwt.sign({ userId }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' })
}

// Emails listed in ADMIN_EMAILS (comma-separated) are auto-granted admin.
function isAdminEmail(email: string): boolean {
  const list = (process.env.ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
  return list.includes(email.toLowerCase())
}

// Promote a user to admin if their email is allow-listed. Returns effective isAdmin.
async function ensureAdmin(userId: string, email: string, current: boolean): Promise<boolean> {
  if (!current && isAdminEmail(email)) {
    await prisma.user.update({ where: { id: userId }, data: { isAdmin: true } })
    return true
  }
  return current
}

// POST /api/auth/register
router.post('/register', async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' })
    return
  }
  if (password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters' })
    return
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    res.status(409).json({ error: 'Email already registered' })
    return
  }

  const hashed = await bcrypt.hash(password, 12)
  const user = await prisma.user.create({
    data: {
      email,
      password: hashed,
      isAdmin: isAdminEmail(email),
      profile: { create: { firstName: '', lastName: '' } },
      projection: { create: {} },
    },
  })

  res.status(201).json({ token: signToken(user.id), user: { id: user.id, email: user.email, isAdmin: user.isAdmin } })
})

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' })
    return
  }

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user || !user.password) {
    res.status(401).json({ error: 'Invalid credentials' })
    return
  }

  const valid = await bcrypt.compare(password, user.password)
  if (!valid) {
    res.status(401).json({ error: 'Invalid credentials' })
    return
  }

  const isAdmin = await ensureAdmin(user.id, user.email, user.isAdmin)
  res.json({
    token: signToken(user.id),
    user: { id: user.id, email: user.email, isAdmin },
  })
})

// GET /api/auth/me
router.get('/me', async (req: Request, res: Response): Promise<void> => {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  try {
    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET || 'secret') as {
      userId: string
    }
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, isAdmin: true, createdAt: true },
    })
    if (!user) {
      res.status(404).json({ error: 'User not found' })
      return
    }
    const isAdmin = await ensureAdmin(user.id, user.email, user.isAdmin)
    res.json({ user: { ...user, isAdmin } })
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
})

// POST /api/auth/google
router.post('/google', async (req: Request, res: Response): Promise<void> => {
  const { credential } = req.body
  if (!credential) {
    res.status(400).json({ error: 'Missing Google credential' })
    return
  }

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    })
    const payload = ticket.getPayload()
    if (!payload?.email) {
      res.status(401).json({ error: 'Invalid Google token' })
      return
    }

    const { email, given_name, family_name } = payload

    let user = await prisma.user.findUnique({ where: { email }, include: { profile: true } })
    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          profile: { create: { firstName: given_name || '', lastName: family_name || '' } },
          projection: { create: {} },
        },
        include: { profile: true },
      })
    } else if (user.profile && !user.profile.firstName && given_name) {
      await prisma.profile.update({
        where: { userId: user.id },
        data: { firstName: given_name, lastName: family_name || '' },
      })
    } else if (!user.profile) {
      await prisma.profile.create({
        data: { userId: user.id, firstName: given_name || '', lastName: family_name || '' },
      })
    }

    const isAdmin = await ensureAdmin(user.id, user.email, user.isAdmin)
    res.json({
      token: signToken(user.id),
      user: { id: user.id, email: user.email, isAdmin },
    })
  } catch (err: any) {
    console.error('[google-auth] Verification failed:', String(err))
    res.status(401).json({ error: 'Google authentication failed' })
  }
})

export default router
