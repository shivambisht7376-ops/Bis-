gsap.registerPlugin(ScrollTrigger);

const clamp01 = v => Math.min(1, Math.max(0, v));
const FADE = 0.03;
const win = (p, a, b) => Math.min(clamp01((p - a) / FADE), clamp01((b - p) / FADE));

/* ---------- smooth scroll ---------- */
const lenis = new Lenis({ lerp: 0.08, smoothWheel: true });
window.lenis = lenis;
lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add(t => lenis.raf(t * 1000));
gsap.ticker.lagSmoothing(0);

/* ---------- a scroll-scrubbed video scene ----------
   The real video file is downloaded into memory (so seeking is instant and
   full quality, with no image-frame compression) and its currentTime is
   driven by scroll position. */
function createScene(el) {
  const video = el.querySelector('video');
  const url = el.dataset.video;
  video.muted = true; video.playsInline = true; video.preload = 'auto'; video.pause();

  let duration = 0, progress = 0, cur = 0, lastSet = -1;

  const hero = el.querySelector('.hero');
  const hint = el.querySelector('.scroll-hint');
  const line = el.querySelector('.progress-line span');
  const stat = el.querySelector('.stat');
  const statNum = el.querySelector('#statNum');
  const chapters = [...el.querySelectorAll('.chapter')];

  async function load(onProgress) {
    try {
      const res = await fetch(url);
      const total = +res.headers.get('Content-Length') || 0;
      const reader = res.body.getReader();
      const chunks = []; let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value); got += value.length;
        if (onProgress && total) onProgress(got / total);
      }
      video.src = URL.createObjectURL(new Blob(chunks, { type: 'video/mp4' }));
    } catch {
      video.src = url; // fallback: let the browser stream it
    }
    await new Promise(res => {
      const ok = () => { duration = video.duration || 0; res(); };
      if (video.readyState >= 2) return ok();
      video.addEventListener('loadeddata', ok, { once: true });
      video.addEventListener('error', res, { once: true });
      video.load();
    });
    video.pause();
    onProgress && onProgress(1);
  }

  // eased seeking, runs every frame
  function tick() {
    if (!duration) return;
    const target = progress * Math.max(0, duration - 0.05);
    cur += (target - cur) * 0.2;
    if (Math.abs(target - cur) < 0.002) cur = target;
    if (Math.abs(cur - lastSet) > 0.004 && (!video.seeking || Math.abs(cur - lastSet) > 0.25)) {
      video.currentTime = cur; lastSet = cur;
    }
  }

  function update(p) {
    progress = p;
    if (hero) {
      const h = clamp01(1 - p / 0.1);
      hero.style.opacity = h;
      hero.style.transform = `translateY(${(1 - h) * -40}px)`;
      hero.style.visibility = h > 0 ? 'visible' : 'hidden';
    }
    chapters.forEach(c => {
      const o = win(p, +c.dataset.in, +c.dataset.out);
      c.style.visibility = o > 0 ? 'visible' : 'hidden';
      [...c.children].forEach((child, i) => {
        const v = clamp01(o * 1.9 - i * 0.28);
        child.style.opacity = v;
        child.style.transform = `translateY(${(1 - v) * 34}px)`;
        child.style.filter = v < 1 ? `blur(${(1 - v) * 6}px)` : 'none';
      });
    });
    if (line) line.style.height = (p * 100) + '%';
    if (hint) hint.style.opacity = p > 0.9 ? 0 : 1;
    if (stat) {
      const so = clamp01((p - 0.9) / 0.05);
      stat.style.opacity = so;
      stat.style.visibility = so > 0 ? 'visible' : 'hidden';
      statNum.textContent = Math.round(clamp01((p - 0.9) / 0.1) * 150);
    }
  }

  function init() {
    ScrollTrigger.create({
      trigger: el, start: 'top top', end: 'bottom bottom', scrub: true,
      onUpdate: self => update(self.progress)
    });
    gsap.ticker.add(tick);
    update(0);
  }
  return { el, load, init };
}

const scenes = [...document.querySelectorAll('.scene')].map(createScene);

/* ---------- menu & anchor navigation ---------- */
const menu = document.getElementById('menu');
document.getElementById('menuBtn').onclick = () => { menu.classList.add('open'); lenis.stop(); };
const closeMenu = () => { menu.classList.remove('open'); lenis.start(); };
document.getElementById('menuClose').onclick = closeMenu;

document.querySelectorAll('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
  const id = a.getAttribute('href');
  e.preventDefault();
  if (menu.contains(a)) closeMenu();
  let target;
  if (id === '#top') target = 0;
  else {
    const node = document.querySelector(id);
    if (!node) return;
    if (node.classList.contains('chapter')) {
      // scroll to the middle of this chapter inside its scene
      const sc = node.closest('.scene');
      const p = (+node.dataset.in + +node.dataset.out) / 2;
      target = sc.offsetTop + p * (sc.offsetHeight - innerHeight);
    } else if (node.classList.contains('scene')) {
      target = node.offsetTop + 2;
    } else target = node;
  }
  lenis.scrollTo(target, { duration: 1.6 });
}));

/* ---------- boot ---------- */
const loaderBar = document.getElementById('loaderBar');
const loaderPct = document.getElementById('loaderPct');
lenis.stop();
scenes[0].load(p => {
  loaderBar.style.width = (p * 100) + '%';
  loaderPct.textContent = Math.round(p * 100);
}).then(() => {
  scenes.forEach(s => s.init());
  gsap.to('#loader', { opacity: 0, duration: .8, delay: .3, onComplete: () => {
    document.getElementById('loader').style.display = 'none';
    lenis.start();
  }});
  gsap.from('.hero h1', { y: 70, opacity: 0, filter: 'blur(8px)', duration: 1.4, delay: .5, ease: 'power3.out' });
  gsap.from('.hero p, .hero .btn', { y: 36, opacity: 0, filter: 'blur(6px)', duration: 1.1, delay: .95, stagger: .18, ease: 'power3.out', clearProps: 'filter,transform' });
  // stream the remaining scenes in the background
  scenes.slice(1).forEach(s => s.load());
});
