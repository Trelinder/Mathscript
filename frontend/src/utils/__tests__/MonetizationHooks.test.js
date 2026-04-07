/**
 * MonetizationHooks.test.js
 *
 * Unit tests for the SDK-agnostic Rewarded Ad and IAP stub hooks.
 * These tests verify the public contract of the module — always resolves,
 * returns the expected shape, and never throws — so that higher-level game
 * logic that calls these hooks can rely on predictable behaviour.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('MonetizationHooks — public API surface', () => {
  it('exports showRewardedAd as a function', async () => {
    const mod = await import('../MonetizationHooks.js')
    expect(typeof mod.showRewardedAd).toBe('function')
  })

  it('exports purchaseIAP as a function', async () => {
    const mod = await import('../MonetizationHooks.js')
    expect(typeof mod.purchaseIAP).toBe('function')
  })
})

describe('showRewardedAd — stub behaviour', () => {
  it('returns a Promise', async () => {
    const { showRewardedAd } = await import('../MonetizationHooks.js')
    const result = showRewardedAd()
    expect(result).toBeInstanceOf(Promise)
    await result  // drain
  })

  it('resolves to an object with a boolean `rewarded` property', async () => {
    const { showRewardedAd } = await import('../MonetizationHooks.js')
    const result = await showRewardedAd()
    expect(result).toHaveProperty('rewarded')
    expect(typeof result.rewarded).toBe('boolean')
  })

  it('stub resolves with rewarded=true', async () => {
    const { showRewardedAd } = await import('../MonetizationHooks.js')
    const result = await showRewardedAd()
    expect(result.rewarded).toBe(true)
  })

  it('never rejects — even if called multiple times rapidly', async () => {
    const { showRewardedAd } = await import('../MonetizationHooks.js')
    await expect(Promise.all([showRewardedAd(), showRewardedAd(), showRewardedAd()]))
      .resolves.not.toThrow()
  })
})

describe('purchaseIAP — stub behaviour', () => {
  it('returns a Promise', async () => {
    const { purchaseIAP } = await import('../MonetizationHooks.js')
    const result = purchaseIAP('starter_pack_99c')
    expect(result).toBeInstanceOf(Promise)
    await result  // drain
  })

  it('resolves to an object with a boolean `purchased` property', async () => {
    const { purchaseIAP } = await import('../MonetizationHooks.js')
    const result = await purchaseIAP('no_ads')
    expect(result).toHaveProperty('purchased')
    expect(typeof result.purchased).toBe('boolean')
  })

  it('stub resolves with purchased=false to prevent accidental free rewards', async () => {
    const { purchaseIAP } = await import('../MonetizationHooks.js')
    const result = await purchaseIAP('prime_coins_1k')
    expect(result.purchased).toBe(false)
  })

  it('accepts any string productId without throwing', async () => {
    const { purchaseIAP } = await import('../MonetizationHooks.js')
    await expect(purchaseIAP('unknown_product_xyz')).resolves.not.toThrow()
    await expect(purchaseIAP('')).resolves.not.toThrow()
  })

  it('never rejects', async () => {
    const { purchaseIAP } = await import('../MonetizationHooks.js')
    await expect(purchaseIAP('any_product')).resolves.toBeDefined()
  })
})
