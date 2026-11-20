/* DRAW: pen, highlighter and eraser for the student's own notes.
   The Draw button beside the tools button (tools/tools.js) opens the small tool bar.

   The small satisfying things (the way the best note apps work):
   - Draw and hold: draw a shape, then keep the pen (or finger, or mouse) still for a moment and the stroke
     snaps into a clean line, circle, ellipse, triangle or rectangle, with a short morph, a pulse and a tiny buzz.
     While holding a snapped line you can drag to change its length and angle (it clicks to 0, 45 and 90 degrees).
   - The highlighter straightens itself: it draws a straight line from where you start to where you are, and snaps to
     horizontal, so highlighting a line of text is a single clean swipe. The ruler button switches this off or on
     (the pen has it too, off by default). Holding Shift draws one straight line on a computer.
   - Tap the active pen or highlighter again to change its size (thin, medium, thick).
   - A ring shows the tip size and follows the mouse or pen before you touch the page.
   - Erased strokes fade away. Undo and redo bring them back.
   - The bar remembers your colours, sizes and ruler choices.

   How it stays in place: every stroke is tied to the part of the lesson it was drawn on (a "block") and stored
   as fractions of that block, so the ink follows the text when the screen width, the text size or an opened card
   changes the layout. Notes are saved on this device only (localStorage) and never appear in the PDF.
   Storage is wrapped so the tool keeps working where storage is blocked (notes then last for this visit).
   Ink is drawn as vector paths in one layer over the page, so long lessons cost no memory.
   Hand tool: switches drawing off so the page scrolls normally. */
(function () {
  var root = document.documentElement
  if (window.top === window && window.location.hash === '#print') return
  if (root.classList.contains('zp-print-view')) return

  var supported = !!window.PointerEvent
  var KEY = 'zp-ink:' + String(window.location.pathname || '')
  var PREF_KEY = 'zp-draw-prefs'
  var NS = 'http://www.w3.org/2000/svg'
  var PEN_W = [1.6, 2.6, 4.4]
  var HI_W = [11, 16, 24]
  var SIZE_NAMES = ['Thin', 'Medium', 'Thick']
  var ERASE_R = 14
  var MIN_STEP = 1.6
  var MAX_BYTES = 3500000
  var HOLD_MS = 520
  var HOLD_SLOP = 4
  var MORPH_MS = 170

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
    ruler: svg('<rect x="2" y="8" width="20" height="8" rx="1.5"/><path d="M6 8v3M10 8v2M14 8v3M18 8v2"/>'),
    undo: svg('<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/>'),
    redo: svg('<path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 15-6.7L21 13"/>'),
    clear: svg('<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>'),
    done: svg('<polyline points="20 6 9 17 4 12"/>')
  }

  var prefs = { pz: 1, hz: 1, ps: false, hs: true, pc: 'ink', hc: 'y', tip: false }
  var strokes = []
  var undoStack = []
  var redoStack = []
  var tool = 'pen'
  var penSeen = false
  var opened = false
  var layer = null
  var gMain = null
  var gGhost = null
  var surface = null
  var bar = null
  var ring = null
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

  function loadPrefs() {
    try {
      var data = JSON.parse(window.localStorage.getItem(PREF_KEY) || 'null')
      if (data && typeof data === 'object') {
        Object.keys(prefs).forEach(function (key) { if (data[key] !== undefined) prefs[key] = data[key] })
      }
    } catch (error) { /* blocked: defaults */ }
  }

  function savePrefs() {
    try { window.localStorage.setItem(PREF_KEY, JSON.stringify(prefs)) } catch (error) { /* blocked */ }
  }

  function clean(s) {
    var out = { i: s.i, t: s.t, c: s.c, a: s.a, g: s.g, p: s.p }
    if (s.z !== undefined && s.z !== 1) out.z = s.z
    if (s.sh) out.sh = s.sh
    return out
  }

  function message(text, tip) {
    if (!parts.msg) return
    clearTimeout(msgTimer)
    parts.msg.textContent = text || ''
    parts.msg.classList.toggle('is-tip', !!tip)
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

  /* ---------- blocks: the parts of the page that strokes are tied to ---------- */
  function flat(el, list) {
    if (el.classList.contains('zp-section') || el.classList.contains('zp-qa-list')) {
      ;[].forEach.call(el.children, function (child) { flat(child, list) })
    } else if (el.classList.contains('zp-ospe')) {
      ;[].forEach.call(el.children, function (station) {
        ;[].forEach.call(station.children, function (part) { list.push(part) })
      })
    } else {
      list.push(el)
    }
  }

  function blocks() {
    var main = document.querySelector('main')
    var list = []
    if (!main) return list
    ;[].forEach.call(main.children, function (child) { flat(child, list) })
    return list
  }

  function signature(el) {
    var station = el.parentNode && el.parentNode.classList && el.parentNode.classList.contains('zp-station') ? el.parentNode : null
    if (station) {
      var all = [].slice.call(document.querySelectorAll('.zp-station'))
      return 'ST' + all.indexOf(station) + ':' + [].indexOf.call(station.children, el)
    }
    return el.tagName + ':' + String(el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 24)
  }

  function colorOf(key) {
    var all = PEN.concat(HI)
    for (var i = 0; i < all.length; i++) if (all[i][0] === key) return all[i][1]
    return 'var(--zp-text)'
  }

  function widthOf(type, z) {
    return (type === 'h' ? HI_W : PEN_W)[z === undefined ? 1 : z]
  }

  function isSharp(sh) { return sh === 'l' || sh === 'p' }

  /* ---------- geometry ---------- */
  function dist(a, b) { return Math.sqrt((a[0] - b[0]) * (a[0] - b[0]) + (a[1] - b[1]) * (a[1] - b[1])) }

  function pathLength(pts) {
    var total = 0
    for (var i = 1; i < pts.length; i++) total += dist(pts[i - 1], pts[i])
    return total
  }

  function bbox(pts) {
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9
    pts.forEach(function (p) {
      if (p[0] < x0) x0 = p[0]
      if (p[0] > x1) x1 = p[0]
      if (p[1] < y0) y0 = p[1]
      if (p[1] > y1) y1 = p[1]
    })
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
  }

  function resample(pts, n, closed) {
    var list = closed && dist(pts[0], pts[pts.length - 1]) > 0.5 ? pts.concat([pts[0]]) : pts
    var total = pathLength(list)
    if (!total) return pts.map(function (p) { return p.slice() })
    var step = total / (n - 1)
    var out = [list[0].slice()]
    var carried = 0
    for (var i = 1; i < list.length && out.length < n; i++) {
      var a = list[i - 1]
      var b = list[i]
      var seg = dist(a, b)
      while (carried + seg >= step * out.length - 1e-6 + 0 && out.length < n) {
        var target = step * out.length - carried
        var t = seg ? target / seg : 0
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
        if (t >= 1) break
      }
      carried += seg
    }
    while (out.length < n) out.push(list[list.length - 1].slice())
    return out
  }

  function simplify(pts, epsilon) {
    if (pts.length < 3) return pts.slice()
    var a = pts[0]
    var b = pts[pts.length - 1]
    var far = -1
    var index = 0
    for (var i = 1; i < pts.length - 1; i++) {
      var d = lineDistance(pts[i], a, b)
      if (d > far) {
        far = d
        index = i
      }
    }
    if (far <= epsilon) return [a, b]
    var left = simplify(pts.slice(0, index + 1), epsilon)
    var right = simplify(pts.slice(index), epsilon)
    return left.slice(0, -1).concat(right)
  }

  function lineDistance(p, a, b) {
    var dx = b[0] - a[0]
    var dy = b[1] - a[1]
    var len = Math.sqrt(dx * dx + dy * dy)
    if (!len) return dist(p, a)
    return Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / len
  }

  /* snaps an end point to 0, 45 or 90 degrees when it is close to one of them */
  function straightEnd(start, point, type) {
    var dx = point[0] - start[0]
    var dy = point[1] - start[1]
    var length = Math.sqrt(dx * dx + dy * dy)
    if (!length) return point
    var angle = Math.atan2(dy, dx) * 180 / Math.PI
    var snapped = Math.round(angle / 45) * 45
    var tolerance = type === 'h' ? 11 : 6
    if (Math.abs(angle - snapped) <= tolerance) {
      var r = snapped * Math.PI / 180
      return [start[0] + length * Math.cos(r), start[1] + length * Math.sin(r)]
    }
    return point
  }

  /* what the stroke is meant to be: a line, an ellipse or circle, a triangle or a rectangle (or nothing) */
  function recognize(pts) {
    if (pts.length < 4) return null
    var length = pathLength(pts)
    if (length < 28) return null
    var first = pts[0]
    var last = pts[pts.length - 1]
    var gap = dist(first, last)
    var box = bbox(pts)
    var diagonal = Math.sqrt(box.w * box.w + box.h * box.h)
    var closed = gap < 0.22 * length && length > 70

    if (!closed) {
      if (gap < 22) return null
      var worst = 0
      pts.forEach(function (p) { worst = Math.max(worst, lineDistance(p, first, last)) })
      if (worst / gap < 0.085) return { kind: 'line', sh: 'l', pts: [first.slice(), last.slice()], closed: false }
      return null
    }

    var cx = box.x + box.w / 2
    var cy = box.y + box.h / 2
    var a = box.w / 2
    var b = box.h / 2
    if (a < 8 || b < 8) return null

    var radii = pts.map(function (p) { return Math.sqrt(Math.pow((p[0] - cx) / a, 2) + Math.pow((p[1] - cy) / b, 2)) })
    var mean = radii.reduce(function (s, v) { return s + v }, 0) / radii.length
    var spread = Math.sqrt(radii.reduce(function (s, v) { return s + (v - mean) * (v - mean) }, 0) / radii.length)
    if (mean > 0.78 && mean < 1.18 && spread < 0.13) {
      if (Math.abs(a - b) / Math.max(a, b) < 0.16) {
        a = b = (a + b) / 2
      }
      var round = []
      for (var i = 0; i <= 72; i++) {
        var t = i / 72 * Math.PI * 2
        round.push([cx + a * Math.cos(t), cy + b * Math.sin(t)])
      }
      return { kind: 'ellipse', sh: 'e', pts: round, closed: true }
    }

    var corners = simplify(pts, 0.07 * diagonal)
    if (corners.length > 2 && dist(corners[0], corners[corners.length - 1]) < 0.22 * length) corners.pop()
    if (corners.length === 3) {
      return { kind: 'triangle', sh: 'p', pts: corners.concat([corners[0]]).map(function (p) { return p.slice() }), closed: true }
    }
    if (corners.length === 4) {
      var tilted = false
      for (var k = 0; k < 4; k++) {
        var p1 = corners[k]
        var p2 = corners[(k + 1) % 4]
        var angle = Math.abs(Math.atan2(p2[1] - p1[1], p2[0] - p1[0]) * 180 / Math.PI) % 90
        if (angle > 14 && angle < 76) tilted = true
      }
      if (!tilted) {
        return {
          kind: 'rectangle',
          sh: 'p',
          pts: [[box.x, box.y], [box.x + box.w, box.y], [box.x + box.w, box.y + box.h], [box.x, box.y + box.h], [box.x, box.y]],
          closed: true
        }
      }
      return { kind: 'quadrilateral', sh: 'p', pts: corners.concat([corners[0]]).map(function (p) { return p.slice() }), closed: true }
    }
    return null
  }

  /* ---------- drawing the layer ---------- */
  function ensureLayer() {
    if (layer) return
    layer = document.createElementNS(NS, 'svg')
    layer.setAttribute('class', 'zp-ink')
    layer.setAttribute('aria-hidden', 'true')
    gMain = document.createElementNS(NS, 'g')
    gGhost = document.createElementNS(NS, 'g')
    layer.appendChild(gMain)
    layer.appendChild(gGhost)
    document.body.appendChild(layer)
  }

  function pathData(pts, sharp) {
    var d = 'M' + pts[0][0].toFixed(1) + ' ' + pts[0][1].toFixed(1)
    if (pts.length === 1) return d + ' l0.01 0'
    var i
    if (sharp || pts.length === 2) {
      for (i = 1; i < pts.length; i++) d += ' L' + pts[i][0].toFixed(1) + ' ' + pts[i][1].toFixed(1)
      return d
    }
    for (i = 1; i < pts.length - 1; i++) {
      var mx = (pts[i][0] + pts[i + 1][0]) / 2
      var my = (pts[i][1] + pts[i + 1][1]) / 2
      d += ' Q' + pts[i][0].toFixed(1) + ' ' + pts[i][1].toFixed(1) + ' ' + mx.toFixed(1) + ' ' + my.toFixed(1)
    }
    var last = pts[pts.length - 1]
    return d + ' L' + last[0].toFixed(1) + ' ' + last[1].toFixed(1)
  }

  function makePath(type, color, pts, z, sharp) {
    var path = document.createElementNS(NS, 'path')
    var width = widthOf(type, z)
    path.setAttribute('class', type === 'h' ? 'zp-ink-h' : 'zp-ink-p')
    path.setAttribute('d', pathData(pts, sharp))
    path.style.stroke = colorOf(color)
    path.style.strokeWidth = String(width)
    path.style.setProperty('--w', String(width))
    if (type === 'h') path.style.strokeLinecap = 'butt'
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
      if (gMain) while (gMain.firstChild) gMain.removeChild(gMain.firstChild)
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
    while (gMain.firstChild) gMain.removeChild(gMain.firstChild)

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
      gMain.appendChild(makePath(s.t, s.c, pts, s.z, isSharp(s.sh)))
    })
    if (live) gMain.appendChild(live.path)
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

  /* an erased stroke leaves a ghost that fades away */
  function fadeOut(stroke) {
    if (!stroke._d || !gGhost) return
    var ghost = makePath(stroke.t, stroke.c, stroke._d, stroke.z, isSharp(stroke.sh))
    ghost.classList.add('zp-ink-fade')
    gGhost.appendChild(ghost)
    setTimeout(function () { if (ghost.parentNode) ghost.parentNode.removeChild(ghost) }, 280)
  }

  function eraseAt(x, y) {
    var dx = x + (window.pageXOffset || 0)
    var dy = y + (window.pageYOffset || 0)
    var removed = false
    for (var i = strokes.length - 1; i >= 0; i--) {
      var s = strokes[i]
      if (!s._d) continue
      if (hits(s._d, dx, dy, ERASE_R + widthOf(s.t, s.z) / 2)) {
        fadeOut(s)
        strokes.splice(i, 1)
        erasing.push(s)
        removed = true
      }
    }
    if (removed) {
      render()
      buzz(6)
    }
  }

  function buzz(ms) {
    try { if (navigator.vibrate) navigator.vibrate(ms) } catch (error) { /* not supported */ }
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
    var sharp = cur.line || (cur.snapped && isSharp(cur.snapped.sh))
    live.path.setAttribute('d', pathData(pts, !!sharp && !cur.morphing))
  }

  function addPoint(x, y) {
    var last = cur.pts[cur.pts.length - 1]
    if (Math.abs(x - last[0]) + Math.abs(y - last[1]) < MIN_STEP) return
    cur.pts.push([x, y])
  }

  /* hold still after drawing: the stroke becomes the clean shape it was meant to be */
  function armHold() {
    if (!cur) return
    clearTimeout(cur.timer)
    if (cur.line || cur.snapped) return
    cur.timer = setTimeout(trySnap, HOLD_MS)
  }

  function trySnap() {
    if (!cur || cur.snapped || cur.pts.length < 4) return
    var found = recognize(cur.pts)
    if (!found && cur.t === 'h' && pathLength(cur.pts) > 30) {
      var first = cur.pts[0]
      var last = cur.pts[cur.pts.length - 1]
      found = { kind: 'line', sh: 'l', pts: [first.slice(), straightEnd(first, last, 'h')], closed: false }
    }
    if (!found) return
    snapTo(found)
  }

  function snapTo(found) {
    var from = resample(cur.pts, 64, false)
    var to = resample(found.pts, 64, found.closed)
    if (found.closed) {
      var best = 0
      var bestDistance = 1e9
      for (var i = 0; i < to.length - 1; i++) {
        var d = dist(to[i], from[0])
        if (d < bestDistance) {
          bestDistance = d
          best = i
        }
      }
      to = to.slice(best, to.length - 1).concat(to.slice(0, best)).concat([to[best]])
    }
    cur.snapped = { kind: found.kind, sh: found.sh, start: found.pts[0].slice(), target: found.pts.map(function (p) { return p.slice() }) }
    cur.morphing = true
    buzz(12)
    if (live && live.path) {
      live.path.classList.add('zp-ink-snap')
      setTimeout(function () { if (live && live.path) live.path.classList.remove('zp-ink-snap') }, 260)
    }
    var begin = null
    function step(now) {
      if (!cur) return
      if (begin === null) begin = now
      var t = Math.min(1, (now - begin) / MORPH_MS)
      var eased = 1 - Math.pow(1 - t, 3)
      cur.pts = from.map(function (p, k) { return [p[0] + (to[k][0] - p[0]) * eased, p[1] + (to[k][1] - p[1]) * eased] })
      liveUpdate()
      if (t < 1) {
        window.requestAnimationFrame(step)
      } else {
        cur.morphing = false
        cur.pts = found.pts.map(function (p) { return p.slice() })
        liveUpdate()
      }
    }
    window.requestAnimationFrame(step)
  }

  function onDown(event) {
    if (event.pointerType === 'pen') penSeen = true
    else if (event.pointerType === 'touch' && penSeen) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    if (pointer !== null) return
    event.preventDefault()
    try { surface.setPointerCapture(event.pointerId) } catch (error) { /* ignore */ }
    pointer = event.pointerId
    if (event.pointerType === 'touch') hideRing()

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
    var color = tool === 'pen' ? prefs.pc : prefs.hc
    var z = tool === 'pen' ? prefs.pz : prefs.hz
    var rect = list[index].getBoundingClientRect()
    ensureLayer()
    cur = {
      t: type,
      c: color,
      z: z,
      a: index,
      g: signature(list[index]),
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      sx: window.pageXOffset || 0,
      sy: window.pageYOffset || 0,
      pts: [[event.clientX, event.clientY]],
      start: [event.clientX, event.clientY],
      holdAt: [event.clientX, event.clientY],
      line: !!(type === 'p' ? prefs.ps : prefs.hs) || !!event.shiftKey,
      snapped: null,
      morphing: false,
      timer: null
    }
    live = { path: makePath(type, color, [[event.clientX + cur.sx, event.clientY + cur.sy]], z, false) }
    gMain.appendChild(live.path)
    armHold()
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
    events.forEach(function (e) {
      var point = [e.clientX, e.clientY]
      if (cur.snapped) {
        /* a snapped line can still be pulled to a new length and angle */
        if (cur.snapped.kind === 'line' && !cur.morphing && dist(point, cur.holdAt) > HOLD_SLOP) {
          cur.pts = [cur.snapped.start, straightEnd(cur.snapped.start, point, cur.t)]
        }
        return
      }
      if (cur.line || e.shiftKey) {
        cur.line = true
        clearTimeout(cur.timer)
        cur.pts = [cur.start, straightEnd(cur.start, point, cur.t)]
        return
      }
      addPoint(point[0], point[1])
      if (dist(point, cur.holdAt) > HOLD_SLOP) {
        cur.holdAt = point
        armHold()
      }
    })
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
    clearTimeout(cur.timer)

    var points = cur.pts
    if (cur.snapped && cur.morphing) points = cur.snapped.target || points
    if (points.length === 1) points = [points[0], [points[0][0], points[0][1]]]
    var r = cur.rect
    serial += 1
    var stroke = {
      i: Date.now().toString(36) + serial,
      t: cur.t,
      c: cur.c,
      z: cur.z,
      a: cur.a,
      g: cur.g,
      p: points.map(function (q) { return [round((q[0] - r.left) / r.width), round((q[1] - r.top) / r.height)] })
    }
    if (cur.snapped) stroke.sh = cur.snapped.sh
    else if (cur.line) stroke.sh = 'l'
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
    if (cur) clearTimeout(cur.timer)
    cur = null
    live = null
    if (erasing && erasing.length) {
      undoStack.push({ k: 'del', list: erasing })
      save()
    }
    erasing = null
    render()
  }

  /* ---------- the ring that shows the tip ---------- */
  function ringSize() {
    if (tool === 'erase') return ERASE_R * 2
    if (tool === 'pen') return Math.max(8, PEN_W[prefs.pz] + 5)
    return HI_W[prefs.hz]
  }

  function updateRing() {
    if (!ring) return
    var size = ringSize()
    ring.style.width = size + 'px'
    ring.style.height = size + 'px'
    ring.style.marginLeft = (-size / 2) + 'px'
    ring.style.marginTop = (-size / 2) + 'px'
    ring.className = 'zp-draw-ring is-' + tool
    var color = tool === 'pen' ? colorOf(prefs.pc) : (tool === 'hi' ? colorOf(prefs.hc) : '')
    ring.style.setProperty('--ring', color || 'var(--zp-muted)')
  }

  function hideRing() {
    if (ring) ring.hidden = true
  }

  function onHover(event) {
    if (!opened || tool === 'hand' || event.pointerType === 'touch') {
      hideRing()
      return
    }
    ring.hidden = false
    ring.style.transform = 'translate(' + event.clientX + 'px,' + event.clientY + 'px)'
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
    strokes.forEach(fadeOut)
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
    var current = tool === 'pen' ? prefs.pc : prefs.hc
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

  function paintTool() {
    ;['pen', 'hi', 'erase', 'hand'].forEach(function (name) {
      parts[name].classList.toggle('is-on', name === tool)
      parts[name].setAttribute('aria-pressed', String(name === tool))
    })
    parts.pen.setAttribute('data-size', String(prefs.pz))
    parts.hi.setAttribute('data-size', String(prefs.hz))
    var ruled = tool === 'pen' ? prefs.ps : prefs.hs
    parts.straight.hidden = !(tool === 'pen' || tool === 'hi')
    parts.straight.classList.toggle('is-on', !!ruled)
    parts.straight.setAttribute('aria-pressed', String(!!ruled))
    parts.straight.setAttribute('aria-label', ruled ? 'Straight lines on' : 'Straight lines off')
    parts.straight.title = ruled ? 'Straight lines: on' : 'Straight lines: off'
  }

  function setTool(next) {
    tool = next
    surface.hidden = tool === 'hand'
    surface.style.cursor = tool === 'erase' ? 'cell' : 'crosshair'
    paintTool()
    buildSwatches()
    updateRing()
    if (tool === 'hand') hideRing()
  }

  /* tapping the tool that is already active changes its size */
  function cycleSize() {
    if (tool === 'pen') prefs.pz = (prefs.pz + 1) % 3
    else if (tool === 'hi') prefs.hz = (prefs.hz + 1) % 3
    else return
    savePrefs()
    paintTool()
    updateRing()
    message(SIZE_NAMES[tool === 'pen' ? prefs.pz : prefs.hz] + ' ' + (tool === 'pen' ? 'pen' : 'highlighter'), true)
  }

  function toggleStraight() {
    if (tool === 'pen') prefs.ps = !prefs.ps
    else if (tool === 'hi') prefs.hs = !prefs.hs
    else return
    savePrefs()
    paintTool()
    var on = tool === 'pen' ? prefs.ps : prefs.hs
    message(on ? 'Straight lines on' : 'Straight lines off. Hold still at the end of a stroke to straighten it.', true)
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

    ring = document.createElement('div')
    ring.className = 'zp-draw-ring'
    ring.hidden = true
    ring.setAttribute('aria-hidden', 'true')
    document.body.appendChild(ring)

    bar = document.createElement('div')
    bar.className = 'zp-draw-bar'
    bar.setAttribute('role', 'region')
    bar.setAttribute('aria-label', 'Drawing tools')
    bar.hidden = true
    bar.innerHTML =
      '<div class="zp-draw-row">' +
        button('pen', 'Pen (tap again for size)', ICON.pen) +
        button('hi', 'Highlighter (tap again for size)', ICON.hi) +
        button('erase', 'Eraser', ICON.erase) +
        button('hand', 'Hand: scroll the page', ICON.hand) +
        '<span class="zp-draw-sep"></span>' +
        button('straight', 'Straight lines', ICON.ruler) +
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
      straight: bar.querySelector('[data-act="straight"]'),
      undo: bar.querySelector('[data-act="undo"]'),
      redo: bar.querySelector('[data-act="redo"]'),
      clear: bar.querySelector('[data-act="clear"]'),
      colors: bar.querySelector('.zp-draw-colors'),
      msg: bar.querySelector('.zp-draw-msg')
    }

    bar.addEventListener('click', function (event) {
      var swatch = event.target.closest ? event.target.closest('.zp-draw-sw') : null
      if (swatch) {
        if (tool === 'pen') prefs.pc = swatch.getAttribute('data-color')
        else prefs.hc = swatch.getAttribute('data-color')
        savePrefs()
        buildSwatches()
        updateRing()
        return
      }
      var target = event.target.closest ? event.target.closest('[data-act]') : null
      if (!target || target.disabled) return
      var act = target.getAttribute('data-act')
      if (act === 'pen' || act === 'hi') {
        if (tool === act) cycleSize()
        else setTool(act)
      } else if (act === 'erase' || act === 'hand') setTool(act)
      else if (act === 'straight') toggleStraight()
      else if (act === 'undo') undo()
      else if (act === 'redo') redo()
      else if (act === 'clear') clearAll()
      else if (act === 'done') close()
    })

    surface.addEventListener('pointerdown', onDown)
    surface.addEventListener('pointermove', function (event) {
      onHover(event)
      onMove(event)
    })
    surface.addEventListener('pointerup', onUp)
    surface.addEventListener('pointercancel', onCancel)
    surface.addEventListener('pointerleave', hideRing)
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
    if (opened || !supported) return
    ensureUi()
    opened = true
    bar.hidden = false
    setTool(tool)
    root.classList.add('zp-drawing')
    render()
    updateButtons()
    announce()
    if (!prefs.tip) {
      prefs.tip = true
      savePrefs()
      message('Tip: hold still at the end of a stroke to snap it into a clean line or shape.', true)
    }
  }

  function close() {
    if (!opened) return
    opened = false
    pointer = null
    if (cur) clearTimeout(cur.timer)
    cur = null
    live = null
    resetConfirm()
    hideRing()
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
    loadPrefs()
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
