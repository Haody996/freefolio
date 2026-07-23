import 'dotenv/config'
import { Worker } from 'bullmq'
import { connection, QUEUE_NETWORTH } from '../lib/queue'
import prisma from '../lib/prisma'
import { snapshotNetWorth } from '../lib/networth'

// Snapshot today's net worth for every user. Idempotent — reruns just overwrite
// the same (userId, date) row.
async function snapshotAll(): Promise<number> {
  const users = await prisma.user.findMany({ select: { id: true } })
  let count = 0
  for (const u of users) {
    try {
      await snapshotNetWorth(u.id)
      count++
    } catch (err) {
      console.error(`[networth] Snapshot failed for user ${u.id}:`, String(err))
    }
  }
  console.log(`[networth] Snapshotted ${count}/${users.length} users`)
  return count
}

const worker = new Worker(
  QUEUE_NETWORTH,
  async () => {
    return snapshotAll()
  },
  { connection }
)

worker.on('completed', (job) => console.log(`[networth] Job ${job.id} completed`))
worker.on('failed', (job, err) => console.error(`[networth] Job ${job?.id} failed:`, err))

console.log('[networth] Worker started, listening on queue:', QUEUE_NETWORTH)
