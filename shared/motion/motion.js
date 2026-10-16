/* MOTION: reveals parts of the lesson as they scroll into view, and counts up the
   numbers in the at-a-glance card. The selector list must match motion.css. */
(function () {
  var root = document.documentElement

  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduced || !('IntersectionObserver' in window)) return

  var SELECTOR = [
    '.zp-glance', '.zp-glance-item', '.zp-section > h2.zp-h2', '.zp-box',
    '.zp-flow > li', '.zp-chain-node', '.zp-cycle', '.zp-compare-card', '.zp-flip',
    '.zp-recall', '.zp-keypoints-group', '.zp-table-wrap', '.zp-lesson-illustration'
  ].join(', ')

  var started = false

  root.classList.add('zp-motion')

  /* Safety net: if nothing was ever revealed, show everything. */
  setTimeout(function () {
    if (!started) root.classList.remove('zp-motion')
  }, 2500)

  function countUp(element) {
    var target = parseInt(element.textContent, 10)
    if (!/^\d+$/.test(element.textContent.trim()) || target > 999) return
    var begin = null
    var duration = 900
    element.textContent = '0'
    function step(now) {
      if (begin === null) begin = now
      var progress = Math.min(1, (now - begin) / duration)
      var eased = 1 - Math.pow(1 - progress, 3)
      element.textContent = String(Math.round(target * eased))
      if (progress < 1) window.requestAnimationFrame(step)
    }
    window.requestAnimationFrame(step)
  }

  function init() {
    var items = [].slice.call(document.querySelectorAll(SELECTOR))

    var observer = new IntersectionObserver(function (entries) {
      var order = 0
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return
        started = true
        var element = entry.target
        var delay = Math.min(order, 5) * 90
        order += 1
        element.style.transitionDelay = delay + 'ms'
        element.classList.add('is-visible')
        observer.unobserve(element)

        if (element.classList.contains('zp-glance-item')) {
          var value = element.querySelector('.zp-glance-value')
          if (value) countUp(value)
        }

        setTimeout(function () { element.style.transitionDelay = '' }, delay + 900)
      })
    }, { threshold: 0.12, rootMargin: '0px 0px -5% 0px' })

    items.forEach(function (element) { observer.observe(element) })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
