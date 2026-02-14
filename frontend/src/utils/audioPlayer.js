let sharedAudioEl = null
let currentBlobUrl = null
let onEndedCallback = null
let audioContextInstance = null
let audioUnlocked = false
let userGestureReceived = false
let currentUtterance = null

function log(msg, ...args) {
  console.log('[AudioPlayer] ' + msg, ...args)
}

function getAudioContext() {
  if (!audioContextInstance) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (AC) {
      try {
        audioContextInstance = new AC()
      } catch (e) {}
    }
  }
  return audioContextInstance
}

function getAudioElement() {
  if (!sharedAudioEl) {
    sharedAudioEl = document.createElement('audio')
    sharedAudioEl.setAttribute('playsinline', '')
    sharedAudioEl.setAttribute('webkit-playsinline', '')
    sharedAudioEl.setAttribute('preload', 'auto')
    sharedAudioEl.volume = 1.0
    document.body.appendChild(sharedAudioEl)
  }
  return sharedAudioEl
}

export function unlockAudioForIOS() {
  userGestureReceived = true
  audioUnlocked = true

  const ctx = getAudioContext()
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => {})
  }
}

function registerGestureListeners() {
  const handler = () => {
    if (!userGestureReceived) {
      unlockAudioForIOS()
    }
  }
  const events = ['touchstart', 'touchend', 'mousedown', 'click', 'keydown']
  events.forEach(evt => {
    document.addEventListener(evt, handler, { once: true, passive: true })
  })
}

registerGestureListeners()

function base64ToArrayBuffer(base64Data) {
  const raw = atob(base64Data)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) {
    arr[i] = raw.charCodeAt(i)
  }
  return arr
}

export async function playBase64Audio(base64Data, mimeType) {
  log('playBase64Audio called, data length:', base64Data.length)
  const el = getAudioElement()
  stopCurrentAudio()

  const mime = mimeType || 'audio/mpeg'
  const arrayBuffer = base64ToArrayBuffer(base64Data)

  const blob = new Blob([arrayBuffer], { type: mime })
  const url = URL.createObjectURL(blob)
  if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl)
  currentBlobUrl = url

  el.onended = () => {
    log('Audio ended')
    if (onEndedCallback) onEndedCallback()
  }

  el.src = url
  el.volume = 1.0
  el.muted = false

  try {
    await el.play()
    log('play() SUCCESS')
    return { success: true }
  } catch (e1) {
    log('play() failed:', e1.message, '- retrying')
  }

  await new Promise(r => setTimeout(r, 200))
  try {
    await el.play()
    log('Retry play() SUCCESS')
    return { success: true }
  } catch (e2) {
    log('Retry failed:', e2.message, '- trying Web Audio API')
  }

  const ctx = getAudioContext()
  if (ctx) {
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {})
    if (ctx.state === 'running') {
      try {
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer.buffer.slice(0))
        const source = ctx.createBufferSource()
        source.buffer = audioBuffer
        source.connect(ctx.destination)
        source.onended = () => {
          log('Web Audio ended')
          if (onEndedCallback) onEndedCallback()
        }
        source.start(0)
        log('Web Audio SUCCESS')
        return { success: true }
      } catch (e) {
        log('Web Audio failed:', e.message)
      }
    }
  }

  log('All audio methods failed')
  if (onEndedCallback) onEndedCallback()
  return { success: false }
}

export function speakWithBrowserTTS(text) {
  log('Using browser SpeechSynthesis for TTS')
  stopCurrentAudio()

  if (!window.speechSynthesis) {
    log('SpeechSynthesis not available')
    if (onEndedCallback) onEndedCallback()
    return { success: false }
  }

  window.speechSynthesis.cancel()

  const utterance = new SpeechSynthesisUtterance(text)
  currentUtterance = utterance
  utterance.rate = 0.95
  utterance.pitch = 1.05
  utterance.volume = 1.0

  const voices = window.speechSynthesis.getVoices()
  const preferred = voices.find(v =>
    v.name.includes('Samantha') ||
    v.name.includes('Karen') ||
    v.name.includes('Daniel') ||
    v.name.includes('Google') ||
    v.lang.startsWith('en')
  )
  if (preferred) utterance.voice = preferred

  utterance.onend = () => {
    log('Browser TTS ended')
    currentUtterance = null
    if (onEndedCallback) onEndedCallback()
  }

  utterance.onerror = (e) => {
    log('Browser TTS error:', e.error)
    currentUtterance = null
    if (onEndedCallback) onEndedCallback()
  }

  window.speechSynthesis.speak(utterance)
  log('Browser TTS started')
  return { success: true }
}

export function stopCurrentAudio() {
  const el = getAudioElement()
  if (!el.paused) {
    el.pause()
    el.currentTime = 0
  }
  el.onended = null
  el.onerror = null
  el.oncanplaythrough = null
  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl)
    currentBlobUrl = null
  }
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel()
  }
  currentUtterance = null
}

export function setOnEndedCallback(cb) {
  onEndedCallback = cb
}

export function isAudioUnlocked() {
  return audioUnlocked
}
