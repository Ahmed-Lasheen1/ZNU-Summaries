/* CYCLE: draws the coloured ring, the arrows between steps and the travelling dot
   behind each circular diagram. Steps stay readable if this script does not run. */
(function () {
  var NS = 'http://www.w3.org/2000/svg'
  var COLORS = ['--zp-accent', '--zp-clin', '--zp-hy', '--zp-vio']
  var CENTER = 50
  var RADIUS = 32
  var counter = 0

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
      var start = i * step
      var end = (i + 1) * step
      var from = point(start)
      var to = point(end)

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

      /* arrowhead halfway between two steps, pointing the way round */
      var mid = start + step / 2
      var middle = point(mid)
      var radians = mid * Math.PI / 180
      var tx = Math.cos(radians)
      var ty = Math.sin(radians)
      var nx = -Math.sin(radians)
      var ny = Math.cos(radians)
      var tip = [middle[0] + tx * 3.6, middle[1] + ty * 3.6]
      var left = [middle[0] - tx * 2.4 + nx * 3, middle[1] - ty * 2.4 + ny * 3]
      var right = [middle[0] - tx * 2.4 - nx * 3, middle[1] - ty * 2.4 - ny * 3]
      var arrow = make('polygon', {
        points: tip.join(',') + ' ' + left.join(',') + ' ' + right.join(',')
      })
      arrow.style.fill = color(i + 1, count)
      svg.appendChild(arrow)
    }

    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!reduced) {
      var top = point(0)
      var bottom = point(180)
      var travel = make('circle', { 'class': 'zp-cycle-dot', r: '1.7' })
      travel.appendChild(make('animateMotion', {
        dur: '9s',
        repeatCount: 'indefinite',
        path: 'M ' + top[0] + ' ' + top[1] +
          ' A ' + RADIUS + ' ' + RADIUS + ' 0 0 1 ' + bottom[0] + ' ' + bottom[1] +
          ' A ' + RADIUS + ' ' + RADIUS + ' 0 0 1 ' + top[0] + ' ' + top[1]
      }))
      svg.appendChild(travel)
    }

    /* added last, so the numbering of the steps does not change */
    cycle.appendChild(svg)
    if (count >= 5) cycle.classList.add('zp-cycle--dense')
    cycle.classList.add('zp-cycle-ready')
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
