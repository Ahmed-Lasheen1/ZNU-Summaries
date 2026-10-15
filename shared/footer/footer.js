/* FOOTER: builds the footer at the end of every lesson.
   To change the footer text or links, edit FOOTER_HTML below. */
(function () {
  var FOOTER_HTML = `
<div class="zp-footer-inner">
  <div class="zp-footer-brand">ZNU PULSE</div>

  <div class="zp-footer-credit">Designed &amp; built by Ahmed Lasheen</div>

  <div class="zp-footer-actions">
    <a
      class="zp-footer-pill"
      href="https://wa.me/qr/AFP6XCVC2BJHO1"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Contact ZNU Pulse on WhatsApp"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 3.5a8.5 8.5 0 0 0-7.3 12.8L3.5 20.5l4.3-1.2A8.5 8.5 0 1 0 12 3.5Z"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linejoin="round"
        ></path>
        <path
          d="M9 8.7c.15-.4.5-.7.9-.7h.5c.3 0 .55.2.65.5l.5 1.3c.1.25.05.55-.15.75l-.5.55c.4.95 1.2 1.75 2.15 2.15l.55-.5c.2-.2.5-.25.75-.15l1.3.5c.3.1.5.35.5.65v.5c0 .4-.3.75-.7.9-2.6.9-5.6-.5-7-3-.75-1.35-1-2.75-.45-4.03Z"
          fill="currentColor"
        ></path>
      </svg>
      <span>Contact us</span>
    </a>

    <button class="zp-footer-pill" type="button" id="zp-back-top">
      <span aria-hidden="true">&uarr;</span>
      <span>Back to top</span>
    </button>
  </div>

  <div class="zp-footer-copy">&copy; <span id="zp-year"></span> ZNU Pulse</div>
</div>`

  function init() {
    var footer = document.querySelector('footer.zp-footer')

    if (!footer) {
      footer = document.createElement('footer')
      footer.className = 'zp-footer'
      document.body.appendChild(footer)
    }

    if (!footer.firstElementChild) footer.innerHTML = FOOTER_HTML

    var year = footer.querySelector('#zp-year')
    if (year) year.textContent = new Date().getFullYear()

    var backToTop = footer.querySelector('#zp-back-top')
    if (backToTop) {
      backToTop.addEventListener('click', function () {
        window.scrollTo({ top: 0, behavior: 'smooth' })
      })
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
