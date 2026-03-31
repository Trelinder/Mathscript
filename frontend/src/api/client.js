const API_BASE = '/api';

export async function fetchCharacters() {
  const res = await fetch(`${API_BASE}/characters`);
  return res.json();
}

export async function fetchShop() {
  const res = await fetch(`${API_BASE}/shop`);
  return res.json();
}

export async function fetchSession(sessionId) {
  const res = await fetch(`${API_BASE}/session/${sessionId}`);
  return res.json();
}

export async function generateStory(hero, problem, sessionId, options = {}) {
  const body = {
    hero,
    problem,
    session_id: sessionId,
  }
  if (options.ageGroup) body.age_group = options.ageGroup
  if (options.playerName) body.player_name = options.playerName
  if (options.selectedRealm) body.selected_realm = options.selectedRealm
  if (options.forceFullAi) body.force_full_ai = true
  if (options.guild) body.guild = options.guild
  if (options.ideologyShift !== undefined) body.ideology_shift = options.ideologyShift
  const controller = new AbortController()
  const timeoutMs = options.timeoutMs || 28000
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  let res
  try {
    res = await fetch(`${API_BASE}/story`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Quest timed out. Quick Mode will trigger for simple math. Please retry.')
    }
    throw err
  } finally {
    clearTimeout(timeout)
  }
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Story generation failed');
  }
  return res.json();
}

export async function generateImage(hero, problem, sessionId) {
  const res = await fetch(`${API_BASE}/image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hero, problem, session_id: sessionId })
  });
  if (!res.ok) return null;
  return res.json();
}

export async function generateSegmentImage(hero, segmentText, segmentIndex, sessionId) {
  const res = await fetch(`${API_BASE}/segment-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hero, segment_text: segmentText, segment_index: segmentIndex, session_id: sessionId })
  });
  if (!res.ok) return null;
  return res.json();
}

export async function generateSegmentImagesBatch(hero, segments, sessionId) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 60000)
  try {
    const res = await fetch(`${API_BASE}/segment-images-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hero, segments, session_id: sessionId }),
      signal: controller.signal,
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

export async function generateTTS(text, voice = 'Kore', voiceId = null) {
  const body = { text, voice }
  if (voiceId) body.voice_id = voiceId
  const res = await fetch(`${API_BASE}/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) return null;
  return res.json();
}

export async function fetchTTSVoices() {
  const res = await fetch(`${API_BASE}/tts/voices`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.voices || [];
}

export async function buyItem(itemId, sessionId) {
  const res = await fetch(`${API_BASE}/shop/buy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ item_id: itemId, session_id: sessionId })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Purchase failed');
  }
  return res.json();
}

export async function equipItem(itemId, sessionId) {
  const res = await fetch(`${API_BASE}/shop/equip`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ item_id: itemId, session_id: sessionId })
  });
  if (!res.ok) { const err = await res.json(); throw new Error(err.detail || 'Equip failed'); }
  return res.json();
}

export async function unequipItem(itemId, sessionId) {
  const res = await fetch(`${API_BASE}/shop/unequip`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ item_id: itemId, session_id: sessionId })
  });
  if (!res.ok) { const err = await res.json(); throw new Error(err.detail || 'Unequip failed'); }
  return res.json();
}

export async function usePotion(potionId, sessionId) {
  const res = await fetch(`${API_BASE}/shop/use-potion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ potion_id: potionId, session_id: sessionId })
  });
  if (!res.ok) { const err = await res.json(); throw new Error(err.detail || 'Use failed'); }
  return res.json();
}

export function getPdfUrl(sessionId) {
  return `${API_BASE}/pdf/${sessionId}`;
}

export async function analyzeMathPhoto(file) {
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetch(`${API_BASE}/problem-from-image`, {
    method: 'POST',
    body: formData
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail || 'Could not read the photo')
  }
  return res.json()
}

export function getYoutubeUrl(query) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent('math for kids ' + query)}`;
}

export async function fetchSubscription(sessionId) {
  const res = await fetch(`${API_BASE}/subscription/${sessionId}`);
  if (!res.ok) return null;
  return res.json();
}

export async function fetchStripePrices() {
  const res = await fetch(`${API_BASE}/stripe/prices`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.prices || [];
}

export async function createCheckout(sessionId, priceId) {
  const res = await fetch(`${API_BASE}/stripe/create-checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, price_id: priceId })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Checkout failed');
  }
  return res.json();
}

export async function addBonusCoins(sessionId, coins) {
  const res = await fetch(`${API_BASE}/bonus-coins`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, coins })
  });
  if (!res.ok) return null;
  return res.json();
}

export async function createPortalSession(sessionId) {
  const res = await fetch(`${API_BASE}/stripe/portal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, price_id: '' })
  });
  if (!res.ok) return null;
  return res.json();
}

export async function updateSessionProfile(sessionId, profile) {
  const body = {
    session_id: sessionId,
    player_name: profile.playerName,
    age_group: profile.ageGroup,
    selected_realm: profile.selectedRealm,
  }
  if (profile.player_level !== undefined) body.player_level = profile.player_level
  if (profile.player_xp !== undefined) body.player_xp = profile.player_xp
  const res = await fetch(`${API_BASE}/session/profile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail || 'Profile update failed')
  }
  return res.json()
}

export async function claimDailyChest(sessionId) {
  const res = await fetch(`${API_BASE}/daily-chest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId }),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail || 'Could not open chest')
  }
  return res.json()
}

// ── Guild / Ideology / Perseverance / DDA ────────────────────────────────────

export async function fetchGuilds() {
  const res = await fetch(`${API_BASE}/guilds`)
  if (!res.ok) return []
  const data = await res.json()
  return data.guilds || []
}

export async function setPlayerGuild(sessionId, guild) {
  const res = await fetch(`${API_BASE}/session/guild`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, guild }),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail || 'Failed to set guild')
  }
  return res.json()
}

export async function getMentorHint(sessionId, equation, hero) {
  const res = await fetch(`${API_BASE}/mentor/hint`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, equation, hero }),
  })
  if (!res.ok) return null
  return res.json()
}

export async function getLogicSentryAnalysis(sessionId, hero, equation, correctAnswer, studentInput) {
  const res = await fetch(`${API_BASE}/logic-sentry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      hero,
      equation,
      correct_answer: correctAnswer,
      student_input: studentInput,
    }),
  })
  if (!res.ok) return null
  return res.json()
}

export async function getCorrectAnswerTutor(sessionId, hero, equation, correctAnswer) {
  const res = await fetch(`${API_BASE}/correct-answer-tutor`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      hero,
      equation,
      correct_answer: correctAnswer,
    }),
  })
  if (!res.ok) return null
  return res.json()
}

export async function recordHintUse(sessionId, eventuallyCorrect = false) {
  const res = await fetch(`${API_BASE}/player/hint`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, eventually_correct: eventuallyCorrect }),
  })
  if (!res.ok) return null
  return res.json()
}

export async function updateIdeology(sessionId, shift) {
  const res = await fetch(`${API_BASE}/player/ideology`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, shift }),
  })
  if (!res.ok) return null
  return res.json()
}

export async function fetchPlayerStats(sessionId) {
  const res = await fetch(`${API_BASE}/player/stats/${sessionId}`)
  if (!res.ok) return null
  return res.json()
}

// ── Concrete Packers telemetry ───────────────────────────────────────────────
// Fire-and-forget: never blocks the UI.  Errors are silently swallowed so
// a telemetry outage can never interrupt the learning experience.
export async function sendConcretePackersTelemetry(payload) {
  try {
    await fetch(`${API_BASE}/concrete-packers/telemetry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch {
    // intentionally silent — telemetry must never block or error the UI
  }
}

// ── Potion Alchemists telemetry ───────────────────────────────────────────────
// Fire-and-forget: never blocks the UI.
export async function sendPotionAlchemistsTelemetry(payload) {
  try {
    await fetch(`${API_BASE}/potion-alchemists/telemetry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch {
    // intentionally silent — telemetry must never block or error the UI
  }
}

export async function sendOrbitalEngineersTelemetry(payload) {
  try {
    await fetch(`${API_BASE}/orbital-engineers/telemetry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch {
    // intentionally silent — telemetry must never block or error the UI
  }
}

// ── Feature Flag admin API ─────────────────────────────────────────────────────

/** Fetch all flags with metadata (admin only — requires adminKey). */
export async function adminGetFeatureFlags(adminKey) {
  const res = await fetch(`${API_BASE}/admin/feature-flags`, {
    headers: { 'x-admin-key': adminKey },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()   // { flags: [{flag_name, is_active, description, updated_at}] }
}

/** Toggle a single flag on or off (admin only). */
export async function adminPatchFeatureFlag(adminKey, flagName, isActive) {
  const res = await fetch(`${API_BASE}/admin/feature-flags/${encodeURIComponent(flagName)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-key': adminKey,
    },
    body: JSON.stringify({ is_active: isActive }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()   // updated flag record
}

// ── Admin: promo code management ─────────────────────────────────────────────

/** List all promo codes (admin only). */
export async function adminListPromoCodes(adminKey) {
  const res = await fetch(`${API_BASE}/promo/list`, {
    headers: { 'x-admin-key': adminKey },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()   // { codes: [{code, duration_type, redeemed, redeemed_by, ...}] }
}

/** Batch-generate promo codes (admin only). */
export async function adminGeneratePromoCodes(adminKey, durationType, count) {
  const res = await fetch(`${API_BASE}/promo/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-key': adminKey,
    },
    body: JSON.stringify({ duration_type: durationType, count }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()   // { codes: string[], duration_type, grants_premium_days }
}

// ── Auth API ─────────────────────────────────────────────────────────────────

async function parseAuthJson(res) {
  try {
    return await res.json()
  } catch {
    throw new Error('Auth service temporarily unavailable.')
  }
}

export async function registerUser(username, password) {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  const data = await parseAuthJson(res)
  if (!res.ok) throw new Error(data.detail || 'Registration failed')
  return data  // { token, session_id, username }
}

export async function loginUser(username, password) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  const data = await parseAuthJson(res)
  if (!res.ok) throw new Error(data.detail || 'Login failed')
  return data  // { token, session_id, username, hero_unlocked, tycoon_currency }
}

// ── Auth: Guest, Forgot Password, Reset Password ──────────────────────────────

export async function guestLogin() {
  const res = await fetch(`${API_BASE}/auth/guest`, { method: 'POST' })
  const data = await parseAuthJson(res)
  if (!res.ok) throw new Error(data.detail || 'Could not start guest session')
  return data  // { token, session_id, username, is_guest: true }
}

export async function forgotPassword(username) {
  const res = await fetch(`${API_BASE}/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username }),
  })
  const data = await parseAuthJson(res)
  if (!res.ok) throw new Error(data.detail || 'Request failed')
  return data  // { message }
}

export async function resetPassword(username, token, newPassword) {
  const res = await fetch(`${API_BASE}/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, token, new_password: newPassword }),
  })
  const data = await parseAuthJson(res)
  if (!res.ok) throw new Error(data.detail || 'Password reset failed')
  return data  // { message }
}
