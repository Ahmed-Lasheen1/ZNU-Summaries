/* THEME SWITCH: applies the saved theme, adds the button, saves the choice.
   Light is the default. Storage calls are wrapped so the page keeps working
   when storage is blocked (for example in saved offline copies). */
(function () {
  var STORAGE_KEY = 'zp-theme'

  var BUTTON_HTML = `
<svg class="zp-sun-icon" viewBox="0 0 24 24" aria-hidden="true">
  <circle cx="12" cy="12" r="4"></circle>
  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"></path>
</svg>
<svg class="zp-moon-icon" viewBox="0 0 24 24" aria-hidden="true">
  <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3 6.7 6.7 0 0 0 21 12.8Z"></path>
</svg>`

  function readSavedTheme() {
    try {
      return localStorage.getItem(STORAGE_KEY)
    } catch (error) {
      return null
    }
  }

  function saveTheme(theme) {
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch (error) {
      /* storage is blocked: the choice just lasts for this visit */
    }
  }

  function applyTheme(theme, button) {
    document.documentElement.dataset.theme = theme
    if (!button) return
    var dark = theme === 'dark'
    button.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode')
    button.setAttribute('aria-pressed', String(dark))
  }

  function init() {
    var button = document.getElementById('zp-theme-toggle')

    if (!button) {
      button = document.createElement('button')
      button.className = 'zp-theme-toggle'
      button.id = 'zp-theme-toggle'
      button.type = 'button'
      button.innerHTML = BUTTON_HTML
      document.body.appendChild(button)
    }

    applyTheme(document.documentElement.dataset.theme || 'light', button)

    button.addEventListener('click', function () {
      var next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'
      applyTheme(next, button)
      saveTheme(next)
    })
  }

  /* Apply the saved theme straight away so the page does not flash light first. */
  applyTheme(readSavedTheme() === 'dark' ? 'dark' : 'light', null)

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
