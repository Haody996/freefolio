import { Router, Request, Response } from 'express'
import { allow } from '../lib/rateLimit'

const router = Router()

const clip = (v: unknown, n: number) => String(v ?? '').slice(0, n)

// POST /api/client-errors — browser crashes, logged for debugging. No auth
// (errors can happen before login); rate-limited per IP and size-capped.
router.post('/', (req: Request, res: Response): void => {
  if (!allow(`client-error:${req.ip}`, 20, 60 * 60 * 1000)) {
    res.status(429).end()
    return
  }
  const b = req.body ?? {}
  console.error(
    `[client-error] ${clip(b.message, 300)} | where: ${clip(b.where, 80)} | page: ${clip(b.url, 200)} | ua: ${clip(req.get('user-agent'), 200)}\n${clip(b.stack, 1500)}${b.componentStack ? `\ncomponent stack:${clip(b.componentStack, 800)}` : ''}`
  )
  res.status(204).end()
})

export default router
