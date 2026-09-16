import { Router, Request, Response } from 'express'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import prisma from '../lib/prisma'
import { buildDigestData, renderDigest, digestHeaders, verifyUnsubscribeToken, appUrl } from '../lib/digest'
import { isEmailConfigured, sendMail } from '../lib/mailer'
import { DigestFrequency } from '@prisma/client'

const router = Router()

function normFrequency(f: unknown): DigestFrequency | null {
  const up = String(f || '').toUpperCase()
  return up === 'OFF' || up === 'WEEKLY' || up === 'MONTHLY' ? up : null
}

// One-click unsubscribe from the email link (GET for people, POST for mail
// clients honoring List-Unsubscribe-Post). No login needed — the token is scoped.
async function unsubscribe(req: Request, res: Response): Promise<void> {
  const userId = verifyUnsubscribeToken(String(req.query.token || ''))
  if (!userId) {
    res.status(400).send('Invalid or expired unsubscribe link.')
    return
  }
  await prisma.user.updateMany({ where: { id: userId }, data: { digestFrequency: 'OFF' } })
  res
    .type('html')
    .send(
      `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribed · getfreefolio</title><body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0E0F13;color:#F2F4F8;font-family:system-ui,sans-serif"><div style="text-align:center;padding:24px"><h1 style="font-size:22px">You're unsubscribed</h1><p style="color:#8A90A2">You won't get digest emails anymore. You can turn them back on in <a style="color:#22E38A" href="${appUrl()}/settings">settings</a>.</p></div></body>`
    )
}
router.get('/unsubscribe', unsubscribe)
router.post('/unsubscribe', unsubscribe)

router.use(authMiddleware)

// GET /api/digest/settings
router.get('/settings', async (req: AuthRequest, res: Response): Promise<void> => {
  const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { email: true, digestFrequency: true, lastDigestAt: true } })
  if (!user) {
    res.status(404).json({ error: 'User not found' })
    return
  }
  res.json({ ...user, emailEnabled: isEmailConfigured() })
})

// PUT /api/digest/settings { frequency: OFF | WEEKLY | MONTHLY }
router.put('/settings', async (req: AuthRequest, res: Response): Promise<void> => {
  const frequency = normFrequency(req.body.frequency)
  if (!frequency) {
    res.status(400).json({ error: 'frequency must be OFF, WEEKLY or MONTHLY' })
    return
  }
  const user = await prisma.user.update({ where: { id: req.userId }, data: { digestFrequency: frequency }, select: { digestFrequency: true } })
  res.json(user)
})

// GET /api/digest/preview?frequency=WEEKLY — the rendered email (HTML).
router.get('/preview', async (req: AuthRequest, res: Response): Promise<void> => {
  const f = normFrequency(req.query.frequency)
  const frequency = f === 'MONTHLY' ? 'MONTHLY' : 'WEEKLY'
  const { subject, html } = renderDigest(await buildDigestData(req.userId!, frequency), req.userId!)
  res.json({ subject, html })
})

// POST /api/digest/test { frequency } — send the digest to yourself now.
router.post('/test', async (req: AuthRequest, res: Response): Promise<void> => {
  if (!isEmailConfigured()) {
    res.status(503).json({ error: 'Email sending is not configured on this server.' })
    return
  }
  const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { email: true } })
  if (!user) {
    res.status(404).json({ error: 'User not found' })
    return
  }
  const frequency = normFrequency(req.body.frequency) === 'MONTHLY' ? 'MONTHLY' : 'WEEKLY'
  try {
    const msg = renderDigest(await buildDigestData(req.userId!, frequency), req.userId!)
    await sendMail({ to: user.email, ...msg, headers: digestHeaders(req.userId!) })
    res.json({ ok: true, to: user.email })
  } catch (err) {
    console.error('[digest] test send failed:', String(err))
    res.status(502).json({ error: 'Sending failed — check the SMTP settings.' })
  }
})

export default router
