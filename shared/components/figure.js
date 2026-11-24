/* FIGURE: makes every picture part of the lesson, the same way every time.
   The lesson only writes a plain figure (components/figure.css) right after the paragraph or list it explains.
   This script does the rest:
   1. It finds each figure (except zp-figure--wide, which always sits on its own line) and groups the one to three
      paragraphs or lists just before it, together with the figure, into one row: zp-fig-row > zp-fig-text + figure.
      This is done on every screen size, and the order never changes: the text, then its picture.
   2. On screens 1000px wide and up it tries one, two or three of those text blocks and several picture widths,
      measures the real layout of the browser, and keeps the combination where the picture and the text come out
      the same height. The picture then sits on the right, so there is no empty space above or below either.
   3. If no combination fits well, or the screen is narrow, the picture sits directly under its text and lines up
      with the left edge of the text (class zp-fig-stack).
   Nothing is guessed from the text length, so it stays right when the text size, the screen width or the font
   changes. The picture is never enlarged past its own size (figure.css), so it stays sharp.
   It runs again when the window is resized, the text size changes, fonts load, or a row appears (for example when
   a written-question card is shown again after a filter).
   Rows written by hand in older lessons (zp-fig-row with zp-fig-text) are fitted by width only.
   It does nothing in the PDF view. Without it, figure.css still gives a normal layout. */
(function () {
  var root = document.documentElement
  if (root.classList.contains('zp-print-view')) return
  if (window.top === window && window.location.hash === '#print') return

  var MIN = 0.26           /* narrowest picture column, as a share of the row */
  var MAX = 0.55           /* widest picture column */
  var STEP = 0.025
  var TOLERANCE = 0.18     /* heights may differ by up to 18 percent, otherwise the picture is stacked */
  var MAX_HEIGHT = 620     /* a picture beside its text is never taller than this */
  var MAX_BLOCKS = 3       /* the most paragraphs or lists grouped with one picture */

  var BLOCK_TAGS = { P: 1, UL: 1, OL: 1 }
  var NOT_TEXT = ['zp-short', 'zp-source', 'zp-qa-core', 'zp-qa-keys', 'zp-qa-src', 'zp-qa-rate']

  var wide = window.matchMedia ? window.matchMedia('(min-width: 1000px)') : null
  var entries = []
  var timer = null
  var observer = null

  function isWide() {
    return wide ? wide.matches : window.innerWidth >= 1000
  }

  function isText(el) {
    if (!el || el.nodeType !== 1 || !BLOCK_TAGS[el.tagName]) return false
    for (var i = 0; i < NOT_TEXT.length; i++) {
      if (el.classList.contains(NOT_TEXT[i])) return false
    }
    return true
  }

  /* ---------- finding and grouping ---------- */
  function addManual(row) {
    var figure = null
    var text = null
    for (var i = 0; i < row.children.length; i++) {
      var child = row.children[i]
      if (child.classList.contains('zp-figure')) figure = child
      else if (child.classList.contains('zp-fig-text')) text = child
    }
    if (figure && text) entries.push({ row: row, text: text, fig: figure, blocks: [] })
  }

  function addAuto(fig) {
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

    var row = document.createElement('div')
    row.className = 'zp-fig-row'
    var text = document.createElement('div')
    text.className = 'zp-fig-text'
    parent.insertBefore(row, blocks[0])
    row.appendChild(text)
    blocks.forEach(function (block) { text.appendChild(block) })
    row.appendChild(fig)
    entries.push({ row: row, text: text, fig: fig, blocks: blocks })
  }

  function collect() {
    ;[].forEach.call(document.querySelectorAll('main .zp-fig-row'), addManual)
    ;[].forEach.call(document.querySelectorAll('main figure.zp-figure'), function (fig) {
      if (fig.parentNode && fig.parentNode.classList.contains('zp-fig-row')) return
      addAuto(fig)
    })
  }

  /* ---------- fitting ---------- */
  /* puts every grouped text block back inside the row, in order */
  function gather(entry) {
    entry.blocks.forEach(function (block) {
      block.style.display = ''
      entry.text.appendChild(block)
    })
  }

  /* keeps only the last k blocks beside the picture, the others go back above the row */
  function release(entry, keep) {
    var out = entry.blocks.slice(0, entry.blocks.length - keep)
    out.forEach(function (block) { entry.row.parentNode.insertBefore(block, entry.row) })
  }

  function showLast(entry, keep) {
    var hide = entry.blocks.length - keep
    entry.blocks.forEach(function (block, i) { block.style.display = i < hide ? 'none' : '' })
  }

  function fit(entry) {
    var row = entry.row
    row.classList.remove('zp-fig-stack')
    row.style.removeProperty('--fig-w')
    gather(entry)
    if (!isWide() || !row.offsetWidth) return

    var most = entry.blocks.length || 1
    var best = null
    for (var k = 1; k <= most; k++) {
      if (entry.blocks.length) showLast(entry, k)
      for (var f = MIN; f <= MAX + 0.0005; f += STEP) {
        row.style.setProperty('--fig-w', (f * 100).toFixed(1) + '%')
        var h = entry.fig.offsetHeight
        var t = entry.text.offsetHeight
        if (!h || !t || h > MAX_HEIGHT) continue
        var diff = Math.abs(h - t) / Math.max(h, t)
        /* a near tie keeps the earlier choice: fewer blocks, then the narrower picture */
        if (!best || diff < best.diff - 0.01) best = { f: f, k: k, diff: diff }
      }
    }
    if (entry.blocks.length) entry.blocks.forEach(function (block) { block.style.display = '' })

    if (best && best.diff <= TOLERANCE) {
      row.style.setProperty('--fig-w', (best.f * 100).toFixed(1) + '%')
      if (entry.blocks.length) release(entry, best.k)
    } else {
      row.style.removeProperty('--fig-w')
      row.classList.add('zp-fig-stack')
    }
    row._seen = Math.round(row.offsetWidth)
  }

  function fitAll() {
    timer = null
    entries.forEach(fit)
  }

  function later() {
    clearTimeout(timer)
    timer = setTimeout(fitAll, 120)
  }

  /* a row that was hidden (a filtered card) is fitted when it appears, or when its width changes */
  function watch(entry) {
    if (!window.ResizeObserver) return
    if (!observer) {
      observer = new window.ResizeObserver(function (changes) {
        var changed = false
        changes.forEach(function (change) {
          var width = Math.round(change.contentRect.width)
          if (Math.abs(width - (change.target._seen || 0)) > 1) {
            change.target._seen = width
            changed = true
          }
        })
        if (changed) later()
      })
    }
    observer.observe(entry.row)
  }

  function init() {
    collect()
    if (!entries.length) return

    entries.forEach(watch)
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
