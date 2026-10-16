/* RECALL: when every quick check in the lesson has been opened,
   shows a short "nice work" message with falling colour dots. Shows once. */
(function () {
  var done = false
  var COLORS = ['var(--zp-accent)', 'var(--zp-clin)', 'var(--zp-hy)', 'var(--zp-vio)', 'var(--zp-warn)']

  function celebrate() {
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches

    var toast = document.createElement('div')
    toast.className = 'zp-toast'
    toast.setAttribute('role', 'status')
    toast.textContent = 'All checks revealed. Nice work!'
    document.body.appendChild(toast)

    var dots = []
    if (!reduced) {
      for (var i = 0; i < 28; i++) {
        var dot = document.createElement('span')
        dot.className = 'zp-confetti'
        dot.style.left = (Math.random() * 100) + '%'
        dot.style.background = COLORS[i % COLORS.length]
        dot.style.animationDelay = (Math.random() * 400) + 'ms'
        dot.style.animationDuration = (1600 + Math.random() * 1400) + 'ms'
        dot.style.setProperty('--drift', ((Math.random() - 0.5) * 160) + 'px')
        document.body.appendChild(dot)
        dots.push(dot)
      }
    }

    setTimeout(function () {
      toast.remove()
      dots.forEach(function (dot) { dot.remove() })
    }, 3600)
  }

  function check() {
    if (done) return
    var all = document.querySelectorAll('.zp-recall')
    if (all.length < 2) return
    if (document.querySelectorAll('.zp-recall[open]').length === all.length) {
      done = true
      celebrate()
    }
  }

  document.addEventListener('toggle', function (event) {
    var target = event.target
    if (target && target.classList && target.classList.contains('zp-recall')) check()
  }, true)
})()
