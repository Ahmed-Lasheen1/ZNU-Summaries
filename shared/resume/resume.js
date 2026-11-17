/* RESUME: remembers where the student stopped reading and, the next time the lesson opens,
   scrolls back to that place and shows a small "Start over" note.
   The place is stored as a block of the lesson plus how far into it the student was, so it
   still works after a change of text size or screen width. Storage is wrapped so a lesson
   keeps working where storage is blocked (the place is then just not remembered). */
(function () {
  var root = document.documentElement
  if (window.top === window && window.location.hash === '#print') return
  if (root.classList.contains('zp-print-view')) return

  var KEY = 'zp-resume:' + String(window.location.pathname || '')
  var TOP_LINE = 80
  var timer = null
  var note = null
  var noteTimer = null

  function read() {
    try { return JSON.parse(window.localStorage.getItem(KEY) || 'null') } catch (error) { return null }
  }

  function write(value) {
    try {
      if (value) window.localStorage.setItem(KEY, JSON.stringify(value))
      else window.localStorage.removeItem(KEY)
    } catch (error) { /* blocked: the place is not remembered */ }
  }

  /* the parts of the lesson a place can be tied to: the children of each section, and the other top-level parts */
  function blocks() {
    var main = document.querySelector('main')
    var list = []
    if (!main) return list
    ;[].forEach.call(main.children, function (child) {
      if (child.classList.contains('zp-section')) {
        ;[].forEach.call(child.children, function (part) { list.push(part) })
      } else {
        list.push(child)
      }
    })
    return list
  }

  function signature(el) {
    return el.tagName + ':' + String(el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 24)
  }

  function save() {
    var y = window.pageYOffset || root.scrollTop || 0
    if (y < 200) {
      write(null)
      return
    }
    var list = blocks()
    for (var i = 0; i < list.length; i++) {
      var rect = list[i].getBoundingClientRect()
      if (rect.height > 0 && rect.top <= TOP_LINE && rect.bottom > TOP_LINE) {
        var fraction = Math.max(0, Math.min(1, (TOP_LINE - rect.top) / rect.height))
        write({ i: i, g: signature(list[i]), f: Math.round(fraction * 1000) / 1000 })
        return
      }
    }
  }

  function later() {
    clearTimeout(timer)
    timer = setTimeout(save, 600)
  }

  function closeNote() {
    clearTimeout(noteTimer)
    if (note && note.parentNode) note.parentNode.removeChild(note)
    note = null
  }

  function showNote() {
    closeNote()
    note = document.createElement('div')
    note.className = 'zp-resume'
    note.setAttribute('role', 'status')
    var text = document.createElement('span')
    text.textContent = 'Continued where you left off'
    var button = document.createElement('button')
    button.type = 'button'
    button.textContent = 'Start over'
    button.addEventListener('click', function () {
      write(null)
      closeNote()
      try { window.scrollTo({ top: 0, behavior: 'smooth' }) } catch (error) { window.scrollTo(0, 0) }
    })
    note.appendChild(text)
    note.appendChild(button)
    document.body.appendChild(note)
    noteTimer = setTimeout(closeNote, 7000)
  }

  function restore() {
    var saved = read()
    if (!saved || typeof saved.i !== 'number') return
    if ((window.pageYOffset || 0) > 60) return
    if (window.location.hash && window.location.hash !== '#') return

    var list = blocks()
    var target = list[saved.i]
    if (!target || signature(target) !== saved.g) {
      target = null
      for (var i = 0; i < list.length; i++) {
        if (signature(list[i]) === saved.g) {
          target = list[i]
          break
        }
      }
    }
    if (!target) return

    var rect = target.getBoundingClientRect()
    if (!rect.height) return
    var top = rect.top + (window.pageYOffset || 0) + saved.f * rect.height - TOP_LINE
    if (top < 150) return
    window.scrollTo(0, top)
    showNote()
  }

  function init() {
    window.addEventListener('scroll', later, { passive: true })
    window.addEventListener('pagehide', save)
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') save()
    })

    var go = function () { setTimeout(restore, 350) }
    if (document.readyState === 'complete') go()
    else window.addEventListener('load', go)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
