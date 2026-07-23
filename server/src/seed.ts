import 'dotenv/config'
import bcrypt from 'bcryptjs'
import prisma from './lib/prisma'
import { snapshotNetWorth } from './lib/networth'

// Seeds a demo user with a couple of accounts, a holding, and a retirement plan.
// Run with: npm run seed
async function main() {
  const email = 'demo@freefolio.net'
  const password = await bcrypt.hash('password123', 12)

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      password,
      profile: { create: { firstName: 'Demo', lastName: 'User' } },
      retirementPlan: {
        create: {
          currentAge: 32,
          retirementAge: 50,
          currentSavings: 120000,
          annualContribution: 30000,
          annualExpenses: 45000,
        },
      },
    },
  })

  // A cash account with a balance...
  const cash = await prisma.account.create({
    data: {
      userId: user.id,
      name: 'Checking',
      kind: 'ASSET',
      category: 'CASH',
      balances: { create: { amount: 15000 } },
    },
  })

  // ...an investment (brokerage) account with a holding...
  const brokerage = await prisma.account.create({
    data: {
      userId: user.id,
      name: 'Brokerage',
      kind: 'ASSET',
      category: 'INVESTMENT',
      isInvestment: true,
      holdings: {
        create: [
          { symbol: 'VTI', assetType: 'ETF', quantity: 200, costBasis: 40000 },
          { symbol: 'AAPL', assetType: 'STOCK', quantity: 50, costBasis: 8000 },
        ],
      },
    },
  })

  // ...and a liability.
  await prisma.account.create({
    data: {
      userId: user.id,
      name: 'Student Loan',
      kind: 'LIABILITY',
      category: 'LOAN',
      balances: { create: { amount: 22000 } },
    },
  })

  await snapshotNetWorth(user.id)

  console.log('Seeded demo user:', email, '/ password123')
  console.log('Accounts:', cash.name, brokerage.name, 'Student Loan')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
