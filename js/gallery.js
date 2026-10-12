/* Service gallery: click a service card to open images/videos incl. before/after sliders.
   To use your real files, edit the SERVICES list below (paths are relative to the site root). */
(function () {
  const G = 'assets/gallery/';
  // item types: 'ba-img' (before/after image), 'ba-vid' (before/after video), 'img', 'vid'
  // For ba-* items give {before, after}; if "before" is omitted, a clay/grayscale version of "after" is shown.
  const SERVICES = [
    { desc: 'Photorealistic stills and photo-matched montages. Drag the slider to compare the raw model with the final render.', items: [
      { type: 'ba-img', after: G + 'exterior-1.jpg', caption: 'Tower facade - model vs final render' },
      { type: 'ba-img', after: G + 'exterior-4.jpg', caption: 'Entrance - model vs final render' },
      { type: 'img', src: G + 'exterior-5.jpg', caption: 'Final CGI still' } ] },
    { desc: 'Cinematic lifestyle films that show how people live in and move through your space.', items: [
      { type: 'ba-vid', after: G + 'clip-i1.mp4', caption: 'Living space - draft vs final animation' },
      { type: 'vid', src: G + 'clip-i2.mp4', caption: 'Lifestyle walkthrough' },
      { type: 'ba-img', after: G + 'interior-2.jpg', caption: 'Interior - model vs final render' } ] },
    { desc: 'Studio-quality renders and animations that make products look irresistible.', items: [
      { type: 'ba-img', after: G + 'interior-3.jpg', caption: 'Product scene - base vs final lighting' },
      { type: 'img', src: G + 'interior-1.jpg', caption: 'Product still' },
      { type: 'vid', src: G + 'clip-i1.mp4', caption: 'Product animation' } ] },
    { desc: 'Green-screen filming composited into your 3D worlds for lifelike presenter and lifestyle scenes.', items: [
      { type: 'ba-vid', after: G + 'clip-w1.mp4', caption: 'Raw shoot vs composited scene' },
      { type: 'ba-img', after: G + 'walkthrough-3.jpg', caption: 'Plate vs final composite' },
      { type: 'vid', src: G + 'clip-w2.mp4', caption: 'Final composite' } ] },
    { desc: 'Immersive panoramas and VR tours your clients can explore from any device.', items: [
      { type: 'img', src: G + 'walkthrough-2.jpg', caption: 'VR panorama preview' },
      { type: 'ba-img', after: G + 'walkthrough-5.jpg', caption: 'Model vs final render' },
      { type: 'vid', src: G + 'clip-w1.mp4', caption: 'VR tour capture' } ] },
    { desc: 'Aerial photography and film that capture the site, scale and context.', items: [
      { type: 'ba-vid', after: G + 'clip-e1.mp4', caption: 'Raw footage vs graded final' },
      { type: 'vid', src: G + 'clip-e2.mp4', caption: 'Aerial flythrough' },
      { type: 'ba-img', after: G + 'exterior-2.jpg', caption: 'Site photo vs finished render' } ] },
    { desc: 'Hand-built architectural models with interactive lighting and touch displays.', items: [
      { type: 'ba-img', after: G + 'walkthrough-4.jpg', caption: 'Unlit model vs lit presentation' },
      { type: 'img', src: G + 'interior-2.jpg', caption: 'Scale model detail' },
      { type: 'vid', src: G + 'clip-i2.mp4', caption: 'Interactive lighting demo' } ] }
  ];

  const cards = document.querySelectorAll('.svc');
  if (!cards.length) return;

  const modal = document.createElement('div');
  modal.className = 'gal'; modal.setAttribute('data-lenis-prevent', '');
  modal.innerHTML = '<div class="gal-box" role="dialog" aria-modal="true">' +
    '<button class="gal-close" aria-label="Close">CLOSE &times;</button>' +
    '<div class="gal-head"><div class="gal-n"></div><h3 class="gal-title"></h3><p class="gal-desc"></p></div>' +
    '<div class="gal-stage"></div><div class="gal-cap"></div><div class="gal-thumbs"></div></div>';
  document.body.appendChild(modal);
  const $ = s => modal.querySelector(s);
  const stage = $('.gal-stage'), cap = $('.gal-cap'), thumbs = $('.gal-thumbs');
  let current = null, lastFocus = null;

  function badge(t) { return '<span class="ba-tag ' + t + '">' + (t === 'b' ? 'BEFORE' : 'AFTER') + '</span>'; }

  function slider(inner) {
    const w = document.createElement('div'); w.className = 'ba';
    w.innerHTML = inner + '<div class="ba-handle"><i></i></div>' + badge('b') + badge('a') +
      '<div class="ba-hint">DRAG TO COMPARE</div>';
    const set = x => {
      const r = w.getBoundingClientRect();
      const p = Math.max(0, Math.min(1, (x - r.left) / r.width)) * 100;
      w.style.setProperty('--p', p + '%');
    };
    let drag = false;
    w.addEventListener('pointerdown', e => { drag = true; w.setPointerCapture(e.pointerId); set(e.clientX); w.classList.add('used'); });
    w.addEventListener('pointermove', e => { if (drag) set(e.clientX); });
    w.addEventListener('pointerup', () => drag = false);
    w.addEventListener('keydown', e => {
      const cur = parseFloat(getComputedStyle(w).getPropertyValue('--p')) || 50;
      if (e.key === 'ArrowLeft') w.style.setProperty('--p', Math.max(0, cur - 5) + '%');
      if (e.key === 'ArrowRight') w.style.setProperty('--p', Math.min(100, cur + 5) + '%');
    });
    w.tabIndex = 0;
    return w;
  }

  function render(it) {
    stage.innerHTML = '';
    let el;
    if (it.type === 'img') {
      el = document.createElement('img'); el.src = it.src; el.alt = it.caption || '';
    } else if (it.type === 'vid') {
      el = document.createElement('video'); el.src = it.src; el.controls = true; el.autoplay = true; el.muted = true; el.loop = true; el.playsInline = true;
    } else if (it.type === 'ba-img') {
      const before = it.before ? '<img class="b-layer" src="' + it.before + '" alt="Before">' : '<img class="b-layer clay" src="' + it.after + '" alt="Before">';
      el = slider('<img class="a-layer" src="' + it.after + '" alt="After">' + before.replace('b-layer', 'b-layer clip'));
    } else {
      const bsrc = it.before || it.after, cls = it.before ? '' : ' clay';
      el = slider('<video class="a-layer" src="' + it.after + '" muted loop playsinline></video>' +
        '<video class="b-layer clip' + cls + '" src="' + bsrc + '" muted loop playsinline></video>');
      const vs = el.querySelectorAll('video');
      const go = () => { vs.forEach(v => { v.currentTime = 0; v.play().catch(() => {}); }); };
      vs[0].addEventListener('loadeddata', go, { once: true });
      vs[1].addEventListener('loadeddata', go, { once: true });
      vs[0].addEventListener('timeupdate', () => { if (Math.abs(vs[1].currentTime - vs[0].currentTime) > .25) vs[1].currentTime = vs[0].currentTime; });
      const play = () => vs.forEach(v => v.play().catch(() => {}));
      play();
    }
    el.classList.add('gal-item');
    stage.appendChild(el);
    cap.textContent = it.caption || '';
  }

  function open(i) {
    const card = cards[i], s = SERVICES[i]; if (!s) return;
    current = i; lastFocus = document.activeElement;
    $('.gal-n').textContent = card.querySelector('.n').textContent;
    $('.gal-title').textContent = card.querySelector('h3').textContent;
    $('.gal-desc').textContent = s.desc;
    thumbs.innerHTML = '';
    s.items.forEach((it, k) => {
      const b = document.createElement('button');
      const kind = it.type.startsWith('ba') ? 'Before / After' : '';
      const media = it.type.endsWith('vid') ? 'Video' : 'Image';
      b.innerHTML = '<b>' + String(k + 1).padStart(2, '0') + '</b><span>' + media + '</span><em>' + kind + '</em>';
      b.onclick = () => { thumbs.querySelectorAll('button').forEach(x => x.classList.remove('on')); b.classList.add('on'); render(it); };
      thumbs.appendChild(b);
    });
    thumbs.firstChild.click();
    modal.classList.add('open');
    document.documentElement.classList.add('gal-lock');
    if (window.lenis) window.lenis.stop();
    $('.gal-close').focus();
  }
  function close() {
    modal.classList.remove('open');
    stage.innerHTML = '';
    document.documentElement.classList.remove('gal-lock');
    if (window.lenis) window.lenis.start();
    if (lastFocus) lastFocus.focus();
  }
  $('.gal-close').onclick = close;
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && modal.classList.contains('open')) close(); });

  cards.forEach((c, i) => {
    c.addEventListener('click', () => open(i));
    c.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(i); } });
    const hint = document.createElement('span'); hint.className = 'svc-more'; hint.textContent = 'VIEW WORK \u2192'; c.appendChild(hint);
  });
})();
