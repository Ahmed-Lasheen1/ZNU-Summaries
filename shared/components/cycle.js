/* CYCLE: draws the coloured ring behind each circular diagram and sends arrows
   flowing around it. The arrows take on the ring's colour as they travel.
   Steps stay readable if this script does not run. With reduced motion switched on,
   the arrows stand still between the steps. */
(function () {
  var NS = 'http://www.w3.org/2000/svg'
  var COLORS = ['--zp-accent', '--zp-clin', '--zp-hy', '--zp-vio']
  var CENTER = 50
  var RADIUS = 32
  var PERIOD = 10000
  var ARROW = '4.4,0 -2.8,3.6 -2.8,-3.6'

  var counter = 0
  var entries = []
  var running = false

  var reduced = (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) ||
    document.documentElement.classList.contains('zp-print-view')
  var printing = false
  var canMix = !!(window.CSS && CSS.supports && CSS.supports('color', 'color-mix(in srgb, red 50%, blue)'))

  function make(name, attributes) {
    var element = document.createElementNS(NS, name)
    Object.keys(attributes || {}).forEach(function (key) {
      element.setAttribute(key, attributes[key])
    })
    return element
  }

  function point(angle) {
    var radians = angle * Math.PI / 180
    return [CENTER + RADIUS * Math.sin(radians), CENTER - RADIUS * Math.cos(radians)]
  }

  function color(index, count) {
    return 'var(' + COLORS[(index % count) % COLORS.length] + ')'
  }

  /* the ring colour at a given angle: a blend of the two steps it lies between */
  function colorAt(entry, angle) {
    var segment = Math.floor(angle / entry.step) % entry.count
    var fraction = (angle - segment * entry.step) / entry.step
    var from = color(segment, entry.count)
    var to = color(segment + 1, entry.count)
    if (!canMix) return fraction < 0.5 ? from : to
    return 'color-mix(in srgb, ' + from + ' ' + Math.round((1 - fraction) * 100) + '%, ' + to + ')'
  }

  function place(arrow, entry, angle) {
    var spot = point(angle)
    arrow.setAttribute('transform', 'translate(' + spot[0].toFixed(2) + ' ' + spot[1].toFixed(2) + ') rotate(' + angle.toFixed(1) + ')')
    arrow.style.fill = colorAt(entry, angle)
  }

  /* still arrows (reduced motion): one halfway between each pair of steps */
  function rest(entry) {
    entry.arrows.forEach(function (arrow, index) {
      if (index % 2) {
        arrow.style.display = 'none'
        return
      }
      place(arrow, entry, (index / 2) * entry.step + entry.step / 2)
    })
  }

  function frame(now) {
    if (printing) {
      running = false
      return
    }
    var active = false
    entries.forEach(function (entry) {
      if (!entry.visible) return
      active = true
      var base = (now % PERIOD) / PERIOD * 360
      entry.arrows.forEach(function (arrow, index) {
        place(arrow, entry, (base + index * entry.step / 2) % 360)
      })
    })
    if (active) {
      window.requestAnimationFrame(frame)
    } else {
      running = false
    }
  }

  function start() {
    if (running) return
    running = true
    window.requestAnimationFrame(frame)
  }

  function build(cycle) {
    if (cycle.classList.contains('zp-cycle-ready')) return

    var count = cycle.querySelectorAll('.zp-cycle-node').length
    if (count < 3) return

    var id = 'zp-cycle-' + (counter += 1)
    var step = 360 / count
    var svg = make('svg', { viewBox: '0 0 100 100', 'aria-hidden': 'true', 'class': 'zp-cycle-svg' })
    var defs = make('defs')
    svg.appendChild(defs)

    for (var i = 0; i < count; i++) {
      var from = point(i * step)
      var to = point((i + 1) * step)

      var gradient = make('linearGradient', {
        id: id + '-' + i,
        gradientUnits: 'userSpaceOnUse',
        x1: from[0], y1: from[1], x2: to[0], y2: to[1]
      })
      var stopA = make('stop', { offset: '0' })
      stopA.style.stopColor = color(i, count)
      var stopB = make('stop', { offset: '1' })
      stopB.style.stopColor = color(i + 1, count)
      gradient.appendChild(stopA)
      gradient.appendChild(stopB)
      defs.appendChild(gradient)

      svg.appendChild(make('path', {
        'class': 'zp-cycle-seg',
        d: 'M ' + from[0] + ' ' + from[1] + ' A ' + RADIUS + ' ' + RADIUS + ' 0 0 1 ' + to[0] + ' ' + to[1],
        stroke: 'url(#' + id + '-' + i + ')'
      }))
    }

    /* two arrows per step, evenly spaced, so some are always in view */
    var arrows = []
    for (var k = 0; k < count * 2; k++) {
      var arrow = make('polygon', { 'class': 'zp-cycle-arrow', points: ARROW })
      svg.appendChild(arrow)
      arrows.push(arrow)
    }

    /* added last, so the numbering of the steps does not change */
    cycle.appendChild(svg)
    if (count >= 5) cycle.classList.add('zp-cycle--dense')
    cycle.classList.add('zp-cycle-ready')

    var entry = { cycle: cycle, count: count, step: step, arrows: arrows, visible: false }
    entries.push(entry)
    rest(entry)

    if (reduced) return

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (changes) {
        changes.forEach(function (change) {
          entry.visible = change.isIntersecting
          if (entry.visible) start()
        })
      }).observe(cycle)
    } else {
      entry.visible = true
      start()
    }
  }

  /* On paper the arrows rest at their default places between the steps. */
  function freeze() {
    printing = true
    entries.forEach(rest)
  }

  function thaw() {
    printing = false
    entries.forEach(function (entry) {
      entry.arrows.forEach(function (arrow) { arrow.style.display = '' })
      if (entry.visible) start()
    })
  }

  window.addEventListener('beforeprint', freeze)
  window.addEventListener('afterprint', thaw)
  if (window.matchMedia) {
    var printQuery = window.matchMedia('print')
    var onPrintChange = function (event) { if (event.matches) freeze(); else thaw() }
    if (printQuery.addEventListener) printQuery.addEventListener('change', onPrintChange)
    else if (printQuery.addListener) printQuery.addListener(onPrintChange)
  }

  function init() {
    var cycles = document.querySelectorAll('.zp-cycle')
    for (var i = 0; i < cycles.length; i++) build(cycles[i])
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
