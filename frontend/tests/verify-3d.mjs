import { mkdir } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const baseUrl = process.env.MATHSCRIPT_URL || 'http://127.0.0.1:5173'
const outputDirectory = 'test-results/3d'

await mkdir(outputDirectory, { recursive: true })

const browser = await chromium.launch({ headless: true })
const scenarios = [
    { name: 'desktop', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
    { name: 'mobile', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
]

try {
    for (const scenario of scenarios) {
        const context = await browser.newContext({
            viewport: scenario.viewport,
            deviceScaleFactor: scenario.deviceScaleFactor,
            isMobile: scenario.isMobile,
            hasTouch: scenario.hasTouch,
            reducedMotion: 'no-preference',
        })
        const page = await context.newPage()
        const pageErrors = []
        page.on('pageerror', (error) => pageErrors.push(error.message))
        await page.addInitScript(() => {
            window.localStorage.setItem('mst_economy_v8', JSON.stringify({ hasCompletedTutorial: true }))
        })

        await page.goto(`${baseUrl}/play.html?s=anonymous`, { waitUntil: 'domcontentloaded' })
        const startButton = page.getByRole('button', { name: /FOUND YOUR EMPIRE|CONTINUE EMPIRE/i })
        await startButton.waitFor({ state: 'visible', timeout: 20_000 })
        await startButton.click()

        const shell = page.locator('.tycoon-3d-shell')
        const canvas = shell.locator('canvas')
        await shell.waitFor({ state: 'visible', timeout: 15_000 })
        await canvas.waitFor({ state: 'visible', timeout: 15_000 })
        await page.waitForTimeout(2_000)

        const canvasPixels = await canvas.evaluate(async (element) => {
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
            const gl = element.getContext('webgl2') || element.getContext('webgl')
            if (!gl) return { available: false, variedPixels: 0, width: 0, height: 0 }
            const width = gl.drawingBufferWidth
            const height = gl.drawingBufferHeight
            const pixels = new Uint8Array(width * height * 4)
            gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
            let variedPixels = 0
            const stride = Math.max(4, Math.floor(pixels.length / 20_000 / 4) * 4)
            for (let index = 0; index < pixels.length; index += stride) {
                if (pixels[index] > 8 || pixels[index + 1] > 8 || pixels[index + 2] > 8) variedPixels += 1
            }
            return { available: true, variedPixels, width, height }
        })

        if (!canvasPixels.available || canvasPixels.width < 200 || canvasPixels.height < 200) {
            throw new Error(`${scenario.name}: WebGL canvas did not initialize at a usable size`)
        }
        if (canvasPixels.variedPixels < 150) {
            throw new Error(`${scenario.name}: WebGL framebuffer appears blank (${canvasPixels.variedPixels} varied samples)`)
        }

        const bounds = await page.evaluate(() => {
            const rect = (selector) => {
                const element = document.querySelector(selector)
                if (!element) return null
                const box = element.getBoundingClientRect()
                return { top: box.top, right: box.right, bottom: box.bottom, left: box.left, width: box.width, height: box.height }
            }
            return {
                shell: rect('.tycoon-3d-shell'),
                inspector: rect('.tycoon-3d-inspector'),
                navigation: rect('.tycoon-3d-floor-nav'),
                logistics: rect('.tycoon-3d-logistics'),
            }
        })

        for (const [name, box] of Object.entries(bounds)) {
            if (!box || box.width <= 0 || box.height <= 0) throw new Error(`${scenario.name}: ${name} is missing or collapsed`)
        }
        for (const [name, box] of Object.entries(bounds).filter(([name]) => name !== 'shell')) {
            if (box.left < bounds.shell.left - 1 || box.right > bounds.shell.right + 1 || box.top < bounds.shell.top - 1 || box.bottom > bounds.shell.bottom + 1) {
                throw new Error(`${scenario.name}: ${name} escapes the 3D scene bounds`)
            }
        }

        await page.locator('.tycoon-3d-floor-nav button').nth(1).click()
        await page.locator('.tycoon-3d-inspector').getByText('BATTLE DOJO', { exact: true }).waitFor({ state: 'visible' })
        await page.screenshot({ path: `${outputDirectory}/${scenario.name}.png`, fullPage: true })

        if (pageErrors.length) throw new Error(`${scenario.name}: page errors: ${pageErrors.join(' | ')}`)
        console.log(`${scenario.name}: ${canvasPixels.width}x${canvasPixels.height}, ${canvasPixels.variedPixels} varied pixel samples`)
        await context.close()
    }
} finally {
    await browser.close()
}