/* LISTEN, READING: walks through the lesson and builds the list of things to speak, in page order.
   Each entry holds the element to highlight and the text to say.
   Nothing here changes the lesson page. It only reads it.

   Two things are easy to edit below:
   - RECALL_WAIT: the silent gap between a quick-check question and its answer.
   - WORDS: words the voice pronounces badly. Add a line [written, spoken] and it is fixed everywhere.
   Symbols, units and ranges are already handled in REPLACEMENTS. */
(function () {
  var RECALL_WAIT = 4000

  /* Add pronunciation fixes here, for example: ['PVLNT', 'P V L N T'] */
  var WORDS = []

  /* Anything inside these is never read. Put data-zp-listen="skip" on any element to skip it too. */
  var SKIP = [
    '.zp-done-btn', '.zp-recall-progress', '.zp-source', '.zp-lesson-illustration', '.zp-toast',
    '.zp-confetti', '.zp-zoom', '.zp-here', '.zp-listen', '.zp-tools', '.zp-progress', '.zp-footer',
    '.zp-pdf-bar', 'script', 'style', 'noscript', 'svg', 'template', '[hidden]', '[data-zp-listen="skip"]'
  ].join(', ')

  var INLINE = {
    A: 1, ABBR: 1, B: 1, BDI: 1, BDO: 1, CITE: 1, CODE: 1, DFN: 1, EM: 1, I: 1, KBD: 1, MARK: 1,
    Q: 1, S: 1, SAMP: 1, SMALL: 1, SPAN: 1, STRONG: 1, SUB: 1, SUP: 1, TIME: 1, U: 1, VAR: 1, WBR: 1
  }

  /* Symbols, units and ranges the way a doctor would say them. Order matters. */
  var REPLACEMENTS = [
    /* arrows and symbols */
    [/\s?\u2192\s?/g, ', then '],
    [/\s?\u2191\s?/g, ' increased '],
    [/\s?\u2193\s?/g, ' decreased '],
    [/\u00B1/g, ' plus or minus '],
    [/\u2265/g, ' greater than or equal to '],
    [/\u2264/g, ' less than or equal to '],
    [/\u2248/g, ' approximately '],
    [/\u00D7/g, ' times '],
    [/\s&\s/g, ' and '],
    [/\s\/\s/g, ' and '],
    /* ions */
    [/\bNa\+/g, 'sodium'],
    [/\bK\+/g, 'potassium'],
    [/\bCa(?:2\+|\+\+)/g, 'calcium'],
    [/\bMg(?:2\+|\+\+)/g, 'magnesium'],
    [/\bCl[-\u2212]/g, 'chloride'],
    [/\bH\+/g, 'hydrogen ion'],
    /* ranges and negative numbers */
    [/(\d)\s?[\u2013\u2014-]\s?(\d)/g, '$1 to $2'],
    [/(^|[\s(])[\u2212\u2013-](?=\d)/g, '$1minus '],
    /* units after a number */
    [/(\d)\s?%/g, '$1 percent'],
    [/(\d)\s?\u00B0\s?C\b/g, '$1 degrees Celsius'],
    [/(\d)\s?mm\s?Hg\b/g, '$1 millimeters of mercury'],
    [/(\d)\s?mEq\/L\b/g, '$1 milliequivalents per liter'],
    [/(\d)\s?mV\b/g, '$1 millivolts'],
    [/(\d)\s?[\u00B5\u03BC]m\b/g, '$1 micrometers'],
    [/(\d)\s?nm\b/g, '$1 nanometers'],
    [/(\d)\s?mm\b/g, '$1 millimeters'],
    [/(\d)\s?cm\b/g, '$1 centimeters'],
    [/(\d)\s?m[lL]\b/g, '$1 milliliters'],
    [/(\d)\s?ms\b/g, '$1 milliseconds'],
    [/(\d)\s?kHz\b/g, '$1 kilohertz'],
    [/(\d)\s?Hz\b/g, '$1 hertz'],
    /* short forms */
    [/\be\.g\.,?/gi, 'for example,'],
    [/\bi\.e\.,?/gi, 'that is,'],
    [/\bvs\.?(?=\s)/gi, 'versus'],
    [/\bapprox\./gi, 'approximately'],
    [/\bRt\./g, 'right'],
    [/\bLt\./g, 'left']
  ]

  var items = []
  var sections = []
  var sectionCount = 0

  /* ---------- text helpers ---------- */
  function clean(text) {
    var s = String(text).replace(/[\u00AD\u200B-\u200D\uFEFF]/g, '')
    WORDS.forEach(function (pair) {
      var safe = pair[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      s = s.replace(new RegExp('\\b' + safe + '\\b', 'g'), pair[1])
    })
    REPLACEMENTS.forEach(function (pair) { s = s.replace(pair[0], pair[1]) })
    return s
      .replace(/\s+/g, ' ')
      .replace(/\s+([,.;:!?])/g, '$1')
      .replace(/([.!?])\s*\.(?!\.)/g, '$1')
      .replace(/,\s*,/g, ',')
      .replace(/^[,;\s]+/, '')
      .trim()
  }

  /* cleaned text that always ends with a full stop, so the voice pauses */
  function sentence(text) {
    var s = clean(text)
    if (s && !/[.!?:;]$/.test(s)) s += '.'
    return s
  }

  /* the text of an element, without anything that is skipped */
  function textOf(node, skipFn) {
    var out = ''
    for (var n = node.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3) {
        out += n.nodeValue
        continue
      }
      if (n.nodeType !== 1) continue
      if (n.matches(SKIP) || (skipFn && skipFn(n))) continue
      if (n.tagName === 'BR') {
        out += ' '
        continue
      }
      var inner = textOf(n, skipFn)
      out += INLINE[n.tagName] ? inner : ' ' + inner + ' '
    }
    return out
  }

  function val(node) {
    return node ? clean(textOf(node)) : ''
  }

  function each(list, fn) {
    Array.prototype.forEach.call(list, fn)
  }

  function all(parent, selector) {
    return [].slice.call(parent.querySelectorAll(selector))
  }

  function push(el, text, wait) {
    var spoken = sentence(text)
    if (!/[A-Za-z0-9]/.test(spoken)) return
    items.push({ el: el, text: spoken, wait: wait || 0, sec: sections.length - 1 })
  }

  /* ---------- how each part of a lesson is spoken ---------- */
  function meta(el) {
    var lesson = val(el.querySelector('#zp-lesson')) || clean(document.title)
    var rest = [val(el.querySelector('#zp-module')), val(el.querySelector('#zp-subject'))].filter(Boolean)
    push(el, lesson + (rest.length ? '. ' + rest.join(', ') : ''))
  }

  function glance(el) {
    var lead = el.querySelector('.zp-glance-lead')
    if (lead) push(lead, textOf(lead))
    each(el.querySelectorAll('.zp-glance-item'), function (item) {
      push(item, val(item.querySelector('.zp-glance-value')) + ' ' + val(item.querySelector('.zp-glance-label')))
    })
  }

  function short(el) {
    var label = el.firstElementChild
    var isLabel = function (n) { return n === label }
    push(el, (label ? val(label) + '. ' : '') + textOf(el, isLabel))
  }

  function chain(el) {
    push(el, all(el, '.zp-chain-node').map(val).join(', then '))
  }

  function effect(el) {
    var parts = all(el, '.zp-effect-step').map(function (step) {
      var text = val(step)
      var dir = step.getAttribute('data-dir')
      if (!/increas|decreas|rise|fall/i.test(text)) {
        if (dir === 'up') text += ' increased'
        else if (dir === 'down') text += ' decreased'
      }
      return text
    })
    push(el, parts.join(', then '))
  }

  function cycle(el) {
    var names = all(el, '.zp-cycle-node').map(val)
    var center = val(el.querySelector('.zp-cycle-center'))
    push(el, (center ? center + ': ' : '') + names.join(', then ') + ', and back to the start')
  }

  function flow(el) {
    var number = 0
    each(el.children, function (li) {
      if (li.tagName !== 'LI') return
      number += 1
      var title = li.querySelector('.zp-flow-title')
      if (title) push(title, 'Step ' + number + '. ' + textOf(title))
      each(li.children, function (child) {
        if (child !== title) visit(child)
      })
    })
  }

  function flip(el) {
    push(el, val(el.querySelector('.zp-flip-front')) + ': ' + val(el.querySelector('.zp-flip-back')))
  }

  /* the question is read, then a short silence to think, then the answer.
     The card is not opened, so the "all checks done" progress is not touched. */
  function recall(el) {
    var summary = el.querySelector('summary')
    var answer = el.querySelector('.zp-recall-answer')
    push(el, 'Quick check. ' + (summary ? textOf(summary) : ''), answer ? RECALL_WAIT : 0)
    if (answer) push(el, 'Answer. ' + textOf(answer))
  }

  function layers(el) {
    var start = el.getAttribute('data-start')
    var end = el.getAttribute('data-end')
    if (start && end) push(el, 'From ' + start.toLowerCase() + ' to ' + end.toLowerCase())
    var number = 0
    each(el.children, function (li) {
      if (li.tagName !== 'LI') return
      number += 1
      var name = val(li.querySelector('.zp-layer-name'))
      var note = val(li.querySelector('.zp-layer-note'))
      push(li, 'Layer ' + number + ': ' + (name || textOf(li)) + (note ? '. ' + note : ''))
    })
  }

  function branch(ul, depth, parent) {
    each(ul.children, function (li) {
      if (li.tagName !== 'LI') return
      var node = null
      var note = null
      var nested = []
      each(li.children, function (child) {
        if (child.classList.contains('zp-tree-node')) node = child
        else if (child.classList.contains('zp-tree-note')) note = child
        else if (child.classList.contains('zp-tree-branch')) nested.push(child)
      })
      var name = node ? val(node) : ''
      var spoken = name
      if (depth > 1 && parent) spoken += ', under ' + parent
      if (note) spoken += ', ' + val(note)
      push(node || li, spoken)
      nested.forEach(function (child) { branch(child, depth + 1, name) })
    })
  }

  function tree(el) {
    each(el.children, function (child) {
      if (child.classList.contains('zp-tree-root')) push(child, textOf(child))
      else if (child.classList.contains('zp-tree-branch')) branch(child, 1, '')
    })
  }

  function bignum(el) {
    var count = el.querySelector('.zp-count')
    var value = count ? val(count) : val(el.querySelector('.zp-bignum-value'))
    push(el, value + ' ' + val(el.querySelector('.zp-bignum-unit')) + ' ' + val(el.querySelector('.zp-bignum-label')))
  }

  function map(el) {
    each(el.querySelectorAll('.zp-map-row'), function (row) {
      push(row, val(row.querySelector('.zp-map-from')) + ': ' + val(row.querySelector('.zp-map-to')))
    })
  }

  function range(el) {
    var scale = all(el, '.zp-range-scale span').map(val)
    var parts = [val(el.querySelector('.zp-range-title'))]
    if (scale.length > 1) parts.push('Scale from ' + scale[0] + ' to ' + scale[scale.length - 1])
    parts = parts.concat(all(el, '.zp-range-legend span').map(val))
    push(el, parts.filter(Boolean).join('. '))
  }

  function rule(el) {
    push(el, [
      val(el.querySelector('.zp-rule-label')),
      val(el.querySelector('.zp-rule-text')),
      val(el.querySelector('.zp-rule-note'))
    ].filter(Boolean).join('. '))
  }

  /* one row at a time: the first cell, then each other cell with its column heading */
  function table(el) {
    var heads = all(el, 'thead th').map(val)
    var rows = all(el, 'tbody tr')
    if (!rows.length) rows = all(el, 'tr')
    rows.forEach(function (row) {
      var cells = [].filter.call(row.children, function (c) { return c.tagName === 'TD' || c.tagName === 'TH' })
      if (!cells.length) return
      var first = val(cells[0])
      var rest = cells.slice(1).map(function (cell, i) {
        var text = val(cell)
        return heads[i + 1] ? heads[i + 1] + ': ' + text : text
      }).filter(Boolean)
      push(row, first + (rest.length ? '. ' + rest.join('. ') : ''))
    })
  }

  var HANDLERS = [
    ['.zp-meta', meta],
    ['.zp-glance', glance],
    ['.zp-short', short],
    ['.zp-chain', chain],
    ['.zp-effect', effect],
    ['.zp-cycle', cycle],
    ['ol.zp-flow', flow],
    ['.zp-flip', flip],
    ['details.zp-recall', recall],
    ['.zp-layers', layers],
    ['.zp-tree', tree],
    ['.zp-bignum', bignum],
    ['.zp-map', map],
    ['.zp-range', range],
    ['.zp-rule', rule],
    ['table.zp-table', table]
  ]

  function startSection(el) {
    var heading = el.querySelector('h2')
    var isKeyPoints = el.classList.contains('zp-keypoints')
    if (!isKeyPoints) sectionCount += 1
    sections.push({
      title: heading ? val(heading) : '',
      number: isKeyPoints ? 0 : sectionCount,
      item: items.length,
      el: el
    })
  }

  function isList(node) {
    return node.tagName === 'UL' || node.tagName === 'OL'
  }

  function visit(el) {
    if (!el || el.nodeType !== 1 || el.matches(SKIP)) return

    for (var i = 0; i < HANDLERS.length; i++) {
      if (el.matches(HANDLERS[i][0])) {
        HANDLERS[i][1](el)
        return
      }
    }

    if (el.classList.contains('zp-section') || el.classList.contains('zp-keypoints')) startSection(el)

    var tag = el.tagName
    if (tag === 'H2' || tag === 'H3' || tag === 'H4' || tag === 'P') {
      push(el, textOf(el))
      return
    }

    /* a list item says its own text, then its nested lists are read */
    if (tag === 'LI') {
      push(el, textOf(el, isList))
      each(el.children, function (child) {
        if (isList(child)) visit(child)
      })
      return
    }

    var hasBlocks = false
    each(el.children, function (child) {
      if (!INLINE[child.tagName]) hasBlocks = true
    })

    if (!hasBlocks) {
      push(el, textOf(el))
      return
    }

    each(el.children, function (child) { visit(child) })
  }

  function lessonTitle() {
    var node = document.getElementById('zp-lesson')
    return (node ? val(node) : '') || clean(document.title)
  }

  /* builds a fresh list every time, so it always matches the page as it is now */
  function build() {
    items = []
    sections = []
    sectionCount = 0
    var header = document.querySelector('.zp-meta')
    if (header) visit(header)
    var main = document.querySelector('main')
    if (main) each(main.children, function (child) { visit(child) })
    return { items: items, sections: sections, title: lessonTitle() }
  }

  window.zpReading = { build: build, clean: clean }
})()
