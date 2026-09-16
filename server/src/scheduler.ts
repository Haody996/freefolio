import { pricesQueue, netWorthQueue, autoInvestQueue, digestQueue } from './lib/queue'

// Registers repeatable BullMQ jobs. The workers (price-refresh-worker,
// networth-snapshot-worker, auto-invest-worker, digest-worker) consume these. Repeatable jobs are deduped by key,
// so calling this on every boot is safe.
export async function initScheduler(): Promise<void> {
  const priceIntervalMin = Number(process.env.PRICE_REFRESH_INTERVAL_MIN) || 15

  // Refresh market prices every N minutes.
  await pricesQueue.add(
    'refresh-all',
    {},
    {
      repeat: { every: priceIntervalMin * 60 * 1000 },
      jobId: 'price-refresh',
      removeOnComplete: true,
      removeOnFail: 100,
    }
  )

  // Apply due auto-invest (DCA) contributions at 00:00 UTC — before the snapshot.
  await autoInvestQueue.add(
    'process-due',
    {},
    {
      repeat: { pattern: '0 0 * * *' },
      jobId: 'auto-invest-daily',
      removeOnComplete: true,
      removeOnFail: 100,
    }
  )

  // Snapshot every user's net worth once a day at 00:05 UTC.
  await netWorthQueue.add(
    'snapshot-all',
    {},
    {
      repeat: { pattern: '5 0 * * *' },
      jobId: 'networth-daily',
      removeOnComplete: true,
      removeOnFail: 100,
    }
  )

  // Email digests at 14:00 UTC (morning in the US): weekly on Mondays, monthly
  // on the 1st — the worker decides who is due.
  await digestQueue.add(
    'send-due',
    {},
    {
      repeat: { pattern: '0 14 * * *' },
      jobId: 'digest-daily',
      removeOnComplete: true,
      removeOnFail: 100,
    }
  )

  console.log('[scheduler] Repeatable jobs registered')
}
