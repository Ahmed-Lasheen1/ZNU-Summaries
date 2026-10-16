/* RECALL: shows "1 of 3 checked" above a group of quick checks and, when every check
   in the group has been opened, celebrates with a message and falling colour dots. */
(function () {
  var COLORS = ['var(--zp-accent)', 'var(--zp-clin)', 'var(--zp-hy)', 'var(--zp-vio)', 'var(--zp-warn)']
  var groups = []

  function isRecall(node) {
    return node && node.classList && node.classList.contains('zp-recall')
  }

  function celebrate(total) {
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches

    var toast = document.createElement('div')
    toast.className = 'zp-toast'
    toast.setAttribute('role', 'status')
    toast.textContent = 'All ' + total + ' checks done. Nice work!'
    document.body.appendChild(toast)

    var pieces = []
    if (!reduced) {
      for (var i = 0; i < 60; i++) {
        var piece = document.createElement('span')
        piece.className = 'zp-confetti'
        piece.style.left = (Math.random() * 100) + '%'
        piece.style.background = COLORS[i % COLORS.length]
        piece.style.animationDelay = (Math.random() * 500) + 'ms'
        piece.style.animationDuration = (2000 + Math.random() * 1800) + 'ms'
        piece.style.setProperty('--drift', ((Math.random() - 0.5) * 220) + 'px')
        document.body.appendChild(piece)
        pieces.push(piece)
      }
    }

    setTimeout(function () {
      toast.remove()
      pieces.forEach(function (piece) { piece.remove() })
    }, 4800)
  }

  function refresh(group) {
    var open = group.items.filter(function (item) { return item.open }).length
    var total = group.items.length
    group.count.textContent = String(open)
    group.bar.style.width = (open / total * 100) + '%'

    if (open === total) {
      group.chip.classList.add('is-complete')
      group.label.textContent = 'All ' + total + ' checks done. Nice work!'
      if (!group.celebrated) {
        group.celebrated = true
        celebrate(total)
      }
    } else {
      group.chip.classList.remove('is-complete')
      group.label.textContent = ''
      group.label.appendChild(group.count)
      group.label.appendChild(document.createTextNode(' of ' + total + ' checked'))
    }
  }

  function refreshAll() {
    groups.forEach(refresh)
  }

  function init() {
    var parents = []
    var all = document.querySelectorAll('.zp-recall')
    for (var i = 0; i < all.length; i++) {
      if (parents.indexOf(all[i].parentNode) === -1) parents.push(all[i].parentNode)
    }

    parents.forEach(function (parent) {
      var items = [].filter.call(parent.children, isRecall)
      if (items.length < 2) return

      var chip = document.createElement('div')
      chip.className = 'zp-recall-progress'

      var label = document.createElement('div')
      label.className = 'zp-recall-progress-label'
      var count = document.createElement('span')
      count.className = 'zp-recall-count'
      label.appendChild(count)

      var track = document.createElement('div')
      track.className = 'zp-recall-bar'
      var bar = document.createElement('span')
      track.appendChild(bar)

      chip.appendChild(label)
      chip.appendChild(track)
      parent.insertBefore(chip, items[0])

      var group = { items: items, chip: chip, label: label, count: count, bar: bar, celebrated: false }
      groups.push(group)
      refresh(group)
    })
  }

  /* details tells us when it opens or closes; the click is a second safety net */
  document.addEventListener('toggle', function (event) {
    if (isRecall(event.target)) refreshAll()
  }, true)

  document.addEventListener('click', function (event) {
    var target = event.target
    if (target && target.closest && target.closest('.zp-recall summary')) {
      setTimeout(refreshAll, 80)
    }
  })

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
