/* PDF VIEW: when a lesson is opened with #print (the Save as PDF button does this), lay it out
   as numbered A4 pages, then open the print dialog. The pages carry their own numbers (1, 2, 3...)
   and have no margin of their own, so the browser adds no header or footer (no web address, no date).
   Circular diagrams rest at their default place. */
(function () {
  var root = document.documentElement
  if (!root.classList.contains('zp-print-view')) return

  var MM = 96 / 25.4
  var PAGE_HEIGHT = 296 * MM
  var CAPACITY = PAGE_HEIGHT - (14 + 22) * MM
  var STICKY = /^(H2|H3|H4)$/

  function isSticky(node) {
    return STICKY.test(node.tagName) ||
      node.classList.contains('zp-source') ||
      node.classList.contains('zp-short')
  }

  /* page size and a layout as wide as an A4 page, so phones lay it out like a desktop */
  function prepare() {
    var style = document.createElement('style')
    style.textContent = '@page { size: A4; margin: 0; }'
    document.head.appendChild(style)

    var meta = document.querySelector('meta[name="viewport"]')
    if (!meta) {
      meta = document.createElement('meta')
      meta.name = 'viewport'
      document.head.appendChild(meta)
    }
    meta.setAttribute('content', 'width=794')
  }

  /* split the lesson into units that are never cut across two pages */
  function collectUnits() {
    var units = []
    var header = document.querySelector('.zp-meta')
    if (header) units.push({ nodes: [header] })

    var main = document.querySelector('main')
    var children = main ? [].slice.call(main.children) : []

    children.forEach(function (child) {
      if (!child.classList.contains('zp-section')) {
        units.push({ nodes: [child] })
        return
      }

      var computed = window.getComputedStyle(child)
      var info = {
        sec: computed.getPropertyValue('--sec').trim(),
        soft: computed.getPropertyValue('--sec-soft').trim(),
        icon: computed.getPropertyValue('--ic').trim()
      }

      var group = []
      var first = true
      ;[].slice.call(child.children).forEach(function (part) {
        if (part.classList.contains('zp-done-btn') || part.classList.contains('zp-recall-progress')) return
        group.push(part)
        if (isSticky(part)) return
        units.push({ nodes: group, section: info, first: first })
        first = false
        group = []
      })
      if (group.length) units.push({ nodes: group, section: info, first: first })
    })

    var footer = document.querySelector('footer.zp-footer')
    if (footer) units.push({ nodes: [footer] })
    return units
  }

  function wrap(unit) {
    if (!unit.section) return unit.nodes[0]
    var wrapper = document.createElement('section')
    wrapper.className = unit.first ? 'zp-section' : 'zp-section zp-sec-part'
    if (unit.section.sec) wrapper.style.setProperty('--sec', unit.section.sec)
    if (unit.section.soft) wrapper.style.setProperty('--sec-soft', unit.section.soft)
    if (unit.section.icon) wrapper.style.setProperty('--ic', unit.section.icon)
    unit.nodes.forEach(function (node) { wrapper.appendChild(node) })
    return wrapper
  }

  function paginate(units) {
    var sheets = document.createElement('div')
    sheets.className = 'zp-sheets'
    document.body.appendChild(sheets)

    var pageMain = null

    function newPage() {
      var sheet = document.createElement('div')
      sheet.className = 'zp-sheet'
      pageMain = document.createElement('main')
      sheet.appendChild(pageMain)
      sheets.appendChild(sheet)
    }

    newPage()

    units.forEach(function (unit) {
      var element = wrap(unit)
      pageMain.appendChild(element)

      if (pageMain.scrollHeight > CAPACITY && pageMain.children.length > 1) {
        newPage()
        pageMain.appendChild(element)
      }

      /* a single part taller than a page is scaled down to fit */
      if (pageMain.scrollHeight > CAPACITY) {
        var factor = Math.max(0.55, (CAPACITY - 4) / pageMain.scrollHeight)
        element.style.zoom = String(factor)
      }
    })

    var pages = sheets.querySelectorAll('.zp-sheet')
    for (var i = 0; i < pages.length; i++) {
      var number = document.createElement('div')
      number.className = 'zp-sheet-num'
      number.textContent = String(i + 1)
      pages[i].appendChild(number)
    }
    return pages.length
  }

  function addBar(pageCount) {
    var started = false
    window.addEventListener('beforeprint', function () { started = true })

    var bar = document.createElement('div')
    bar.className = 'zp-pdf-bar'
    var text = document.createElement('span')
    text.textContent = pageCount + (pageCount === 1 ? ' page' : ' pages') + ' ready. Save it as a PDF.'
    var button = document.createElement('button')
    button.type = 'button'
    button.textContent = 'Save as PDF'
    button.addEventListener('click', function () {
      try { window.print() } catch (error) { /* blocked */ }
    })
    bar.appendChild(text)
    bar.appendChild(button)
    document.body.insertBefore(bar, document.body.firstChild)

    setTimeout(function () {
      try { window.print() } catch (error) { /* blocked */ }
      setTimeout(function () {
        if (!started) text.textContent = 'If the print window did not open: tap Share, then Print.'
      }, 1500)
    }, 700)
  }

  function run() {
    var images = [].slice.call(document.images).map(function (image) {
      return image.decode ? image.decode().catch(function () {}) : Promise.resolve()
    })
    var fonts = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()

    Promise.all(images.concat([fonts])).then(function () {
      var checks = document.querySelectorAll('details.zp-recall')
      for (var i = 0; i < checks.length; i++) checks[i].open = true

      var units = collectUnits()
      var main = document.querySelector('main')
      var pageCount = paginate(units)
      if (main && main.parentNode) main.parentNode.removeChild(main)
      addBar(pageCount)
    })
  }

  prepare()

  if (document.readyState === 'complete') {
    setTimeout(run, 400)
  } else {
    window.addEventListener('load', function () { setTimeout(run, 400) })
  }
})()
