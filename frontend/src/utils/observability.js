const TELEMETRY_ENDPOINT = '/api/client-telemetry'
const MAX_STRING = 400

function trimText(value) {
  if (value === null || value === undefined) return ''
  return String(value).slice(0, MAX_STRING)
}

function buildPayload(eventType, payload) {
  const page = typeof window !== 'undefined'
    ? `${window.location.pathname}${window.location.search}`
    : ''
  return JSON.stringify({
    event_type: eventType,
    page: trimText(page),
    user_agent: trimText(typeof navigator !== 'undefined' ? navigator.userAgent : ''),
    timestamp: Date.now(),
    payload,
  })
}

function sendTelemetry(eventType, payload) {
  if (typeof window === 'undefined') return
  const body = buildPayload(eventType, payload)
  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' })
      if (navigator.sendBeacon(TELEMETRY_ENDPOINT, blob)) return
    }
  } catch {
    // Fallback to fetch below.
  }

  fetch(TELEMETRY_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {})
}

function normalizeMetric(metric) {
  return {
    name: metric.name,
    value: Number(metric.value.toFixed(2)),
    rating: metric.rating,
    id: metric.id,
    delta: Number(metric.delta.toFixed(2)),
  }
}

export function initObservability() {
  if (typeof window === 'undefined') return
  if (window.__mathscriptObservabilityInit) return
  window.__mathscriptObservabilityInit = true

  window.addEventListener('error', (event) => {
    sendTelemetry('client_error', {
      message: trimText(event.message),
      source: trimText(event.filename),
      line: event.lineno || null,
      col: event.colno || null,
    })
  })

  window.addEventListener('unhandledrejection', (event) => {
    sendTelemetry('unhandled_rejection', {
      reason: trimText(event?.reason?.message || event?.reason),
    })
  })

  import('web-vitals')
    .then(({ onCLS, onINP, onLCP, onFCP, onTTFB }) => {
      const report = (metric) => sendTelemetry('web_vital', normalizeMetric(metric))
      onCLS(report)
      onINP(report)
      onLCP(report)
      onFCP(report)
      onTTFB(report)
    })
    .catch(() => {})
}
