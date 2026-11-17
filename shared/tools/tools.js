/* TOOLS: round buttons for listen and draw (always visible), and for theme, text size,
   hide terms and save as PDF (in the menu that slides out from the main button).
   Light theme, normal text size and visible terms are the defaults.
   Theme and text size are remembered where the browser allows it (not in offline copies).
   Hide terms always starts switched off.
   The listen button opens the read-aloud player (listen/listen.js).
   The draw button opens the pen, highlighter and eraser (draw/draw.js). */
(function () {
  var THEME_KEY = 'zp-theme'
  var SIZE_KEY = 'zp-size'
  var SIZES = ['normal', 'large', 'larger']
  var SIZE_NAMES = { normal: 'Normal', large: 'Large', larger: 'Larger' }
  var MIN_TERMS = 3
  var root = document.documentElement

  function read(key) {
    try { return localStorage.getItem(key) } catch (error) { return null }
  }

  function write(key, value) {
    try { localStorage.setItem(key, value) } catch (error) { /* storage blocked: lasts for this visit */ }
  }

  /* Apply the saved choices straight away so the page does not flash the wrong theme. */
  var pdfView = window.top === window && window.location.hash === '#print'
  var theme = !pdfView && read(THEME_KEY) === 'dark' ? 'dark' : 'light'
  var size = !pdfView && SIZES.indexOf(read(SIZE_KEY)) > -1 ? read(SIZE_KEY) : 'normal'
  root.dataset.theme = theme
  root.dataset.size = size
  if (pdfView) root.classList.add('zp-print-view')

  function svg(inner, className) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"' + (className ? ' class="' + className + '"' : '') + '>' + inner + '</svg>'
  }

  var ICONS = {
    sliders: svg('<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>', 'zp-ico-open'),
    close: svg('<line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/>', 'zp-ico-close'),
    sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>', 'zp-ico-sun'),
    moon: svg('<path d="M21 12.8A8.5 8.5 0 1 1 11.2 3 6.7 6.7 0 0 0 21 12.8Z"/>', 'zp-ico-moon'),
    type: svg('<polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/>'),
    eye: svg('<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>', 'zp-ico-eye'),
    eyeOff: svg('<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>', 'zp-ico-eye-off'),
    pdf: svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><polyline points="9 15 12 18 15 15"/>'),
    listen: svg('<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>'),
    draw: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>')
  }

  var holder, mainButton, statusLabel
  var buttons = {}
  var statusTimer = null

  function say(button, text) {
    statusLabel.textContent = text
    var inRow = button.classList.contains('zp-tool--row')
    var holderBox = holder.getBoundingClientRect()
    var box = button.getBoundingClientRect()
    var top
    if (inRow) {
      /* the row buttons sit at the top, so their message goes just below the row, at the right edge */
      statusLabel.style.right = '0px'
      top = holderBox.height + 8
    } else {
      statusLabel.style.right = ''
      top = box.top - holderBox.top + (box.height - statusLabel.offsetHeight) / 2
    }
    statusLabel.style.top = Math.max(0, top) + 'px'
    statusLabel.classList.add('is-shown')
    clearTimeout(statusTimer)
    statusTimer = setTimeout(function () { statusLabel.classList.remove('is-shown') }, 1900)
  }

  function setOpen(open) {
    holder.classList.toggle('is-open', open)
    mainButton.setAttribute('aria-expanded', String(open))
    mainButton.setAttribute('aria-label', open ? 'Close tools' : 'Open tools')
    if (!open) statusLabel.classList.remove('is-shown')
  }

  /* ---- theme ---- */
  function describeTheme() {
    buttons.theme.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode')
  }

  function toggleTheme() {
    theme = theme === 'dark' ? 'light' : 'dark'
    root.dataset.theme = theme
    write(THEME_KEY, theme)
    describeTheme()
    say(buttons.theme, theme === 'dark' ? 'Dark mode' : 'Light mode')
  }

  /* ---- text size ---- */
  function cycleSize() {
    size = SIZES[(SIZES.indexOf(size) + 1) % SIZES.length]
    root.dataset.size = size
    write(SIZE_KEY, size)
    say(buttons.size, 'Text size: ' + SIZE_NAMES[size])
  }

  /* ---- hide terms ---- */
  function countTerms() {
    return document.querySelectorAll('.zp-term').length
  }

  function refreshTerms() {
    var usable = countTerms() >= MIN_TERMS
    buttons.terms.classList.toggle('is-unavailable', !usable)
    buttons.terms.setAttribute('aria-disabled', String(!usable))
    if (!usable && root.classList.contains('zp-hide-terms')) setTermsHidden(false)
  }

  function setTermsHidden(hidden) {
    root.classList.toggle('zp-hide-terms', hidden)
    var shown = document.querySelectorAll('.zp-term.is-shown')
    for (var i = 0; i < shown.length; i++) shown[i].classList.remove('is-shown')
    buttons.terms.classList.toggle('is-active', hidden)
    buttons.terms.setAttribute('aria-pressed', String(hidden))
    buttons.terms.setAttribute('aria-label', hidden ? 'Show key terms' : 'Hide key terms')
  }

  function toggleTerms() {
    var count = countTerms()
    if (count < MIN_TERMS) {
      say(buttons.terms, count === 0 ? 'No key terms in this lesson' : 'Too few key terms in this lesson')
      return
    }
    var hide = !root.classList.contains('zp-hide-terms')
    setTermsHidden(hide)
    say(buttons.terms, hide ? 'Key terms hidden. Tap one to reveal it.' : 'Key terms shown')
  }

  /* ---- listen (read aloud) ---- */
  function listenReady() {
    return !!(window.zpListen && window.zpListen.supported)
  }

  /* greyed out when this browser cannot speak, like hide terms when a lesson has too few terms */
  function refreshListen() {
    var usable = listenReady()
    buttons.listen.classList.toggle('is-unavailable', !usable)
    buttons.listen.setAttribute('aria-disabled', String(!usable))
  }

  function toggleListen() {
    if (!listenReady()) {
      say(buttons.listen, 'Listening is not supported in this browser')
      return
    }
    window.zpListen.toggle()
    setOpen(false)
  }

  /* the player tells us when it opens or closes, so the button can light up */
  document.addEventListener('zp-listen-state', function (event) {
    if (!buttons.listen) return
    var open = !!(event.detail && event.detail.open)
    buttons.listen.classList.toggle('is-active', open)
    buttons.listen.setAttribute('aria-pressed', String(open))
    buttons.listen.setAttribute('aria-label', open ? 'Stop listening' : 'Listen to this lesson')
  })

  /* ---- draw (pen, highlighter, eraser) ---- */
  function drawReady() {
    return !!(window.zpDraw && window.zpDraw.supported)
  }

  function refreshDraw() {
    var usable = drawReady()
    buttons.draw.classList.toggle('is-unavailable', !usable)
    buttons.draw.setAttribute('aria-disabled', String(!usable))
  }

  function toggleDraw() {
    if (!drawReady()) {
      say(buttons.draw, 'Drawing is not supported in this browser')
      return
    }
    window.zpDraw.toggle()
    setOpen(false)
  }

  document.addEventListener('zp-draw-state', function (event) {
    if (!buttons.draw) return
    var open = !!(event.detail && event.detail.open)
    buttons.draw.classList.toggle('is-active', open)
    buttons.draw.setAttribute('aria-pressed', String(open))
    buttons.draw.setAttribute('aria-label', open ? 'Stop drawing' : 'Draw and highlight')
  })

  /* ---- save as PDF ---- */
  var reopened = []

  function prepareForPrint() {
    var checks = document.querySelectorAll('details.zp-recall')
    reopened = []
    for (var i = 0; i < checks.length; i++) {
      if (!checks[i].open) {
        checks[i].open = true
        reopened.push(checks[i])
      }
    }
  }

  function afterPrint() {
    reopened.forEach(function (item) { item.open = false })
    reopened = []
  }

  window.addEventListener('beforeprint', prepareForPrint)
  window.addEventListener('afterprint', afterPrint)
  if (window.matchMedia) {
    var printQuery = window.matchMedia('print')
    var onPrintChange = function (event) { if (event.matches) prepareForPrint(); else afterPrint() }
    if (printQuery.addEventListener) printQuery.addEventListener('change', onPrintChange)
    else if (printQuery.addListener) printQuery.addListener(onPrintChange)
  }

  function lessonAddress() {
    var address = String(window.location.href)
    return /^https?:/.test(address) ? address.split('#')[0] : null
  }

  /* The lesson is opened on its own as numbered pages (see print/pdf.js), where the Download PDF
     button builds the file. This also works in home-screen web apps, which cannot print. */
  function savePdf() {
    var address = lessonAddress()

    if (address) {
      var opened = window.open(address + '#print', '_blank')
      if (opened) {
        say(buttons.pdf, 'Opening the PDF pages...')
      } else {
        /* a home-screen app can refuse a new window: open the pages in this window */
        window.location.href = address + '#print'
        window.location.reload()
      }
      return
    }

    /* an offline copy has no web address to open its PDF pages from */
    say(buttons.pdf, 'Open this lesson online to save it as a PDF')
  }

  /* index places a setting in the slide-out menu (0 is the first).
     row places an always-visible button to the left of the main button (1 is the nearest). */
  function makeButton(name, label, markup, index, row) {
    var button = document.createElement('button')
    button.className = 'zp-tool' + (row ? ' zp-tool--row' : '')
    button.type = 'button'
    button.setAttribute('data-tool', name)
    button.setAttribute('aria-label', label)
    button.title = label
    if (row) button.style.setProperty('--r', String(row))
    else button.style.setProperty('--k', String(index))
    button.innerHTML = markup
    holder.appendChild(button)
    buttons[name] = button
    return button
  }

  function build() {
    holder = document.createElement('div')
    holder.className = 'zp-tools'
    holder.id = 'zp-tools'

    mainButton = document.createElement('button')
    mainButton.className = 'zp-tool zp-tool--main'
    mainButton.id = 'zp-tools-button'
    mainButton.type = 'button'
    mainButton.setAttribute('aria-expanded', 'false')
    mainButton.setAttribute('aria-label', 'Open tools')
    mainButton.innerHTML = ICONS.sliders + ICONS.close
    holder.appendChild(mainButton)

    makeButton('theme', 'Switch theme', ICONS.sun + ICONS.moon, 0)
    makeButton('size', 'Change text size', ICONS.type + '<span class="zp-tool-badge" aria-hidden="true"></span>', 1)
    makeButton('terms', 'Hide key terms', ICONS.eye + ICONS.eyeOff, 2)
    makeButton('pdf', 'Save as PDF', ICONS.pdf, 3)
    makeButton('listen', 'Listen to this lesson', ICONS.listen, 0, 1)
    makeButton('draw', 'Draw and highlight', ICONS.draw, 0, 2)

    statusLabel = document.createElement('div')
    statusLabel.className = 'zp-tool-status'
    statusLabel.setAttribute('role', 'status')
    statusLabel.setAttribute('aria-live', 'polite')
    holder.appendChild(statusLabel)

    document.body.appendChild(holder)

    describeTheme()
    refreshTerms()
    refreshListen()
    refreshDraw()

    /* Listen and Draw are always visible, so their state is checked once every shared script has loaded,
       and again whenever the menu opens */
    window.addEventListener('load', function () {
      refreshListen()
      refreshDraw()
    })

    mainButton.addEventListener('click', function () {
      if (!holder.classList.contains('is-open')) {
        refreshTerms()
        refreshListen()
        refreshDraw()
      }
      setOpen(!holder.classList.contains('is-open'))
    })

    buttons.theme.addEventListener('click', toggleTheme)
    buttons.size.addEventListener('click', cycleSize)
    buttons.terms.addEventListener('click', toggleTerms)
    buttons.listen.addEventListener('click', toggleListen)
    buttons.draw.addEventListener('click', toggleDraw)
    buttons.pdf.addEventListener('click', function () {
      savePdf()
      setOpen(false)
      /* keep the message readable even though the menu closes */
      statusLabel.classList.add('is-shown')
      clearTimeout(statusTimer)
      statusTimer = setTimeout(function () { statusLabel.classList.remove('is-shown') }, 2600)
    })

    document.addEventListener('click', function (event) {
      var term = event.target.closest ? event.target.closest('.zp-term') : null
      if (term && root.classList.contains('zp-hide-terms')) {
        term.classList.toggle('is-shown')
        return
      }
      if (holder.classList.contains('is-open') && !holder.contains(event.target)) setOpen(false)
    })

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && holder.classList.contains('is-open')) {
        setOpen(false)
        mainButton.focus()
      }
    })
  }

  if (pdfView) return

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build)
  } else {
    build()
  }
})()
