/* ZNU Pulse shared script: entry file.
   Every lesson links only to this file, inside the head.
   To add or remove a shared script, edit the list on the first line of code below.
   Keep that list on a single line. The offline saving code in the app reads it. */
var ZNU_PULSE_FILES = ['core/header.js', 'core/celebrate.js', 'listen/speech.js', 'listen/reading.js', 'listen/listen.js', 'tools/tools.js', 'draw/draw.js', 'motion/motion.js', 'components/cycle.js', 'components/flip.js', 'components/recall.js', 'components/tables.js', 'study/study.js', 'resume/resume.js', 'station/station.js', 'progress/progress.js', 'footer/footer.js', 'print/pdf.js']

;(function () {
  var current = document.currentScript
  if (!current || !current.src) return

  var base = current.src.replace(/[^\/]*$/, '')

  ZNU_PULSE_FILES.forEach(function (file) {
    var script = document.createElement('script')
    script.src = base + file
    script.async = false
    document.head.appendChild(script)
  })
})()
