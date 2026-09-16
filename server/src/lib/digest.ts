import jwt from 'jsonwebtoken'
import prisma from './prisma'
import { DigestFrequency } from '@prisma/client'
import { computeBalances } from './networth'
import { getHistory, assetTypeForCategory, mapLimit } from './prices'

// Weekly / monthly email digest: net-worth change over the period, top movers,
// and FIRE progress.

const DAY = 86_400_000

export function appUrl(): string {
  return (process.env.CLIENT_URL || 'https://getfreefolio.com').replace(/\/$/, '')
}

// Long-lived, purpose-scoped token for the one-click unsubscribe link.
export function unsubscribeToken(userId: string): string {
  return jwt.sign({ userId, purpose: 'digest-unsubscribe' }, process.env.JWT_SECRET || 'secret')
}

export function verifyUnsubscribeToken(token: string): string | null {
  try {
    const p = jwt.verify(token, process.env.JWT_SECRET || 'secret') as { userId?: string; purpose?: string }
    return p.purpose === 'digest-unsubscribe' && p.userId ? p.userId : null
  } catch {
    return null
  }
}

export interface Mover {
  symbol: string
  name: string
  change: number // $ over the period on current quantity
  changePct: number
}

export interface DigestData {
  frequency: Exclude<DigestFrequency, 'OFF'>
  firstName: string
  periodLabel: string
  startDate: string
  netWorth: number
  assets: number
  liabilities: number
  startNetWorth: number | null
  change: number | null
  changePct: number | null
  gainers: Mover[]
  decliners: Mover[]
  fire: { invested: number; goal: number; progress: number; goalLabel: string } | null
}

function periodStart(freq: Exclude<DigestFrequency, 'OFF'>, now: Date): Date {
  if (freq === 'WEEKLY') return new Date(now.getTime() - 7 * DAY)
  const d = new Date(now)
  d.setUTCMonth(d.getUTCMonth() - 1)
  return d
}

export async function buildDigestData(userId: string, frequency: Exclude<DigestFrequency, 'OFF'>, now: Date = new Date()): Promise<DigestData> {
  const start = periodStart(frequency, now)
  const startDay = start.toISOString().slice(0, 10)
  const [user, balances, holdings, settings, before, after] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, include: { profile: true } }),
    computeBalances(userId),
    prisma.holding.findMany({ where: { userId } }),
    prisma.projectionSettings.findUnique({ where: { userId } }),
    prisma.netWorthSnapshot.findFirst({ where: { userId, date: { lte: new Date(startDay) } }, orderBy: { date: 'desc' } }),
    prisma.netWorthSnapshot.findFirst({ where: { userId, date: { gt: new Date(startDay) } }, orderBy: { date: 'asc' } }),
  ])
  const baseline = before ?? after
  const startNetWorth = baseline && baseline.date.getTime() < now.getTime() - DAY ? baseline.netWorth : null
  const change = startNetWorth != null ? balances.netWorth - startNetWorth : null

  // Movers: price change since the period start × current quantity, per ticker.
  const priced = holdings.filter((h) => assetTypeForCategory(h.category) && h.quantity > 0)
  const hists = await mapLimit(priced, 4, (h) => getHistory(h.symbol, assetTypeForCategory(h.category)!, 40, { providerId: h.providerId }))
  const bySymbol = new Map<string, Mover & { base: number }>()
  priced.forEach((h, i) => {
    const startPx = hists[i].filter((p) => p.date <= startDay).pop()?.price
    if (!startPx) return
    const m = bySymbol.get(h.symbol) ?? { symbol: h.symbol, name: h.name, change: 0, changePct: 0, base: 0 }
    m.change += h.quantity * (h.price - startPx)
    m.base += h.quantity * startPx
    bySymbol.set(h.symbol, m)
  })
  const movers = [...bySymbol.values()].map(({ base, ...m }) => ({ ...m, changePct: base ? m.change / base : 0 }))
  const gainers = movers.filter((m) => m.change > 0).sort((a, b) => b.change - a.change).slice(0, 3)
  const decliners = movers.filter((m) => m.change < 0).sort((a, b) => a.change - b.change).slice(0, 3)

  // FIRE progress: the user's own goal, else the classic FIRE number — 25× annual
  // spending net of guaranteed income, grossed up for taxes.
  let fire: DigestData['fire'] = null
  if (settings) {
    const netSpending = Math.max(0, settings.annualSpending + settings.healthcareAnnual - settings.socialSecurityAnnual - settings.pensionAnnual)
    const fireNumber = (netSpending / Math.max(0.05, 1 - settings.taxRatePct / 100)) * 25
    const goal = settings.fireGoal ?? fireNumber
    if (goal > 0) {
      fire = {
        invested: balances.investable,
        goal,
        progress: balances.investable / goal,
        goalLabel: settings.fireGoal != null ? 'your FIRE goal' : 'your FIRE number',
      }
    }
  }

  return {
    frequency,
    firstName: user?.profile?.firstName || '',
    periodLabel: frequency === 'WEEKLY' ? 'this week' : 'this month',
    startDate: startDay,
    netWorth: balances.netWorth,
    assets: balances.assets,
    liabilities: balances.liabilities,
    startNetWorth,
    change,
    changePct: change != null && startNetWorth ? change / Math.abs(startNetWorth) : null,
    gainers,
    decliners,
    fire,
  }
}

// ─── Rendering ───────────────────────────────────────────────────────

const usd = (n: number) => (n < 0 ? '−' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('en-US')
const signedUsd = (n: number) => (n >= 0 ? '+' : '−') + '$' + Math.abs(Math.round(n)).toLocaleString('en-US')
const signedPct = (x: number) => (x >= 0 ? '+' : '−') + Math.abs(x * 100).toFixed(2) + '%'
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

const GREEN = '#22E38A'
const RED = '#FF5470'
const MUTED = '#8A90A2'

export function renderDigest(d: DigestData, userId: string): { subject: string; html: string; text: string } {
  const up = (d.change ?? 0) >= 0
  const subject =
    d.change != null
      ? `Your net worth ${up ? 'rose' : 'fell'} ${signedUsd(d.change)} ${d.periodLabel}`
      : `Your ${d.frequency === 'WEEKLY' ? 'weekly' : 'monthly'} getfreefolio digest`
  const unsub = `${appUrl()}/api/digest/unsubscribe?token=${encodeURIComponent(unsubscribeToken(userId))}`
  const settingsUrl = `${appUrl()}/settings`

  const moverRows = (list: Mover[], color: string) =>
    list
      .map(
        (m) => `<tr>
          <td style="padding:6px 0;font-weight:700;color:#F2F4F8">${esc(m.symbol)} <span style="font-weight:400;color:${MUTED}">${esc(m.name)}</span></td>
          <td align="right" style="padding:6px 0;color:${color};font-weight:700;white-space:nowrap">${signedUsd(m.change)} <span style="font-weight:400">(${signedPct(m.changePct)})</span></td>
        </tr>`
      )
      .join('')

  const section = (title: string, body: string) =>
    `<tr><td style="padding:20px 28px 0"><div style="font-size:11px;letter-spacing:1px;font-weight:700;color:${MUTED};text-transform:uppercase;margin-bottom:8px">${title}</div>${body}</td></tr>`

  const fireBar = d.fire
    ? section(
        'FIRE progress',
        `<div style="font-size:14px;color:#C9CDD8;margin-bottom:8px"><b style="color:#F2F4F8">${usd(d.fire.invested)}</b> invested toward ${esc(d.fire.goalLabel)} of <b style="color:#F2F4F8">${usd(d.fire.goal)}</b>${d.fire.goalLabel === 'your FIRE number' ? `<div style="font-size:12px;color:${MUTED};margin-top:2px">25× your annual retirement spending, net of Social Security &amp; pensions</div>` : ''}</div>
         <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>
           <td style="background:#2A2D36;border-radius:6px;height:10px;padding:0">
             <div style="width:${Math.min(100, Math.max(1, d.fire.progress * 100)).toFixed(1)}%;height:10px;border-radius:6px;background:#FF7A00"></div>
           </td>
           <td width="60" align="right" style="font-weight:700;color:#F2F4F8;font-size:14px">${(d.fire.progress * 100).toFixed(1)}%</td>
         </tr></table>`
      )
    : ''

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#0E0F13">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#0E0F13" style="background:#0E0F13;font-family:Manrope,Helvetica,Arial,sans-serif">
<tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#16181F" style="max-width:560px;background:#16181F;border:1px solid #262933;border-radius:18px">
  <tr><td style="padding:24px 28px 0;font-size:18px;font-weight:700;color:#F2F4F8"><span style="color:${GREEN}">◆</span> getfreefolio</td></tr>
  <tr><td style="padding:18px 28px 0;font-size:15px;color:#C9CDD8">${d.firstName ? `Hi ${esc(d.firstName)}, here` : 'Here'}’s how your money did ${d.periodLabel}.</td></tr>
  <tr><td style="padding:18px 28px 0">
    <div style="font-size:11px;letter-spacing:1px;font-weight:700;color:${MUTED}">NET WORTH</div>
    <div style="font-size:34px;font-weight:700;color:#F2F4F8;margin:4px 0">${usd(d.netWorth)}</div>
    ${d.change != null ? `<div style="font-size:15px;font-weight:700;color:${up ? GREEN : RED}">${signedUsd(d.change)}${d.changePct != null ? ` (${signedPct(d.changePct)})` : ''} <span style="font-weight:400;color:${MUTED}">since ${d.startDate}</span></div>` : `<div style="font-size:13px;color:${MUTED}">Not enough history yet to show a change.</div>`}
    ${d.liabilities > 0 ? `<div style="font-size:13px;color:${MUTED};margin-top:6px">Assets ${usd(d.assets)} · Debts ${usd(d.liabilities)}</div>` : ''}
  </td></tr>
  ${d.gainers.length ? section('Top gainers', `<table role="presentation" width="100%" style="font-size:14px">${moverRows(d.gainers, GREEN)}</table>`) : ''}
  ${d.decliners.length ? section('Top decliners', `<table role="presentation" width="100%" style="font-size:14px">${moverRows(d.decliners, RED)}</table>`) : ''}
  ${fireBar}
  <tr><td style="padding:26px 28px"><a href="${appUrl()}/" style="display:inline-block;background:${GREEN};color:#04140C;font-weight:700;font-size:14px;text-decoration:none;padding:11px 18px;border-radius:10px">Open dashboard</a></td></tr>
</table>
<div style="max-width:560px;padding:16px 12px;font-size:12px;color:${MUTED};font-family:Helvetica,Arial,sans-serif">
  You’re getting this because you turned on the ${d.frequency === 'WEEKLY' ? 'weekly' : 'monthly'} digest.
  <a href="${settingsUrl}" style="color:${MUTED}">Email settings</a> · <a href="${unsub}" style="color:${MUTED}">Unsubscribe</a>
</div>
</td></tr></table></body></html>`

  const lines = [
    `${d.firstName ? `Hi ${d.firstName}, here` : 'Here'}’s how your money did ${d.periodLabel}.`,
    '',
    `Net worth: ${usd(d.netWorth)}${d.change != null ? ` (${signedUsd(d.change)} since ${d.startDate})` : ''}`,
    d.liabilities > 0 ? `Assets ${usd(d.assets)} · Debts ${usd(d.liabilities)}` : '',
    d.gainers.length ? `\nTop gainers: ${d.gainers.map((m) => `${m.symbol} ${signedUsd(m.change)}`).join(', ')}` : '',
    d.decliners.length ? `Top decliners: ${d.decliners.map((m) => `${m.symbol} ${signedUsd(m.change)}`).join(', ')}` : '',
    d.fire ? `\nFIRE progress: ${(d.fire.progress * 100).toFixed(1)}% — ${usd(d.fire.invested)} invested toward ${d.fire.goalLabel} of ${usd(d.fire.goal)}` : '',
    '',
    `Open dashboard: ${appUrl()}/`,
    `Unsubscribe: ${unsub}`,
  ]
  return { subject, html, text: lines.filter((l) => l !== '').join('\n') }
}

export function digestHeaders(userId: string): Record<string, string> {
  const unsub = `${appUrl()}/api/digest/unsubscribe?token=${encodeURIComponent(unsubscribeToken(userId))}`
  return { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
}

// Which users are due today: weekly on Mondays, monthly on the 1st (UTC), with a
// guard against double-sends if the job reruns.
export function isDue(freq: DigestFrequency, lastAt: Date | null, now: Date): boolean {
  if (freq === 'WEEKLY') return now.getUTCDay() === 1 && (!lastAt || now.getTime() - lastAt.getTime() > 6 * DAY)
  if (freq === 'MONTHLY') return now.getUTCDate() === 1 && (!lastAt || now.getTime() - lastAt.getTime() > 20 * DAY)
  return false
}
