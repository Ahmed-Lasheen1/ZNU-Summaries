/* TABLES: copies each column heading onto the cells beneath it, so the phone layout
   can show "heading: value" on every card. Needs no extra markup in the lesson. */
(function () {
  function init() {
    var tables = document.querySelectorAll('table.zp-table')
    if (!tables.length) return

    for (var t = 0; t < tables.length; t++) {
      var headings = [].map.call(tables[t].querySelectorAll('thead th'), function (cell) {
        return cell.textContent.trim()
      })
      var rows = tables[t].querySelectorAll('tbody tr')
      for (var r = 0; r < rows.length; r++) {
        var cells = rows[r].children
        for (var c = 0; c < cells.length; c++) {
          if (headings[c] && !cells[c].hasAttribute('data-label')) {
            cells[c].setAttribute('data-label', headings[c])
          }
        }
      }
    }

    document.documentElement.classList.add('zp-cards')
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
