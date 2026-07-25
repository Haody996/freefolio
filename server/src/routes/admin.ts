import { Router, Response, NextFunction } from 'express'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import prisma from '../lib/prisma'

const router = Router()
router.use(authMiddleware)

// Admin-only guard — checks isAdmin from the database (not just the token).
router.use(async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  const u = await prisma.user.findUnique({ where: { id: req.userId }, select: { isAdmin: true } })
  if (!u?.isAdmin) {
    res.status(403).json({ error: 'Admin only' })
    return
  }
  next()
})

// GET /api/admin/users — all users with holdings count + net worth.
router.get('/users', async (_req: AuthRequest, res: Response): Promise<void> => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      email: true,
      isAdmin: true,
      createdAt: true,
      profile: { select: { firstName: true, lastName: true } },
      _count: { select: { holdings: true, netWorthHistory: true } },
    },
  })

  const holdings = await prisma.holding.findMany({ select: { userId: true, quantity: true, price: true } })
  const nwByUser = new Map<string, number>()
  for (const h of holdings) nwByUser.set(h.userId, (nwByUser.get(h.userId) || 0) + h.quantity * h.price)

  res.json({
    users: users.map((u) => ({
      id: u.id,
      email: u.email,
      isAdmin: u.isAdmin,
      createdAt: u.createdAt,
      name: [u.profile?.firstName, u.profile?.lastName].filter(Boolean).join(' '),
      holdingsCount: u._count.holdings,
      snapshots: u._count.netWorthHistory,
      netWorth: nwByUser.get(u.id) || 0,
    })),
  })
})

// PATCH /api/admin/users/:id — toggle admin. Can't demote yourself (avoid lockout).
router.patch('/users/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const id = req.params.id as string
  const { isAdmin } = req.body
  if (id === req.userId && isAdmin === false) {
    res.status(400).json({ error: "You can't remove your own admin access." })
    return
  }
  const user = await prisma.user.findUnique({ where: { id } })
  if (!user) {
    res.status(404).json({ error: 'User not found' })
    return
  }
  const updated = await prisma.user.update({ where: { id }, data: { isAdmin: !!isAdmin }, select: { id: true, isAdmin: true } })
  res.json({ user: updated })
})

// DELETE /api/admin/users/:id — delete a user (and cascades). Can't delete yourself.
router.delete('/users/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const id = req.params.id as string
  if (id === req.userId) {
    res.status(400).json({ error: "You can't delete your own account here." })
    return
  }
  const user = await prisma.user.findUnique({ where: { id } })
  if (!user) {
    res.status(404).json({ error: 'User not found' })
    return
  }
  await prisma.user.delete({ where: { id } })
  res.json({ ok: true })
})

export default router
