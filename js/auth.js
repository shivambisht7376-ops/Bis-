/* Shared client logic: auth forms, account page, menu state, enquiry form */
const api = async (url, method = 'GET', body) => {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin'
  });
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
};
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = d => new Date(d.replace(' ', 'T') + 'Z').toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

/* ---------- login / signup form ---------- */
const authForm = document.getElementById('authForm');
if (authForm) {
  const msg = document.getElementById('msg');
  const mode = authForm.dataset.mode;
  // already logged in? go to account
  api('/api/auth/me').then(d => { if (d.user) location.replace('/account'); }).catch(() => {});

  authForm.addEventListener('submit', async e => {
    e.preventDefault();
    msg.className = 'form-msg'; msg.textContent = '';
    const f = Object.fromEntries(new FormData(authForm));
    if (mode === 'signup' && f.password !== f.confirm) { msg.textContent = 'Passwords do not match.'; return; }
    const btn = authForm.querySelector('button'); btn.disabled = true;
    try {
      await api(`/api/auth/${mode}`, 'POST', { name: f.name, email: f.email, password: f.password });
      msg.classList.add('ok'); msg.textContent = 'Success — redirecting…';
      setTimeout(() => location.assign('/account'), 500);
    } catch (err) { msg.textContent = err.message; btn.disabled = false; }
  });
}

/* ---------- account page ---------- */
const accountEl = document.getElementById('account');
if (accountEl) {
  const statusSel = (id, cur) => `<select data-id="${id}">${['new', 'contacted', 'closed'].map(s => `<option ${s === cur ? 'selected' : ''}>${s}</option>`).join('')}</select>`;
  (async () => {
    const { user } = await api('/api/auth/me');
    if (!user) return location.replace('/login');
    accountEl.hidden = false;
    document.getElementById('hello').textContent = `Hello, ${user.name.split(' ')[0]}`;
    document.getElementById('who').textContent = `${user.email} · ${user.role === 'admin' ? 'Administrator' : 'Member'} since ${new Date(user.created_at.replace(' ', 'T') + 'Z').toLocaleDateString()}`;

    const { enquiries } = await api('/api/enquiries/mine');
    document.getElementById('mine').innerHTML = enquiries.length
      ? enquiries.map(x => `<div class="item"><div class="meta"><span>${fmt(x.created_at)}</span><span class="badge">${esc(x.status)}</span></div>${esc(x.message) || '<i>(no message)</i>'}</div>`).join('')
      : '<div class="empty">You have not sent any enquiries yet. Use the Enquire button on the home page.</div>';

    if (user.role === 'admin') {
      document.getElementById('adminBox').hidden = false;
      const [e, u] = await Promise.all([api('/api/admin/enquiries'), api('/api/admin/users')]);
      document.getElementById('allEnq').innerHTML = e.enquiries.length
        ? e.enquiries.map(x => `<div class="item"><div class="meta"><span>${fmt(x.created_at)} · ${esc(x.name)} · ${esc(x.email)}</span>${statusSel(x.id, x.status)}</div>${esc(x.message) || '<i>(no message)</i>'}</div>`).join('')
        : '<div class="empty">No enquiries yet.</div>';
      document.getElementById('allUsers').innerHTML = u.users
        .map(x => `<div class="item"><div class="meta"><span>${esc(x.name)} · ${esc(x.email)}</span><span class="badge">${esc(x.role)}</span></div>Joined ${fmt(x.created_at)}</div>`).join('');
      document.getElementById('allEnq').addEventListener('change', ev => {
        if (ev.target.matches('select')) api(`/api/admin/enquiries/${ev.target.dataset.id}`, 'PATCH', { status: ev.target.value }).catch(err => alert(err.message));
      });
    }
  })().catch(() => location.replace('/login'));

  document.getElementById('logoutBtn').onclick = async () => { await api('/api/auth/logout', 'POST'); location.assign('/'); };
}

/* ---------- main site: menu login link + enquiry form ---------- */
const menuList = document.querySelector('#menu ul');
if (menuList) {
  const li = document.createElement('li');
  li.innerHTML = '<a class="auth-link" href="/login">Log in / Sign up</a>';
  menuList.appendChild(li);
  api('/api/auth/me').then(({ user }) => {
    if (user) { const a = li.firstChild; a.href = '/account'; a.textContent = `My account (${user.name.split(' ')[0]})`; }
  }).catch(() => {});
  // these are real page links, not scroll anchors
  li.firstChild.addEventListener('click', e => e.stopPropagation());
}

const enquiryForm = document.getElementById('enquiryForm');
if (enquiryForm) {
  const msg = document.getElementById('enquiryMsg');
  api('/api/auth/me').then(({ user }) => {
    if (user) { enquiryForm.name.value = user.name; enquiryForm.email.value = user.email; }
  }).catch(() => {});
  enquiryForm.addEventListener('submit', async e => {
    e.preventDefault();
    msg.className = 'form-msg'; msg.textContent = '';
    const btn = enquiryForm.querySelector('button'); btn.disabled = true;
    try {
      await api('/api/enquiries', 'POST', Object.fromEntries(new FormData(enquiryForm)));
      msg.classList.add('ok'); msg.textContent = 'Thank you — we will be in touch shortly.';
      enquiryForm.message.value = '';
    } catch (err) { msg.textContent = err.message; }
    btn.disabled = false;
  });
}
