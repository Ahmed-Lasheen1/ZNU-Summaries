/* PDF VIEW: when a lesson is opened with #print (the Save as PDF button does this), lay it out
   as numbered A4 pages. A "Download PDF" button then builds the file and saves it, without
   opening the print dialog. The pages carry their own numbers (1, 2, 3...) and have no margin
   of their own, so the browser adds no header or footer. */
(function () {
  var root = document.documentElement
  if (!root.classList.contains('zp-print-view')) return

  var MM = 96 / 25.4
  var PAGE_HEIGHT = 296 * MM
  var CAPACITY = PAGE_HEIGHT - (14 + 22) * MM
  var STICKY = /^(H2|H3|H4)$/

  var CDN = 'https://cdnjs.cloudflare.com/ajax/libs/'
  var LIBRARIES = [
    CDN + 'html2canvas/1.4.1/html2canvas.min.js',
    CDN + 'jspdf/2.5.1/jspdf.umd.min.js'
  ]

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

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement('script')
      script.src = src
      script.onload = resolve
      script.onerror = function () { reject(new Error('Could not load ' + src)) }
      document.head.appendChild(script)
    })
  }

  /* loaded only when the person taps Download, so the lesson page stays light */
  function loadLibraries() {
    if (window.html2canvas && window.jspdf) return Promise.resolve()
    return LIBRARIES.reduce(function (chain, src) {
      return chain.then(function () { return loadScript(src) })
    }, Promise.resolve())
  }

  function pdfFileName() {
    var title = document.getElementById('zp-lesson')
    var name = (title ? title.textContent : 'ZNU Pulse lesson')
      .replace(/[\\\/:*?"<>|]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    return name + '.pdf'
  }

  function downloadPdf(button, status) {
    button.disabled = true
    status.textContent = 'Preparing your PDF...'

    loadLibraries().then(function () {
      var pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true })
      var sheets = [].slice.call(document.querySelectorAll('.zp-sheet'))

      /* one page at a time, so a phone does not run out of memory */
      return sheets.reduce(function (chain, sheet, index) {
        return chain.then(function () {
          return window.html2canvas(sheet, {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff',
            logging: false
          }).then(function (canvas) {
            if (index > 0) pdf.addPage()
            pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 296)
            status.textContent = 'Preparing your PDF... ' + (index + 1) + ' of ' + sheets.length
          })
        })
      }, Promise.resolve()).then(function () {
        pdf.save(pdfFileName())
      })
    }).then(function () {
      status.textContent = 'PDF downloaded'
    }, function () {
      status.textContent = 'Could not make the PDF. Check your connection and try again.'
    }).then(function () {
      button.disabled = false
    })
  }

  function addBar(pageCount) {
    var bar = document.createElement('div')
    bar.className = 'zp-pdf-bar'

    var text = document.createElement('span')
    text.textContent = pageCount + (pageCount === 1 ? ' page' : ' pages') + ' ready.'

    var button = document.createElement('button')
    button.type = 'button'
    button.textContent = 'Download PDF'
    button.addEventListener('click', function () { downloadPdf(button, text) })

    bar.appendChild(text)
    bar.appendChild(button)
    document.body.insertBefore(bar, document.body.firstChild)
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
