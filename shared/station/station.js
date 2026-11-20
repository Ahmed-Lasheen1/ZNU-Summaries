/* STATION: makes an OSPE station page work.
   The page holds every station as plain markup (see station/station.css). This script adds a small
   control bar and shows one station at a time, in two modes:
   - Study all (the default): every station, with a "Show answers" button.
   - Mock exam: a timed run. The number of stations, questions per station and minutes per station
     start at the values written on the page (data-mock-stations, data-mock-questions, data-mock-minutes)
     and the student can change them. Stations are drawn from every topic in proportion to its size,
     never purely at random. After each station the student marks their own answers, and at the end
     there is a score by topic. Stations below 60 percent are remembered on this device.
   The small satisfying things: the mode switch has a sliding thumb, stations slide in from the side you are
   moving towards, answers grow open and the cover boxes fade away, ticks pop, the timer pulses in the last
   seconds, and the results count up and fill in (a score of 80 percent or more celebrates).
   Listen and Draw work here too. While Listen reads, the answers open when it reaches them.
   Without this script, or in the PDF view, every station is simply shown one under the other.
   Storage is wrapped so the page keeps working where storage is blocked. */
(function () {
  var root = document.documentElement
  if (root.classList.contains('zp-print-view')) return
  if (window.top === window && window.location.hash === '#print') return

  var KEY = 'zp-ospe:' + String(window.location.pathname || '')
  var PASS = 0.6
  var CELEBRATE = 0.8

  var wrap, ui, modesEl, barEl, foot
  var stations = []
  var mode = 'study'
  var idx = 0
  var shown = null
  var plan = null
  var timer = null
  var saved = { missed: [], last: null }

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

  function scrollToTop() {
    try { ui.scrollIntoView({ block: 'start', behavior: reduced() ? 'auto' : 'smooth' }) } catch (error) { ui.scrollIntoView() }
  }

  /* puts new content in the bar and plays its entrance again */
  function swapBar(html) {
    barEl.innerHTML = html
    barEl.classList.remove('is-in')
    void barEl.offsetWidth
    barEl.classList.add('is-in')
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

  /* ---------- the stations ---------- */
  function tickFor(marks) {
    var box = el('div', 'zp-sq-tick')
    if (marks === 1) {
      box.innerHTML = '<label><input type="checkbox"><span>I got it</span></label>'
    } else {
      var options = ''
      for (var i = 0; i <= marks; i++) options += '<option value="' + i + '">' + i + ' / ' + marks + '</option>'
      box.innerHTML = '<label><span>Marks I got</span><select>' + options + '</select></label>'
    }
    return box
  }

  function prepare() {
    stations.forEach(function (st, i) {
      st._n = i + 1
      st._topic = st.getAttribute('data-topic') || 'General'
      st._name = st.querySelector('.zp-st-name')
      st._marksEl = st.querySelector('.zp-st-marks')
      st._qs = [].slice.call(st.querySelectorAll('.zp-sq > li'))
      if (!st.querySelector('.zp-station-media')) st.classList.add('zp-station--nomedia')
      st._qs.forEach(function (li) {
        li._marks = Math.max(1, number(li.getAttribute('data-marks'), 1))
        var answer = li.querySelector('.zp-sq-answer')
        if (!answer) return
        /* the answer grows open: its content sits in two wrappers */
        var inner = el('div', 'zp-sq-answer-in')
        var body = el('div', 'zp-sq-answer-body')
        while (answer.firstChild) body.appendChild(answer.firstChild)
        inner.appendChild(body)
        answer.appendChild(inner)
        if (!body.querySelector('.zp-sq-tick')) body.appendChild(tickFor(li._marks))
      })
    })
  }

  function gotOf(li) {
    var box = li.querySelector('.zp-sq-tick input')
    if (box) return box.checked ? li._marks : 0
    var select = li.querySelector('.zp-sq-tick select')
    return select ? number(select.value, 0) : 0
  }

  function resetTicks(st) {
    st._qs.forEach(function (li) {
      var box = li.querySelector('.zp-sq-tick input')
      if (box) box.checked = false
      var select = li.querySelector('.zp-sq-tick select')
      if (select) select.value = '0'
    })
  }

  function visibleQs(st) {
    return st._qs.filter(function (li) { return !li.hidden })
  }

  function scoreOf(st) {
    var got = 0
    var total = 0
    visibleQs(st).forEach(function (li) {
      got += gotOf(li)
      total += li._marks
    })
    return { got: got, total: total }
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
    st.classList.remove('zp-st-in-next', 'zp-st-in-prev')
    if (options.dir && !reduced()) {
      void st.offsetWidth
      st.classList.add('zp-st-in-' + options.dir)
    }
    st.classList.toggle('is-revealed', !!options.revealed)
    if (options.reset) resetTicks(st)
    st._qs.forEach(function (li) { li.hidden = !!(options.only && options.only.indexOf(li) < 0) })
    var total = visibleQs(st).reduce(function (sum, li) { return sum + li._marks }, 0)
    if (st._name) st._name.textContent = options.name || ('Station ' + st._n)
    if (st._marksEl) st._marksEl.textContent = '(' + total + (total === 1 ? ' mark' : ' marks') + ')'
  }

  function updateScore() {
    var node = barEl.querySelector('.zp-ospe-score')
    if (!node) return
    if (!shown || !shown.classList.contains('is-revealed')) {
      node.textContent = ''
      return
    }
    var score = scoreOf(shown)
    node.textContent = 'Marks: ' + score.got + ' / ' + score.total
  }

  function setModes() {
    modesEl.setAttribute('data-mode', mode)
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
    setModes()

    var options = ''
    stations.forEach(function (st, i) {
      var missed = saved.missed.indexOf(st._n) > -1
      options += '<option value="' + i + '"' + (i === idx ? ' selected' : '') + '>Station ' + st._n + ' \u00B7 ' + st._topic + (missed ? ' \u2022' : '') + '</option>'
    })
    swapBar(
      '<div class="zp-ospe-row"><select class="zp-ospe-pick" aria-label="Choose a station">' + options + '</select></div>' +
      '<div class="zp-ospe-meter"><span class="zp-ospe-meter-label">Station ' + (idx + 1) + ' of ' + stations.length + '</span>' +
      '<div class="zp-ospe-track" aria-hidden="true"><span style="width:' + ((idx + 1) / stations.length * 100) + '%"></span></div></div>' +
      '<div class="zp-ospe-row"><span class="zp-ospe-score"></span></div>' +
      (saved.missed.length ? '<p class="zp-ospe-note">A dot marks stations you scored below 60 percent on in your last mock.</p>' : '')
    )
    foot.innerHTML =
      '<button type="button" class="zp-btn" data-act="prev"' + (idx === 0 ? ' disabled' : '') + '>Previous</button>' +
      '<button type="button" class="zp-btn zp-btn--main" data-act="reveal">Show answers</button>' +
      '<button type="button" class="zp-btn" data-act="next"' + (idx === stations.length - 1 ? ' disabled' : '') + '>Next</button>'
    showStation(stations[idx], { revealed: false, reset: true, dir: dir })
    updateScore()
    if (scroll) scrollToTop()
  }

  function setReveal(st, revealed) {
    st.classList.toggle('is-revealed', revealed)
    var button = foot.querySelector('[data-act="reveal"]')
    if (button) button.textContent = revealed ? 'Hide answers' : 'Show answers'
    updateScore()
  }

  function toggleReveal() {
    if (!shown) return
    setReveal(shown, !shown.classList.contains('is-revealed'))
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
    setModes()
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
      '<p class="zp-ospe-note">Stations are drawn from all ' + topics.length + (topics.length === 1 ? ' topic' : ' topics') + ', in proportion to their size.</p>'
    )
    foot.innerHTML =
      '<button type="button" class="zp-btn zp-btn--main" data-act="start">Start mock</button>' +
      (saved.missed.length ? '<button type="button" class="zp-btn" data-act="retry">Retry my missed stations (' + saved.missed.length + ')</button>' : '')
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
    plan = {
      items: chosen.map(function (st) { return { st: st, qs: pickQuestions(st, q) } }),
      minutes: m,
      k: 0,
      results: [],
      endAt: null,
      left: 0,
      paused: false
    }
    answerPhase('next')
    scrollToTop()
  }

  /* ---------- mock: running it ---------- */
  function stopTimer() {
    if (timer) clearInterval(timer)
    timer = null
  }

  function setClock(ms) {
    var clock = barEl.querySelector('.zp-ospe-clock')
    var fill = barEl.querySelector('.zp-ospe-track span')
    if (!clock) return
    var seconds = Math.max(0, Math.ceil(ms / 1000))
    clock.textContent = pad(Math.floor(seconds / 60)) + ':' + pad(seconds % 60)
    var low = seconds <= 10
    clock.classList.toggle('is-low', low)
    var run = barEl.querySelector('.zp-ospe-run')
    if (run) run.classList.toggle('is-low', low)
    if (fill) fill.style.width = Math.max(0, Math.min(100, ms / (plan.minutes * 60000) * 100)) + '%'
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
    swapBar(
      '<div class="zp-ospe-row zp-ospe-run"><strong>Station ' + (plan.k + 1) + ' of ' + plan.items.length + '</strong>' +
      (timed ? '<span class="zp-ospe-clock"></span><button type="button" class="zp-btn zp-btn--small" data-act="pause">Pause</button>' : '<span class="zp-ospe-note">No timer</span>') +
      '</div>' +
      (timed ? '<div class="zp-ospe-track zp-ospe-timer" aria-hidden="true"><span></span></div>' : '')
    )
    foot.innerHTML = '<button type="button" class="zp-btn zp-btn--main" data-act="done">I\u2019m done</button>'
    showStation(item.st, { revealed: false, reset: true, only: item.qs, name: 'Station ' + (plan.k + 1), dir: dir })
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
    if (!plan || !plan.minutes) return
    var button = barEl.querySelector('[data-act="pause"]')
    if (plan.paused) {
      plan.paused = false
      plan.endAt = Date.now() + plan.left
      timer = setInterval(tick, 250)
      if (button) button.textContent = 'Pause'
    } else {
      plan.paused = true
      plan.left = Math.max(0, plan.endAt - Date.now())
      plan.endAt = null
      stopTimer()
      if (button) button.textContent = 'Resume'
    }
  }

  function markPhase(timeUp) {
    stopTimer()
    var item = plan.items[plan.k]
    var last = plan.k === plan.items.length - 1
    swapBar(
      '<div class="zp-ospe-row"><strong>Station ' + (plan.k + 1) + ' of ' + plan.items.length + ' \u00B7 mark your answers</strong>' +
      '<span class="zp-ospe-score"></span></div>' +
      (timeUp ? '<p class="zp-ospe-note">Time is up.</p>' : '')
    )
    foot.innerHTML = '<button type="button" class="zp-btn zp-btn--main" data-act="next-station">' + (last ? 'See results' : 'Next station') + '</button>'
    setReveal(item.st, true)
  }

  function nextStation() {
    var item = plan.items[plan.k]
    var score = scoreOf(item.st)
    plan.results.push({ n: item.st._n, topic: item.st._topic, got: score.got, total: score.total })
    if (plan.k + 1 < plan.items.length) {
      plan.k += 1
      answerPhase('next')
      scrollToTop()
    } else {
      results()
    }
  }

  /* ---------- mock: the results ---------- */
  function results() {
    stopTimer()
    hideAll()
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
      return '<div class="zp-ospe-topic' + (p < PASS * 100 ? ' is-weak' : '') + '"><span>' + topic + '</span>' +
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
    foot.innerHTML =
      (missed.length ? '<button type="button" class="zp-btn zp-btn--main" data-act="retry-now">Retry missed stations</button>' : '') +
      '<button type="button" class="zp-btn' + (missed.length ? '' : ' zp-btn--main') + '" data-act="newmock">New mock</button>' +
      '<button type="button" class="zp-btn" data-act="mode-study">Study all</button>'

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
    scrollToTop()
  }

  function retryList() {
    return stations.filter(function (st) { return saved.missed.indexOf(st._n) > -1 })
  }

  /* ---------- clicks ---------- */
  function onClick(event) {
    var target = event.target.closest ? event.target.closest('[data-act]') : null
    if (!target || target.disabled) return
    var act = target.getAttribute('data-act')
    if (act === 'mode-study') study(idx, true)
    else if (act === 'mode-mock') mockSetup()
    else if (act === 'prev') study(idx - 1, true, 'prev')
    else if (act === 'next') study(idx + 1, true, 'next')
    else if (act === 'reveal') toggleReveal()
    else if (act === 'start') startMock(null)
    else if (act === 'retry') startMock(retryList())
    else if (act === 'retry-now') startMock(retryList())
    else if (act === 'newmock') mockSetup()
    else if (act === 'pause') togglePause()
    else if (act === 'done') markPhase(false)
    else if (act === 'next-station') nextStation()
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
    foot = el('div', 'zp-ospe-foot')
    wrap.parentNode.insertBefore(ui, wrap)
    wrap.parentNode.insertBefore(foot, wrap.nextSibling)

    ui.addEventListener('click', onClick)
    foot.addEventListener('click', onClick)
    ui.addEventListener('change', function (event) {
      if (event.target.matches && event.target.matches('.zp-ospe-pick')) study(number(event.target.value, 0), true)
    })
    wrap.addEventListener('change', function (event) {
      var target = event.target
      if (target && target.matches && target.matches('.zp-sq-tick input')) {
        var label = target.closest('label')
        if (label) {
          label.classList.remove('is-pop')
          void label.offsetWidth
          label.classList.add('is-pop')
        }
      }
      updateScore()
    })

    /* while Listen reads an answer, the answers open by themselves */
    if (window.MutationObserver) {
      new window.MutationObserver(function (changes) {
        changes.forEach(function (change) {
          var target = change.target
          if (!target.classList || !target.classList.contains('zp-reading')) return
          var inAnswer = target.closest ? target.closest('.zp-sq-answer') : null
          var station = target.closest ? target.closest('.zp-station') : null
          if (inAnswer && station && !station.classList.contains('is-revealed')) setReveal(station, true)
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
