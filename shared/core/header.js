/* HEADER: puts the fixed ZNU Pulse icon into the empty icon holder of every lesson. */
(function () {
  var ICON = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1039 1024" fill="none">
  <defs>
    <filter id="contactShadow" x="-12%" y="-12%" width="140%" height="145%" color-interpolation-filters="sRGB">
      <feGaussianBlur in="SourceAlpha" stdDeviation="5.5" result="softEdge"/>
      <feOffset in="softEdge" dx="8" dy="15" result="offset"/>
      <feColorMatrix in="offset" type="matrix" values="0 0 0 0 0.005 0 0 0 0 0.055 0 0 0 0 0.14 0 0 0 .48 0"/>
    </filter>

    <filter id="ambientShadow" x="-16%" y="-16%" width="150%" height="155%" color-interpolation-filters="sRGB">
      <feGaussianBlur in="SourceAlpha" stdDeviation="14" result="wideEdge"/>
      <feOffset in="wideEdge" dx="10" dy="19" result="offset"/>
      <feColorMatrix in="offset" type="matrix" values="0 0 0 0 0.005 0 0 0 0 0.045 0 0 0 0 0.12 0 0 0 .43 0"/>
    </filter>

    <path id="ecgCentreline" d="
      M134 536 H193
      C210 536 217 529 228 514
      C235 504 240 498 246 498
      C253 498 258 509 264 523
      C272 542 279 564 294 566
      C309 570 316 552 322 532
      L342 450
      C345 438 349 431 355 431
      C361 431 365 442 369 455
      L383 507
      C386 519 392 524 403 525
      C419 525 424 536 428 550
      L451 624 L527 191 L607 711 L648 568
      C651 559 656 557 664 559
      C676 562 685 570 695 563
      C706 554 710 531 717 510
      C723 489 731 473 741 472
      C753 470 761 488 769 505
      C776 521 781 532 793 535
      C804 538 811 528 821 526
      C832 523 843 534 853 536
      H909"/>
  </defs>

  <use href="#ecgCentreline"
    stroke="#02152e"
    stroke-width="25"
    stroke-linecap="round"
    stroke-linejoin="round"
    filter="url(#ambientShadow)"/>

  <use href="#ecgCentreline"
    stroke="#011630"
    stroke-width="25"
    stroke-linecap="round"
    stroke-linejoin="round"
    filter="url(#contactShadow)"/>

  <use href="#ecgCentreline"
    stroke="#ebf9ff"
    stroke-width="25"
    stroke-linecap="round"
    stroke-linejoin="round"/>
</svg>`

  function init() {
    var holder = document.querySelector('.zp-meta-icon')
    if (holder && !holder.firstElementChild) holder.innerHTML = ICON
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
