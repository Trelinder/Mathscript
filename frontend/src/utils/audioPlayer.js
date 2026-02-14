let sharedAudioEl = null
let currentBlobUrl = null
let onEndedCallback = null
let audioContextInstance = null
let audioUnlocked = false
let userGestureReceived = false

function log(msg, ...args) {
  console.log('[AudioPlayer] ' + msg, ...args)
}

function getAudioContext() {
  if (!audioContextInstance) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (AC) {
      audioContextInstance = new AC()
      log('AudioContext created, state:', audioContextInstance.state)
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
    log('Audio element created')
  }
  return sharedAudioEl
}

export function unlockAudioForIOS() {
  userGestureReceived = true
  log('unlockAudioForIOS called')

  const el = getAudioElement()
  el.muted = true
  el.src = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYoRwMHAAAAAAD/+1DEAAAHAAGf9AAAIi2Kcz80ABAAAIA/5c5znOf/Luc5/y5znOIAAAGq3hERHkRJECBAgOf/y53/l3P/znOc4hAMDBYef/+XP//OcQh/y7/5dz/l3Oc5ziEP+f8uc5znEIBgYLDz/lz//5c//85xCH/8u/+Xc5znOIQ/5/y5znOcQjBAMFh5/y5//8uf//OcQh//Lv/l3Oc5xCH/P+XOc5ziEYIBgsPP/y5///Ln/5ziEP/5d/8u5znOcQh/z/lznOc4hGCAYLDz/8uf//Ln//znEIf/y7/5dznOc4hD/n/LnOc5xCMEAwWHn/Ln//y5//85xCH/8u/+Xc5znEIf8/5c5znOIRggGCw8/5c//+XP//nOIQ//l3/y7nOc5xCH/P+XOc5ziEA='

  const playPromise = el.play()
  if (playPromise && playPromise.then) {
    playPromise.then(() => {
      log('Unlock play succeeded')
      el.pause()
      el.muted = false
      el.currentTime = 0
      audioUnlocked = true
    }).catch((e) => {
      log('Unlock play failed:', e.message)
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
  log('playBase64Audio called, data length:', base64Data.length, 'mime:', mimeType)
  const el = getAudioElement()
  stopCurrentAudio()

  const mime = mimeType || 'audio/mpeg'
  const arrayBuffer = base64ToArrayBuffer(base64Data)
  log('Decoded audio bytes:', arrayBuffer.length)

  const result = await tryHTMLAudioDataUrl(el, base64Data, mime)
  if (result.success) return result

  log('Data URL approach failed, trying blob URL')
  const result2 = await tryHTMLAudioBlob(el, arrayBuffer, mime)
  if (result2.success) return result2

  log('Blob URL approach failed, trying Web Audio API')
  const result3 = await playFallbackWebAudio(arrayBuffer)
  return result3
}

async function tryHTMLAudioDataUrl(el, base64Data, mime) {
  return new Promise((resolve) => {
    const dataUrl = `data:${mime};base64,${base64Data}`
    log('Trying data URL approach, URL length:', dataUrl.length)

    const cleanup = () => {
      el.oncanplaythrough = null
      el.onerror = null
      clearTimeout(timer)
    }

    el.onended = () => {
      if (onEndedCallback) onEndedCallback()
    }

    el.onerror = (e) => {
      log('Data URL audio error event:', e.type)
      cleanup()
      resolve({ success: false })
    }

    el.oncanplaythrough = () => {
      log('Data URL canplaythrough fired, readyState:', el.readyState)
      cleanup()
      attemptPlay(el).then(resolve)
    }

    el.src = dataUrl
    el.volume = 1.0
    el.muted = false

    const timer = setTimeout(() => {
      log('Data URL timeout, readyState:', el.readyState, 'paused:', el.paused)
      cleanup()
      if (el.readyState >= 2) {
        attemptPlay(el).then(resolve)
      } else {
        resolve({ success: false })
      }
    }, 5000)
  })
}

async function tryHTMLAudioBlob(el, arrayBuffer, mime) {
  return new Promise((resolve) => {
    const blob = new Blob([arrayBuffer], { type: mime })
    const url = URL.createObjectURL(blob)

    if (currentBlobUrl) {
      URL.revokeObjectURL(currentBlobUrl)
    }
    currentBlobUrl = url

    log('Trying blob URL approach')

    const cleanup = () => {
      el.oncanplaythrough = null
      el.onerror = null
      clearTimeout(timer)
    }

    el.onended = () => {
      if (onEndedCallback) onEndedCallback()
    }

    el.onerror = (e) => {
      log('Blob URL audio error event:', e.type)
      cleanup()
      resolve({ success: false })
    }

    el.oncanplaythrough = () => {
      log('Blob URL canplaythrough fired, readyState:', el.readyState)
      cleanup()
      attemptPlay(el).then(resolve)
    }

    el.src = url
    el.volume = 1.0
    el.muted = false

    const timer = setTimeout(() => {
      log('Blob URL timeout, readyState:', el.readyState, 'paused:', el.paused)
      cleanup()
      if (el.readyState >= 2) {
        attemptPlay(el).then(resolve)
      } else {
        resolve({ success: false })
      }
    }, 5000)
  })
}

async function attemptPlay(el) {
  try {
    log('Attempting play(), readyState:', el.readyState, 'muted:', el.muted, 'volume:', el.volume)
    await el.play()
    log('play() SUCCESS - audio is playing')
    return { success: true }
  } catch (e) {
    log('play() FAILED:', e.name, e.message)
    try {
      log('Trying muted play trick...')
      el.muted = true
      await el.play()
      log('Muted play succeeded, unmuting...')
      el.muted = false
      return { success: true }
    } catch (e2) {
      log('Muted play also FAILED:', e2.name, e2.message)
      return { success: false }
    }
  }
}

async function playFallbackWebAudio(arrayBuffer) {
  const ctx = getAudioContext()
  if (!ctx) {
    log('No AudioContext available')
    if (onEndedCallback) onEndedCallback()
    return { success: false }
  }

  log('Web Audio API fallback, context state:', ctx.state)

  if (ctx.state === 'suspended') {
    await ctx.resume().catch(() => {})
    log('AudioContext resumed, new state:', ctx.state)
  }

  if (ctx.state !== 'running') {
    log('AudioContext not running, state:', ctx.state)
    if (onEndedCallback) onEndedCallback()
    return { success: false }
  }

  try {
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer.buffer.slice(0))
    log('Audio decoded, duration:', audioBuffer.duration, 'seconds')
    const source = ctx.createBufferSource()
    source.buffer = audioBuffer
    source.connect(ctx.destination)
    source.onended = () => {
      log('Web Audio playback ended')
      if (onEndedCallback) onEndedCallback()
    }
    source.start(0)
    log('Web Audio play() SUCCESS')
    return { success: true }
  } catch (e) {
    log('Web Audio API FAILED:', e.name, e.message)
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
