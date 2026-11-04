/* LISTEN: the read-aloud player. The Listen button in the tools menu (tools/tools.js) opens it.
   It reads the lesson with the voice of the device, highlights what is being read, follows along
   on the screen, and lets the student skip, change speed and pick a voice.
   It needs speech.js and reading.js (loaded before it). Without them, or without speech support in
   the browser, nothing is added and the lesson works exactly as before.
   Other files talk to it through window.zpListen and the "zp-listen-state" event. */
(function () {
  var root = document.documentElement
  if (window.top === window && window.location.hash === '#print') return
  if (root.classList.contains('zp-print-view')) return

  var speech = window.zpSpeech
  var reading = window.zpReading
  var supported = !!(speech && reading && speech.supported)

  var RATE_KEY = 'zp-listen-rate'
  var VOICE_KEY = 'zp-listen-voice'
  var RATES = [0.75, 1, 1.25, 1.5, 2]

  window.zpListen = {
    supported: supported,
    isOpen: function () { return false },
    open: function () {},
    close: function () {},
    toggle: function () {}
  }

  if (!supported) return

  var bar = null
  var parts = {}
  var player = null
  var data = null
  var opened = false
  var follow = true
  var marked = null
  var held = null
  var rate = 1
  var voicePool = []
  var messageTimer = null
  var justOpened = false

  /* ---------- small helpers ---------- */
  function read(key) {
    try { return localStorage.getItem(key) } catch (error) { return null }
  }

  function write(key, value) {
    try { localStorage.setItem(key, value) } catch (error) { /* storage blocked: lasts for this visit */ }
  }

  function svg(inner, className) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"' + (className ? ' class="' + className + '"' : '') + '>' + inner + '</svg>'
  }

  var ICON = {
    play: svg('<polygon points="6 3 20 12 6 21 6 3"/>', 'zp-listen-fill'),
    pause: svg('<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>', 'zp-listen-fill'),
    replay: svg('<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>'),
    left: svg('<polyline points="15 18 9 12 15 6"/>'),
    right: svg('<polyline points="9 18 15 12 9 6"/>'),
    skipBack: svg('<polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/>'),
    skipForward: svg('<polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/>'),
    close: svg('<line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/>')
  }

  function reducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  }

  function pad(number) {
    return number < 10 ? '0' + number : String(number)
  }

  function formatRate(value) {
    return String(value) + '\u00D7'
  }

  function announce(isOpen) {
    try {
      document.dispatchEvent(new CustomEvent('zp-listen-state', { detail: { open: isOpen } }))
    } catch (error) { /* very old browser: the tools button just will not light up */ }
  }

  /* ---------- highlight and follow along ---------- */
  function clearMark() {
    if (!marked) return
    marked.classList.remove('zp-reading')
    marked.classList.remove('zp-reading--tint')
    marked = null
  }

  function mark(el) {
    clearMark()
    if (!el) return
    marked = el
    el.classList.add('zp-reading')
    if (/^(P|LI|H3|H4)$/.test(el.tagName) && !el.closest('.zp-layers, .zp-tree-branch')) {
      el.classList.add('zp-reading--tint')
    }
  }

  /* Scrolls only when the passage has left the screen, so the page never jumps for nothing.
     When the player has just opened (quiet), nothing moves at all if the passage is already in view. */
  function ensureVisible(el, quiet) {
    var rect = el.getBoundingClientRect()
    var top = 70
    var bottom = window.innerHeight - (bar ? bar.offsetHeight : 0) - 24

    if (quiet) {
      if (rect.bottom > 40 && rect.top < bottom) return
    } else if (rect.top >= 8 && rect.bottom <= bottom) {
      return
    }

    /* put the passage in the upper part of the screen, or at the top if it is taller than the screen */
    var wanted = rect.height > bottom - top
      ? top
      : Math.max(top, Math.min(bottom - rect.height, window.innerHeight * 0.3))
    var delta = rect.top - wanted
    try {
      window.scrollBy({ top: delta, left: 0, behavior: reducedMotion() ? 'auto' : 'smooth' })
    } catch (error) {
      window.scrollBy(0, delta)
    }
  }

  function setAway(flag) {
    parts.where.classList.toggle('is-away', flag)
  }

  /* the passage nearest the top of the screen, so listening starts where the student is reading */
  function startIndex() {
    for (var i = 0; i < data.items.length; i++) {
      var rect = data.items[i].el.getBoundingClientRect()
      if (rect.height > 0 && rect.bottom > 90) return i
    }
    return 0
  }

  /* ---------- the bar ---------- */
  function show(index) {
    if (!opened || !data) return
    var item = data.items[index]
    if (!item) return
    var section = data.sections[item.sec]

    mark(item.el)

    parts.num.textContent = section && section.number ? pad(section.number) : ''
    parts.title.textContent = section ? section.title : data.title
    parts.where.setAttribute('aria-label', 'Show the part being read: ' + (section ? section.title : data.title))
    parts.fill.style.width = ((index + 1) / data.items.length * 100) + '%'

    var color = section ? window.getComputedStyle(section.el).getPropertyValue('--sec').trim() : ''
    bar.style.setProperty('--sec', color || 'var(--zp-accent)')

    var quiet = justOpened
    justOpened = false
    if (follow) ensureVisible(item.el, quiet)
  }

  function updatePlay(state) {
    var label = state === 'playing' ? 'Pause' : (state === 'idle' ? 'Play again' : 'Play')
    parts.play.innerHTML = state === 'playing' ? ICON.pause : (state === 'idle' ? ICON.replay : ICON.play)
    parts.play.setAttribute('aria-label', label)
    bar.classList.toggle('is-playing', state === 'playing')
  }

  function message(text) {
    clearTimeout(messageTimer)
    parts.msg.textContent = text
    bar.classList.toggle('has-msg', !!text)
    if (text) {
      messageTimer = setTimeout(function () {
        parts.msg.textContent = ''
        bar.classList.remove('has-msg')
      }, 6000)
    }
  }

  function hidePanel() {
    parts.panel.hidden = true
    parts.voice.setAttribute('aria-expanded', 'false')
  }

  /* ---------- voices ---------- */
  function voiceKey(voice) {
    return voice.voiceURI || voice.name
  }

  function fillVoices(list) {
    var pool = speech.recommended(list)
    voicePool = pool

    parts.select.innerHTML = ''
    pool.forEach(function (voice) {
      var option = document.createElement('option')
      option.value = voiceKey(voice)
      option.textContent = voice.name + (voice.lang ? ' (' + voice.lang + ')' : '')
      parts.select.appendChild(option)
    })

    parts.voice.hidden = !pool.length
    if (!pool.length) return

    var saved = read(VOICE_KEY)
    var pick = pool[0]
    pool.forEach(function (voice) {
      if (voiceKey(voice) === saved) pick = voice
    })
    parts.select.value = voiceKey(pick)
    player.setVoice(pick)
  }

  function onVoiceChange() {
    var key = parts.select.value
    voicePool.forEach(function (voice) {
      if (voiceKey(voice) === key) {
        write(VOICE_KEY, key)
        player.setVoice(voice)
      }
    })
  }

  /* ---------- controls ---------- */
  function go(index) {
    follow = true
    setAway(false)
    player.seek(index)
  }

  function sectionOf(index) {
    return data.items[index] ? data.items[index].sec : -1
  }

  function playPressed() {
    if (player.state() === 'playing') {
      player.pause()
      return
    }
    follow = true
    setAway(false)
    player.play()
  }

  function sectionBack() {
    var position = player.position()
    var current = sectionOf(position)
    var start = current >= 0 ? data.sections[current].item : 0
    if (position > start) go(start)
    else go(current > 0 ? data.sections[current - 1].item : 0)
  }

  function sectionForward() {
    var next = sectionOf(player.position()) + 1
    if (next < data.sections.length) go(data.sections[next].item)
    else go(data.items.length - 1)
  }

  function changeSpeed() {
    var next = RATES[(RATES.indexOf(rate) + 1) % RATES.length]
    rate = next
    write(RATE_KEY, String(rate))
    parts.speed.textContent = formatRate(rate)
    parts.speed.setAttribute('aria-label', 'Speed ' + rate + ' times. Change speed')
    player.setRate(rate)
  }

  function toggleVoicePanel() {
    var open = parts.panel.hidden
    parts.panel.hidden = !open
    parts.voice.setAttribute('aria-expanded', String(open))
  }

  function onClick(event) {
    var button = event.target.closest ? event.target.closest('[data-act]') : null
    if (!button || !data) return
    var act = button.getAttribute('data-act')
    if (act === 'play') playPressed()
    else if (act === 'back') go(player.position() - 1)
    else if (act === 'forward') go(player.position() + 1)
    else if (act === 'section-back') sectionBack()
    else if (act === 'section-forward') sectionForward()
    else if (act === 'speed') changeSpeed()
    else if (act === 'voice') toggleVoicePanel()
    else if (act === 'close') close()
    else if (act === 'where') {
      follow = true
      setAway(false)
      var item = data.items[player.position()]
      if (item) ensureVisible(item.el)
    }
  }

  /* when the student scrolls by hand, the page stops following until they ask it to come back */
  function onUserScroll(event) {
    if (!opened || (bar && bar.contains(event.target))) return
    follow = false
    setAway(true)
  }

  function onKeyScroll(event) {
    if (!opened) return
    var tag = event.target && event.target.tagName
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'BUTTON') return
    if (/^(PageUp|PageDown|Home|End|ArrowUp|ArrowDown)$/.test(event.key)) onUserScroll(event)
  }

  /* ---------- building the player ---------- */
  function ensureUi() {
    if (bar) return

    var savedRate = parseFloat(read(RATE_KEY))
    rate = RATES.indexOf(savedRate) > -1 ? savedRate : 1

    bar = document.createElement('div')
    bar.className = 'zp-listen'
    bar.setAttribute('role', 'region')
    bar.setAttribute('aria-label', 'Listen to this lesson')
    bar.hidden = true
    bar.innerHTML =
      '<div class="zp-listen-panel" hidden>' +
        '<label class="zp-listen-label" for="zp-listen-voice">Voice</label>' +
        '<select class="zp-listen-select" id="zp-listen-voice"></select>' +
        '<div class="zp-listen-hint">Voices come from your device. Pick the one that sounds best to you.</div>' +
      '</div>' +
      '<div class="zp-listen-top">' +
        '<button type="button" class="zp-listen-where" data-act="where" aria-label="Show the part being read">' +
          '<span class="zp-listen-num"></span><span class="zp-listen-title"></span>' +
        '</button>' +
        '<button type="button" class="zp-listen-chip" data-act="speed"></button>' +
        '<button type="button" class="zp-listen-chip" data-act="voice" aria-expanded="false">Voice</button>' +
        '<button type="button" class="zp-listen-icon" data-act="close" aria-label="Close the player">' + ICON.close + '</button>' +
      '</div>' +
      '<div class="zp-listen-track" aria-hidden="true"><span></span></div>' +
      '<div class="zp-listen-controls">' +
        '<button type="button" class="zp-listen-btn" data-act="section-back" aria-label="Previous section">' + ICON.skipBack + '</button>' +
        '<button type="button" class="zp-listen-btn" data-act="back" aria-label="Previous passage">' + ICON.left + '</button>' +
        '<button type="button" class="zp-listen-btn zp-listen-play" data-act="play" aria-label="Pause">' + ICON.pause + '</button>' +
        '<button type="button" class="zp-listen-btn" data-act="forward" aria-label="Next passage">' + ICON.right + '</button>' +
        '<button type="button" class="zp-listen-btn" data-act="section-forward" aria-label="Next section">' + ICON.skipForward + '</button>' +
      '</div>' +
      '<div class="zp-listen-msg" role="status"></div>'
    document.body.appendChild(bar)

    parts = {
      panel: bar.querySelector('.zp-listen-panel'),
      select: bar.querySelector('.zp-listen-select'),
      where: bar.querySelector('.zp-listen-where'),
      num: bar.querySelector('.zp-listen-num'),
      title: bar.querySelector('.zp-listen-title'),
      speed: bar.querySelector('[data-act="speed"]'),
      voice: bar.querySelector('[data-act="voice"]'),
      fill: bar.querySelector('.zp-listen-track span'),
      play: bar.querySelector('[data-act="play"]'),
      msg: bar.querySelector('.zp-listen-msg')
    }
    parts.speed.textContent = formatRate(rate)
    parts.speed.setAttribute('aria-label', 'Speed ' + rate + ' times. Change speed')

    player = speech.createPlayer()
    player.setRate(rate)

    player.on('item', show)
    player.on('state', updatePlay)
    player.on('end', function () {
      if (!opened) return
      parts.fill.style.width = '100%'
      parts.num.textContent = ''
      parts.title.textContent = 'End of the lesson'
      clearMark()
    })
    player.on('error', function (reason) {
      if (reason === 'not-allowed' || reason === 'blocked') {
        message('Speech did not start. Tap play to try again.')
      } else {
        message('This voice could not speak. Try another voice.')
      }
    })

    bar.addEventListener('click', onClick)
    parts.select.addEventListener('change', onVoiceChange)
    bar.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !parts.panel.hidden) {
        hidePanel()
        parts.voice.focus()
      }
    })

    window.addEventListener('wheel', onUserScroll, { passive: true })
    window.addEventListener('touchmove', onUserScroll, { passive: true })
    window.addEventListener('keydown', onKeyScroll)

    /* speech stops when the page is left, and the highlight never reaches the printed page */
    window.addEventListener('pagehide', function () { player.stop() })
    window.addEventListener('beforeprint', function () {
      if (marked) {
        held = marked
        clearMark()
      }
    })
    window.addEventListener('afterprint', function () {
      if (held && opened) mark(held)
      held = null
    })

    speech.onVoices(fillVoices)
  }

  /* ---------- opening and closing ---------- */
  function open() {
    if (opened) return
    ensureUi()
    data = reading.build()
    if (!data.items.length) return

    var start = startIndex()
    player.load(data.items.map(function (item) {
      return { text: item.text, wait: item.wait }
    }))

    opened = true
    follow = true
    setAway(false)
    message('')
    bar.hidden = false
    root.classList.add('zp-listening')
    announce(true)

    /* this runs inside the tap, which iPhone requires for the first sound */
    justOpened = true
    player.play(start)
  }

  function close() {
    if (!opened) return
    opened = false
    player.stop()
    clearMark()
    hidePanel()
    message('')
    bar.hidden = true
    root.classList.remove('zp-listening')
    announce(false)
  }

  window.zpListen.isOpen = function () { return opened }
  window.zpListen.open = open
  window.zpListen.close = close
  window.zpListen.toggle = function () {
    if (opened) close()
    else open()
  }
})()
