/* FIGURE: sizes a picture beside its text so that both come out the same height.
   Works on every .zp-fig-row (see components/figure.css) on screens 1000px wide and up.
   For each row it tries a range of picture widths and measures the real layout of the browser
   (the picture and the text next to it), then keeps the width where the two heights match best.
   Nothing is guessed from the text length, so it stays right when the text size, the screen width
   or the font changes.
   If no width gives a good match, the row gets the class zp-fig-stack and the picture sits above
   its text instead, so no empty space is ever left beside a picture.
   The picture is never enlarged past its own size (figure.css), so it stays sharp.
   It runs again when the window is resized, the text size changes, fonts load, or a row appears
   (for example when a written-question card is shown again after a filter).
   It does nothing in the PDF view. Without it, figure.css still gives a normal layout. */
(function () {
  var root = document.documentElement
  if (root.classList.contains('zp-print-view')) return
  if (window.top === window && window.location.hash === '#print') return

  var MIN = 0.30          /* narrowest picture column, as a share of the row */
  var MAX = 0.55          /* widest picture column */
  var STEP = 0.025
  var TOLERANCE = 0.18    /* heights may differ by up to 18 percent, otherwise the picture is stacked */
  var MAX_HEIGHT = 640    /* a picture beside its text is never taller than this */

  var wide = window.matchMedia ? window.matchMedia('(min-width: 1000px)') : null
  var rows = []
  var timer = null
  var observer = null

  function isWide() {
    return wide ? wide.matches : window.innerWidth >= 1000
  }

  function pieces(row) {
    var figure = null
    var text = null
    for (var i = 0; i < row.children.length; i++) {
      var child = row.children[i]
      if (child.classList.contains('zp-figure')) figure = child
      else if (child.classList.contains('zp-fig-text')) text = child
    }
    if (!figure || !text) return null
    return { figure: figure, text: text }
  }

  function fit(row) {
    var p = pieces(row)
    if (!p) return

    row.classList.remove('zp-fig-stack')
    row.style.removeProperty('--fig-w')
    if (!isWide() || !row.offsetWidth) return

    var best = null
    for (var f = MIN; f <= MAX + 0.0005; f += STEP) {
      row.style.setProperty('--fig-w', (f * 100).toFixed(1) + '%')
      var h = p.figure.offsetHeight
      var t = p.text.offsetHeight
      if (!h || !t || h > MAX_HEIGHT) continue
      var diff = Math.abs(h - t) / Math.max(h, t)
      /* on a near tie the narrower picture wins, it leaves more room for the text */
      if (!best || diff < best.diff - 0.01) best = { f: f, diff: diff }
    }

    if (best && best.diff <= TOLERANCE) {
      row.style.setProperty('--fig-w', (best.f * 100).toFixed(1) + '%')
    } else {
      row.style.removeProperty('--fig-w')
      row.classList.add('zp-fig-stack')
    }
    row._seen = Math.round(row.offsetWidth)
  }

  function fitAll() {
    timer = null
    rows.forEach(fit)
  }

  function later() {
    clearTimeout(timer)
    timer = setTimeout(fitAll, 120)
  }

  /* a row that was hidden (a filtered card, a closed page) is fitted when it appears, or when its width changes */
  function watch(row) {
    if (!window.ResizeObserver) return
    if (!observer) {
      observer = new window.ResizeObserver(function (entries) {
        var changed = false
        entries.forEach(function (entry) {
          var width = Math.round(entry.contentRect.width)
          if (Math.abs(width - (entry.target._seen || 0)) > 1) {
            entry.target._seen = width
            changed = true
          }
        })
        if (changed) later()
      })
    }
    observer.observe(row)
  }

  function init() {
    rows = [].slice.call(document.querySelectorAll('.zp-fig-row'))
    if (!rows.length) return

    rows.forEach(watch)
    fitAll()

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
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
