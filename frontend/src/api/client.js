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

export async function generateStory(hero, problem, sessionId) {
  const res = await fetch(`${API_BASE}/story`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hero, problem, session_id: sessionId })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Story generation failed');
  }
  return res.json();
}

export async function generateStoryStream(hero, problem, sessionId, callbacks) {
  const res = await fetch(`${API_BASE}/story-stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hero, problem, session_id: sessionId })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Story generation failed');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const data = JSON.parse(line.slice(6));
        if (data.type === 'mini_games' && callbacks.onMiniGames) {
          callbacks.onMiniGames(data.mini_games);
        } else if (data.type === 'math_steps' && callbacks.onMathSteps) {
          callbacks.onMathSteps(data.math_steps);
        } else if (data.type === 'segment' && callbacks.onSegment) {
          callbacks.onSegment(data.index, data.text);
        } else if (data.type === 'done' && callbacks.onDone) {
          callbacks.onDone(data);
        } else if (data.type === 'error' && callbacks.onError) {
          callbacks.onError(data.detail);
        }
      } catch (e) {}
    }
  }
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

export async function redeemPromoCode(sessionId, code) {
  const res = await fetch(`${API_BASE}/promo/redeem`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, code })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Invalid promo code');
  }
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
