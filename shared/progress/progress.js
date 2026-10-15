/* PROGRESS: adds the reading-progress bar and keeps it in step with scrolling. */
(function () {
  function init() {
    var bar = document.createElement('div')
    bar.className = 'zp-progress'
    bar.setAttribute('aria-hidden', 'true')
    document.body.appendChild(bar)

    var waiting = false

    function update() {
      waiting = false
      var root = document.documentElement
      var scrollable = root.scrollHeight - window.innerHeight
      var scrolled = window.pageYOffset || root.scrollTop || 0
      var percent = scrollable > 0 ? Math.min(100, Math.max(0, (scrolled / scrollable) * 100)) : 0
      bar.style.width = percent + '%'
    }

    function onScroll() {
      if (waiting) return
      waiting = true
      window.requestAnimationFrame(update)
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    update()
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
