import 'dotenv/config'
import { Worker } from 'bullmq'
import { connection, QUEUE_AUTOINVEST } from '../lib/queue'
import { processDueAutoInvest } from '../lib/auto-invest'

const worker = new Worker(
  QUEUE_AUTOINVEST,
  async () => {
    return processDueAutoInvest()
  },
  { connection }
)

worker.on('completed', (job) => console.log(`[auto-invest] Job ${job.id} completed`))
worker.on('failed', (job, err) => console.error(`[auto-invest] Job ${job?.id} failed:`, err))

console.log('[auto-invest] Worker started, listening on queue:', QUEUE_AUTOINVEST)
