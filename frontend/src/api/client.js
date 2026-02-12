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

export async function generateTTS(text, voice = 'Kore') {
  const res = await fetch(`${API_BASE}/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice })
  });
  if (!res.ok) return null;
  return res.json();
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

export function getPdfUrl(sessionId) {
  return `${API_BASE}/pdf/${sessionId}`;
}

export function getYoutubeUrl(query) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent('math for kids ' + query)}`;
}
