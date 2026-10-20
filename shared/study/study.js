/* STUDY: adds a "Mark this section as done" button to every section and a small
   "you are here" pill showing the current section and how many are done.
   Only used when a lesson has 3 or more sections. Ticks are remembered where the
   browser allows it (not in offline copies). Finishing every section celebrates. */
(function () {
  var MIN_SECTIONS = 3
  var root = document.documentElement
  if (root.classList.contains('zp-print-view')) return

  var key = 'zp-done:' + String(window.location.pathname || '')

  function load() {
    try { return JSON.parse(window.localStorage.getItem(key) || '[]') } catch (error) { return [] }
  }

  function save(list) {
    try { window.localStorage.setItem(key, JSON.stringify(list)) } catch (error) { /* blocked: lasts for this visit */ }
  }

  function init() {
    var sections = [].slice.call(document.querySelectorAll('main .zp-section'))
    if (sections.length < MIN_SECTIONS) return

    var pill = document.createElement('div')
    pill.className = 'zp-here'
    pill.setAttribute('aria-hidden', 'true')
    pill.innerHTML = '<span class="zp-here-num"></span><span class="zp-here-title"></span><span class="zp-here-count"></span>'
    document.body.appendChild(pill)
    var pillNum = pill.querySelector('.zp-here-num')
    var pillTitle = pill.querySelector('.zp-here-title')
    var pillCount = pill.querySelector('.zp-here-count')

    var saved = load()
    var celebrated = false
    var titles = []
    var buttons = []

    function doneCount() {
      return sections.filter(function (section) { return section.classList.contains('is-done') }).length
    }

    function persist() {
      var list = []
      sections.forEach(function (section, index) { if (section.classList.contains('is-done')) list.push(index) })
      save(list)
    }

    function setDone(index, done) {
      sections[index].classList.toggle('is-done', done)
      buttons[index].setAttribute('aria-pressed', String(done))
      buttons[index].querySelector('.zp-done-text').textContent = done ? 'Section done' : 'Mark this section as done'
    }

    sections.forEach(function (section, index) {
      var heading = section.querySelector('h2')
      titles[index] = heading ? heading.textContent.replace(/\s+/g, ' ').trim() : 'Section ' + (index + 1)

      var button = document.createElement('button')
      button.type = 'button'
      button.className = 'zp-done-btn'
      button.setAttribute('aria-pressed', 'false')
      button.innerHTML = '<span class="zp-done-box" aria-hidden="true"></span><span class="zp-done-text">Mark this section as done</span>'
      section.appendChild(button)
      buttons[index] = button

      button.addEventListener('click', function () {
        setDone(index, !section.classList.contains('is-done'))
        persist()
        update()
        if (!celebrated && doneCount() === sections.length && window.zpCelebrate) {
          celebrated = true
          window.zpCelebrate('All ' + sections.length + ' sections done. Great work!')
        }
      })

      if (saved.indexOf(index) > -1) setDone(index, true)
    })

    var waiting = false

    function update() {
      waiting = false
      var line = window.innerHeight * 0.4
      var current = -1
      for (var i = 0; i < sections.length; i++) {
        if (sections[i].getBoundingClientRect().top <= line) current = i
      }

      /* hide the pill above the first section and once the key points are reached */
      var end = document.querySelector('.zp-keypoints')
      var pastEnd = end && end.getBoundingClientRect().top <= line

      if (current < 0 || pastEnd) {
        pill.classList.remove('is-shown')
        return
      }

      var number = String(current + 1)
      pillNum.textContent = number.length < 2 ? '0' + number : number
      pillTitle.textContent = titles[current]
      pillCount.textContent = doneCount() + '/' + sections.length + ' done'
      var color = window.getComputedStyle(sections[current]).getPropertyValue('--sec').trim()
      pill.style.setProperty('--here', color || 'var(--zp-accent)')
      pill.classList.add('is-shown')
    }

    function onScroll() {
      if (waiting) return
      waiting = true
      window.requestAnimationFrame(update)
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    update()
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
