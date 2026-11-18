/* QA: makes the written-questions page work (see qa/qa.css for the markup).
   - Each question is a card that opens smoothly to show its answer.
   - Under each answer the student rates themselves: Knew it, Not sure or Didn't know (remembered on this device).
   - A search and filter bar at the top: search by keyword, show only the questions in one rating, expand or collapse all.
     It slides away while scrolling down and returns when scrolling up.
   - Each lesson shows how many of its questions are rated, and finishing every question celebrates.
   - While the Listen player reads an answer, its card opens by itself.
   Without this script, or in the PDF view, every answer is simply shown.
   Ratings are stored by a short fingerprint of the question text, so reordering the page does not lose them.
   Storage is wrapped so the page keeps working where storage is blocked. */
(function () {
  var root = document.documentElement
  if (window.top === window && window.location.hash === '#print') return
  if (root.classList.contains('zp-print-view')) return

  var KEY = 'zp-qa:' + String(window.location.pathname || '')
  var cards = []
  var sections = []
  var ratings = {}
  var filter = 'all'
  var term = ''
  var celebrated = false
  var bar = null
  var parts = {}
  var searchTimer = null
  var lastY = 0
  var waiting = false

  /* ---------- storage ---------- */
  function load() {
    try {
      var data = JSON.parse(window.localStorage.getItem(KEY) || '{}')
      return data && typeof data === 'object' ? data : {}
    } catch (error) {
      return {}
    }
  }

  function save() {
    try { window.localStorage.setItem(KEY, JSON.stringify(ratings)) } catch (error) { /* blocked: lasts for this visit */ }
  }

  function fingerprint(text) {
    var h = 5381
    for (var i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0
    return (h >>> 0).toString(36)
  }

  function normal(text) {
    return String(text || '').replace(/\s+/g, ' ').trim()
  }

  /* ---------- opening and closing a card ---------- */
  function setOpen(card, open) {
    card.classList.toggle('is-open', open)
    card._q.setAttribute('aria-expanded', String(open))
  }

  function toggle(card) {
    setOpen(card, !card.classList.contains('is-open'))
  }

  /* ---------- ratings ---------- */
  function paint(card) {
    card.classList.remove('r-k', 'r-s', 'r-d')
    var rating = ratings[card._id]
    if (rating) card.classList.add('r-' + rating)
    ;[].forEach.call(card._rate.querySelectorAll('button'), function (button) {
      var on = button.getAttribute('data-r') === rating
      button.classList.toggle('is-on', on)
      button.setAttribute('aria-pressed', String(on))
    })
  }

  function rate(card, value) {
    if (ratings[card._id] === value) delete ratings[card._id]
    else ratings[card._id] = value
    save()
    paint(card)
    counts()
  }

  function counts() {
    var n = { k: 0, s: 0, d: 0 }
    cards.forEach(function (card) {
      var rating = ratings[card._id]
      if (rating) n[rating] += 1
    })
    var total = cards.length
    var rated = n.k + n.s + n.d
    var values = { all: total, 'new': total - rated, s: n.s, d: n.d, k: n.k }
    ;[].forEach.call(bar.querySelectorAll('.zp-qa-chip'), function (chip) {
      chip.querySelector('b').textContent = String(values[chip.getAttribute('data-filter')])
    })
    parts.meter.style.width = (total ? rated / total * 100 : 0) + '%'

    sections.forEach(function (section) {
      var done = section.cards.filter(function (card) { return ratings[card._id] }).length
      section.count.textContent = done + ' of ' + section.cards.length + ' rated'
    })

    if (total && rated === total && !celebrated) {
      celebrated = true
      if (window.zpCelebrate) window.zpCelebrate('All ' + total + ' questions rated. Great work!')
    }
  }

  /* ---------- search and filters ---------- */
  function matches(card) {
    var rating = ratings[card._id]
    if (filter === 'new' && rating) return false
    if (filter !== 'all' && filter !== 'new' && rating !== filter) return false
    if (term && card._text.indexOf(term) < 0) return false
    return true
  }

  function applyFilter() {
    var shown = 0
    cards.forEach(function (card) {
      var show = matches(card)
      card.classList.toggle('is-filtered', !show)
      if (show) shown += 1
    })
    sections.forEach(function (section) {
      var any = section.cards.some(function (card) { return !card.classList.contains('is-filtered') })
      section.el.classList.toggle('zp-qa-empty', !any)
    })
    parts.none.hidden = shown > 0
  }

  function setFilter(next) {
    filter = next
    ;[].forEach.call(bar.querySelectorAll('.zp-qa-chip'), function (chip) {
      var on = chip.getAttribute('data-filter') === filter
      chip.classList.toggle('is-on', on)
      chip.setAttribute('aria-pressed', String(on))
    })
    applyFilter()
  }

  function openAll(open) {
    cards.forEach(function (card) {
      if (!card.classList.contains('is-filtered')) setOpen(card, open)
    })
  }

  /* ---------- the bar slides away when scrolling down and returns when scrolling up ---------- */
  function onScroll() {
    if (waiting) return
    waiting = true
    window.requestAnimationFrame(function () {
      waiting = false
      var y = window.pageYOffset || 0
      var delta = y - lastY
      if (y < 120 || delta < -6 || document.activeElement === parts.search) bar.classList.remove('is-hidden')
      else if (delta > 6) bar.classList.add('is-hidden')
      lastY = y
    })
  }

  /* ---------- building the bar and the cards ---------- */
  function buildBar(first) {
    bar = document.createElement('div')
    bar.className = 'zp-qa-bar'
    bar.setAttribute('role', 'search')
    bar.innerHTML =
      '<div class="zp-qa-bar-top">' +
        '<input type="search" class="zp-qa-search" placeholder="Search questions and answers" aria-label="Search questions and answers" autocomplete="off">' +
        '<button type="button" class="zp-qa-tool" data-qa="expand">Open all</button>' +
        '<button type="button" class="zp-qa-tool" data-qa="collapse">Close all</button>' +
      '</div>' +
      '<div class="zp-qa-chips" role="group" aria-label="Filter by rating">' +
        '<button type="button" class="zp-qa-chip" data-filter="all">All <b>0</b></button>' +
        '<button type="button" class="zp-qa-chip" data-filter="new">Not rated <b>0</b></button>' +
        '<button type="button" class="zp-qa-chip" data-filter="s">Not sure <b>0</b></button>' +
        '<button type="button" class="zp-qa-chip" data-filter="d">Didn\u2019t know <b>0</b></button>' +
        '<button type="button" class="zp-qa-chip" data-filter="k">Knew it <b>0</b></button>' +
      '</div>' +
      '<div class="zp-qa-meter" aria-hidden="true"><span></span></div>'
    first.parentNode.insertBefore(bar, first)

    var none = document.createElement('div')
    none.className = 'zp-qa-none'
    none.hidden = true
    none.textContent = 'No question matches. Try another word or filter.'
    first.parentNode.insertBefore(none, first)

    parts = {
      search: bar.querySelector('.zp-qa-search'),
      meter: bar.querySelector('.zp-qa-meter span'),
      none: none
    }

    parts.search.addEventListener('input', function () {
      clearTimeout(searchTimer)
      searchTimer = setTimeout(function () {
        term = normal(parts.search.value).toLowerCase()
        applyFilter()
      }, 120)
    })
    parts.search.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        parts.search.value = ''
        term = ''
        applyFilter()
      }
    })

    bar.addEventListener('click', function (event) {
      var chip = event.target.closest ? event.target.closest('.zp-qa-chip') : null
      if (chip) {
        setFilter(chip.getAttribute('data-filter'))
        return
      }
      var tool = event.target.closest ? event.target.closest('[data-qa]') : null
      if (!tool) return
      openAll(tool.getAttribute('data-qa') === 'expand')
    })
  }

  function buildCard(card, index, used) {
    var q = card.querySelector('.zp-qa-q')
    var panel = card.querySelector('.zp-qa-panel')
    var body = card.querySelector('.zp-qa-body')
    if (!q || !panel || !body) return false

    var base = fingerprint(normal(q.textContent).toLowerCase())
    var id = base
    var copy = 1
    while (used[id]) {
      copy += 1
      id = base + '-' + copy
    }
    used[id] = true

    card._id = id
    card._q = q
    card._text = normal(card.textContent).toLowerCase()

    panel.id = panel.id || 'zp-qa-panel-' + index
    q.setAttribute('role', 'button')
    q.setAttribute('tabindex', '0')
    q.setAttribute('aria-expanded', 'false')
    q.setAttribute('aria-controls', panel.id)
    q.addEventListener('click', function () { toggle(card) })
    q.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        toggle(card)
      }
    })

    var row = document.createElement('div')
    row.className = 'zp-qa-rate'
    row.innerHTML =
      '<span>How did you do?</span>' +
      '<button type="button" data-r="k" aria-pressed="false">Knew it</button>' +
      '<button type="button" data-r="s" aria-pressed="false">Not sure</button>' +
      '<button type="button" data-r="d" aria-pressed="false">Didn\u2019t know</button>'
    row.addEventListener('click', function (event) {
      var button = event.target.closest ? event.target.closest('button[data-r]') : null
      if (button) rate(card, button.getAttribute('data-r'))
    })
    body.appendChild(row)
    card._rate = row
    return true
  }

  function init() {
    var found = [].slice.call(document.querySelectorAll('main .zp-qa'))
    if (!found.length) return

    ratings = load()
    var used = {}
    found.forEach(function (card, index) {
      if (buildCard(card, index, used)) cards.push(card)
    })
    if (!cards.length) return

    root.classList.add('zp-qa-on')

    /* the lessons that hold questions, each with its own count */
    ;[].forEach.call(document.querySelectorAll('main .zp-section'), function (el) {
      var own = cards.filter(function (card) { return el.contains(card) })
      if (!own.length) return
      var count = document.createElement('div')
      count.className = 'zp-qa-count'
      var anchor = el.querySelector('.zp-source') || el.querySelector('h2')
      anchor.parentNode.insertBefore(count, anchor.nextSibling)
      sections.push({ el: el, cards: own, count: count })
    })

    var first = document.querySelector('main .zp-section') || cards[0]
    buildBar(first)
    cards.forEach(paint)
    setFilter('all')
    counts()

    window.addEventListener('scroll', onScroll, { passive: true })

    /* when the Listen player reaches an answer, open its card */
    var main = document.querySelector('main')
    if (main && window.MutationObserver) {
      new window.MutationObserver(function (changes) {
        changes.forEach(function (change) {
          var target = change.target
          if (!target.classList || !target.classList.contains('zp-reading')) return
          var inAnswer = target.closest ? target.closest('.zp-qa-panel') : null
          var card = target.closest ? target.closest('.zp-qa') : null
          if (inAnswer && card && !card.classList.contains('is-open')) setOpen(card, true)
        })
      }).observe(main, { attributes: true, attributeFilter: ['class'], subtree: true })
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
