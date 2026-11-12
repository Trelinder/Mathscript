import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const baseUrl = process.env.GAMES_TEST_URL || 'http://127.0.0.1:5176'
const unityPath = process.env.UNITY_GAME_PATH || '/data-center/index.html'
const artifacts = process.env.GAMES_AUDIT_ARTIFACTS || '/tmp/mathscript-mobile-audit'
const profiles = [
  { name: 'small-phone', width: 320, height: 568 },
  { name: 'android', width: 360, height: 800 },
  { name: 'iphone', width: 390, height: 844 },
  { name: 'large-phone', width: 430, height: 932 },
  { name: 'landscape', width: 844, height: 390 },
  { name: 'small-landscape', width: 568, height: 320 },
  { name: 'desktop', width: 1280, height: 800 },
]
await mkdir(artifacts, { recursive: true })
const browser = await chromium.launch({ headless: true })

async function snapshot(page) {
  await page.evaluate(() => {
    window.mathscriptSnapshot = null
    window.unityInstance.SendMessage('Mathscript Idle Miner', 'RequestSnapshot', '')
  })
  await page.waitForFunction(() => window.mathscriptSnapshot, null, { timeout: 15000 })
  return page.evaluate(() => window.mathscriptSnapshot)
}

async function frames(page, previous) {
  await page.waitForFunction(before => {
    window.unityInstance.SendMessage('Mathscript Idle Miner', 'RequestSnapshot', '')
    return window.mathscriptSnapshot?.frame >= before + 2
  }, previous, { timeout: 15000, polling: 100 })
}

async function waitState(page, predicate, timeout = 15000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const current = await snapshot(page)
    if (predicate(current)) return current
    await frames(page, current.frame)
  }
  assert.fail('Expected Unity state transition did not occur')
}

async function unityPress(page, title) {
  const session = await page.context().newCDPSession(page)
  try {
    let current = await snapshot(page)
    let control = current.controls.find(item => item.enabled && item.text.startsWith(title))
    let scrolled = false
    assert.ok(control, `Enabled Unity control: ${title}`)
    const canvas = await page.locator('canvas').boundingBox()
    for (let attempt = 0; current.dialogBounds.height > 0 && attempt < 12; attempt++) {
      const visible = current.dialogBounds
      if (control.bounds.y >= visible.y && control.bounds.y + control.bounds.height <= visible.y + visible.height) break
      const direction = control.bounds.y < visible.y ? -1 : 1
      scrolled = true
      const horizontal = canvas.x + (visible.x + visible.width / 2) * canvas.width / current.width
      const vertical = canvas.y + (visible.y + visible.height / 2) * canvas.height / current.height
      const distance = Math.min(140, visible.height * 0.35) * canvas.height / current.height
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: horizontal, y: vertical + direction * distance / 2 }] })
      for (let step = 1; step <= 6; step++) {
        await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: horizontal, y: vertical + direction * distance * (0.5 - step / 6) }] })
        await page.waitForTimeout(30)
      }
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await page.waitForTimeout(200)
      current = await snapshot(page)
      control = current.controls.find(item => item.enabled && item.text.startsWith(title))
      assert.ok(control, `Unity control remains available after scrolling: ${title}`)
    }
    if (scrolled) {
      let previousTop = control.bounds.y
      let stableSamples = 0
      current = await waitState(page, value => {
        const candidate = value.controls.find(item => item.enabled && item.text.startsWith(title))
        assert.ok(candidate)
        stableSamples = Math.abs(candidate.bounds.y - previousTop) < 0.1 ? stableSamples + 1 : 0
        previousTop = candidate.bounds.y
        return stableSamples >= 3
      })
      control = current.controls.find(item => item.enabled && item.text.startsWith(title))
    }
    const bounds = control.bounds
    assert.ok(bounds.x >= -1 && bounds.y >= -1 && bounds.x + bounds.width <= current.width + 1 && bounds.y + bounds.height <= current.height + 1, `Unity control fits viewport: ${title}`)
    if (current.dialogBounds.height > 0) {
      assert.ok(bounds.y >= current.dialogBounds.y - 1 && bounds.y + bounds.height <= current.dialogBounds.y + current.dialogBounds.height + 1, `Unity dialog control is reachable: ${title}`)
    }
    const horizontal = canvas.x + (bounds.x + bounds.width / 2) * canvas.width / current.width
    const vertical = canvas.y + (bounds.y + bounds.height / 2) * canvas.height / current.height
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: horizontal, y: vertical }] })
    await frames(page, current.frame)
    const pressed = await snapshot(page)
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await frames(page, pressed.frame)
  } finally {
    await session.detach()
  }
}

function watchErrors(page) {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error' || /Exception|MATHSCRIPT_.*FAIL|Unable to parse|SendMessage.*not found/.test(message.text())) errors.push(message.text())
  })
  page.on('requestfailed', request => errors.push(`${request.url()}: ${request.failure()?.errorText}`))
  return errors
}

async function checkPhoneControls(page, current) {
  const canvas = await page.locator('canvas').boundingBox()
  for (const control of current.controls) {
    assert.ok(control.bounds.x >= -1 && control.bounds.y >= -1 && control.bounds.x + control.bounds.width <= current.width + 1 && control.bounds.y + control.bounds.height <= current.height + 1, `Phone control is not clipped: ${control.text}`)
    assert.ok(control.bounds.height * canvas.height / current.height >= 43.9, `Phone control has a 44px touch target: ${control.text}`)
  }
}

async function verifyUnity(profile) {
  const context = await browser.newContext({ viewport: { width: profile.width, height: profile.height }, hasTouch: true, isMobile: profile.name !== 'desktop', deviceScaleFactor: 2 })
  try {
    const page = await context.newPage()
    const errors = watchErrors(page)
    await page.goto(new URL(unityPath, baseUrl).href)
    await page.waitForFunction(() => window.unityInstance, null, { timeout: 90000 })
    await waitState(page, current => current.controls.length > 0)
    const opening = await snapshot(page)
    assert.equal(opening.state.coins, 10)
    assert.equal(opening.state.levels[0], 0)
    if (profile.name !== 'desktop') await checkPhoneControls(page, opening)
    await page.screenshot({ path: `${artifacts}/unity-${profile.name}-opening.png` })
    await unityPress(page, '+ BUILD DEPARTMENT')
    const built = await snapshot(page)
    assert.equal(built.state.levels[0], 1, 'Physical touch builds exactly one department')
    assert.equal(built.state.coins, 0, 'Physical touch charges exactly ten coins')
    if (profile.name !== 'desktop') await checkPhoneControls(page, built)
    await unityPress(page, 'PROD')
    assert.equal((await snapshot(page)).state.bins[0], 7.5, 'Physical touch generates the displayed output')
    await unityPress(page, 'SEND')
    await waitState(page, current => current.state.compilerBuffer === 7.5)
    await unityPress(page, 'COMPILE')
    const compiled = await waitState(page, current => current.state.compiledRC === 3)
    assert.equal(compiled.state.coins, 6, 'Compilation pays the exact expected amount')
    assert.equal(compiled.state.compilerBuffer, 4.5, 'Transport and compilation conserve output')
    await unityPress(page, 'BUS OPTIONS')
    assert.ok((await snapshot(page)).dialogBounds.height > 0)
    await unityPress(page, 'CLOSE')
    const busClosed = await snapshot(page)
    assert.equal(busClosed.dialogBounds.height, 0, 'Bus dialog closes through settled physical touch')
    await unityPress(page, 'COMPILER OPTIONS')
    await page.screenshot({ path: `${artifacts}/unity-${profile.name}-dialog.png` })
    await unityPress(page, 'CLOSE')
    await unityPress(page, 'COMPANY')
    await unityPress(page, 'CLOSE')
    assert.equal((await snapshot(page)).dialogBounds.height, 0, 'Company dialog closes through real touch scrolling')
    await unityPress(page, 'v')
    assert.equal((await snapshot(page)).state.viewport, 1)
    await unityPress(page, '^')
    assert.equal((await snapshot(page)).state.viewport, 0)
    const before = await snapshot(page)
    await frames(page, before.frame)
    assert.ok((await snapshot(page)).frame > before.frame, 'Game frame loop advances')
    if (profile.name === 'iphone') {
      await page.setViewportSize({ width: 844, height: 390 })
      const rotated = await waitState(page, current => current.width === 1266 && current.height === 585)
      await frames(page, rotated.frame)
      await checkPhoneControls(page, await snapshot(page))
      assert.equal(rotated.state.coins, 6, 'Rotation preserves cash')
      assert.equal(rotated.state.compiledRC, 3, 'Rotation preserves completed output')
      await page.screenshot({ path: `${artifacts}/unity-rotation-landscape.png` })
      await page.setViewportSize({ width: profile.width, height: profile.height })
      await waitState(page, current => current.width === 585 && current.height === 1266)
    }
    await page.waitForTimeout(600)
    await page.reload()
    await page.waitForFunction(() => window.unityInstance, null, { timeout: 90000 })
    const restored = await waitState(page, current => current.controls.length > 0)
    assert.equal(restored.state.levels[0], 1, 'Department survives reload')
    assert.equal(restored.state.coins, 6, 'Cash survives reload without duplicate payouts')
    await page.screenshot({ path: `${artifacts}/unity-${profile.name}-played.png` })
    assert.deepEqual(errors, [], 'No Unity runtime, load, or input errors')
    console.log(`PASS Unity ${profile.name}: touch build/produce/send/compile/dialogs/navigation/save; ${profile.width}x${profile.height}`)
  } finally {
    await context.close()
  }
}

async function movesLeft(page) {
  const text = await page.getByText('Moves left', { exact: true }).evaluate(element => {
    let parent = element
    while (parent && !/\d/.test(parent.textContent)) parent = parent.parentElement
    return parent?.textContent || ''
  })
  return Number(text.match(/\d+/)?.[0])
}

function legalSwap(values) {
  const matches = (row, column) => {
    const value = values[row][column]
    let horizontal = 1
    let vertical = 1
    for (let next = column - 1; next >= 0 && values[row][next] === value; next--) horizontal++
    for (let next = column + 1; next < 8 && values[row][next] === value; next++) horizontal++
    for (let next = row - 1; next >= 0 && values[next][column] === value; next--) vertical++
    for (let next = row + 1; next < 8 && values[next][column] === value; next++) vertical++
    return horizontal >= 3 || vertical >= 3
  }
  for (let row = 0; row < 8; row++) {
    for (let column = 0; column < 8; column++) {
      for (const [otherRow, otherColumn] of [[row + 1, column], [row, column + 1]]) {
        if (otherRow >= 8 || otherColumn >= 8 || values[row][column] === values[otherRow][otherColumn]) continue
        const original = values[row][column]
        values[row][column] = values[otherRow][otherColumn]
        values[otherRow][otherColumn] = original
        const valid = matches(row, column) || matches(otherRow, otherColumn)
        values[otherRow][otherColumn] = values[row][column]
        values[row][column] = original
        if (valid) return [[row + 1, column + 1], [otherRow + 1, otherColumn + 1]]
      }
    }
  }
  assert.fail('Crush starting board has no valid swap')
}

async function verifyCrush(profile) {
  const context = await browser.newContext({ viewport: { width: profile.width, height: profile.height }, hasTouch: true, isMobile: profile.name !== 'desktop', deviceScaleFactor: 2 })
  try {
    const page = await context.newPage()
    const errors = watchErrors(page)
    await page.goto(new URL('/mathscript-crush/index.html', baseUrl).href, { waitUntil: 'networkidle' })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Crush has no horizontal overflow')
    const cells = page.getByRole('button', { name: /^Row \d+, column \d+:/ })
    assert.equal(await cells.count(), 64)
    const labels = await cells.evaluateAll(elements => elements.map(element => element.getAttribute('aria-label')))
    const values = Array.from({ length: 8 }, () => Array(8))
    for (const label of labels) {
      const match = label.match(/Row (\d+), column (\d+):.*equals (\d+)/)
      assert.ok(match, 'Crush tiles expose their mathematical values')
      values[Number(match[1]) - 1][Number(match[2]) - 1] = Number(match[3])
    }
    const startingMoves = await movesLeft(page)
    const swap = legalSwap(values)
    for (const [row, column] of swap) await page.getByRole('button', { name: new RegExp(`^Row ${row}, column ${column}:`) }).tap()
    await page.waitForFunction(expected => {
      const label = [...document.querySelectorAll('*')].find(element => element.childElementCount === 0 && element.textContent.trim() === 'Moves left')
      let parent = label
      while (parent && !/\d/.test(parent.textContent)) parent = parent.parentElement
      return Number(parent?.textContent.match(/\d+/)?.[0]) === expected
    }, startingMoves - 1, { timeout: 10000 })
    await page.getByRole('button', { name: 'Pause and settings' }).tap()
    await page.getByRole('button', { name: 'Resume', exact: true }).waitFor({ state: 'visible' })
    await page.screenshot({ path: `${artifacts}/crush-${profile.name}-pause.png` })
    await page.getByRole('button', { name: 'Resume', exact: true }).tap()
    assert.equal(await movesLeft(page), startingMoves - 1, 'Pause/resume preserves the successful move')
    await page.getByRole('button', { name: 'Sqrt Soda', exact: true }).tap()
    assert.equal(await cells.count(), 64, 'Second game mode displays its board')
    await page.getByRole('button', { name: 'Algebra', exact: true }).tap()
    await page.screenshot({ path: `${artifacts}/crush-${profile.name}-played.png`, fullPage: true })
    assert.deepEqual(errors, [], 'No Crush runtime, load, or touch errors')
    console.log(`PASS Crush ${profile.name}: 64 tiles/legal touch swap/move count/pause/resume/both modes; ${profile.width}x${profile.height}`)
  } finally {
    await context.close()
  }
}

try {
  for (const profile of profiles.filter(item => !process.env.GAMES_AUDIT_PROFILE || item.name === process.env.GAMES_AUDIT_PROFILE)) {
    await verifyUnity(profile)
    await verifyCrush(profile)
  }
} finally {
  await browser.close()
}