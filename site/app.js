// Kixo website — progressive enhancement only; the page works without JS.
const $ = (s, el = document) => el.querySelector(s)
const $$ = (s, el = document) => [...el.querySelectorAll(s)]

// Latest release: point download buttons at the real .exe files.
fetch('https://api.github.com/repos/achrafthedev/kixo/releases/latest')
  .then((r) => (r.ok ? r.json() : Promise.reject()))
  .then((rel) => {
    const find = (re) => rel.assets.find((a) => re.test(a.name))
    const setup = find(/^Kixo-Setup-.*\.exe$/)
    const portable = find(/^Kixo-Portable-.*\.exe$/)
    for (const el of $$('[data-dl="setup"]')) if (setup) el.href = setup.browser_download_url
    for (const el of $$('[data-dl="portable"]')) if (portable) el.href = portable.browser_download_url
    for (const el of $$('[data-version]')) el.textContent = rel.tag_name
    if (setup) for (const el of $$('[data-size]')) el.textContent = `${Math.round(setup.size / 1048576)} MB`
  })
  .catch(() => {})

// Showcase streamer: live badge + follower count (same-origin proxy on kixo.app).
fetch('/api/ces4rrs')
  .then((r) => (r.ok ? r.json() : Promise.reject()))
  .then((c) => {
    if (c.livestream) $('[data-live]').hidden = false
    if (c.followers_count) {
      const n = c.followers_count
      $('[data-followers]').textContent = n >= 1000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, '')}K` : n
    }
  })
  .catch(() => {})

// Tour tabs
const tourImg = $('#tour-img')
const tourCap = $('#tour-cap')
for (const btn of $$('.tour-tabs button')) {
  const pre = new Image()
  pre.src = `/assets/shots/${btn.dataset.shot}.webp`
  btn.addEventListener('click', () => {
    $$('.tour-tabs button').forEach((b) => b.classList.toggle('on', b === btn))
    tourImg.style.opacity = 0
    setTimeout(() => {
      tourImg.src = pre.src
      tourCap.textContent = btn.dataset.cap
      tourImg.style.opacity = 1
    }, 150)
  })
}

// Copy buttons
for (const b of $$('[data-copy]')) {
  b.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(b.dataset.copy)
      b.textContent = 'Copied!'
      setTimeout(() => (b.textContent = 'Copy'), 1500)
    } catch {
      /* clipboard blocked */
    }
  })
}

// Overlay builder: kixo.app/overlay?channel=... with a live iframe preview.
const bChan = $('#b-channel')
if (bChan) {
  const frame = $('#overlay-frame')
  const liveTag = $('.scene-live')
  let t = null
  const update = () => {
    const slug =
      bChan.value
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\/(www\.)?kick\.com\//, '')
        .replace(/[^a-z0-9_-]/g, '') || 'yourchannel'
    const q = new URLSearchParams({ channel: slug })
    if ($('#b-fade').value !== '0') q.set('fade', $('#b-fade').value)
    if ($('#b-size').value !== '18') q.set('size', $('#b-size').value)
    if ($('#b-bg').checked) q.set('bg', '1')
    if ($('#b-bots').checked) q.set('bots', '0')
    const url = `https://kixo.app/overlay?${q}`
    $('#b-url').textContent = url
    $('#b-copy').dataset.copy = url
    liveTag.lastChild.textContent = `LIVE · ${slug}`
    clearTimeout(t)
    t = setTimeout(() => {
      q.set('demo', '1')
      frame.src = `/overlay?${q}`
    }, 400)
  }
  for (const id of ['#b-channel', '#b-fade', '#b-size', '#b-bg', '#b-bots']) $(id).addEventListener('input', update)
}

// Scroll reveal
const rev = new IntersectionObserver(
  (entries) => {
    for (const en of entries)
      if (en.isIntersecting) {
        en.target.classList.add('in')
        rev.unobserve(en.target)
      }
  },
  { rootMargin: '0px 0px -60px 0px' }
)
for (const el of $$('.card, .dl-card, .section-head, .two-col > *, .tour, details')) {
  el.classList.add('reveal')
  rev.observe(el)
}
