/**
 * MonetizationHooks.js — SDK-agnostic stubs for Rewarded Video Ads and IAP.
 *
 * These functions are the ONLY integration point with external ad/payment SDKs.
 * When a real SDK (e.g. AdMob Web, Unity Ads, Stripe) becomes available, replace
 * the bodies here — all game-logic callers remain unchanged.
 *
 * Contracts:
 *   - Both functions always RESOLVE (never reject).  Callers must not add .catch().
 *   - A missing/blocked SDK is treated as "not rewarded / not purchased".
 */

/**
 * Request a Rewarded Video Ad.
 *
 * @returns {Promise<{rewarded: boolean}>}
 *   rewarded=true  — user watched the full ad; caller should grant the reward.
 *   rewarded=false — user dismissed, ad failed to fill, or SDK not available.
 */
export async function showRewardedAd() {
  // TODO: Replace with real SDK call, e.g.:
  //   const result = await window.adSdk.showRewarded(AD_UNIT_ID)
  //   return { rewarded: result.rewardEarned }
  console.info('[MonetizationHooks] showRewardedAd — stub (no SDK integrated yet)')
  return { rewarded: true }
}

/**
 * Initiate an In-App Purchase.
 *
 * @param {string} productId — e.g. 'starter_pack_99c', 'no_ads', 'prime_coins_1k'
 * @returns {Promise<{purchased: boolean}>}
 *   purchased=true  — transaction completed; caller should credit the item.
 *   purchased=false — cancelled, failed, or SDK not available.
 */
export async function purchaseIAP(productId) {
  // TODO: Replace with real SDK call, e.g.:
  //   const result = await window.iapSdk.purchase(productId)
  //   return { purchased: result.success }
  console.info(`[MonetizationHooks] purchaseIAP("${productId}") — stub (no SDK integrated yet)`)
  // Default: no free IAP rewards in stub mode so the economy stays balanced during dev.
  return { purchased: false }
}
