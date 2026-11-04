/* LISTEN, SPEECH ENGINE: speaks a list of texts out loud with the voices of the browser.
   It knows nothing about the lesson page. reading.js decides what is spoken and listen.js shows the player.

   Built around known browser problems:
   - Long text is spoken one short sentence at a time, because some voices cut out after about 15 seconds.
   - One sentence is spoken at a time and the next one starts when it ends.
   - Pause stops the sound and remembers the place, because pause and resume do not work on every phone.
   - The first sentence is spoken straight inside the tap, because iPhone only allows speech that starts from a tap.
   - Events from a sentence that was cancelled are ignored.
   - A sentence that never starts is tried once more, and one that never ends is moved past.
   If the browser cannot speak, window.zpSpeech.supported is false and nothing else happens. */
(function () {
  var synth = window.speechSynthesis
  var supported = !!(synth && typeof window.SpeechSynthesisUtterance === 'function')

  var CHUNK_MAX = 170      /* longest piece of text spoken at once, in characters */
  var START_WAIT = 4000    /* milliseconds to wait for a sentence to start before trying once more */
  var AFTER_CANCEL = 60    /* milliseconds between cancelling and speaking again (Safari needs this) */

  /* ---------- voices ---------- */
  var voiceList = []
  var voiceWatchers = []

  function readVoices() {
    var found = []
    try { found = synth.getVoices() || [] } catch (error) { found = [] }
    if (!found.length || found.length === voiceList.length) return
    voiceList = [].slice.call(found)
    voiceWatchers.slice().forEach(function (fn) {
      try { fn(voiceList) } catch (error) { /* a broken listener must not stop the others */ }
    })
  }

  /* Voices often load a moment after the page. Safari has no addEventListener for this event,
     so the property is used, and a short check runs as a safety net. */
  function watchVoices() {
    readVoices()
    try { synth.onvoiceschanged = readVoices } catch (error) { /* ignore */ }
    var tries = 0
    var timer = setInterval(function () {
      readVoices()
      tries += 1
      if (voiceList.length || tries > 20) clearInterval(timer)
    }, 250)
  }

  function voices() {
    return voiceList.slice()
  }

  function onVoices(fn) {
    voiceWatchers.push(fn)
    if (voiceList.length) fn(voiceList)
  }

  function isEnglish(voice) {
    return /^en([-_]|$)/i.test(voice.lang || '')
  }

  function english(list) {
    return list.filter(isEnglish)
  }

  /* Novelty and joke voices that Apple devices list (the "Eloquence" group on iPhone and iPad and the old
     Mac fun voices). They sound bad for study, so they are pushed to the bottom of the list. */
  var NOVELTY = /^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Deranged|Good News|Hysterical|Junior|Organ|Princess|Ralph|Trinoids|Whisper|Wobble|Zarvox|Fred|Superstar|Eddy|Flo|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley)\b/i

  /* A rough quality guess used to put the best voices first. The student can always pick another. */
  function score(voice) {
    var points = 0
    var name = voice.name || ''
    if (NOVELTY.test(name)) points -= 20
    var lang = String(voice.lang || '').replace('_', '-')
    if (/natural|neural|premium|enhanced/i.test(name)) points += 5
    if (/google/i.test(name)) points += 2
    if (/^en-US$/i.test(lang)) points += 2
    else if (/^en-GB$/i.test(lang)) points += 1.5
    if (voice.localService) points += 1
    return points
  }

  /* ---------- cutting text into sentences ---------- */
  function splitLong(piece) {
    var parts = []
    var rest = piece
    while (rest.length > CHUNK_MAX) {
      var cut = -1
      for (var i = CHUNK_MAX; i > CHUNK_MAX * 0.4; i--) {
        if (rest.charAt(i) === ' ' && /[;:,]/.test(rest.charAt(i - 1))) {
          cut = i
          break
        }
      }
      if (cut < 0) cut = rest.lastIndexOf(' ', CHUNK_MAX)
      if (cut < 1) cut = CHUNK_MAX
      parts.push(rest.slice(0, cut).trim())
      rest = rest.slice(cut).trim()
    }
    if (rest) parts.push(rest)
    return parts
  }

  function split(text) {
    var marked = String(text).replace(/([.!?]["')\]]*)\s+(?=[A-Z"'(])/g, '$1\u0001')
    var out = []
    marked.split('\u0001').forEach(function (sentence) {
      var trimmed = sentence.trim()
      if (trimmed) splitLong(trimmed).forEach(function (part) { out.push(part) })
    })
    return out
  }

  /* ---------- the player ---------- */
  function createPlayer() {
    var items = []         /* [{ chunks: [...], wait: milliseconds of silence after the item }] */
    var item = 0
    var chunk = 0
    var state = 'idle'     /* idle, playing or paused */
    var ended = false
    var rate = 1
    var voice = null
    var token = 0          /* changes whenever speech is stopped, so late events can be ignored */
    var serial = 0
    var activeId = 0
    var timer = null
    var guard = null
    var current = null     /* keeps the sentence alive, some browsers lose it otherwise */
    var handlers = { item: [], state: [], end: [], error: [] }

    function emit(name, value) {
      handlers[name].slice().forEach(function (fn) {
        try { fn(value) } catch (error) { /* ignore */ }
      })
    }

    function on(name, fn) {
      if (handlers[name]) handlers[name].push(fn)
    }

    function setState(next) {
      if (state === next) return
      state = next
      emit('state', next)
    }

    function clamp(index) {
      return Math.max(0, Math.min(items.length - 1, index))
    }

    /* stops the sound and every waiting timer; the place in the text is kept */
    function halt(keepSound) {
      token += 1
      activeId = 0
      clearTimeout(timer)
      clearTimeout(guard)
      timer = null
      guard = null
      current = null
      if (!keepSound) {
        try { synth.cancel() } catch (error) { /* ignore */ }
      }
    }

    function fail(reason) {
      halt()
      setState('paused')
      emit('error', reason || 'error')
    }

    function finish() {
      halt()
      ended = true
      chunk = 0
      setState('idle')
      emit('end')
    }

    function advance(mine) {
      if (mine !== token) return
      clearTimeout(guard)
      var entry = items[item]
      if (chunk + 1 < entry.chunks.length) {
        chunk += 1
        speak(mine, 0)
        return
      }
      var next = function () {
        if (mine !== token) return
        if (item + 1 >= items.length) {
          finish()
          return
        }
        item += 1
        chunk = 0
        emit('item', item)
        speak(mine, 0)
      }
      if (entry.wait) timer = setTimeout(next, entry.wait)
      else next()
    }

    function speak(mine, attempt) {
      if (mine !== token || !items[item]) return
      var text = items[item].chunks[chunk]
      var utterance = new window.SpeechSynthesisUtterance(text)
      if (voice) {
        utterance.voice = voice
        utterance.lang = voice.lang || 'en-US'
      } else {
        utterance.lang = 'en-US'
      }
      utterance.rate = rate
      utterance.pitch = 1
      utterance.volume = 1

      serial += 1
      var id = serial
      activeId = id
      var started = false

      utterance.onstart = function () {
        if (mine !== token || id !== activeId) return
        started = true
        clearTimeout(guard)
        /* if the end never arrives, move on after a generous time */
        guard = setTimeout(function () {
          if (mine === token && id === activeId) advance(mine)
        }, 8000 + (text.length / (11 * rate)) * 2000)
      }

      utterance.onend = function () {
        if (mine === token && id === activeId) advance(mine)
      }

      utterance.onerror = function (event) {
        if (mine !== token || id !== activeId) return
        var reason = event && event.error
        if (reason === 'interrupted' || reason === 'canceled') return
        fail(reason)
      }

      current = utterance

      /* if the sentence never starts, try once more, then give up */
      clearTimeout(guard)
      guard = setTimeout(function () {
        if (mine !== token || id !== activeId || started) return
        if (attempt < 1) {
          activeId = 0
          try { synth.cancel() } catch (error) { /* ignore */ }
          timer = setTimeout(function () { speak(mine, attempt + 1) }, AFTER_CANCEL)
        } else {
          fail('not-allowed')
        }
      }, START_WAIT)

      try {
        if (synth.paused) synth.resume()
        synth.speak(utterance)
      } catch (error) {
        fail('error')
      }
    }

    /* starts speaking from the current place */
    function begin() {
      var busy = false
      try { busy = !!(synth.speaking || synth.pending) } catch (error) { busy = false }
      halt(!busy)
      setState('playing')
      var mine = token
      if (busy) {
        timer = setTimeout(function () { speak(mine, 0) }, AFTER_CANCEL)
      } else {
        /* nothing was playing: speak at once, so the tap that started it still counts */
        speak(mine, 0)
      }
    }

    function load(list) {
      halt()
      items = list.map(function (entry) {
        var chunks = split(entry.text)
        return { chunks: chunks.length ? chunks : [String(entry.text)], wait: entry.wait || 0 }
      })
      item = 0
      chunk = 0
      ended = false
      setState('idle')
    }

    function play(index) {
      if (!items.length) return
      if (typeof index === 'number') {
        item = clamp(index)
        chunk = 0
        ended = false
        emit('item', item)
      } else if (ended) {
        item = 0
        chunk = 0
        ended = false
        emit('item', item)
      }
      begin()
    }

    function pause() {
      if (state !== 'playing') return
      halt()
      setState('paused')
    }

    function stop() {
      halt()
      ended = false
      setState('idle')
    }

    function seek(index) {
      if (!items.length) return
      item = clamp(index)
      chunk = 0
      ended = false
      emit('item', item)
      if (state === 'playing') begin()
      else setState('paused')
    }

    function setRate(value) {
      rate = value
      if (state === 'playing') begin()
    }

    function setVoice(value) {
      if (value === voice) return
      voice = value
      if (state === 'playing') begin()
    }

    return {
      load: load,
      play: play,
      pause: pause,
      stop: stop,
      seek: seek,
      setRate: setRate,
      setVoice: setVoice,
      on: on,
      state: function () { return state },
      position: function () { return item },
      count: function () { return items.length }
    }
  }

  window.zpSpeech = {
    supported: supported,
    voices: voices,
    onVoices: onVoices,
    english: english,
    score: score,
    split: split,
    createPlayer: createPlayer
  }

  if (supported) watchVoices()
})()
