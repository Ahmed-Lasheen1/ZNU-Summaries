/* FLIP CARDS: turns a card over when it is tapped. */
(function () {
  document.documentElement.classList.add('zp-flip-on')

  document.addEventListener('click', function (event) {
    var target = event.target
    var card = target && target.closest ? target.closest('.zp-flip') : null
    if (!card) return
    var flipped = card.classList.toggle('is-flipped')
    card.setAttribute('aria-pressed', String(flipped))
  })
})()
