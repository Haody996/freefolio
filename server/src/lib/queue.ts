import { Queue } from 'bullmq'
import IORedis from 'ioredis'

// A single shared Redis connection for producers. BullMQ requires
// maxRetriesPerRequest: null so blocking commands don't get killed.
export const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
})

// Queue names — kept in one place so producers and workers agree.
export const QUEUE_PRICES = 'prices'
export const QUEUE_NETWORTH = 'networth'

export const pricesQueue = new Queue(QUEUE_PRICES, { connection })
export const netWorthQueue = new Queue(QUEUE_NETWORTH, { connection })
