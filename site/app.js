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

// OBS overlay demo — mirrors what Kixo's overlay renders.
const demo = $('#overlay-demo')
if (demo) {
  const e = (n) => `<img src="/assets/emotes/c4-${n}.webp" alt="${n}">`
  const sub = '#53fc18'
  const lines = [
    ['nightowl_ma', '#00C7FF', sub, `BUNNY IS BACK ${e('hi')}`],
    ['bunny_fan212', '#FF6BD6', '#ff9d00', `${e('pog')} ${e('pog')} that chase!!`],
    ['lfakir', '#FFB020', '#1f9f6f', `salam C4 family ${e('love')}`],
    ['kenitra_king', '#4DD0E1', sub, `Just one more game 👑`],
    ['sara.gta', '#A970FF', sub, `6 months with the C4 family ${e('love')}`],
    ['youssef_exe', '#9CFF57', null, `no way he got away ${e('noway')}`],
    ['hamza_lv', '#FF5C5C', null, `${e('lol')} ${e('lol')}`],
    ['zak_c4', '#53FC18', '#00c7ff', `GG ${e('gg')} best RP on Kick`],
    ['moha.rp', '#FFD54F', sub, `Bunny is cooking tonight ${e('oh')}`],
    ['salma_x', '#F48FB1', null, `W stream ${e('good')}`]
  ]
  let i = 0
  const push = () => {
    const [name, color, badge, html] = lines[i++ % lines.length]
    const row = document.createElement('div')
    row.className = 'ov'
    row.innerHTML = `${badge ? `<span class="b" style="background:${badge}"></span>` : ''}<span class="n" style="color:${color}">${name}</span>: ${html}`
    demo.append(row)
    while (demo.children.length > 7) demo.firstChild.remove()
  }
  for (let k = 0; k < 4; k++) push()
  let timer = null
  const io = new IntersectionObserver(([en]) => {
    clearInterval(timer)
    if (en.isIntersecting) timer = setInterval(push, 1600)
  })
  io.observe(demo)
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
