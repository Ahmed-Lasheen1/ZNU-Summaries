/* FIGURE: makes every picture part of the lesson, the same way every time.
   The lesson only writes a plain figure (components/figure.css) right after the paragraph or list it explains.
   On a wide screen this script turns it into a floating picture on the right, the way an encyclopedia page or a
   handout with margin figures does it:
   - it measures the height of the one to three paragraphs or lists just before the figure (the text it explains);
   - it sets the picture's width so that its height is about that height, but never narrower than 220px, never
     wider than 420px or 42 percent of the page, never taller than 560px and never above the picture's own size;
   - it moves the figure to the start of that text and floats it right, so the text flows beside it and carries on
     underneath it. Nothing can leave an empty space, because the text simply fills the room.
   On a narrow screen, in the PDF and when printing, the figure stays (or goes back) directly after its text, and
   figure.css centres it. A zp-figure--wide figure (a detailed picture) is never floated.
   It runs again when the window is resized, the text size changes, or fonts load.
   Nothing here changes the text itself. Without this script, figure.css still gives a normal layout. */
(function () {
  var root = document.documentElement
  if (root.classList.contains('zp-print-view')) return
  if (window.top === window && window.location.hash === '#print') return

  var BREAK = 900          /* narrower screens keep the picture under its text */
  var MIN_W = 220
  var MAX_W = 420
  var MAX_SHARE = 0.42
  var MAX_H = 560
  var MAX_BLOCKS = 3       /* the most paragraphs or lists taken as the text of one picture */

  var BLOCK_TAGS = { P: 1, UL: 1, OL: 1 }
  var NOT_TEXT = ['zp-short', 'zp-source', 'zp-qa-core', 'zp-qa-keys', 'zp-qa-src', 'zp-qa-rate']

  var entries = []
  var timer = null
  var wide = window.matchMedia ? window.matchMedia('(min-width: ' + BREAK + 'px)') : null

  function isWide() {
    return wide ? wide.matches : window.innerWidth >= BREAK
  }

  function isText(el) {
    if (!el || el.nodeType !== 1 || !BLOCK_TAGS[el.tagName]) return false
    for (var i = 0; i < NOT_TEXT.length; i++) {
      if (el.classList.contains(NOT_TEXT[i])) return false
    }
    return true
  }

  function collect() {
    ;[].forEach.call(document.querySelectorAll('main figure.zp-figure'), function (fig) {
      var parent = fig.parentNode
      if (!parent || fig.classList.contains('zp-figure--wide')) return
      if (!parent.classList.contains('zp-section') && !parent.classList.contains('zp-qa-body')) return

      var blocks = []
      var prev = fig.previousElementSibling
      while (prev && blocks.length < MAX_BLOCKS && isText(prev)) {
        blocks.unshift(prev)
        prev = prev.previousElementSibling
      }
      if (!blocks.length) return

      entries.push({
        fig: fig,
        first: blocks[0],
        last: blocks[blocks.length - 1],
        w: parseFloat(fig.querySelector('img') && fig.querySelector('img').getAttribute('width')) || 0,
        h: parseFloat(fig.querySelector('img') && fig.querySelector('img').getAttribute('height')) || 0
      })
    })
  }

  /* the picture sits directly after its text, centred (narrow screens, print, and the first measurement) */
  function stack(entry) {
    var fig = entry.fig
    fig.classList.remove('zp-fig-float')
    fig.style.removeProperty('--fig-w')
    if (fig.previousElementSibling !== entry.last) entry.last.insertAdjacentElement('afterend', fig)
  }

  function float(entry) {
    var fig = entry.fig
    stack(entry)

    var host = entry.first.parentNode
    var hostW = host.clientWidth
    var caption = fig.querySelector('figcaption')
    var captionH = caption ? caption.offsetHeight + 8 : 0
    var textH = entry.last.offsetTop + entry.last.offsetHeight - entry.first.offsetTop
    if (!hostW || !textH || !entry.w || !entry.h) return

    var ratio = entry.w / entry.h
    var most = Math.min(MAX_W, hostW * MAX_SHARE, MAX_H * ratio, entry.w)
    var width = (textH - captionH) * ratio
    width = Math.max(Math.min(MIN_W, entry.w), Math.min(width, most))

    fig.style.setProperty('--fig-w', Math.round(width) + 'px')
    fig.classList.add('zp-fig-float')
    host.insertBefore(fig, entry.first)
  }

  function place(entry) {
    if (isWide()) float(entry)
    else stack(entry)
  }

  function placeAll() {
    timer = null
    entries.forEach(place)
  }

  function later() {
    clearTimeout(timer)
    timer = setTimeout(placeAll, 120)
  }

  function init() {
    collect()
    if (!entries.length) return
    placeAll()

    window.addEventListener('resize', later)
    window.addEventListener('load', later)
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(later)
    if (wide) {
      if (wide.addEventListener) wide.addEventListener('change', later)
      else if (wide.addListener) wide.addListener(later)
    }
    /* the text size button changes how tall the text is */
    if (window.MutationObserver) {
      new window.MutationObserver(later).observe(root, { attributes: true, attributeFilter: ['data-size'] })
    }

    /* on paper the picture goes back under its text */
    window.addEventListener('beforeprint', function () { entries.forEach(stack) })
    window.addEventListener('afterprint', placeAll)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
