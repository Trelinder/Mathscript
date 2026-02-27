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
  if (options.preferredLanguage) body.preferred_language = options.preferredLanguage
  if (options.forceFullAi) body.force_full_ai = true
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
  const res = await fetch(`${API_BASE}/segment-images-batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hero, segments, session_id: sessionId })
  });
  if (!res.ok) return null;
  return res.json();
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
  const res = await fetch(`${API_BASE}/session/profile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      player_name: profile.playerName,
      age_group: profile.ageGroup,
      selected_realm: profile.selectedRealm,
      preferred_language: profile.preferredLanguage,
    }),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail || 'Profile update failed')
  }
  return res.json()
}

export async function setParentPin(sessionId, pin) {
  const res = await fetch(`${API_BASE}/parent-pin/set`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, pin }),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail || 'Could not set parent PIN')
  }
  return res.json()
}

export async function verifyParentPin(sessionId, pin) {
  const res = await fetch(`${API_BASE}/parent-pin/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, pin }),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail || 'Could not verify parent PIN')
  }
  return res.json()
}

export async function fetchPrivacySettings(sessionId) {
  const res = await fetch(`${API_BASE}/privacy/${sessionId}`)
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail || 'Could not fetch privacy settings')
  }
  return res.json()
}

export async function updatePrivacySettings(sessionId, pin, settings) {
  const res = await fetch(`${API_BASE}/privacy/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      pin,
      parental_consent: settings.parental_consent,
      allow_telemetry: settings.allow_telemetry,
      allow_personalization: settings.allow_personalization,
      data_retention_days: settings.data_retention_days,
    }),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail || 'Could not update privacy settings')
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
