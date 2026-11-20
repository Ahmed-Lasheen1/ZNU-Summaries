/* STATION: makes an OSPE station page work (see station/station.css for the markup).
   The page holds every station as plain markup. This script adds a slim top row (the mode switch and the
   station picker) and a fixed bar at the bottom of the screen, and shows one station at a time, in two modes:
   - Study all (the default): every station. Tap a question to show or hide its answer, or use the bar to show
     all the answers of the station at once. Under each answer the student taps "Got it" or "Missed it".
   - Mock exam: a timed run. The number of stations, questions per station and minutes per station
     start at the values written on the page (data-mock-stations, data-mock-questions, data-mock-minutes)
     and the student can change them. Stations are drawn from every topic in proportion to its size,
     never purely at random. During a station the answers are locked and the timer runs (it can be paused, which
     hides the station). Then the answers open and the student marks each one. At the end there is a score by
     topic. Stations below 60 percent are remembered on this device.
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
  var PASS = 0.6
  var CELEBRATE = 0.8
  var CHEV_L = '<svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>'
  var CHEV_R = '<svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>'

  var wrap, ui, modesEl, barEl, foot, progEl, metaEl, ctrlEl, hintEl
  var stations = []
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

  /* when the page has been scrolled down, a new station starts at the top row. Otherwise nothing moves. */
  function toTop() {
    var rect = ui.getBoundingClientRect()
    if (rect.top >= 0) return
    try { ui.scrollIntoView({ block: 'start' }) } catch (error) { window.scrollTo(0, (window.pageYOffset || 0) + rect.top - 12) }
  }

  /* puts new content in the top row and plays its entrance again */
  function swapBar(html) {
    barEl.innerHTML = html
    barEl.classList.remove('is-in')
    void barEl.offsetWidth
    barEl.classList.add('is-in')
  }

  /* the page keeps room for the bar, so the last question is never hidden behind it */
  function syncPad() {
    if (!foot) return
    root.style.setProperty('--zp-ospe-pad', Math.ceil(foot.offsetHeight + 36) + 'px')
  }

  /* fills the fixed bar: meta is the line above the buttons, pct is the thin progress line */
  function setFoot(meta, controls, pct, hint) {
    metaEl.innerHTML = meta
    ctrlEl.innerHTML = controls
    hintEl.textContent = hint || ''
    progEl.style.width = Math.max(0, Math.min(100, pct || 0)) + '%'
    foot.classList.remove('is-low')
    syncPad()
  }

  function meta(left, middle, right) {
    return '<span class="zp-ospe-m1">' + left + '</span><span class="zp-ospe-m2">' + (middle || '') + '</span><span class="zp-ospe-m3">' + (right || '') + '</span>'
  }

  function btn(act, label, className, title) {
    return '<button type="button" class="zp-btn ' + (className || '') + '" data-act="' + act + '"' + (title ? ' title="' + title + '"' : '') + '>' + label + '</button>'
  }

  /* counts a number up (used for the score) */
  function countUp(node, target, suffix) {
    if (reduced() || target <= 0) {
      node.textContent = target + (suffix || '')
      return
    }
    var begin = null
    function step(now) {
      if (begin === null) begin = now
      var t = Math.min(1, (now - begin) / 800)
      node.textContent = Math.round(target * (1 - Math.pow(1 - t, 3))) + (suffix || '')
      if (t < 1) window.requestAnimationFrame(step)
    }
    node.textContent = '0' + (suffix || '')
    window.requestAnimationFrame(step)
  }

  /* ---------- getting the stations ready ---------- */
  function markBox() {
    return el('div', 'zp-sq-tick',
      '<span>How did you do?</span>' +
      '<button type="button" data-mark="got" aria-pressed="false">Got it</button>' +
      '<button type="button" data-mark="miss" aria-pressed="false">Missed it</button>')
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
  }

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

  /* keeps the bar in step: the label of the show button and the score line */
  function refreshBar() {
    if (!shown || !foot) return
    var score = scoreOf(shown)
    var reveal = foot.querySelector('[data-act="reveal"]')
    if (reveal) reveal.textContent = shown.classList.contains('is-revealed') ? 'Hide answers' : 'Show answers'
    var right = foot.querySelector('.zp-ospe-m3')
    if (right && !right.querySelector('.zp-ospe-clock')) {
      if (plan && plan.phase === 'mark') right.textContent = score.marked + ' of ' + score.total + ' marked'
      else right.textContent = score.marked ? 'Got ' + score.got + ' / ' + score.total : ''
    }
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

  function setModes(view) {
    modesEl.setAttribute('data-mode', mode)
    ui.setAttribute('data-view', view)
    ;[].forEach.call(modesEl.querySelectorAll('button'), function (button) {
      var on = button.getAttribute('data-act') === 'mode-' + mode
      button.classList.toggle('is-on', on)
      button.setAttribute('aria-selected', String(on))
    })
  }

  /* ---------- study all ---------- */
  function study(index, scroll, dir) {
    stopTimer()
    plan = null
    mode = 'study'
    var before = idx
    idx = Math.max(0, Math.min(stations.length - 1, index))
    if (!dir && idx !== before) dir = idx > before ? 'next' : 'prev'
    setModes('study')

    var options = ''
    stations.forEach(function (st, i) {
      var missed = saved.missed.indexOf(st._n) > -1
      options += '<option value="' + i + '"' + (i === idx ? ' selected' : '') + '>Station ' + st._n + ' \u00B7 ' + esc(st._topic) + (missed ? ' \u2022' : '') + '</option>'
    })
    swapBar(
      '<select class="zp-ospe-pick" aria-label="Choose a station">' + options + '</select>' +
      (saved.missed.length ? '<p class="zp-ospe-note">A dot marks stations you scored below 60 percent on in your last mock.</p>' : '')
    )

    setFoot(
      meta('Station ' + (idx + 1) + ' / ' + stations.length, esc(stations[idx]._topic), ''),
      '<button type="button" class="zp-btn zp-ospe-nav" data-act="prev" aria-label="Previous station" title="Previous station (\u2190)"' + (idx === 0 ? ' disabled' : '') + '>' + CHEV_L + '<span>Previous</span></button>' +
      btn('reveal', 'Show answers', 'zp-btn--main zp-ospe-main', 'Show or hide all the answers (Space)') +
      '<button type="button" class="zp-btn zp-ospe-nav" data-act="next" aria-label="Next station" title="Next station (\u2192)"' + (idx === stations.length - 1 ? ' disabled' : '') + '><span>Next</span>' + CHEV_R + '</button>',
      (idx + 1) / stations.length * 100,
      '\u2190 \u2192 station \u00B7 Space all answers \u00B7 1\u20139 one answer'
    )
    showStation(stations[idx], { reset: true, dir: dir })
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
    setModes('setup')
    hideAll()
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
      meta('Mock exam', 'Choose your settings, then start', ''),
      btn('start', 'Start mock', 'zp-btn--main zp-ospe-main') +
      (saved.missed.length ? btn('retry', 'Retry missed (' + saved.missed.length + ')') : ''),
      0
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
    var clock = foot.querySelector('.zp-ospe-clock')
    if (!clock) return
    var seconds = Math.max(0, Math.ceil(ms / 1000))
    clock.textContent = pad(Math.floor(seconds / 60)) + ':' + pad(seconds % 60)
    var low = seconds <= 10
    clock.classList.toggle('is-low', low)
    foot.classList.toggle('is-low', low)
    progEl.style.width = Math.max(0, Math.min(100, ms / (plan.minutes * 60000) * 100)) + '%'
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

  function answerPhase(dir) {
    stopTimer()
    var item = plan.items[plan.k]
    var timed = plan.minutes > 0
    var label = 'Station ' + (plan.k + 1) + ' / ' + plan.items.length
    plan.phase = 'answer'
    setModes('run')
    swapBar(
      '<div class="zp-ospe-row zp-ospe-run"><strong>Station ' + (plan.k + 1) + ' of ' + plan.items.length + '</strong>' +
      '<span class="zp-ospe-note">' + (timed ? 'Answer from the picture. The clock is in the bar below.' : 'Answer from the picture, then tap I\u2019m done.') + '</span></div>'
    )
    setFoot(
      meta(label, 'Answer', timed ? '<span class="zp-ospe-clock"></span>' : ''),
      (timed ? btn('pause', 'Pause') : '') + btn('done', 'I\u2019m done', 'zp-btn--main zp-ospe-main'),
      100
    )
    showStation(item.st, { reset: true, only: item.qs, name: 'Station ' + (plan.k + 1), dir: dir, locked: true, mock: true })
    if (timed) {
      plan.left = plan.minutes * 60000
      plan.endAt = Date.now() + plan.left
      plan.paused = false
      setClock(plan.left)
      timer = setInterval(tick, 250)
    } else {
      plan.endAt = null
    }
  }

  function togglePause() {
    if (!plan || !plan.minutes || plan.phase !== 'answer') return
    var button = foot.querySelector('[data-act="pause"]')
    if (plan.paused) {
      plan.paused = false
      plan.endAt = Date.now() + plan.left
      timer = setInterval(tick, 250)
      if (shown) shown.classList.remove('is-paused')
      if (button) button.textContent = 'Pause'
    } else {
      plan.paused = true
      plan.left = Math.max(0, plan.endAt - Date.now())
      plan.endAt = null
      stopTimer()
      if (shown) shown.classList.add('is-paused')
      if (button) button.textContent = 'Resume'
    }
  }

  function markPhase(timeUp) {
    stopTimer()
    var item = plan.items[plan.k]
    var last = plan.k === plan.items.length - 1
    plan.phase = 'mark'
    plan.paused = false
    setModes('run')
    swapBar(
      '<div class="zp-ospe-row zp-ospe-run"><strong>Station ' + (plan.k + 1) + ' of ' + plan.items.length + '</strong>' +
      '<span class="zp-ospe-note">' + (timeUp ? 'Time is up. ' : '') + 'Check each answer, then tap Got it or Missed it.</span></div>'
    )
    setFoot(
      meta('Station ' + (plan.k + 1) + ' / ' + plan.items.length, 'Mark your answers', ''),
      btn('next-station', last ? 'See results' : 'Next station', 'zp-btn--main zp-ospe-main'),
      (plan.k + 1) / plan.items.length * 100
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
    setModes('results')
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
      '<div class="zp-ospe-result"><h3>Score: <span class="zp-ospe-got">' + got + '</span> / ' + total + ' <small class="zp-ospe-pct">(' + percent + '%)</small></h3>' +
      '<p class="zp-ospe-note">By topic</p>' + rows +
      (missed.length
        ? '<p class="zp-ospe-note">Stations below 60 percent: ' + missed.join(', ') + '. They are marked in the station list.</p>'
        : '<p class="zp-ospe-note">No station below 60 percent. Well done.</p>') +
      '</div>'
    )
    setFoot(
      meta('Mock finished', 'Every question was one point', percent + '%'),
      (missed.length ? btn('retry-now', 'Retry missed', 'zp-btn--main zp-ospe-main') : '') +
      btn('newmock', 'New mock', missed.length ? '' : 'zp-btn--main zp-ospe-main') +
      btn('mode-study', 'Study all'),
      percent
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

  /* true when nothing would be lost by leaving the mock */
  function leaveMock() {
    if (mode === 'mock' && plan && plan.phase !== 'results') {
      return window.confirm('Leave the mock exam? Your progress in it will be lost.')
    }
    return true
  }

  /* ---------- taps and keys ---------- */
  function onClick(event) {
    var target = event.target.closest ? event.target.closest('[data-act]') : null
    if (!target || target.disabled) return
    var act = target.getAttribute('data-act')
    if (act === 'mode-study') {
      if (mode === 'study' || leaveMock()) study(idx, true)
    } else if (act === 'mode-mock') {
      if (!plan || plan.phase === 'results') mockSetup()
    } else if (act === 'prev') study(idx - 1, true, 'prev')
    else if (act === 'next') study(idx + 1, true, 'next')
    else if (act === 'reveal') toggleReveal()
    else if (act === 'start') startMock(null)
    else if (act === 'retry' || act === 'retry-now') startMock(retryList())
    else if (act === 'newmock') mockSetup()
    else if (act === 'pause') togglePause()
    else if (act === 'done') markPhase(false)
    else if (act === 'next-station') nextStation()
  }

  function onPageClick(event) {
    var target = event.target
    if (!target || !target.closest) return
    var mark = target.closest('[data-mark]')
    if (mark) {
      var row = mark.closest('li')
      if (row) setMark(row, mark.getAttribute('data-mark'))
      return
    }
    var question = target.closest('.zp-sq-text')
    if (question) toggleQ(question.closest('li'))
  }

  function onPageKey(event) {
    if ((event.key === 'Enter' || event.key === ' ') && event.target.classList && event.target.classList.contains('zp-sq-text')) {
      event.preventDefault()
      toggleQ(event.target.closest('li'))
    }
  }

  function onKey(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) return
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

    root.classList.add('zp-station-page')
    readSaved()
    prepare()

    ui = el('div', 'zp-ospe-ui')
    modesEl = el('div', 'zp-ospe-modes',
      '<span class="zp-ospe-thumb" aria-hidden="true"></span>' +
      '<button type="button" role="tab" data-act="mode-study">Study all</button>' +
      '<button type="button" role="tab" data-act="mode-mock">Mock exam</button>')
    modesEl.setAttribute('role', 'tablist')
    barEl = el('div', 'zp-ospe-bar')
    ui.appendChild(modesEl)
    ui.appendChild(barEl)
    wrap.parentNode.insertBefore(ui, wrap)

    /* the bar lives in the body, outside the lesson column, so text size and zoom never scale it */
    foot = el('div', 'zp-ospe-foot',
      '<div class="zp-ospe-prog" aria-hidden="true"><span></span></div>' +
      '<div class="zp-ospe-meta"></div><div class="zp-ospe-ctrls"></div><div class="zp-ospe-hint"></div>')
    foot.setAttribute('role', 'region')
    foot.setAttribute('aria-label', 'Station controls')
    document.body.appendChild(foot)
    progEl = foot.querySelector('.zp-ospe-prog span')
    metaEl = foot.querySelector('.zp-ospe-meta')
    ctrlEl = foot.querySelector('.zp-ospe-ctrls')
    hintEl = foot.querySelector('.zp-ospe-hint')

    ui.addEventListener('click', onClick)
    foot.addEventListener('click', onClick)
    ui.addEventListener('change', function (event) {
      if (event.target.matches && event.target.matches('.zp-ospe-pick')) study(number(event.target.value, 0), true)
    })
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
