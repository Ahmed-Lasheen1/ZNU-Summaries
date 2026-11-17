/* DRAW: pen, highlighter and eraser for the student's own notes.
   The Draw button beside the tools button (tools/tools.js) opens the small tool bar.

   How it stays in place: every stroke is tied to the part of the lesson it was drawn on
   (a "block") and stored as fractions of that block. So the ink follows the text when the
   screen width, the text size or an opened quick check changes the layout.
   Notes are saved on this device only (localStorage) and never appear in the PDF.
   Storage is wrapped so the tool keeps working where storage is blocked (notes then last for this visit).
   Pen and highlighter are drawn as vector paths in one layer over the page, so long lessons cost no memory.
   Hand tool: switches drawing off so the page scrolls normally. */
(function () {
  var root = document.documentElement
  if (window.top === window && window.location.hash === '#print') return
  if (root.classList.contains('zp-print-view')) return

  var supported = !!window.PointerEvent
  var KEY = 'zp-ink:' + String(window.location.pathname || '')
  var NS = 'http://www.w3.org/2000/svg'
  var PEN_W = 2.6
  var HI_W = 16
  var ERASE_R = 14
  var MIN_STEP = 1.6
  var MAX_BYTES = 3500000

  var PEN = [['ink', 'var(--zp-text)', 'Black'], ['red', '#e11d48', 'Red'], ['blue', '#2563eb', 'Blue'], ['green', '#059669', 'Green']]
  var HI = [['y', '#facc15', 'Yellow'], ['g', '#4ade80', 'Green'], ['p', '#f472b6', 'Pink'], ['b', '#60a5fa', 'Blue']]

  function svg(inner) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true">' + inner + '</svg>'
  }

  var ICON = {
    pen: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>'),
    hi: svg('<path d="M9 11l-5 5v4h4l5-5"/><path d="M12 8l4-4 4 4-4 4z"/>'),
    erase: svg('<path d="M7 21h10"/><path d="M5.5 13.5L13 6a2 2 0 0 1 2.8 0l3 3a2 2 0 0 1 0 2.8L11.5 19H8z"/>'),
    hand: svg('<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12"/><path d="M11 5.5V4a1.5 1.5 0 0 1 3 0v8"/><path d="M14 5.5a1.5 1.5 0 0 1 3 0V12"/><path d="M17 8.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1.5a6 6 0 0 1-4.8-2.4L4.5 14.5a1.5 1.5 0 0 1 2.4-1.8L8 14"/>'),
    undo: svg('<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/>'),
    redo: svg('<path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 15-6.7L21 13"/>'),
    clear: svg('<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>'),
    done: svg('<polyline points="20 6 9 17 4 12"/>')
  }

  var strokes = []
  var undoStack = []
  var redoStack = []
  var tool = 'pen'
  var penColor = 'ink'
  var hiColor = 'y'
  var penSeen = false
  var opened = false
  var layer = null
  var surface = null
  var bar = null
  var parts = {}
  var frame = 0
  var saveTimer = null
  var msgTimer = null
  var confirmTimer = null
  var pointer = null
  var cur = null
  var live = null
  var erasing = null
  var serial = 0

  /* ---------- storage ---------- */
  function load() {
    try {
      var data = JSON.parse(window.localStorage.getItem(KEY) || 'null')
      return data && data.v === 1 && Array.isArray(data.s) ? data.s : []
    } catch (error) {
      return []
    }
  }

  function clean(s) {
    return { i: s.i, t: s.t, c: s.c, a: s.a, g: s.g, p: s.p }
  }

  function message(text) {
    if (!parts.msg) return
    clearTimeout(msgTimer)
    parts.msg.textContent = text || ''
    if (text) msgTimer = setTimeout(function () { parts.msg.textContent = '' }, 4500)
  }

  function save() {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(function () {
      var data = JSON.stringify({ v: 1, s: strokes.map(clean) })
      if (data.length > MAX_BYTES) {
        message('Your notes are too large to save. Clear some ink.')
        return
      }
      try {
        if (strokes.length) window.localStorage.setItem(KEY, data)
        else window.localStorage.removeItem(KEY)
      } catch (error) {
        message('Notes could not be saved on this device.')
      }
    }, 400)
  }

  /* ---------- blocks: the parts of the lesson that strokes are tied to ---------- */
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

  function colorOf(key) {
    var all = PEN.concat(HI)
    for (var i = 0; i < all.length; i++) if (all[i][0] === key) return all[i][1]
    return 'var(--zp-text)'
  }

  /* ---------- drawing the layer ---------- */
  function ensureLayer() {
    if (layer) return
    layer = document.createElementNS(NS, 'svg')
    layer.setAttribute('class', 'zp-ink')
    layer.setAttribute('aria-hidden', 'true')
    document.body.appendChild(layer)
  }

  function pathData(pts) {
    var d = 'M' + pts[0][0].toFixed(1) + ' ' + pts[0][1].toFixed(1)
    if (pts.length === 1) return d + ' l0.01 0'
    for (var i = 1; i < pts.length - 1; i++) {
      var mx = (pts[i][0] + pts[i + 1][0]) / 2
      var my = (pts[i][1] + pts[i + 1][1]) / 2
      d += ' Q' + pts[i][0].toFixed(1) + ' ' + pts[i][1].toFixed(1) + ' ' + mx.toFixed(1) + ' ' + my.toFixed(1)
    }
    var last = pts[pts.length - 1]
    return d + ' L' + last[0].toFixed(1) + ' ' + last[1].toFixed(1)
  }

  function makePath(type, color, pts) {
    var path = document.createElementNS(NS, 'path')
    path.setAttribute('class', type === 'h' ? 'zp-ink-h' : 'zp-ink-p')
    path.setAttribute('d', pathData(pts))
    path.style.stroke = colorOf(color)
    path.style.strokeWidth = String(type === 'h' ? HI_W : PEN_W)
    return path
  }

  function resolveAll(list) {
    var sigs = list.map(signature)
    strokes.forEach(function (s) {
      var el = null
      if (list[s.a] && sigs[s.a] === s.g) {
        el = list[s.a]
      } else {
        var found = sigs.indexOf(s.g)
        if (found > -1) el = list[found]
      }
      s._el = el
    })
  }

  function render() {
    frame = 0
    if (!strokes.length && !live) {
      if (layer) while (layer.firstChild) layer.removeChild(layer.firstChild)
      return
    }
    ensureLayer()
    var sx = window.pageXOffset || 0
    var sy = window.pageYOffset || 0
    var width = root.clientWidth
    var height = Math.ceil(document.body.getBoundingClientRect().bottom + sy)
    layer.setAttribute('width', String(width))
    layer.setAttribute('height', String(height))
    layer.style.width = width + 'px'
    layer.style.height = height + 'px'
    while (layer.firstChild) layer.removeChild(layer.firstChild)

    resolveAll(blocks())
    strokes.forEach(function (s) {
      s._d = null
      if (!s._el) return
      var r = s._el.getBoundingClientRect()
      if (!r.width || !r.height) return
      var pts = s.p.map(function (q) {
        return [r.left + sx + q[0] * r.width, r.top + sy + q[1] * r.height]
      })
      s._d = pts
      layer.appendChild(makePath(s.t, s.c, pts))
    })
    if (live) layer.appendChild(live.path)
  }

  function schedule() {
    if (frame) return
    frame = window.requestAnimationFrame(render)
  }

  /* ---------- erasing ---------- */
  function segmentDistance(px, py, ax, ay, bx, by) {
    var dx = bx - ax
    var dy = by - ay
    var len = dx * dx + dy * dy
    var t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0
    var cx = ax + t * dx
    var cy = ay + t * dy
    return Math.sqrt((px - cx) * (px - cx) + (py - cy) * (py - cy))
  }

  function hits(pts, x, y, radius) {
    if (pts.length === 1) return segmentDistance(x, y, pts[0][0], pts[0][1], pts[0][0], pts[0][1]) <= radius
    for (var i = 0; i < pts.length - 1; i++) {
      if (segmentDistance(x, y, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]) <= radius) return true
    }
    return false
  }

  function eraseAt(x, y) {
    var dx = x + (window.pageXOffset || 0)
    var dy = y + (window.pageYOffset || 0)
    var removed = false
    for (var i = strokes.length - 1; i >= 0; i--) {
      var s = strokes[i]
      if (!s._d) continue
      if (hits(s._d, dx, dy, ERASE_R + (s.t === 'h' ? HI_W : PEN_W) / 2)) {
        strokes.splice(i, 1)
        erasing.push(s)
        removed = true
      }
    }
    if (removed) render()
  }

  /* ---------- pointer handling ---------- */
  function anchorAt(x, y, list) {
    var best = -1
    var bestDistance = 1e9
    var bestArea = 1e12
    list.forEach(function (el, i) {
      var r = el.getBoundingClientRect()
      if (!r.width || !r.height) return
      var d = y < r.top ? r.top - y : (y > r.bottom ? y - r.bottom : 0)
      var area = r.width * r.height
      if (d < bestDistance || (d === bestDistance && area < bestArea)) {
        best = i
        bestDistance = d
        bestArea = area
      }
    })
    return best
  }

  function liveUpdate() {
    if (!cur || !live) return
    var pts = cur.pts.map(function (q) { return [q[0] + cur.sx, q[1] + cur.sy] })
    live.path.setAttribute('d', pathData(pts))
  }

  function addPoint(x, y) {
    var last = cur.pts[cur.pts.length - 1]
    if (Math.abs(x - last[0]) + Math.abs(y - last[1]) < MIN_STEP) return
    cur.pts.push([x, y])
  }

  function onDown(event) {
    if (event.pointerType === 'pen') penSeen = true
    else if (event.pointerType === 'touch' && penSeen) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    if (pointer !== null) return
    event.preventDefault()
    try { surface.setPointerCapture(event.pointerId) } catch (error) { /* ignore */ }
    pointer = event.pointerId

    if (tool === 'erase') {
      erasing = []
      render()
      eraseAt(event.clientX, event.clientY)
      return
    }

    var list = blocks()
    var index = anchorAt(event.clientX, event.clientY, list)
    if (index < 0) {
      pointer = null
      return
    }
    var type = tool === 'pen' ? 'p' : 'h'
    var color = tool === 'pen' ? penColor : hiColor
    var rect = list[index].getBoundingClientRect()
    ensureLayer()
    cur = {
      t: type,
      c: color,
      a: index,
      g: signature(list[index]),
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      sx: window.pageXOffset || 0,
      sy: window.pageYOffset || 0,
      pts: [[event.clientX, event.clientY]]
    }
    live = { path: makePath(type, color, [[event.clientX + cur.sx, event.clientY + cur.sy]]) }
    layer.appendChild(live.path)
  }

  function onMove(event) {
    if (event.pointerId !== pointer) return
    var events = event.getCoalescedEvents ? event.getCoalescedEvents() : []
    if (!events.length) events = [event]
    if (tool === 'erase') {
      events.forEach(function (e) { eraseAt(e.clientX, e.clientY) })
      return
    }
    if (!cur) return
    events.forEach(function (e) { addPoint(e.clientX, e.clientY) })
    liveUpdate()
  }

  function round(value) {
    return Math.round(value * 10000) / 10000
  }

  function onUp(event) {
    if (event.pointerId !== pointer) return
    pointer = null
    try { surface.releasePointerCapture(event.pointerId) } catch (error) { /* ignore */ }

    if (tool === 'erase') {
      if (erasing && erasing.length) {
        undoStack.push({ k: 'del', list: erasing })
        redoStack = []
        save()
      }
      erasing = null
      updateButtons()
      return
    }
    if (!cur) return

    if (cur.pts.length === 1) cur.pts.push([cur.pts[0][0], cur.pts[0][1]])
    var r = cur.rect
    serial += 1
    var stroke = {
      i: Date.now().toString(36) + serial,
      t: cur.t,
      c: cur.c,
      a: cur.a,
      g: cur.g,
      p: cur.pts.map(function (q) { return [round((q[0] - r.left) / r.width), round((q[1] - r.top) / r.height)] })
    }
    strokes.push(stroke)
    undoStack.push({ k: 'add', s: stroke })
    if (undoStack.length > 150) undoStack.shift()
    redoStack = []
    cur = null
    live = null
    render()
    save()
    updateButtons()
  }

  function onCancel(event) {
    if (event.pointerId !== pointer) return
    pointer = null
    cur = null
    live = null
    if (erasing && erasing.length) {
      undoStack.push({ k: 'del', list: erasing })
      save()
    }
    erasing = null
    render()
  }

  /* ---------- undo, redo, clear ---------- */
  function undo() {
    var op = undoStack.pop()
    if (!op) return
    if (op.k === 'add') {
      var at = strokes.indexOf(op.s)
      if (at > -1) strokes.splice(at, 1)
    } else {
      op.list.forEach(function (s) { strokes.push(s) })
    }
    redoStack.push(op)
    render()
    save()
    updateButtons()
  }

  function redo() {
    var op = redoStack.pop()
    if (!op) return
    if (op.k === 'add') {
      strokes.push(op.s)
    } else {
      op.list.forEach(function (s) {
        var at = strokes.indexOf(s)
        if (at > -1) strokes.splice(at, 1)
      })
    }
    undoStack.push(op)
    render()
    save()
    updateButtons()
  }

  function clearAll() {
    if (!strokes.length) return
    if (!parts.clear.classList.contains('is-confirm')) {
      parts.clear.classList.add('is-confirm')
      parts.clear.setAttribute('aria-label', 'Tap again to clear all notes')
      message('Tap the bin again to clear all your notes.')
      clearTimeout(confirmTimer)
      confirmTimer = setTimeout(resetConfirm, 3500)
      return
    }
    resetConfirm()
    undoStack.push({ k: 'del', list: strokes.slice() })
    redoStack = []
    strokes = []
    render()
    save()
    updateButtons()
  }

  function resetConfirm() {
    clearTimeout(confirmTimer)
    if (!parts.clear) return
    parts.clear.classList.remove('is-confirm')
    parts.clear.setAttribute('aria-label', 'Clear all notes')
    message('')
  }

  /* ---------- the tool bar ---------- */
  function updateButtons() {
    if (!bar) return
    parts.undo.disabled = !undoStack.length
    parts.redo.disabled = !redoStack.length
    parts.clear.disabled = !strokes.length
  }

  function buildSwatches() {
    parts.colors.innerHTML = ''
    var set = tool === 'pen' ? PEN : (tool === 'hi' ? HI : [])
    var current = tool === 'pen' ? penColor : hiColor
    set.forEach(function (entry) {
      var button = document.createElement('button')
      button.type = 'button'
      button.className = 'zp-draw-sw' + (entry[0] === current ? ' is-on' : '')
      button.style.setProperty('--c', entry[1])
      button.setAttribute('data-color', entry[0])
      button.setAttribute('aria-label', entry[2])
      parts.colors.appendChild(button)
    })
    parts.colors.hidden = !set.length
  }

  function setTool(next) {
    tool = next
    ;['pen', 'hi', 'erase', 'hand'].forEach(function (name) {
      parts[name].classList.toggle('is-on', name === tool)
      parts[name].setAttribute('aria-pressed', String(name === tool))
    })
    surface.hidden = tool === 'hand'
    surface.style.cursor = tool === 'erase' ? 'cell' : 'crosshair'
    buildSwatches()
  }

  function button(act, label, icon) {
    return '<button type="button" class="zp-draw-btn" data-act="' + act + '" aria-label="' + label + '" title="' + label + '">' + icon + '</button>'
  }

  function ensureUi() {
    if (bar) return
    surface = document.createElement('div')
    surface.className = 'zp-draw-surface'
    surface.hidden = true
    document.body.appendChild(surface)

    bar = document.createElement('div')
    bar.className = 'zp-draw-bar'
    bar.setAttribute('role', 'region')
    bar.setAttribute('aria-label', 'Drawing tools')
    bar.hidden = true
    bar.innerHTML =
      '<div class="zp-draw-row">' +
        button('pen', 'Pen', ICON.pen) +
        button('hi', 'Highlighter', ICON.hi) +
        button('erase', 'Eraser', ICON.erase) +
        button('hand', 'Hand: scroll the page', ICON.hand) +
        '<span class="zp-draw-sep"></span>' +
        button('undo', 'Undo', ICON.undo) +
        button('redo', 'Redo', ICON.redo) +
        button('clear', 'Clear all notes', ICON.clear) +
        button('done', 'Done', ICON.done) +
      '</div>' +
      '<div class="zp-draw-row zp-draw-colors"></div>' +
      '<div class="zp-draw-msg" role="status"></div>'
    document.body.appendChild(bar)

    parts = {
      pen: bar.querySelector('[data-act="pen"]'),
      hi: bar.querySelector('[data-act="hi"]'),
      erase: bar.querySelector('[data-act="erase"]'),
      hand: bar.querySelector('[data-act="hand"]'),
      undo: bar.querySelector('[data-act="undo"]'),
      redo: bar.querySelector('[data-act="redo"]'),
      clear: bar.querySelector('[data-act="clear"]'),
      colors: bar.querySelector('.zp-draw-colors'),
      msg: bar.querySelector('.zp-draw-msg')
    }

    bar.addEventListener('click', function (event) {
      var swatch = event.target.closest ? event.target.closest('.zp-draw-sw') : null
      if (swatch) {
        if (tool === 'pen') penColor = swatch.getAttribute('data-color')
        else hiColor = swatch.getAttribute('data-color')
        buildSwatches()
        return
      }
      var target = event.target.closest ? event.target.closest('[data-act]') : null
      if (!target || target.disabled) return
      var act = target.getAttribute('data-act')
      if (act === 'pen' || act === 'hi' || act === 'erase' || act === 'hand') setTool(act)
      else if (act === 'undo') undo()
      else if (act === 'redo') redo()
      else if (act === 'clear') clearAll()
      else if (act === 'done') close()
    })

    surface.addEventListener('pointerdown', onDown)
    surface.addEventListener('pointermove', onMove)
    surface.addEventListener('pointerup', onUp)
    surface.addEventListener('pointercancel', onCancel)
    surface.addEventListener('contextmenu', function (event) { event.preventDefault() })

    document.addEventListener('keydown', function (event) {
      if (!opened) return
      var tag = event.target && event.target.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      var key = String(event.key || '').toLowerCase()
      if ((event.ctrlKey || event.metaKey) && key === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
      } else if ((event.ctrlKey || event.metaKey) && key === 'y') {
        event.preventDefault()
        redo()
      } else if (event.key === 'Escape') {
        close()
      }
    })

    setTool('pen')
  }

  function announce() {
    try {
      document.dispatchEvent(new CustomEvent('zp-draw-state', { detail: { open: opened } }))
    } catch (error) { /* very old browser: the button just will not light up */ }
  }

  function open() {
    if (opened || !supported || root.classList.contains('zp-station-page')) return
    ensureUi()
    opened = true
    bar.hidden = false
    setTool(tool)
    root.classList.add('zp-drawing')
    render()
    updateButtons()
    announce()
  }

  function close() {
    if (!opened) return
    opened = false
    pointer = null
    cur = null
    live = null
    resetConfirm()
    bar.hidden = true
    surface.hidden = true
    root.classList.remove('zp-drawing')
    render()
    announce()
  }

  window.zpDraw = {
    supported: supported,
    isOpen: function () { return opened },
    open: open,
    close: close,
    toggle: function () {
      if (opened) close()
      else open()
    }
  }

  /* ---------- keeping the ink in place ---------- */
  function init() {
    strokes = load()
    if (!strokes.length) return
    schedule()
    window.addEventListener('load', function () { setTimeout(schedule, 200) })
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule)
  }

  window.addEventListener('resize', schedule)
  /* the lesson's own fade-in moves parts a few pixels until they appear, so the ink is placed again after it */
  document.addEventListener('transitionend', schedule, true)

  function watch() {
    if (window.ResizeObserver) new window.ResizeObserver(schedule).observe(document.body)
    if (window.MutationObserver) new window.MutationObserver(schedule).observe(root, { attributes: true, attributeFilter: ['data-size'] })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      init()
      watch()
    })
  } else {
    init()
    watch()
  }
})()
