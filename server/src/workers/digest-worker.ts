import 'dotenv/config'
import { Worker } from 'bullmq'
import { connection, QUEUE_DIGEST } from '../lib/queue'
import prisma from '../lib/prisma'
import { buildDigestData, renderDigest, digestHeaders, isDue } from '../lib/digest'
import { isEmailConfigured, sendMail } from '../lib/mailer'

// Send the weekly / monthly digest to every user who is due today.
export async function sendDueDigests(now = new Date()): Promise<number> {
  if (!isEmailConfigured()) {
    console.log('[digest] SMTP not configured — skipping')
    return 0
  }
  const users = await prisma.user.findMany({
    where: { digestFrequency: { not: 'OFF' } },
    select: { id: true, email: true, digestFrequency: true, lastDigestAt: true },
  })
  let sent = 0
  for (const u of users) {
    if (u.digestFrequency === 'OFF' || !isDue(u.digestFrequency, u.lastDigestAt, now)) continue
    try {
      const msg = renderDigest(await buildDigestData(u.id, u.digestFrequency, now), u.id)
      await sendMail({ to: u.email, ...msg, headers: digestHeaders(u.id) })
      await prisma.user.update({ where: { id: u.id }, data: { lastDigestAt: now } })
      sent++
    } catch (err) {
      console.error(`[digest] Failed for user ${u.id}:`, String(err))
    }
  }
  console.log(`[digest] Sent ${sent} digest(s)`)
  return sent
}

const worker = new Worker(QUEUE_DIGEST, async () => sendDueDigests(), { connection })

worker.on('completed', (job) => console.log(`[digest] Job ${job.id} completed`))
worker.on('failed', (job, err) => console.error(`[digest] Job ${job?.id} failed:`, err))

console.log('[digest] Worker started, listening on queue:', QUEUE_DIGEST)
