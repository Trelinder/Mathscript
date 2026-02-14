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
    sharedAudioEl.setAttribute('x-webkit-airplay', 'deny')
    sharedAudioEl.crossOrigin = 'anonymous'
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

async function playViaAudioElement(arrayBuffer, mimeType) {
  const el = getAudioElement()

  const blob = new Blob([arrayBuffer], { type: mimeType || 'audio/mpeg' })
  const url = URL.createObjectURL(blob)

  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl)
  }
  currentBlobUrl = url

  return new Promise((resolve) => {
    let resolved = false
    const safeResolve = (val) => {
      if (resolved) return
      resolved = true
      clearTimeout(safetyTimer)
      resolve(val)
    }

    const safetyTimer = setTimeout(() => {
      if (!resolved) {
        console.warn('Audio playback safety timeout reached')
        if (onEndedCallback) onEndedCallback()
        safeResolve({ success: false, method: 'html5' })
      }
    }, 120000)

    el.onended = () => {
      if (onEndedCallback) onEndedCallback()
      safeResolve({ success: true, method: 'html5' })
    }

    el.onerror = () => {
      console.warn('Audio element playback error')
      if (onEndedCallback) onEndedCallback()
      safeResolve({ success: false, method: 'html5' })
    }

    el.src = url
    el.volume = 1.0
    el.muted = false
    el.currentTime = 0

    el.load()

    const attemptPlay = () => {
      const p = el.play()
      if (p && p.then) {
        p.then(() => {}).catch((e) => {
          console.warn('HTML5 Audio play failed:', e.message)
          setTimeout(() => {
            const retry = el.play()
            if (retry && retry.then) {
              retry.catch((e2) => {
                console.warn('HTML5 Audio retry failed:', e2.message)
                safeResolve({ success: false, method: 'html5' })
              })
            }
          }, 300)
        })
      }
    }

    if (el.readyState >= 2) {
      attemptPlay()
    } else {
      el.oncanplaythrough = () => {
        el.oncanplaythrough = null
        attemptPlay()
      }
      setTimeout(() => {
        if (el.readyState < 2) {
          attemptPlay()
        }
      }, 1000)
    }
  })
}

async function playViaWebAudioAPI(arrayBuffer) {
  const ctx = getAudioContext()
  if (!ctx) return { success: false, method: 'webaudio' }

  if (ctx.state === 'suspended') {
    await ctx.resume().catch(() => {})
  }

  if (ctx.state !== 'running') {
    return { success: false, method: 'webaudio' }
  }

  try {
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer.buffer.slice(0))
    const source = ctx.createBufferSource()
    source.buffer = audioBuffer
    source.connect(ctx.destination)

    return new Promise((resolve) => {
      source.onended = () => {
        if (onEndedCallback) onEndedCallback()
        resolve({ success: true, method: 'webaudio' })
      }
      source.start(0)
    })
  } catch (e) {
    console.warn('Web Audio API decode/play failed:', e.message)
    return { success: false, method: 'webaudio' }
  }
}

export async function playBase64Audio(base64Data, mimeType) {
  const arrayBuffer = base64ToArrayBuffer(base64Data)

  const result = await playViaAudioElement(arrayBuffer, mimeType)
  if (result.success) return result

  console.warn('HTML5 Audio failed, trying Web Audio API fallback...')
  const fallbackResult = await playViaWebAudioAPI(arrayBuffer)
  if (fallbackResult.success) return fallbackResult

  console.warn('All audio playback methods failed')
  if (onEndedCallback) onEndedCallback()
  return { success: false, method: 'none' }
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
