/* STATION: makes an OSPE station page work (see station/station.css for the markup).
   It builds the same kind of screen as the MCQ exam:
   - a centered header: text size on the left, the title, the station (tap it to pick one) and the timer in the middle,
     Mock exam or Exit on the right;
   - a segmented rail with one segment per station (tap a segment to jump, a dot marks stations missed in the last mock);
   - a dark glass bar fixed at the bottom: previous, show answers, next.
   Two modes:
   - Study all (the default): one station at a time. Tap a question to show or hide its answer, or tap Show answers for
     the whole station. Under each answer the student taps "Got it" or "Missed it". The row turns green or red.
   - Mock exam: a timed run. The number of stations, questions per station and minutes per station start at the values
     written on the page (data-mock-stations, data-mock-questions, data-mock-minutes) and the student can change them.
     Stations are drawn from every topic in proportion to its size, never purely at random. During a station the
     answers are locked and the timer runs (Pause hides the station). Then the answers open and the student marks each one.
     At the end there is a score by topic. Stations below 60 percent are remembered on this device.
   Every question is worth one point. Marks written in the markup (data-marks, zp-st-marks, zp-sq-marks) are ignored.
   Keyboard: left and right arrows change station, Space shows or hides all the answers, 1 to 9 show one answer.
   Listen and Draw work here too. While Listen reads, the answers open when it reaches them.
   Without this script, or in the PDF view, every station is simply shown one under the other with its answers.
   Storage is wrapped so the page keeps working where storage is blocked. */
(function () {
  var root = document.documentElement
  if (root.classList.contains('zp-print-view')) return
  if (window.top === window && window.location.hash === '#print') return

  var KEY = 'zp-ospe:' + String(window.location.pathname || '')
  var SIZE_KEY = 'zp-size'
  var SIZES = ['normal', 'large', 'larger']
  var PERCENT = { normal: 100, large: 115, larger: 130 }
  var PASS = 0.6
  var CELEBRATE = 0.8

  function svg(inner) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + inner + '</svg>' }

  var ICON = {
    left: svg('<polyline points="15 18 9 12 15 6"/>'),
    right: svg('<polyline points="9 18 15 12 9 6"/>'),
    check: svg('<polyline points="20 6 9 17 4 12"/>'),
    close: svg('<line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/>'),
    clock: svg('<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/>')
  }

  var wrap, ui, head, railEl, barEl, selectEl
  var foot, slotL, slotC, slotR, hintEl
  var headEls = {}
  var segs = []
  var railState = { current: -1, done: null, flag: null }
  var stations = []
  var lessonName = ''
  var mode = 'study'
  var idx = 0
  var shown = null
  var plan = null
  var timer = null
  var saved = { missed: [], last: null }
  var scrollWaiting = false

  /* ---------- small helpers ---------- */
  function readSaved() {
    try {
      var data = JSON.parse(window.localStorage.getItem(KEY) || 'null')
      if (data && Array.isArray(data.missed)) saved = data
    } catch (error) { /* blocked: nothing remembered */ }
  }

  function writeSaved() {
    try { window.localStorage.setItem(KEY, JSON.stringify(saved)) } catch (error) { /* blocked: lasts for this visit */ }
  }

  function el(tag, className, html) {
    var node = document.createElement(tag)
    if (className) node.className = className
    if (html !== undefined) node.innerHTML = html
    return node
  }

  function esc(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }

  function shuffle(list) {
    var a = list.slice()
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1))
      var t = a[i]
      a[i] = a[j]
      a[j] = t
    }
    return a
  }

  function pad(n) { return n < 10 ? '0' + n : String(n) }
  function add(a, b) { return a + b }
  function number(value, fallback) {
    var n = parseInt(value, 10)
    return isNaN(n) ? fallback : n
  }

  function reduced() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  }

  /* when the page has been scrolled down, a new station starts at the header. Otherwise nothing moves. */
  function toTop() {
    var rect = ui.getBoundingClientRect()
    if (rect.top >= 0) return
    try { ui.scrollIntoView({ block: 'start' }) } catch (error) { window.scrollTo(0, (window.pageYOffset || 0) + rect.top - 12) }
  }

  /* puts new content in the panel under the rail and plays its entrance again */
  function swapBar(html) {
    barEl.innerHTML = html
    barEl.classList.remove('is-in')
    void barEl.offsetWidth
    if (html) barEl.classList.add('is-in')
  }

  /* the page keeps room for the bar, so the last question is never hidden behind it */
  function syncPad() {
    if (!foot) return
    root.style.setProperty('--zp-ospe-pad', Math.ceil(foot.offsetHeight + 20) + 'px')
  }

  /* counts a number up (used for the score) */
  function countUp(node, target) {
    if (reduced() || target <= 0) {
      node.textContent = String(target)
      return
    }
    var begin = null
    function step(now) {
      if (begin === null) begin = now
      var t = Math.min(1, (now - begin) / 800)
      node.textContent = String(Math.round(target * (1 - Math.pow(1 - t, 3))))
      if (t < 1) window.requestAnimationFrame(step)
    }
    node.textContent = '0'
    window.requestAnimationFrame(step)
  }

  /* ---------- the confirmation dialog ---------- */
  function confirmDialog(o) {
    var back = el('div', 'zp-dlg',
      '<div class="zp-dlg-card"><h3>' + esc(o.title) + '</h3><p>' + esc(o.message) + '</p>' +
      '<div class="zp-dlg-row"><button type="button" class="zp-btn" data-d="no">' + esc(o.cancel) + '</button>' +
      '<button type="button" class="zp-btn zp-btn--main" data-d="yes">' + esc(o.confirm) + '</button></div></div>')
    back.setAttribute('role', 'dialog')
    back.setAttribute('aria-modal', 'true')
    back.setAttribute('aria-label', o.title)

    function close() {
      document.removeEventListener('keydown', onEsc, true)
      if (back.parentNode) back.parentNode.removeChild(back)
    }

    function onEsc(event) {
      if (event.key === 'Escape') {
        event.stopPropagation()
        close()
      }
    }

    back.addEventListener('click', function (event) {
      var choice = event.target.getAttribute ? event.target.getAttribute('data-d') : null
      if (event.target === back || choice === 'no') close()
      else if (choice === 'yes') {
        close()
        o.onConfirm()
      }
    })
    document.addEventListener('keydown', onEsc, true)
    document.body.appendChild(back)
    back.querySelector('[data-d="yes"]').focus()
  }

  /* leaving a running mock asks first. Everything else leaves at once. */
  function askLeave(then) {
    if (mode === 'mock' && plan && plan.phase !== 'results') {
      confirmDialog({
        title: 'Leave this mock exam?',
        message: 'Your progress in this mock will not be saved.',
        confirm: 'Leave',
        cancel: 'Keep going',
        onConfirm: then
      })
    } else {
      then()
    }
  }

  /* ---------- the header ---------- */
  function buildHead() {
    head = el('div', 'zp-st-head',
      '<div class="zp-st-l"><button type="button" class="zp-st-btn" data-act="size">' +
        '<span class="zp-st-aa">Aa</span><span class="zp-st-lbl zp-st-pct">100%</span></button></div>' +
      '<div class="zp-st-c"><div class="zp-st-eyebrow"></div>' +
        '<div class="zp-st-statusrow"><label class="zp-st-status"><span class="zp-st-status-text"></span>' +
          '<svg class="zp-st-caret" viewBox="0 0 24 24" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>' +
          '<select aria-label="Choose a station"></select></label></div>' +
        '<div class="zp-st-timer" hidden></div><div class="zp-st-timebar" hidden><span></span></div></div>' +
      '<div class="zp-st-r"><button type="button" class="zp-st-btn" data-act="side"></button></div>')
    headEls = {
      size: head.querySelector('[data-act="size"]'),
      pct: head.querySelector('.zp-st-pct'),
      eyebrow: head.querySelector('.zp-st-eyebrow'),
      statusLabel: head.querySelector('.zp-st-status'),
      statusText: head.querySelector('.zp-st-status-text'),
      timer: head.querySelector('.zp-st-timer'),
      timebar: head.querySelector('.zp-st-timebar'),
      side: head.querySelector('[data-act="side"]')
    }
    selectEl = head.querySelector('select')
  }

  function updateSizeLabel() {
    var size = root.dataset.size || 'normal'
    var percent = PERCENT[size] || 100
    headEls.pct.textContent = percent + '%'
    headEls.size.setAttribute('aria-label', 'Adjust text size (currently ' + percent + '%)')
  }

  /* the tools menu keeps its own copy of the text size, so its button is used when it is there */
  function cycleSize() {
    var tools = document.querySelector('[data-tool="size"]')
    if (tools) {
      tools.click()
    } else {
      var size = root.dataset.size || 'normal'
      var next = SIZES[(SIZES.indexOf(size) + 1) % SIZES.length]
      root.dataset.size = next
      try { window.localStorage.setItem(SIZE_KEY, next) } catch (error) { /* blocked: lasts for this visit */ }
    }
    updateSizeLabel()
  }

  /* o: eyebrow, status, select (the status opens a station list), timer, side ('mock' or 'exit') */
  function setHead(o) {
    headEls.eyebrow.textContent = o.eyebrow
    headEls.statusText.textContent = o.status
    headEls.statusLabel.classList.toggle('is-static', !o.select)
    headEls.timer.hidden = !o.timer
    headEls.timebar.hidden = !o.timer
    if (!o.timer) headEls.timer.classList.remove('is-low')
    if (o.side === 'exit') {
      headEls.side.innerHTML = ICON.close + '<span class="zp-st-lbl">Exit</span>'
      headEls.side.setAttribute('aria-label', 'Exit the mock exam')
    } else {
      headEls.side.innerHTML = ICON.clock + '<span class="zp-st-lbl">Mock exam</span>'
      headEls.side.setAttribute('aria-label', 'Start a mock exam')
    }
    updateSizeLabel()
  }

  function rebuildSelect() {
    var options = ''
    stations.forEach(function (st, i) {
      var missed = saved.missed.indexOf(st._n) > -1
      options += '<option value="' + i + '">Station ' + st._n + ' \u00B7 ' + esc(st._topic) + (missed ? ' \u2022' : '') + '</option>'
    })
    selectEl.innerHTML = options
    selectEl.value = String(idx)
  }

  /* ---------- the rail ---------- */
  function buildRail(total, current, interactive, done, flag) {
    railEl.innerHTML = ''
    segs = []
    railState = { current: current, done: done || null, flag: flag || null }
    railEl.setAttribute('role', interactive ? 'group' : 'progressbar')
    if (interactive) railEl.setAttribute('aria-label', 'Stations')
    for (var i = 0; i < total; i++) {
      var item = el('div', 'zp-rail-item')
      var dot = el('span', 'zp-rail-dot')
      var seg = interactive ? el('button', 'zp-rail-seg', '<span></span>') : el('div', 'zp-rail-seg', '<span></span>')
      if (interactive) {
        seg.type = 'button'
        seg.setAttribute('data-go', String(i))
        seg.setAttribute('aria-label', 'Go to station ' + (i + 1))
      }
      item.appendChild(dot)
      item.appendChild(seg)
      railEl.appendChild(item)
      segs.push({ item: item, dot: dot, seg: seg })
    }
    refreshRail()
  }

  function refreshRail() {
    var count = 0
    segs.forEach(function (s, i) {
      var isDone = !!(railState.done && railState.done(i))
      if (isDone) count += 1
      s.item.classList.toggle('is-current', i === railState.current)
      s.item.classList.toggle('is-done', isDone)
      s.dot.classList.toggle('is-flag', !!(railState.flag && railState.flag(i)))
      if (i === railState.current) s.seg.setAttribute('aria-current', 'step')
      else s.seg.removeAttribute('aria-current')
    })
    if (railEl.getAttribute('role') === 'progressbar') {
      railEl.setAttribute('aria-valuemin', '0')
      railEl.setAttribute('aria-valuemax', String(segs.length))
      railEl.setAttribute('aria-valuenow', String(count))
    }
  }

  /* ---------- the bar at the bottom ---------- */
  /* o: cls (extra classes), title, aria, disabled, iconL, iconR */
  function bbtn(act, label, o) {
    o = o || {}
    return '<button type="button" class="zp-bar-btn ' + (o.cls || '') + '" data-act="' + act + '"' +
      (o.title ? ' title="' + o.title + '"' : '') +
      (o.aria ? ' aria-label="' + o.aria + '"' : '') +
      (o.disabled ? ' disabled' : '') + '>' +
      (o.iconL || '') + '<span class="zp-bar-label">' + label + '</span>' + (o.iconR || '') + '</button>'
  }

  function countChip() {
    return '<span class="zp-bar-count" title="Answers marked"></span>'
  }

  function setFoot(left, center, right, hint) {
    slotL.innerHTML = left || ''
    slotC.innerHTML = center || ''
    slotR.innerHTML = right || ''
    hintEl.textContent = hint || ''
    syncPad()
  }

  /* ---------- getting the stations ready ---------- */
  function markBox() {
    return el('div', 'zp-sq-tick',
      '<span>How did you do?</span>' +
      '<button type="button" data-mark="got" aria-pressed="false">\u2713 Got it</button>' +
      '<button type="button" data-mark="miss" aria-pressed="false">\u2715 Missed it</button>')
  }

  function prepare() {
    stations.forEach(function (st, i) {
      st._n = i + 1
      st._topic = st.getAttribute('data-topic') || 'General'
      st._title = st.querySelector('.zp-station-title')
      st._name = st.querySelector('.zp-st-name')

      /* every question is one point: marks written in the page are emptied, so Listen never reads them */
      ;[].forEach.call(st.querySelectorAll('.zp-st-marks, .zp-sq-marks'), function (mark) { mark.textContent = '' })

      st._qs = [].slice.call(st.querySelectorAll('.zp-sq > li'))
      if (!st.querySelector('.zp-station-media')) st.classList.add('zp-station--nomedia')

      st._qs.forEach(function (li) {
        li._st = st
        li._question = li.querySelector('.zp-sq-text')
        var answer = li.querySelector('.zp-sq-answer')
        li._hasAnswer = !!answer
        if (!answer) return

        /* the answer grows open: its content sits in two wrappers */
        var inner = el('div', 'zp-sq-answer-in')
        var body = el('div', 'zp-sq-answer-body')
        while (answer.firstChild) body.appendChild(answer.firstChild)
        inner.appendChild(body)
        answer.appendChild(inner)
        body.appendChild(markBox())

        li.setAttribute('data-q', '')
        if (li._question) {
          li._question.setAttribute('role', 'button')
          li._question.setAttribute('tabindex', '0')
          li._question.setAttribute('aria-expanded', 'false')
        }
      })
    })
  }

  /* ---------- the state of a question and of a station ---------- */
  function visibleQs(st) {
    return st._qs.filter(function (li) { return !li.hidden })
  }

  /* every question is one point */
  function scoreOf(st) {
    var qs = visibleQs(st)
    var got = 0
    var missed = 0
    qs.forEach(function (li) {
      if (li.classList.contains('is-got')) got += 1
      else if (li.classList.contains('is-missed')) missed += 1
    })
    return { got: got, total: qs.length, marked: got + missed }
  }

  /* the station counts as revealed when every one of its answers is open (the cover boxes fade away then) */
  function syncStation(st) {
    var qs = visibleQs(st).filter(function (li) { return li._hasAnswer })
    var all = qs.length > 0 && qs.every(function (li) { return li.classList.contains('is-open') })
    st.classList.toggle('is-revealed', all)
    if (st === shown) refreshBar()
  }

  function setQ(li, open) {
    if (!li._hasAnswer) return
    li.classList.toggle('is-open', open)
    if (li._question) li._question.setAttribute('aria-expanded', String(open))
    syncStation(li._st)
  }

  function toggleQ(li) {
    if (!li || !li._hasAnswer || li._st.classList.contains('is-locked')) return
    setQ(li, !li.classList.contains('is-open'))
  }

  function setMark(li, value) {
    var current = li.classList.contains('is-got') ? 'got' : (li.classList.contains('is-missed') ? 'miss' : '')
    var next = current === value ? '' : value
    li.classList.toggle('is-got', next === 'got')
    li.classList.toggle('is-missed', next === 'miss')
    ;[].forEach.call(li.querySelectorAll('.zp-sq-tick button'), function (button) {
      var on = button.getAttribute('data-mark') === next
      button.classList.toggle('is-on', on)
      button.setAttribute('aria-pressed', String(on))
    })
    if (li._st === shown) refreshBar()
    else refreshRail()
  }

  /* closes the answers and forgets the marks */
  function resetStation(st) {
    st._qs.forEach(function (li) {
      li.classList.remove('is-open', 'is-got', 'is-missed')
      if (li._question) li._question.setAttribute('aria-expanded', 'false')
      ;[].forEach.call(li.querySelectorAll('.zp-sq-tick button'), function (button) {
        button.classList.remove('is-on')
        button.setAttribute('aria-pressed', 'false')
      })
    })
    st.classList.remove('is-revealed')
  }

  /* closes the answers but keeps the marks, so a station you come back to shows how you did */
  function collapseStation(st) {
    st._qs.forEach(function (li) {
      li.classList.remove('is-open')
      if (li._question) li._question.setAttribute('aria-expanded', 'false')
    })
    st.classList.remove('is-revealed')
  }

  /* keeps the bar and the rail in step */
  function refreshBar() {
    if (!shown || !foot) return
    var score = scoreOf(shown)
    var reveal = foot.querySelector('[data-act="reveal"] .zp-bar-label')
    if (reveal) reveal.textContent = shown.classList.contains('is-revealed') ? 'Hide answers' : 'Show answers'
    var count = foot.querySelector('.zp-bar-count')
    if (count) {
      count.textContent = score.marked + '/' + score.total
      count.setAttribute('aria-label', score.marked + ' of ' + score.total + ' marked')
    }
    refreshRail()
  }

  function hideAll() {
    stations.forEach(function (st) { st.hidden = true })
    shown = null
  }

  /* dir is 'next' or 'prev': the station slides in from the side you are moving towards */
  function showStation(st, options) {
    hideAll()
    st.hidden = false
    shown = st
    st.classList.remove('zp-st-in-next', 'zp-st-in-prev', 'is-paused')
    if (options.dir && !reduced()) {
      void st.offsetWidth
      st.classList.add('zp-st-in-' + options.dir)
    }
    if (options.reset) resetStation(st)
    else collapseStation(st)
    st.classList.toggle('is-locked', !!options.locked)
    st._qs.forEach(function (li) { li.hidden = !!(options.only && options.only.indexOf(li) < 0) })
    if (st._name) st._name.textContent = options.name || ('Station ' + st._n)
    /* a mock never shows the topic, it would give a hint */
    if (st._title) {
      if (options.mock) st._title.removeAttribute('data-topic')
      else st._title.setAttribute('data-topic', st._topic)
    }
    syncStation(st)
  }

  /* ---------- study all ---------- */
  function study(index, scroll, dir) {
    stopTimer()
    plan = null
    mode = 'study'
    var before = idx
    idx = Math.max(0, Math.min(stations.length - 1, index))
    if (!dir && idx !== before) dir = idx > before ? 'next' : 'prev'
    ui.setAttribute('data-view', 'study')

    setHead({ eyebrow: lessonName, status: 'Station ' + (idx + 1) + ' / ' + stations.length, select: true, timer: false, side: 'mock' })
    rebuildSelect()
    buildRail(
      stations.length, idx, true,
      function (i) {
        var s = scoreOf(stations[i])
        return s.total > 0 && s.marked === s.total
      },
      function (i) { return saved.missed.indexOf(stations[i]._n) > -1 }
    )
    swapBar(saved.missed.length ? '<p class="zp-ospe-note"><i></i>Scored below 60 percent in your last mock.</p>' : '')

    setFoot(
      bbtn('prev', 'Previous', { cls: 'zp-bar-nav', iconL: ICON.left, aria: 'Previous station', title: 'Previous station (\u2190)', disabled: idx === 0 }),
      bbtn('reveal', 'Show answers', { cls: 'zp-bar-wide', title: 'Show or hide all the answers (Space)' }) + countChip(),
      bbtn('next', 'Next', { cls: 'zp-bar-nav zp-bar-solid', iconR: ICON.right, aria: 'Next station', title: 'Next station (\u2192)', disabled: idx === stations.length - 1 }),
      '\u2190 \u2192 navigate \u00B7 Space show answers \u00B7 1\u20139 one answer'
    )
    showStation(stations[idx], { dir: dir })
    refreshBar()
    if (scroll) toTop()
  }

  function toggleReveal() {
    if (!shown) return
    var open = !shown.classList.contains('is-revealed')
    visibleQs(shown).forEach(function (li) { setQ(li, open) })
  }

  /* ---------- mock: choosing the stations ---------- */
  function pickStations(count) {
    var groups = {}
    var order = []
    stations.forEach(function (st) {
      if (!groups[st._topic]) {
        groups[st._topic] = []
        order.push(st._topic)
      }
      groups[st._topic].push(st)
    })
    var g = order.map(function (topic) { return shuffle(groups[topic]) })
    var total = stations.length
    var n = Math.max(1, Math.min(count, total))
    var every = n >= g.length

    var q = g.map(function (list) { return Math.min(list.length, Math.floor(n * list.length / total)) })
    if (every) q = q.map(function (v) { return Math.max(1, v) })
    var sum = q.reduce(add, 0)

    while (sum > n) {
      var most = -1
      q.forEach(function (v, i) {
        if (v > (every ? 1 : 0) && (most < 0 || v > q[most])) most = i
      })
      if (most < 0) break
      q[most] -= 1
      sum -= 1
    }
    while (sum < n) {
      var pick = -1
      var best = -1
      q.forEach(function (v, i) {
        if (v >= g[i].length) return
        var want = n * g[i].length / total - v + Math.random() * 0.01
        if (want > best) {
          best = want
          pick = i
        }
      })
      if (pick < 0) break
      q[pick] += 1
      sum += 1
    }

    var chosen = []
    g.forEach(function (list, i) { chosen = chosen.concat(list.slice(0, q[i])) })
    return shuffle(chosen)
  }

  function pickQuestions(st, count) {
    var all = st._qs
    if (!count || count >= all.length) return all.slice()
    var keep = shuffle(all.map(function (li, i) { return i })).slice(0, count).sort(function (a, b) { return a - b })
    return keep.map(function (i) { return all[i] })
  }

  /* ---------- mock: setting it up ---------- */
  function defaults() {
    return {
      n: Math.min(stations.length, Math.max(1, number(wrap.getAttribute('data-mock-stations'), Math.min(10, stations.length)))),
      q: Math.max(0, number(wrap.getAttribute('data-mock-questions'), 0)),
      m: Math.max(0, number(wrap.getAttribute('data-mock-minutes'), 0))
    }
  }

  function mockSetup() {
    stopTimer()
    plan = null
    mode = 'mock'
    ui.setAttribute('data-view', 'setup')
    hideAll()
    setHead({ eyebrow: lessonName, status: 'Mock exam', select: false, timer: false, side: 'exit' })
    buildRail(0, -1, false)
    var d = defaults()
    var maxQ = stations.reduce(function (most, st) { return Math.max(most, st._qs.length) }, 1)
    var topics = []
    stations.forEach(function (st) { if (topics.indexOf(st._topic) < 0) topics.push(st._topic) })
    swapBar(
      '<div class="zp-ospe-form">' +
        '<label>Stations<input type="number" inputmode="numeric" enterkeyhint="go" name="n" min="1" max="' + stations.length + '" value="' + d.n + '"><small>1 to ' + stations.length + '</small></label>' +
        '<label>Questions per station<input type="number" inputmode="numeric" enterkeyhint="go" name="q" min="0" max="' + maxQ + '" value="' + d.q + '"><small>0 = all</small></label>' +
        '<label>Minutes per station<input type="number" inputmode="numeric" enterkeyhint="go" name="m" min="0" max="60" value="' + d.m + '"><small>0 = no timer</small></label>' +
      '</div>' +
      '<p class="zp-ospe-note">Stations are drawn from all ' + topics.length + (topics.length === 1 ? ' topic' : ' topics') + ', in proportion to their size. Every question is one point.</p>'
    )
    setFoot(
      saved.missed.length ? bbtn('retry', 'Retry missed (' + saved.missed.length + ')', { cls: 'zp-bar-wide zp-bar-ghost' }) : '',
      '',
      bbtn('start', 'Start mock', { cls: 'zp-bar-wide zp-bar-solid' }),
      ''
    )
  }

  function startMock(list) {
    var inputs = {
      n: barEl.querySelector('[name="n"]'),
      q: barEl.querySelector('[name="q"]'),
      m: barEl.querySelector('[name="m"]')
    }
    var d = defaults()
    var n = inputs.n ? Math.max(1, Math.min(stations.length, number(inputs.n.value, d.n))) : d.n
    var q = inputs.q ? Math.max(0, number(inputs.q.value, d.q)) : d.q
    var m = inputs.m ? Math.max(0, Math.min(60, number(inputs.m.value, d.m))) : d.m

    var chosen = list || pickStations(n)
    if (!chosen.length) return
    plan = {
      items: chosen.map(function (st) { return { st: st, qs: pickQuestions(st, q) } }),
      minutes: m,
      k: 0,
      phase: 'answer',
      results: [],
      endAt: null,
      left: 0,
      paused: false
    }
    answerPhase('next')
    toTop()
  }

  /* ---------- mock: running it ---------- */
  function stopTimer() {
    if (timer) clearInterval(timer)
    timer = null
  }

  function setClock(ms) {
    var seconds = Math.max(0, Math.ceil(ms / 1000))
    headEls.timer.textContent = pad(Math.floor(seconds / 60)) + ':' + pad(seconds % 60)
    headEls.timer.classList.toggle('is-low', seconds <= 10)
    headEls.timebar.firstElementChild.style.width = Math.max(0, Math.min(100, ms / (plan.minutes * 60000) * 100)) + '%'
  }

  function tick() {
    if (!plan || !plan.endAt) return
    var left = plan.endAt - Date.now()
    setClock(left)
    if (left <= 0) {
      stopTimer()
      markPhase(true)
    }
  }

  function mockRail(current) {
    buildRail(plan.items.length, current, false, function (i) { return i < plan.k })
  }

  function answerPhase(dir) {
    stopTimer()
    var item = plan.items[plan.k]
    var timed = plan.minutes > 0
    plan.phase = 'answer'
    ui.setAttribute('data-view', 'run')
    setHead({ eyebrow: lessonName + ' \u00B7 mock', status: 'Station ' + (plan.k + 1) + ' / ' + plan.items.length, select: false, timer: timed, side: 'exit' })
    mockRail(plan.k)
    swapBar('<p class="zp-ospe-note">Answer from the picture, then tap I\u2019m done.</p>')
    setFoot(
      timed ? bbtn('pause', 'Pause', { cls: 'zp-bar-wide' }) : '',
      '',
      bbtn('done', 'I\u2019m done', { cls: 'zp-bar-wide zp-bar-solid', iconR: ICON.check }),
      ''
    )
    showStation(item.st, { reset: true, only: item.qs, name: 'Station ' + (plan.k + 1), dir: dir, locked: true, mock: true })
    if (timed) {
      plan.left = plan.minutes * 60000
      plan.endAt = Date.now() + plan.left
      plan.paused = false
      headEls.timebar.firstElementChild.style.width = '100%'
      setClock(plan.left)
      timer = setInterval(tick, 250)
    } else {
      plan.endAt = null
    }
  }

  function togglePause() {
    if (!plan || !plan.minutes || plan.phase !== 'answer') return
    var label = foot.querySelector('[data-act="pause"] .zp-bar-label')
    if (plan.paused) {
      plan.paused = false
      plan.endAt = Date.now() + plan.left
      timer = setInterval(tick, 250)
      if (shown) shown.classList.remove('is-paused')
      if (label) label.textContent = 'Pause'
    } else {
      plan.paused = true
      plan.left = Math.max(0, plan.endAt - Date.now())
      plan.endAt = null
      stopTimer()
      if (shown) shown.classList.add('is-paused')
      if (label) label.textContent = 'Resume'
    }
  }

  function markPhase(timeUp) {
    stopTimer()
    var item = plan.items[plan.k]
    var last = plan.k === plan.items.length - 1
    plan.phase = 'mark'
    plan.paused = false
    ui.setAttribute('data-view', 'run')
    setHead({ eyebrow: lessonName + ' \u00B7 mock', status: 'Station ' + (plan.k + 1) + ' / ' + plan.items.length, select: false, timer: false, side: 'exit' })
    mockRail(plan.k)
    swapBar('<p class="zp-ospe-note">' + (timeUp ? 'Time is up. ' : '') + 'Check each answer, then tap Got it or Missed it.</p>')
    setFoot(
      '',
      countChip(),
      bbtn('next-station', last ? 'See results' : 'Next station', { cls: 'zp-bar-wide zp-bar-solid', iconR: last ? ICON.check : ICON.right }),
      ''
    )
    item.st.classList.remove('is-paused', 'is-locked')
    visibleQs(item.st).forEach(function (li) { setQ(li, true) })
    refreshBar()
  }

  function nextStation() {
    var item = plan.items[plan.k]
    var score = scoreOf(item.st)
    plan.results.push({ n: item.st._n, topic: item.st._topic, got: score.got, total: score.total })
    if (plan.k + 1 < plan.items.length) {
      plan.k += 1
      answerPhase('next')
      toTop()
    } else {
      results()
    }
  }

  /* ---------- mock: the results ---------- */
  function results() {
    stopTimer()
    hideAll()
    plan.phase = 'results'
    ui.setAttribute('data-view', 'results')
    setHead({ eyebrow: lessonName + ' \u00B7 mock', status: 'Results', select: false, timer: false, side: 'exit' })
    buildRail(plan.items.length, -1, false, function () { return true })

    var got = 0
    var total = 0
    var byTopic = {}
    var order = []
    var missed = []
    plan.results.forEach(function (r) {
      got += r.got
      total += r.total
      if (!byTopic[r.topic]) {
        byTopic[r.topic] = { got: 0, total: 0 }
        order.push(r.topic)
      }
      byTopic[r.topic].got += r.got
      byTopic[r.topic].total += r.total
      if (r.total > 0 && r.got / r.total < PASS) missed.push(r.n)
    })
    var percent = total ? Math.round(got / total * 100) : 0

    var rows = order.map(function (topic) {
      var t = byTopic[topic]
      var p = t.total ? Math.round(t.got / t.total * 100) : 0
      return '<div class="zp-ospe-topic' + (p < PASS * 100 ? ' is-weak' : '') + '"><span>' + esc(topic) + '</span>' +
        '<div class="zp-ospe-bar-track"><span data-w="' + p + '" style="width:0"></span></div><b>' + t.got + ' / ' + t.total + '</b></div>'
    }).join('')

    swapBar(
      '<div class="zp-ospe-result"><h3><span class="zp-ospe-got">' + got + '</span> / ' + total + ' <small class="zp-ospe-pct">(' + percent + '%)</small></h3>' +
      '<p class="zp-ospe-note">Every question was one point. Score by topic:</p>' + rows +
      (missed.length
        ? '<p class="zp-ospe-note">Below 60 percent: station ' + missed.join(', ') + '. They are marked with a dot in the station list.</p>'
        : '<p class="zp-ospe-note">No station below 60 percent. Well done.</p>') +
      '</div>'
    )
    setFoot(
      bbtn('mode-study', 'Study all', { cls: 'zp-bar-wide zp-bar-ghost' }),
      missed.length ? bbtn('newmock', 'New mock', { cls: 'zp-bar-wide' }) : '',
      missed.length
        ? bbtn('retry-now', 'Retry missed', { cls: 'zp-bar-wide zp-bar-solid' })
        : bbtn('newmock', 'New mock', { cls: 'zp-bar-wide zp-bar-solid' }),
      ''
    )

    /* the numbers count up and the bars fill in */
    countUp(barEl.querySelector('.zp-ospe-got'), got)
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        ;[].forEach.call(barEl.querySelectorAll('.zp-ospe-bar-track span'), function (bar) {
          bar.style.width = bar.getAttribute('data-w') + '%'
        })
      })
    })
    if (total && got / total >= CELEBRATE && window.zpCelebrate) window.zpCelebrate('Score ' + percent + '%. Excellent work!')

    saved.missed = missed
    saved.last = { got: got, total: total, date: new Date().toISOString().slice(0, 10) }
    writeSaved()
    toTop()
  }

  function retryList() {
    return stations.filter(function (st) { return saved.missed.indexOf(st._n) > -1 })
  }

  /* ---------- taps and keys ---------- */
  function onClick(event) {
    var go = event.target.closest ? event.target.closest('[data-go]') : null
    if (go) {
      study(number(go.getAttribute('data-go'), 0), true)
      return
    }
    var target = event.target.closest ? event.target.closest('[data-act]') : null
    if (!target || target.disabled) return
    var act = target.getAttribute('data-act')
    if (act === 'size') cycleSize()
    else if (act === 'side') {
      if (mode === 'study') mockSetup()
      else askLeave(function () { study(idx, true) })
    } else if (act === 'mode-study') study(idx, true)
    else if (act === 'prev') study(idx - 1, true, 'prev')
    else if (act === 'next') study(idx + 1, true, 'next')
    else if (act === 'reveal') toggleReveal()
    else if (act === 'start') startMock(null)
    else if (act === 'retry' || act === 'retry-now') startMock(retryList())
    else if (act === 'newmock') mockSetup()
    else if (act === 'pause') togglePause()
    else if (act === 'done') markPhase(false)
    else if (act === 'next-station') nextStation()
  }

  /* tapping anywhere on a question row shows or hides its answer; the buttons inside the answer do their own thing */
  function onPageClick(event) {
    var target = event.target
    if (!target || !target.closest) return
    var mark = target.closest('[data-mark]')
    if (mark) {
      var row = mark.closest('li')
      if (row) setMark(row, mark.getAttribute('data-mark'))
      return
    }
    if (target.closest('.zp-sq-answer')) return
    toggleQ(target.closest('.zp-sq > li'))
  }

  function onPageKey(event) {
    if ((event.key === 'Enter' || event.key === ' ') && event.target.classList && event.target.classList.contains('zp-sq-text')) {
      event.preventDefault()
      toggleQ(event.target.closest('li'))
    }
  }

  function onKey(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) return
    if (document.querySelector('.zp-dlg')) return
    var tag = event.target && event.target.tagName
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
    if (window.zpDraw && window.zpDraw.isOpen && window.zpDraw.isOpen()) return
    var role = event.target && event.target.getAttribute ? event.target.getAttribute('role') : null
    var onButton = tag === 'BUTTON' || role === 'button'
    var key = event.key

    if (mode === 'study' && shown) {
      if (key === 'ArrowLeft') study(idx - 1, true, 'prev')
      else if (key === 'ArrowRight') study(idx + 1, true, 'next')
      else if ((key === ' ' || key === 'Enter') && !onButton) {
        event.preventDefault()
        toggleReveal()
      } else if (/^[1-9]$/.test(key)) toggleQ(visibleQs(shown)[parseInt(key, 10) - 1])
    } else if (mode === 'mock' && plan && plan.phase === 'mark' && key === 'Enter' && !onButton) {
      event.preventDefault()
      nextStation()
    }
  }

  /* a picture that stays in view on a wide screen moves while scrolling, so the student's own ink on it is placed again */
  function onScroll() {
    if (scrollWaiting || !shown) return
    if (!window.matchMedia || !window.matchMedia('(min-width: 1000px)').matches) return
    if (!document.querySelector('.zp-ink')) return
    scrollWaiting = true
    window.requestAnimationFrame(function () {
      scrollWaiting = false
      window.dispatchEvent(new Event('resize'))
    })
  }

  function init() {
    wrap = document.querySelector('.zp-ospe')
    if (!wrap) return
    stations = [].slice.call(wrap.querySelectorAll('.zp-station'))
    if (!stations.length) return

    var lesson = document.getElementById('zp-lesson')
    lessonName = (lesson && lesson.textContent.trim()) || document.title || 'Stations'

    root.classList.add('zp-station-page')
    readSaved()
    prepare()

    /* the header, the rail and the panel for the mock setup and results sit above the stations */
    ui = el('div', 'zp-ospe-ui')
    buildHead()
    railEl = el('div', 'zp-rail')
    barEl = el('div', 'zp-ospe-bar')
    ui.appendChild(head)
    ui.appendChild(el('div', 'zp-st-divider'))
    ui.appendChild(railEl)
    ui.appendChild(barEl)
    wrap.parentNode.insertBefore(ui, wrap)

    /* the bar lives in the body, outside the lesson column, so text size never scales it */
    foot = el('div', 'zp-ospe-foot',
      '<div class="zp-ospe-strip" role="toolbar" aria-label="Station controls">' +
        '<div class="zp-ospe-grid"><div class="zp-bar-l"></div><div class="zp-bar-c"></div><div class="zp-bar-r"></div></div>' +
        '<div class="zp-ospe-hint"></div></div>')
    document.body.appendChild(foot)
    slotL = foot.querySelector('.zp-bar-l')
    slotC = foot.querySelector('.zp-bar-c')
    slotR = foot.querySelector('.zp-bar-r')
    hintEl = foot.querySelector('.zp-ospe-hint')

    ui.addEventListener('click', onClick)
    foot.addEventListener('click', onClick)
    selectEl.addEventListener('change', function () { study(number(selectEl.value, 0), true) })
    ui.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && event.target.matches && event.target.matches('.zp-ospe-form input')) startMock(null)
    })
    wrap.addEventListener('click', onPageClick)
    wrap.addEventListener('keydown', onPageKey)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('load', syncPad)
    if (window.ResizeObserver) new window.ResizeObserver(syncPad).observe(foot)

    /* while Listen reads an answer, that answer opens by itself (not during a timed station) */
    if (window.MutationObserver) {
      new window.MutationObserver(function (changes) {
        changes.forEach(function (change) {
          var target = change.target
          if (!target.classList || !target.classList.contains('zp-reading')) return
          var answer = target.closest ? target.closest('.zp-sq-answer') : null
          var row = answer ? answer.closest('li') : null
          if (row && row._st && !row._st.classList.contains('is-locked') && !row.classList.contains('is-open')) setQ(row, true)
        })
      }).observe(wrap, { attributes: true, attributeFilter: ['class'], subtree: true })
    }

    study(0, false)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
