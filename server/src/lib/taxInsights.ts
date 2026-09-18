import prisma from './prisma'
import { AccountType } from '@prisma/client'
import { computeGains, HarvestCandidate } from './gains'
import { assetLocation, rothLadder, replacementsFor, AssetLocation, Ladder, Replacement } from './tax'
import { NON_INVESTABLE } from './assets'

// Social Security multiplier for the claim age vs full retirement age 67
// (mirrors client/src/lib/retirement.ts ssClaimFactor).
export function ssClaimFactor(claimAge: number): number {
  const age = Math.max(62, Math.min(70, claimAge))
  if (age === 67) return 1
  if (age < 67) {
    const monthsEarly = (67 - age) * 12
    return 1 - (Math.min(monthsEarly, 36) * (5 / 9)) / 100 - (Math.max(0, monthsEarly - 36) * (5 / 12)) / 100
  }
  return 1 + ((age - 67) * 12 * (8 / 12)) / 100
}

const CONVERTIBLE: AccountType[] = ['TRADITIONAL_401K', 'TRADITIONAL_IRA']

export interface TaxInsights {
  assetLocation: AssetLocation
  rothLadder: Ladder
  harvest: (HarvestCandidate & { replacements: Replacement[]; replacementNote: string })[]
  settings: { filingStatus: 'SINGLE' | 'MARRIED_JOINT'; rothTargetBracketPct: number; retirementAge: number; currentAge: number }
}

export async function computeTaxInsights(userId: string): Promise<TaxInsights> {
  const [holdings, settingsRow, gains] = await Promise.all([
    prisma.holding.findMany({ where: { userId } }),
    prisma.projectionSettings.findUnique({ where: { userId } }),
    computeGains(userId),
  ])
  const s = settingsRow ?? (await prisma.projectionSettings.create({ data: { userId } }))

  const investable = holdings.filter((h) => !NON_INVESTABLE.includes(h.category))
  const investableTotal = investable.reduce((t, h) => t + h.quantity * h.price, 0)
  const convertible = investable.filter((h) => CONVERTIBLE.includes(h.accountType)).reduce((t, h) => t + h.quantity * h.price, 0)
  const realReturn = (1 + s.expectedReturnPct / 100) / (1 + s.inflationPct / 100) - 1 - s.aumFeePct / 100

  return {
    assetLocation: assetLocation(investable),
    rothLadder: rothLadder({
      currentAge: s.currentAge,
      retirementAge: s.retirementAge,
      convertibleBalance: convertible,
      investableTotal,
      monthlyContribution: s.monthlyContribution,
      realReturn,
      socialSecurityAnnual: s.socialSecurityAnnual * ssClaimFactor(s.ssStartAge),
      ssStartAge: s.ssStartAge,
      pensionAnnual: s.pensionAnnual,
      pensionStartAge: s.pensionStartAge,
      filingStatus: s.filingStatus,
      targetBracketPct: s.rothTargetBracketPct,
    }),
    harvest: gains.harvest.map((h) => {
      const r = replacementsFor(h.symbol, h.category)
      return { ...h, replacements: r.replacements, replacementNote: r.note }
    }),
    settings: { filingStatus: s.filingStatus, rothTargetBracketPct: s.rothTargetBracketPct, retirementAge: s.retirementAge, currentAge: s.currentAge },
  }
}
