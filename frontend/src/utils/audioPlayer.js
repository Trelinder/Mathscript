let sharedAudioEl = null
let currentBlobUrl = null
let onEndedCallback = null
let audioContextInstance = null
let audioUnlocked = false
let userGestureReceived = false
let currentUtterance = null
let isSpeaking = false
let sentenceQueue = []
let selectedVoice = null
let voicesLoaded = false

function log(msg, ...args) {
  console.log('[AudioPlayer] ' + msg, ...args)
}

function getAudioContext() {
  if (!audioContextInstance) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (AC) {
      try { audioContextInstance = new AC() } catch (e) {}
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
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {})
}

function registerGestureListeners() {
  const handler = () => { if (!userGestureReceived) unlockAudioForIOS() }
  ;['touchstart', 'touchend', 'mousedown', 'click', 'keydown'].forEach(evt => {
    document.addEventListener(evt, handler, { once: true, passive: true })
  })
}
registerGestureListeners()

function loadVoices() {
  if (!window.speechSynthesis) return
  const tryLoad = () => {
    const voices = window.speechSynthesis.getVoices()
    if (voices.length > 0) {
      voicesLoaded = true
      pickBestVoice(voices)
    }
  }
  tryLoad()
  if (!voicesLoaded && window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = tryLoad
  }
}

function pickBestVoice(voices) {
  const englishVoices = voices.filter(v => v.lang.startsWith('en'))
  const preferredNames = [
    'Google UK English Female',
    'Google UK English Male',
    'Google US English',
    'Samantha',
    'Karen',
    'Daniel',
    'Moira',
    'Rishi',
    'Tessa',
    'Alex',
    'Victoria',
    'Microsoft Zira',
    'Microsoft David',
  ]
  for (const name of preferredNames) {
    const match = englishVoices.find(v => v.name.includes(name))
    if (match) { selectedVoice = match; log('Selected voice:', match.name); return }
  }
  const googleVoice = englishVoices.find(v => v.name.includes('Google'))
  if (googleVoice) { selectedVoice = googleVoice; log('Selected Google voice:', googleVoice.name); return }
  if (englishVoices.length > 0) {
    selectedVoice = englishVoices[0]
    log('Selected fallback voice:', selectedVoice.name)
  }
}

loadVoices()

function base64ToArrayBuffer(base64Data) {
  const raw = atob(base64Data)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

export async function playBase64Audio(base64Data, mimeType) {
  log('playBase64Audio, data length:', base64Data.length)
  const el = getAudioElement()
  stopCurrentAudio()

  const mime = mimeType || 'audio/mpeg'
  const arrayBuffer = base64ToArrayBuffer(base64Data)
  const blob = new Blob([arrayBuffer], { type: mime })
  const url = URL.createObjectURL(blob)
  if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl)
  currentBlobUrl = url

  el.onended = () => { if (onEndedCallback) onEndedCallback() }
  el.src = url
  el.volume = 1.0
  el.muted = false

  try {
    await el.play()
    log('play() SUCCESS')
    return { success: true }
  } catch (e1) { log('play() failed:', e1.message) }

  await new Promise(r => setTimeout(r, 200))
  try {
    await el.play()
    return { success: true }
  } catch (e2) { log('Retry failed:', e2.message) }

  const ctx = getAudioContext()
  if (ctx) {
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {})
    if (ctx.state === 'running') {
      try {
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer.buffer.slice(0))
        const source = ctx.createBufferSource()
        source.buffer = audioBuffer
        source.connect(ctx.destination)
        source.onended = () => { if (onEndedCallback) onEndedCallback() }
        source.start(0)
        log('Web Audio SUCCESS')
        return { success: true }
      } catch (e) { log('Web Audio failed:', e.message) }
    }
  }

  if (onEndedCallback) onEndedCallback()
  return { success: false }
}

function splitIntoSentences(text) {
  const parts = text.match(/[^.!?]+[.!?]+\s*/g) || [text]
  return parts.map(s => s.trim()).filter(s => s.length > 0)
}

export function speakWithBrowserTTS(text) {
  log('Browser TTS starting')
  stopCurrentAudio()

  if (!window.speechSynthesis) {
    log('SpeechSynthesis not available')
    if (onEndedCallback) onEndedCallback()
    return { success: false }
  }

  if (!voicesLoaded) {
    const voices = window.speechSynthesis.getVoices()
    if (voices.length > 0) { voicesLoaded = true; pickBestVoice(voices) }
  }

  window.speechSynthesis.cancel()
  sentenceQueue = splitIntoSentences(text)
  isSpeaking = true
  speakNextSentence()
  return { success: true }
}

function speakNextSentence() {
  if (!isSpeaking || sentenceQueue.length === 0) {
    isSpeaking = false
    currentUtterance = null
    log('Browser TTS finished all sentences')
    if (onEndedCallback) onEndedCallback()
    return
  }

  const sentence = sentenceQueue.shift()
  const utterance = new SpeechSynthesisUtterance(sentence)
  currentUtterance = utterance

  utterance.rate = 0.92
  utterance.pitch = 1.08
  utterance.volume = 1.0

  if (selectedVoice) utterance.voice = selectedVoice

  utterance.onend = () => {
    if (!isSpeaking) return
    setTimeout(() => speakNextSentence(), 120)
  }

  utterance.onerror = (e) => {
    if (e.error === 'canceled') return
    log('Browser TTS sentence error:', e.error)
    if (!isSpeaking) return
    setTimeout(() => speakNextSentence(), 50)
  }

  window.speechSynthesis.speak(utterance)
}

export function stopCurrentAudio() {
  isSpeaking = false
  sentenceQueue = []
  currentUtterance = null

  const el = getAudioElement()
  if (!el.paused) { el.pause(); el.currentTime = 0 }
  el.onended = null
  el.onerror = null
  el.oncanplaythrough = null
  if (currentBlobUrl) { URL.revokeObjectURL(currentBlobUrl); currentBlobUrl = null }
  if (window.speechSynthesis) window.speechSynthesis.cancel()
}

export function setOnEndedCallback(cb) { onEndedCallback = cb }
export function isAudioUnlocked() { return audioUnlocked }
