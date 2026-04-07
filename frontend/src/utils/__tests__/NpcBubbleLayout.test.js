import { describe, it, expect } from 'vitest'
import {
  DEFAULT_BUBBLE_OPTIONS,
  computePanelSize,
  computeTailAnchor,
  computePortraitOffsets,
  worldToScreen,
  computeBubbleLayout,
} from '../NpcBubbleLayout.js'

// ─── DEFAULT_BUBBLE_OPTIONS ───────────────────────────────────────────────────

describe('DEFAULT_BUBBLE_OPTIONS', () => {
  it('exports a frozen object with all required keys including portrait fields', () => {
    expect(typeof DEFAULT_BUBBLE_OPTIONS).toBe('object')
    expect(DEFAULT_BUBBLE_OPTIONS.paddingH).toBeDefined()
    expect(DEFAULT_BUBBLE_OPTIONS.paddingV).toBeDefined()
    expect(DEFAULT_BUBBLE_OPTIONS.cornerSize).toBeDefined()
    expect(DEFAULT_BUBBLE_OPTIONS.minPanelW).toBeDefined()
    expect(DEFAULT_BUBBLE_OPTIONS.minPanelH).toBeDefined()
    expect(DEFAULT_BUBBLE_OPTIONS.tailH).toBeDefined()
    expect(DEFAULT_BUBBLE_OPTIONS.tailW).toBeDefined()
    expect(DEFAULT_BUBBLE_OPTIONS.tailPosition).toBeDefined()
    expect(DEFAULT_BUBBLE_OPTIONS.tailInset).toBeDefined()
    // Portrait column fields
    expect(DEFAULT_BUBBLE_OPTIONS.portraitW).toBeDefined()
    expect(DEFAULT_BUBBLE_OPTIONS.portraitH).toBeDefined()
    expect(DEFAULT_BUBBLE_OPTIONS.portraitGap).toBeDefined()
  })

  it('is frozen (immutable)', () => {
    expect(() => { DEFAULT_BUBBLE_OPTIONS.paddingH = 999 }).toThrow()
  })

  it('cornerSize × 2 < minPanelW (corners never overlap at minimum size)', () => {
    const { cornerSize, minPanelW, minPanelH } = DEFAULT_BUBBLE_OPTIONS
    expect(minPanelW).toBeGreaterThan(cornerSize * 2)
    expect(minPanelH).toBeGreaterThan(cornerSize * 2)
  })
})

// ─── computePanelSize ─────────────────────────────────────────────────────────

describe('computePanelSize — text bounds dictate panel dimensions', () => {
  it('adds symmetric paddingH on both sides of the text width', () => {
    const { panelW } = computePanelSize(100, 20)
    const { paddingH } = DEFAULT_BUBBLE_OPTIONS
    expect(panelW).toBeGreaterThanOrEqual(100 + paddingH * 2)
  })

  it('adds symmetric paddingV on both sides of the text height', () => {
    const { panelH } = computePanelSize(20, 50)
    const { paddingV } = DEFAULT_BUBBLE_OPTIONS
    expect(panelH).toBeGreaterThanOrEqual(50 + paddingV * 2)
  })

  it('respects minPanelW when text is very narrow', () => {
    const { panelW } = computePanelSize(0, 0)
    expect(panelW).toBeGreaterThanOrEqual(DEFAULT_BUBBLE_OPTIONS.minPanelW)
  })

  it('respects minPanelH when text is very short', () => {
    const { panelH } = computePanelSize(0, 0)
    expect(panelH).toBeGreaterThanOrEqual(DEFAULT_BUBBLE_OPTIONS.minPanelH)
  })

  it('corners never overlap — panelW >= cornerSize * 2 + 1', () => {
    for (const textW of [0, 10, 50, 200]) {
      const { panelW } = computePanelSize(textW, 10)
      const minNoOverlap = DEFAULT_BUBBLE_OPTIONS.cornerSize * 2 + 1
      expect(panelW).toBeGreaterThanOrEqual(minNoOverlap)
    }
  })

  it('corners never overlap — panelH >= cornerSize * 2 + 1', () => {
    for (const textH of [0, 10, 50, 200]) {
      const { panelH } = computePanelSize(10, textH)
      const minNoOverlap = DEFAULT_BUBBLE_OPTIONS.cornerSize * 2 + 1
      expect(panelH).toBeGreaterThanOrEqual(minNoOverlap)
    }
  })

  it('wider text produces wider panels', () => {
    const { panelW: w1 } = computePanelSize(100, 20)
    const { panelW: w2 } = computePanelSize(200, 20)
    expect(w2).toBeGreaterThan(w1)
  })

  it('taller text produces taller panels', () => {
    const { panelH: h1 } = computePanelSize(20, 20)
    const { panelH: h2 } = computePanelSize(20, 80)
    expect(h2).toBeGreaterThan(h1)
  })

  it('accepts custom padding via opts', () => {
    const { panelW } = computePanelSize(100, 20, { paddingH: 30 })
    expect(panelW).toBeGreaterThanOrEqual(100 + 30 * 2)
  })

  it('returns integer-rounded values (no sub-pixel panels)', () => {
    const { panelW, panelH } = computePanelSize(101.7, 33.4)
    expect(Number.isInteger(panelW)).toBe(true)
    expect(Number.isInteger(panelH)).toBe(true)
  })

  it('treats negative text dimensions as zero (guard for unmeasured text)', () => {
    const { panelW: wNeg } = computePanelSize(-50, -20)
    const { panelW: wZero } = computePanelSize(0, 0)
    expect(wNeg).toBe(wZero)
  })

  it('portrait column (portraitW > 0) widens the panel by portraitW + portraitGap', () => {
    const textW = 100, textH = 20
    const { panelW: base }     = computePanelSize(textW, textH)
    const portrait = { portraitW: 44, portraitH: 44, portraitGap: 8 }
    const { panelW: withPort } = computePanelSize(textW, textH, portrait)
    expect(withPort).toBe(base + portrait.portraitW + portrait.portraitGap)
  })

  it('portrait column does not affect panel height', () => {
    const { panelH: base }     = computePanelSize(100, 20)
    const { panelH: withPort } = computePanelSize(100, 20, { portraitW: 44 })
    expect(withPort).toBe(base)
  })

  it('portraitW = 0 (default) produces identical result to no-portrait call', () => {
    const { panelW: noOpt }   = computePanelSize(100, 20)
    const { panelW: zeroOpt } = computePanelSize(100, 20, { portraitW: 0 })
    expect(noOpt).toBe(zeroOpt)
  })
})

// ─── computePortraitOffsets ───────────────────────────────────────────────────

describe('computePortraitOffsets — portrait and text positions inside the panel', () => {
  it('portrait x equals paddingH (flush with left padding)', () => {
    const { portraitLocalX } = computePortraitOffsets(68)
    expect(portraitLocalX).toBe(DEFAULT_BUBBLE_OPTIONS.paddingH)
  })

  it('portrait is vertically centred in the panel', () => {
    const panelH = 68
    const { portraitLocalY } = computePortraitOffsets(panelH)
    const { portraitH } = DEFAULT_BUBBLE_OPTIONS
    expect(portraitLocalY).toBe(Math.round((panelH - portraitH) / 2))
  })

  it('textLocalX = paddingH + portraitW + portraitGap', () => {
    const { textLocalX } = computePortraitOffsets(68)
    const { paddingH, portraitW, portraitGap } = DEFAULT_BUBBLE_OPTIONS
    expect(textLocalX).toBe(paddingH + portraitW + portraitGap)
  })

  it('textLocalX is greater than paddingH when portrait is present', () => {
    const { textLocalX } = computePortraitOffsets(68, { portraitW: 44, portraitGap: 8 })
    expect(textLocalX).toBeGreaterThan(DEFAULT_BUBBLE_OPTIONS.paddingH)
  })

  it('custom portraitW and portraitGap are respected', () => {
    const { portraitLocalX, textLocalX } = computePortraitOffsets(80, {
      paddingH:   10,
      portraitW:  50,
      portraitGap: 6,
    })
    expect(portraitLocalX).toBe(10)
    expect(textLocalX).toBe(10 + 50 + 6)
  })

  it('returns numeric x, y and textLocalX', () => {
    const result = computePortraitOffsets(68)
    expect(typeof result.portraitLocalX).toBe('number')
    expect(typeof result.portraitLocalY).toBe('number')
    expect(typeof result.textLocalX).toBe('number')
  })
})

// ─── computeTailAnchor ────────────────────────────────────────────────────────

describe('computeTailAnchor — tail anchors to the bottom edge of the panel', () => {
  it('y always equals panelH (flush with the bottom edge)', () => {
    for (const h of [44, 60, 120]) {
      const { y } = computeTailAnchor(200, h)
      expect(y).toBe(h)
    }
  })

  it('bottom-centre: x = panelW / 2', () => {
    const { x } = computeTailAnchor(200, 60, { tailPosition: 'bottom-centre' })
    expect(x).toBe(100)
  })

  it('bottom-left: x = tailInset', () => {
    const inset = 25
    const { x } = computeTailAnchor(200, 60, { tailPosition: 'bottom-left', tailInset: inset })
    expect(x).toBe(inset)
  })

  it('bottom-right: x = panelW - tailInset', () => {
    const inset = 25
    const { x } = computeTailAnchor(200, 60, { tailPosition: 'bottom-right', tailInset: inset })
    expect(x).toBe(200 - inset)
  })

  it('default tailPosition is bottom-centre', () => {
    const { x } = computeTailAnchor(160, 60)
    expect(x).toBe(80)  // 160 / 2
  })

  it('tail x is independent of panel height', () => {
    const { x: x1 } = computeTailAnchor(200, 44)
    const { x: x2 } = computeTailAnchor(200, 120)
    expect(x1).toBe(x2)  // same panelW → same centre x
  })

  it('tail x changes when panelW changes (centre tracks panel width)', () => {
    const { x: x1 } = computeTailAnchor(100, 60)
    const { x: x2 } = computeTailAnchor(200, 60)
    expect(x2).toBeGreaterThan(x1)
  })

  it('returns numeric x and y properties', () => {
    const result = computeTailAnchor(200, 60)
    expect(typeof result.x).toBe('number')
    expect(typeof result.y).toBe('number')
  })
})

// ─── worldToScreen ────────────────────────────────────────────────────────────

describe('worldToScreen — isometric world → 2D canvas projection', () => {
  it('returns (worldX, worldY - headOffsetY) when camera is at origin', () => {
    const { screenX, screenY } = worldToScreen(400, 300, 80, { x: 0, y: 0 })
    expect(screenX).toBe(400)
    expect(screenY).toBe(220)  // 300 - 80
  })

  it('subtracts camera.x from world X', () => {
    const { screenX } = worldToScreen(400, 300, 0, { x: 100, y: 0 })
    expect(screenX).toBe(300)
  })

  it('subtracts camera.y from (worldY - headOffsetY)', () => {
    const { screenY } = worldToScreen(400, 300, 50, { x: 0, y: 30 })
    expect(screenY).toBe(220)  // (300 - 50) - 30 = 220
  })

  it('a positive headOffsetY moves the bubble up (smaller screenY)', () => {
    const { screenY: y0 } = worldToScreen(400, 300, 0,   { x: 0, y: 0 })
    const { screenY: y1 } = worldToScreen(400, 300, 80,  { x: 0, y: 0 })
    const { screenY: y2 } = worldToScreen(400, 300, 160, { x: 0, y: 0 })
    expect(y1).toBeLessThan(y0)
    expect(y2).toBeLessThan(y1)
  })

  it('handles zero headOffsetY', () => {
    const { screenY } = worldToScreen(400, 300, 0, { x: 0, y: 0 })
    expect(screenY).toBe(300)
  })

  it('uses { x: 0, y: 0 } when camera is null/undefined', () => {
    const { screenX, screenY } = worldToScreen(400, 300, 80, null)
    expect(screenX).toBe(400)
    expect(screenY).toBe(220)
  })

  it('camera pan right moves bubble left on screen', () => {
    const { screenX: x0 } = worldToScreen(400, 300, 80, { x: 0,   y: 0 })
    const { screenX: x1 } = worldToScreen(400, 300, 80, { x: 100, y: 0 })
    expect(x1).toBeLessThan(x0)
  })

  it('camera pan down moves bubble up on screen', () => {
    const { screenY: y0 } = worldToScreen(400, 300, 80, { x: 0, y: 0   })
    const { screenY: y1 } = worldToScreen(400, 300, 80, { x: 0, y: 100 })
    expect(y1).toBeLessThan(y0)
  })
})

// ─── computeBubbleLayout — integration ───────────────────────────────────────

describe('computeBubbleLayout — full layout integration', () => {
  const baseArgs = [100, 20, 400, 300, 80, { x: 0, y: 0 }]

  it('returns all required layout fields', () => {
    const layout = computeBubbleLayout(...baseArgs)
    expect(typeof layout.panelW).toBe('number')
    expect(typeof layout.panelH).toBe('number')
    expect(typeof layout.tailX).toBe('number')
    expect(typeof layout.tailY).toBe('number')
    expect(typeof layout.textOffsetX).toBe('number')
    expect(typeof layout.textOffsetY).toBe('number')
    expect(typeof layout.containerX).toBe('number')
    expect(typeof layout.containerY).toBe('number')
    // Portrait offset fields always present (zero when no portrait)
    expect(typeof layout.portraitLocalX).toBe('number')
    expect(typeof layout.portraitLocalY).toBe('number')
  })

  it('tailY equals panelH (tail flush with panel bottom)', () => {
    const { tailY, panelH } = computeBubbleLayout(...baseArgs)
    expect(tailY).toBe(panelH)
  })

  it('containerX centres the panel over the NPC', () => {
    const { containerX, panelW } = computeBubbleLayout(...baseArgs)
    // NPC world X = 400, camera at 0 → screenX = 400
    // containerX = screenX - panelW / 2
    expect(containerX).toBeCloseTo(400 - panelW / 2)
  })

  it('containerY places the bubble top so bottom-of-tail = screenY', () => {
    const { containerY, panelH } = computeBubbleLayout(...baseArgs)
    const { tailH } = DEFAULT_BUBBLE_OPTIONS
    const screenY = 300 - 80  // worldY - headOffsetY = 220, camera at 0
    // containerY + panelH + tailH = screenY
    expect(containerY + panelH + tailH).toBeCloseTo(screenY)
  })

  it('wider text produces a wider panel and a correspondingly shifted containerX', () => {
    const layoutNarrow = computeBubbleLayout(50,  20, 400, 300, 80, { x: 0, y: 0 })
    const layoutWide   = computeBubbleLayout(250, 20, 400, 300, 80, { x: 0, y: 0 })
    expect(layoutWide.panelW).toBeGreaterThan(layoutNarrow.panelW)
    // containerX shifts left for wider panel (still centred on 400)
    expect(layoutWide.containerX).toBeLessThan(layoutNarrow.containerX)
  })

  it('textOffsetX equals paddingH when no portrait (text starts after left padding)', () => {
    const { textOffsetX } = computeBubbleLayout(...baseArgs)
    expect(textOffsetX).toBe(DEFAULT_BUBBLE_OPTIONS.paddingH)
  })

  it('textOffsetY equals panelH / 2 (text vertically centred in panel)', () => {
    const { textOffsetY, panelH } = computeBubbleLayout(...baseArgs)
    expect(textOffsetY).toBe(panelH / 2)
  })

  it('without portrait: portraitLocalX and portraitLocalY are both 0', () => {
    const { portraitLocalX, portraitLocalY } = computeBubbleLayout(...baseArgs)
    expect(portraitLocalX).toBe(0)
    expect(portraitLocalY).toBe(0)
  })

  it('with portrait: textOffsetX > paddingH (text shifted right of portrait column)', () => {
    const { textOffsetX } = computeBubbleLayout(100, 20, 400, 300, 80, { x: 0, y: 0 }, {
      portraitW: 44, portraitGap: 8,
    })
    expect(textOffsetX).toBeGreaterThan(DEFAULT_BUBBLE_OPTIONS.paddingH)
  })

  it('with portrait: panel is wider than without portrait (same text)', () => {
    const { panelW: base }     = computeBubbleLayout(...baseArgs)
    const { panelW: withPort } = computeBubbleLayout(100, 20, 400, 300, 80, { x: 0, y: 0 }, {
      portraitW: 44, portraitGap: 8,
    })
    expect(withPort).toBeGreaterThan(base)
  })

  it('with portrait: tail y still equals panelH (tail anchored to full panel)', () => {
    const { tailY, panelH } = computeBubbleLayout(100, 20, 400, 300, 80, { x: 0, y: 0 }, {
      portraitW: 44, portraitGap: 8,
    })
    expect(tailY).toBe(panelH)
  })

  it('with portrait: containerY still satisfies bottom-of-tail = screenY', () => {
    const { containerY, panelH } = computeBubbleLayout(100, 20, 400, 300, 80, { x: 0, y: 0 }, {
      portraitW: 44, portraitGap: 8,
    })
    const { tailH } = DEFAULT_BUBBLE_OPTIONS
    const screenY = 300 - 80
    expect(containerY + panelH + tailH).toBeCloseTo(screenY)
  })
})
