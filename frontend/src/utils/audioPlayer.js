let sharedAudioEl = null
let currentBlobUrl = null
let onEndedCallback = null
let audioContextInstance = null
let audioUnlocked = false
let userGestureReceived = false

function getAudioContext() {
  if (!audioContextInstance) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (AC) {
      audioContextInstance = new AC()
    }
  }
  return audioContextInstance
}

function resumeAudioContext() {
  const ctx = getAudioContext()
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => {})
  }
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

  const el = getAudioElement()
  el.muted = true
  el.src = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYoRwMHAAAAAAD/+1DEAAAHAAGf9AAAIi2Kcz80ABAAAIA/5c5znOf/Luc5/y5znOIAAAGq3hERHkRJECBAgOf/y53/l3P/znOc4hAMDBYef/+XP//OcQh/y7/5dz/l3Oc5ziEP+f8uc5znEIBgYLDz/lz//5c//85xCH/8u/+Xc5znOIQ/5/y5znOcQjBAMFh5/y5//8uf//OcQh//Lv/l3Oc5xCH/P+XOc5ziEYIBgsPP/y5///Ln/5ziEP/5d/8u5znOcQh/z/lznOc4hGCAYLDz/8uf//Ln//znEIf/y7/5dznOc4hD/n/LnOc5xCMEAwWHn/Ln//y5//85xCH/8u/+Xc5znEIf8/5c5znOIRggGCw8/5c//+XP//nOIQ//l3/y7nOc5xCH/P+XOc5ziEA='

  const playPromise = el.play()
  if (playPromise && playPromise.then) {
    playPromise.then(() => {
      el.pause()
      el.muted = false
      el.currentTime = 0
      audioUnlocked = true
    }).catch(() => {
      el.muted = false
      audioUnlocked = true
    })
  } else {
    el.muted = false
    audioUnlocked = true
  }

  resumeAudioContext()
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
  const el = getAudioElement()
  stopCurrentAudio()

  const arrayBuffer = base64ToArrayBuffer(base64Data)
  const blob = new Blob([arrayBuffer], { type: mimeType || 'audio/mpeg' })
  const url = URL.createObjectURL(blob)

  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl)
  }
  currentBlobUrl = url

  el.onended = () => {
    if (onEndedCallback) onEndedCallback()
  }

  el.onerror = () => {
    console.warn('Audio element error, trying Web Audio API fallback')
    playFallbackWebAudio(arrayBuffer)
  }

  el.src = url
  el.volume = 1.0
  el.muted = false
  el.currentTime = 0

  try {
    await el.load()
    await el.play()
    return { success: true }
  } catch (e) {
    console.warn('HTML5 Audio play() failed:', e.message)
    try {
      await new Promise(r => setTimeout(r, 300))
      await el.play()
      return { success: true }
    } catch (e2) {
      console.warn('HTML5 Audio retry failed, trying Web Audio API:', e2.message)
      return await playFallbackWebAudio(arrayBuffer)
    }
  }
}

async function playFallbackWebAudio(arrayBuffer) {
  const ctx = getAudioContext()
  if (!ctx) {
    if (onEndedCallback) onEndedCallback()
    return { success: false }
  }

  if (ctx.state === 'suspended') {
    await ctx.resume().catch(() => {})
  }

  if (ctx.state !== 'running') {
    if (onEndedCallback) onEndedCallback()
    return { success: false }
  }

  try {
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer.buffer.slice(0))
    const source = ctx.createBufferSource()
    source.buffer = audioBuffer
    source.connect(ctx.destination)
    source.onended = () => {
      if (onEndedCallback) onEndedCallback()
    }
    source.start(0)
    return { success: true }
  } catch (e) {
    console.warn('Web Audio API failed:', e.message)
    if (onEndedCallback) onEndedCallback()
    return { success: false }
  }
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
}

export function setOnEndedCallback(cb) {
  onEndedCallback = cb
}

export function isAudioUnlocked() {
  return audioUnlocked
}
