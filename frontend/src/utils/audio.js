export function unlockAudioForIOS() {
  if (typeof document === 'undefined') return

  const el = document.createElement('audio')
  el.setAttribute('playsinline', '')
  el.setAttribute('webkit-playsinline', '')
  el.setAttribute('preload', 'auto')
  el.muted = true
  el.src = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYoRwMHAAAAAAD/+1DEAAAHAAGf9AAAIi2Kcz80ABAAAIA/5c5znOf/Luc5/y5znOIAAAGq3hERHkRJECBAgOf/y53/l3P/znOc4hAMDBYef/+XP//OcQh/y7/5dz/l3Oc5ziEP+f8uc5znEIBgYLDz/lz//5c//85xCH/8u/+Xc5znOIQ/5/y5znOcQjBAMFh5/y5//8uf//OcQh//Lv/l3Oc5xCH/P+XOc5ziEYIBgsPP/y5///Ln/5ziEP/5d/8u5znOcQh/z/lznOc4hGCAYLDz/8uf//Ln//znEIf/y7/5dznOc4hD/n/LnOc5xCMEAwWHn/Ln//y5//85xCH/8u/+Xc5znEIf8/5c5znOIRggGCw8/5c//+XP//nOIQ//l3/y7nOc5xCH/P+XOc5ziEA='
  const p = el.play()
  if (p && p.then) {
    p.then(() => {
      el.pause()
      el.muted = false
      el.currentTime = 0
      el.remove()
    }).catch(() => {
      el.remove()
    })
  } else {
    el.remove()
  }
}
