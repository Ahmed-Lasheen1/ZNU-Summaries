/* CELEBRATE: one shared "well done" moment (a message and falling colour pieces).
   Other parts call window.zpCelebrate('Message') when something is completed. */
(function () {
  var COLORS = ['var(--zp-accent)', 'var(--zp-clin)', 'var(--zp-hy)', 'var(--zp-vio)', 'var(--zp-warn)']

  window.zpCelebrate = function (message) {
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches

    var toast = document.createElement('div')
    toast.className = 'zp-toast'
    toast.setAttribute('role', 'status')
    toast.textContent = message
    document.body.appendChild(toast)

    var pieces = []
    if (!reduced) {
      for (var i = 0; i < 60; i++) {
        var piece = document.createElement('span')
        piece.className = 'zp-confetti'
        piece.style.left = (Math.random() * 100) + '%'
        piece.style.background = COLORS[i % COLORS.length]
        piece.style.animationDelay = (Math.random() * 500) + 'ms'
        piece.style.animationDuration = (2000 + Math.random() * 1800) + 'ms'
        piece.style.setProperty('--drift', ((Math.random() - 0.5) * 220) + 'px')
        document.body.appendChild(piece)
        pieces.push(piece)
      }
    }

    setTimeout(function () {
      toast.remove()
      pieces.forEach(function (piece) { piece.remove() })
    }, 4800)
  }
})()
