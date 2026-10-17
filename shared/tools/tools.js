/* TOOLS: the Tools menu. Light theme, normal text size and visible terms are the defaults.
   Theme and text size are remembered where the browser allows it (not in offline copies).
   Hide terms always starts switched off. */
(function () {
  var THEME_KEY = 'zp-theme'
  var SIZE_KEY = 'zp-size'
  var SIZES = ['normal', 'large', 'larger']
  var MIN_TERMS = 3
  var root = document.documentElement

  function read(key) {
    try { return localStorage.getItem(key) } catch (error) { return null }
  }

  function write(key, value) {
    try { localStorage.setItem(key, value) } catch (error) { /* storage blocked: lasts for this visit */ }
  }

  /* Apply the saved choices straight away so the page does not flash the wrong theme. */
  var theme = read(THEME_KEY) === 'dark' ? 'dark' : 'light'
  var size = SIZES.indexOf(read(SIZE_KEY)) > -1 ? read(SIZE_KEY) : 'normal'
  root.dataset.theme = theme
  root.dataset.size = size

  var ICONS = {
    sliders: '<svg viewBox="0 0 24 24" aria-hidden="true"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>',
    sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>',
    type: '<svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>',
    eyeOff: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>',
    printer: '<svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>'
  }

  var PANEL_HTML =
    '<div class="zp-tools-row">' +
      '<div class="zp-tools-head">' + ICONS.sun + '<span>Theme</span></div>' +
      '<div class="zp-seg" data-group="theme">' +
        '<button type="button" data-value="light">Light</button>' +
        '<button type="button" data-value="dark">Dark</button>' +
      '</div>' +
    '</div>' +
    '<div class="zp-tools-row">' +
      '<div class="zp-tools-head">' + ICONS.type + '<span>Text size</span></div>' +
      '<div class="zp-seg" data-group="size">' +
        '<button type="button" data-value="normal">Normal</button>' +
        '<button type="button" data-value="large">Large</button>' +
        '<button type="button" data-value="larger">Larger</button>' +
      '</div>' +
    '</div>' +
    '<div class="zp-tools-row" id="zp-tools-terms-row">' +
      '<div class="zp-tools-head">' + ICONS.eyeOff + '<span>Hide terms</span>' +
        '<button class="zp-switch" id="zp-tools-terms" type="button" role="switch" aria-checked="false" aria-label="Hide key terms"></button>' +
      '</div>' +
      '<div class="zp-tools-note" id="zp-tools-terms-note"></div>' +
    '</div>' +
    '<div class="zp-tools-row">' +
      '<button class="zp-tools-print" id="zp-tools-print" type="button">' + ICONS.printer + '<span>Print or save as PDF</span></button>' +
      '<div class="zp-tools-hint" id="zp-tools-hint" hidden></div>' +
    '</div>'

  var holder, button, panel, termsSwitch, termsNote, hint
  var termCount = 0

  function applyTheme(value) {
    theme = value
    root.dataset.theme = value
    write(THEME_KEY, value)
    sync()
  }

  function applySize(value) {
    size = value
    root.dataset.size = value
    write(SIZE_KEY, value)
    sync()
  }

  function setTermsHidden(hidden) {
    root.classList.toggle('zp-hide-terms', hidden)
    var shown = document.querySelectorAll('.zp-term.is-shown')
    for (var i = 0; i < shown.length; i++) shown[i].classList.remove('is-shown')
    termsSwitch.setAttribute('aria-checked', String(hidden))
  }

  function sync() {
    var groups = panel.querySelectorAll('.zp-seg')
    for (var g = 0; g < groups.length; g++) {
      var current = groups[g].getAttribute('data-group') === 'theme' ? theme : size
      var buttons = groups[g].querySelectorAll('button')
      for (var b = 0; b < buttons.length; b++) {
        buttons[b].setAttribute('aria-pressed', String(buttons[b].getAttribute('data-value') === current))
      }
    }
  }

  function refreshTerms() {
    termCount = document.querySelectorAll('.zp-term').length
    var row = document.getElementById('zp-tools-terms-row')
    var usable = termCount >= MIN_TERMS
    termsSwitch.disabled = !usable
    row.classList.toggle('is-disabled', !usable)
    if (usable) {
      termsNote.textContent = 'Tap a blurred term to reveal it.'
    } else if (termCount === 0) {
      termsNote.textContent = 'No key terms in this lesson.'
    } else {
      termsNote.textContent = 'Too few key terms in this lesson.'
    }
    if (!usable && root.classList.contains('zp-hide-terms')) setTermsHidden(false)
  }

  function openPanel() {
    refreshTerms()
    hint.hidden = true
    panel.hidden = false
    button.setAttribute('aria-expanded', 'true')
    button.setAttribute('aria-label', 'Close tools')
  }

  function closePanel() {
    panel.hidden = true
    button.setAttribute('aria-expanded', 'false')
    button.setAttribute('aria-label', 'Open tools')
  }

  /* ---- printing ---- */
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

  function startPrint() {
    var started = false
    var mark = function () { started = true }
    window.addEventListener('beforeprint', mark)
    try { window.print() } catch (error) { /* blocked */ }
    setTimeout(function () {
      window.removeEventListener('beforeprint', mark)
      if (!started) {
        hint.textContent = 'Printing is not available here. Open the lesson in your browser to print it.'
        hint.hidden = false
      }
    }, 700)
  }

  function build() {
    holder = document.createElement('div')
    holder.className = 'zp-tools'
    holder.id = 'zp-tools'

    button = document.createElement('button')
    button.className = 'zp-tools-button'
    button.id = 'zp-tools-button'
    button.type = 'button'
    button.setAttribute('aria-expanded', 'false')
    button.setAttribute('aria-controls', 'zp-tools-panel')
    button.setAttribute('aria-label', 'Open tools')
    button.innerHTML = ICONS.sliders

    panel = document.createElement('div')
    panel.className = 'zp-tools-panel'
    panel.id = 'zp-tools-panel'
    panel.setAttribute('role', 'dialog')
    panel.setAttribute('aria-label', 'Lesson tools')
    panel.hidden = true
    panel.innerHTML = PANEL_HTML

    holder.appendChild(button)
    holder.appendChild(panel)
    document.body.appendChild(holder)

    termsSwitch = document.getElementById('zp-tools-terms')
    termsNote = document.getElementById('zp-tools-terms-note')
    hint = document.getElementById('zp-tools-hint')

    button.addEventListener('click', function () {
      if (panel.hidden) openPanel(); else closePanel()
    })

    panel.addEventListener('click', function (event) {
      var target = event.target
      var choice = target.closest ? target.closest('.zp-seg button') : null
      if (choice) {
        var group = choice.parentNode.getAttribute('data-group')
        if (group === 'theme') applyTheme(choice.getAttribute('data-value'))
        else applySize(choice.getAttribute('data-value'))
        return
      }
      if (target.closest && target.closest('#zp-tools-terms')) {
        setTermsHidden(termsSwitch.getAttribute('aria-checked') !== 'true')
        return
      }
      if (target.closest && target.closest('#zp-tools-print')) startPrint()
    })

    document.addEventListener('click', function (event) {
      var term = event.target.closest ? event.target.closest('.zp-term') : null
      if (term && root.classList.contains('zp-hide-terms')) {
        term.classList.toggle('is-shown')
        return
      }
      if (!panel.hidden && !holder.contains(event.target)) closePanel()
    })

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !panel.hidden) {
        closePanel()
        button.focus()
      }
    })

    sync()
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build)
  } else {
    build()
  }
})()
