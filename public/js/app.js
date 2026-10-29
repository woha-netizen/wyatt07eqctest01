const $ = id => document.getElementById(id);
const norm = p => p.replace(/\.html$/, '').replace(/\/+$/, '');
const fmt = ts => (ts ? new Date(ts * 1000).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Never');
const roleName = u => (u.role === 'admin' ? 'Administrator' : 'Standard user');

const EVENTS = {
  register: ['Account created', ''],
  login: ['Signed in', ''],
  login_failed: ['Failed sign-in', 'bad'],
  locked: ['Account locked', 'bad'],
  logout: ['Signed out', ''],
  password_changed: ['Password changed', 'warn'],
  session_revoked: ['Device signed out', 'warn'],
  sessions_revoked: ['Other devices signed out', 'warn'],
  admin_role: ['Role changed', 'warn'],
  admin_suspend: ['Account suspended', 'bad'],
  admin_reactivate: ['Account reactivated', 'ok'],
  admin_delete: ['Account deleted', 'bad']
};

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined
  });
  let data = {};
  try { data = await res.json(); } catch { /* empty body */ }
  return { ok: res.ok, status: res.status, data };
}

/* ---------- small DOM helpers (all user data goes through textContent) ---------- */
function show(el, text, kind) {
  el.textContent = text;
  el.className = `msg msg-${kind}`;
}
function hide(el) { el.className = 'hidden'; }
function cell(text, cls) { const td = document.createElement('td'); td.textContent = text ?? '—'; if (cls) td.className = cls; return td; }
function tag(text, kind) { const s = document.createElement('span'); s.className = `tag${kind ? ` tag-${kind}` : ''}`; s.textContent = text; return s; }
function tagCell(text, kind) { const td = document.createElement('td'); td.append(tag(text, kind)); return td; }
function button(label, cls, onClick) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = `btn btn-sm ${cls}`; b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}
function emptyRow(body, cols, text) {
  const tr = document.createElement('tr');
  const td = cell(text, 'empty'); td.colSpan = cols; tr.append(td); body.replaceChildren(tr);
}

async function currentUser() {
  const r = await api('/api/me');
  return r.ok ? r.data.user : null;
}

/* ---------- navigation ---------- */
function applyNav(user) {
  document.querySelectorAll('[data-auth="in"]').forEach(e => e.classList.toggle('hidden', !user));
  document.querySelectorAll('[data-auth="out"]').forEach(e => e.classList.toggle('hidden', !!user));
  document.querySelectorAll('[data-auth="admin"]').forEach(e => e.classList.toggle('hidden', !(user && user.role === 'admin')));
  const chip = $('user-chip');
  if (chip) chip.textContent = user ? user.username : '';
  document.querySelectorAll('.links a[href]').forEach(a => {
    if (norm(new URL(a.href).pathname) === norm(location.pathname)) a.setAttribute('aria-current', 'page');
  });
  const logout = $('logout');
  if (logout) logout.addEventListener('click', async () => {
    await api('/api/logout', { method: 'POST' });
    location.href = '/login';
  });
}

/* ---------- activity tables ---------- */
function renderEvents(body, events, { withUser = false } = {}) {
  const cols = withUser ? 5 : 4;
  if (!events.length) return emptyRow(body, cols, 'No activity yet.');
  body.replaceChildren();
  for (const e of events) {
    const [label, kind] = EVENTS[e.event] || [e.event, ''];
    const tr = document.createElement('tr');
    tr.append(cell(fmt(e.created_at), 'nowrap'));
    if (withUser) tr.append(cell(e.username || 'Unknown'));
    tr.append(tagCell(label, kind), cell(e.detail || '—'), cell(e.ip || '—', 'nowrap'));
    body.append(tr);
  }
}

/* ---------- pages ---------- */
function setupAuthForm(kind) {
  const form = $('auth-form');
  const msg = $('msg');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    hide(msg);
    const data = Object.fromEntries(new FormData(form));
    if (kind === 'register' && data.password !== data.confirm) return show(msg, 'Passwords do not match.', 'error');
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    const r = kind === 'login'
      ? await api('/api/login', { method: 'POST', body: { identifier: data.identifier, password: data.password } })
      : await api('/api/register', { method: 'POST', body: { username: data.username, email: data.email, password: data.password } });
    if (r.ok) { location.href = '/dashboard'; return; }
    btn.disabled = false;
    show(msg, r.data.error || 'Something went wrong. Try again.', 'error');
  });
}

async function setupDashboard(user) {
  $('welcome').textContent = `Welcome back, ${user.username}`;
  $('c-initial').textContent = user.username[0].toUpperCase();
  $('c-name').textContent = user.username;
  $('c-mail').textContent = user.email;
  $('c-role').textContent = user.role === 'admin' ? 'Administrator' : 'Member';
  $('c-no').textContent = String(user.id).padStart(4, '0');
  $('c-since').textContent = new Date(user.created_at * 1000).toLocaleDateString([], { dateStyle: 'medium' });
  $('c-status').textContent = user.status === 'active' ? 'Active' : user.status;
  $('access-admin').replaceChildren(user.role === 'admin' ? tag('Yes', 'ok') : tag('Admins only', 'warn'));
  const r = await api('/api/activity');
  renderEvents($('recent-body'), r.ok ? r.data.events.slice(0, 5) : []);
}

function setupProfile(user) {
  $('p-username').textContent = user.username;
  $('p-email').textContent = user.email;
  $('p-role').textContent = roleName(user);
  $('p-status').textContent = user.status === 'active' ? 'Active' : user.status;
  $('p-since').textContent = fmt(user.created_at);
  $('p-last').textContent = fmt(user.last_login);
}

async function setupSecurity() {
  const form = $('pw-form');
  const msg = $('msg');
  const body = $('sessions-body');
  const sessMsg = $('sess-msg');

  form.addEventListener('submit', async e => {
    e.preventDefault();
    hide(msg);
    const d = Object.fromEntries(new FormData(form));
    if (d.next !== d.confirm) return show(msg, 'New passwords do not match.', 'error');
    const r = await api('/api/change-password', { method: 'POST', body: { current: d.current, next: d.next } });
    if (r.ok) { form.reset(); show(msg, 'Password changed. Your other devices have been signed out.', 'success'); loadSessions(); }
    else show(msg, r.data.error || 'Could not change password.', 'error');
  });

  async function revoke(id) {
    const r = await api(`/api/sessions/${id}`, { method: 'DELETE' });
    if (!r.ok) show(sessMsg, r.data.error || 'Could not sign out that device.', 'error'); else hide(sessMsg);
    loadSessions();
  }
  $('revoke-others').addEventListener('click', async () => {
    const r = await api('/api/sessions/revoke-others', { method: 'POST' });
    if (r.ok) show(sessMsg, 'All other devices have been signed out.', 'success');
    loadSessions();
  });

  async function loadSessions() {
    const r = await api('/api/sessions');
    if (!r.ok) return emptyRow(body, 5, 'Could not load devices.');
    body.replaceChildren();
    $('revoke-others').classList.toggle('hidden', r.data.sessions.length < 2);
    for (const s of r.data.sessions) {
      const tr = document.createElement('tr');
      tr.append(cell(s.device), cell(s.ip || '—', 'nowrap'), cell(fmt(s.created_at), 'nowrap'), cell(fmt(s.expires_at), 'nowrap'));
      const act = document.createElement('td');
      if (s.current) act.append(tag('This device', 'ok')); else act.append(button('Sign out', 'btn-quiet', () => revoke(s.id)));
      tr.append(act);
      body.append(tr);
    }
  }
  loadSessions();
}

async function setupActivity() {
  const r = await api('/api/activity');
  renderEvents($('activity-body'), r.ok ? r.data.events : []);
}

async function setupAdmin(me) {
  const body = $('users-body');
  const msg = $('msg');

  async function patch(id, change) {
    const r = await api(`/api/admin/users/${id}`, { method: 'PATCH', body: change });
    if (!r.ok) show(msg, r.data.error || 'Update failed.', 'error'); else hide(msg);
    load();
  }
  async function remove(user) {
    if (!confirm(`Delete ${user.username}? This cannot be undone.`)) return;
    const r = await api(`/api/admin/users/${user.id}`, { method: 'DELETE' });
    if (!r.ok) show(msg, r.data.error || 'Delete failed.', 'error'); else hide(msg);
    load();
  }

  async function load() {
    const [users, events] = await Promise.all([api('/api/admin/users'), api('/api/admin/activity')]);
    if (!users.ok) return show(msg, users.data.error || 'Could not load users.', 'error');
    body.replaceChildren();
    for (const u of users.data.users) {
      const tr = document.createElement('tr');
      tr.append(cell(u.username), cell(u.email));
      tr.append(tagCell(u.role === 'admin' ? 'Admin' : 'User', u.role === 'admin' ? 'warn' : ''));
      tr.append(tagCell(u.status === 'active' ? 'Active' : 'Suspended', u.status === 'active' ? 'ok' : 'bad'));
      tr.append(cell(fmt(u.last_login), 'nowrap'));
      const act = document.createElement('td');
      if (u.id === me.id) act.textContent = 'You';
      else {
        const wrap = document.createElement('div'); wrap.className = 'actions';
        wrap.append(
          button(u.role === 'admin' ? 'Make user' : 'Make admin', 'btn-quiet', () => patch(u.id, { role: u.role === 'admin' ? 'user' : 'admin' })),
          button(u.status === 'active' ? 'Suspend' : 'Reactivate', 'btn-quiet', () => patch(u.id, { status: u.status === 'active' ? 'suspended' : 'active' })),
          button('Delete', 'btn-danger', () => remove(u))
        );
        act.append(wrap);
      }
      tr.append(act);
      body.append(tr);
    }
    renderEvents($('audit-body'), events.ok ? events.data.events : [], { withUser: true });
  }
  load();
}

document.addEventListener('DOMContentLoaded', async () => {
  const page = document.body.dataset.page;
  const user = await currentUser();
  applyNav(user);

  if (page === 'login' || page === 'register') {
    if (user) { location.href = '/dashboard'; return; }
    setupAuthForm(page);
    return;
  }
  if (['dashboard', 'profile', 'security', 'activity', 'admin'].includes(page)) {
    if (!user) { location.href = '/login'; return; }
    if (page === 'dashboard') setupDashboard(user);
    if (page === 'profile') setupProfile(user);
    if (page === 'security') setupSecurity();
    if (page === 'activity') setupActivity();
    if (page === 'admin') setupAdmin(user);
  }
});
