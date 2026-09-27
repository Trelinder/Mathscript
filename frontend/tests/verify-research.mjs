import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'

const baseUrl = process.env.MATHSCRIPT_URL || 'http://127.0.0.1:5174'
const browser = await chromium.launch({ headless: true })

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  await context.addInitScript(() => {
    if (localStorage.getItem('mst_economy_v8')) return
    localStorage.setItem('mst_economy_v8', JSON.stringify({
      coins: 5000,
      lifetime: 100000,
      hasCompletedTutorial: true,
    }))
  })

  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', error => pageErrors.push(error.message))

  await page.goto(`${baseUrl}/play.html`, { waitUntil: 'domcontentloaded' })
  const enterGame = page.getByRole('button', { name: /FOUND YOUR EMPIRE|CONTINUE EMPIRE/i })
  if (await enterGame.isVisible().catch(() => false)) await enterGame.click()
  await page.getByRole('button', { name: /R&D/ }).waitFor({ state: 'visible' })

  await page.getByRole('button', { name: /R&D/ }).click()
  await page.getByRole('button', { name: 'Upgrade Server Scheduling for $500' }).click()
  await page.getByRole('button', { name: 'Upgrade Server Scheduling for $900' }).waitFor({ state: 'visible' })
  await page.getByText('0.53', { exact: true }).first().waitFor({ state: 'visible' })
  await page.waitForTimeout(2200)

  const purchasedState = await page.evaluate(() => JSON.parse(localStorage.getItem('mst_economy_v8')))
  assert.equal(purchasedState.coins, 4500)
  assert.equal(purchasedState.research.compute, 1)

  await page.getByRole('button', { name: 'Close research' }).click()
  await page.getByRole('button', { name: /PRIME REFACTOR/ }).click()
  await page.getByRole('button', { name: 'Confirm refactor and earn 3 prime tokens' }).click()
  await page.getByRole('button', { name: /R&D/ }).waitFor({ state: 'visible' })
  const refactoredState = await page.evaluate(() => JSON.parse(localStorage.getItem('mst_economy_v8')))
  assert.equal(refactoredState.coins, 1000)
  assert.equal(refactoredState.research.compute, 1)

  await page.reload({ waitUntil: 'domcontentloaded' })
  const enterGameAgain = page.getByRole('button', { name: /FOUND YOUR EMPIRE|CONTINUE EMPIRE/i })
  if (await enterGameAgain.isVisible().catch(() => false)) await enterGameAgain.click()
  await page.getByRole('button', { name: /R&D/ }).click()
  await page.getByText('LEVEL 1/5').waitFor({ state: 'visible' })

  assert.deepEqual(pageErrors, [])
  console.log('Research purchase updates production and survives a reload.')
  await context.close()
} finally {
  await browser.close()
}