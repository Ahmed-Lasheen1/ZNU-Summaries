/* ZOOM: opens the lesson illustration full screen when it is tapped. */
(function () {
  function close() {
    var overlay = document.querySelector('.zp-zoom')
    if (overlay) overlay.remove()
    document.documentElement.classList.remove('zp-zoom-open')
  }

  document.addEventListener('click', function (event) {
    var target = event.target
    if (!target || !target.closest) return

    if (target.closest('.zp-zoom')) {
      close()
      return
    }

    var image = target.closest('.zp-lesson-illustration img')
    if (!image) return

    var overlay = document.createElement('div')
    overlay.className = 'zp-zoom'
    overlay.setAttribute('role', 'dialog')
    overlay.setAttribute('aria-label', 'Enlarged illustration')

    var big = document.createElement('img')
    big.src = image.currentSrc || image.src
    big.alt = image.alt || ''

    var hint = document.createElement('div')
    hint.className = 'zp-zoom-hint'
    hint.textContent = 'Pinch to zoom. Tap to close.'

    overlay.appendChild(big)
    overlay.appendChild(hint)
    document.body.appendChild(overlay)
    document.documentElement.classList.add('zp-zoom-open')
  })

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') close()
  })
})()
