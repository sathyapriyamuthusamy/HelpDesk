// HelpDesk frontend (plain JavaScript, no build step)

const STATUSES = ['Open', 'Assigned', 'In Progress', 'Resolved', 'Closed'];
const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];
const CATEGORIES = ['Technical', 'Billing', 'Account', 'General'];

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slug = (s) => s.toLowerCase().replace(/\s+/g, '-');
const opts = (list, selected) =>
  list.map((v) => `<option value="${esc(v)}" ${v === selected ? 'selected' : ''}>${esc(v)}</option>`).join('');
const when = (d) => new Date(d.replace(' ', 'T') + 'Z').toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

let token = localStorage.getItem('token');
let me = null;
let socket = null;
let tab = 'tickets';
let openTicketId = null;

// ---------- API helper ----------
async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch('/api' + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) logout();
    throw new Error(data.error || 'Something went wrong. Try again.');
  }
  return data;
}

function toast(message) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), 4500);
}

// ---------- Auth ----------
function logout() {
  localStorage.removeItem('token');
  token = null;
  me = null;
  if (socket) socket.disconnect();
  socket = null;
  renderAuth('login');
}

function renderAuth(mode) {
  const signup = mode === 'signup';
  $('#app').innerHTML = `
    <div class="auth">
      <section class="auth-side">
        <h1>Support that keeps everyone in the loop.</h1>
        <p>Raise a ticket, watch it move from open to resolved, and get updates the moment an agent responds.</p>
        <div class="demo">
          <b>Try the demo accounts</b>
          Admin: admin@helpdesk.com / admin123<br>
          Agent: agent@helpdesk.com / agent123<br>
          Customer: customer@helpdesk.com / customer123
        </div>
      </section>
      <section class="auth-form">
        <h2>${signup ? 'Create your account' : 'Log in'}</h2>
        <form id="auth-form" novalidate>
          ${signup ? '<div class="field"><label for="name">Name</label><input id="name" autocomplete="name"></div>' : ''}
          <div class="field"><label for="email">Email</label><input id="email" type="email" autocomplete="email"></div>
          <div class="field"><label for="password">Password</label><input id="password" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}"></div>
          <p class="error" id="auth-error"></p>
          <button class="btn" type="submit">${signup ? 'Create account' : 'Log in'}</button>
        </form>
        <p class="switch">${signup ? 'Already have an account?' : 'New here?'}
          <button id="switch">${signup ? 'Log in' : 'Create an account'}</button></p>
      </section>
    </div>`;
  $('#switch').onclick = () => renderAuth(signup ? 'login' : 'signup');
  $('#auth-form').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const body = { email: $('#email').value, password: $('#password').value };
      if (signup) body.name = $('#name').value;
      const data = await api(signup ? '/signup' : '/login', { method: 'POST', body });
      token = data.token;
      localStorage.setItem('token', token);
      me = data.user;
      startApp();
    } catch (err) {
      $('#auth-error').textContent = err.message;
    }
  };
}

// ---------- App shell ----------
function startApp() {
  tab = 'tickets';
  connectSocket();
  renderShell();
}

function connectSocket() {
  if (socket) socket.disconnect();
  socket = io({ auth: { token } });
  socket.on('connect', () => $('#live')?.classList.add('on'));
  socket.on('disconnect', () => $('#live')?.classList.remove('on'));
  socket.on('ticket:changed', (evt) => {
    if (evt.actorId !== me.id) toast(evt.message);
    refreshCurrentView();
    if (openTicketId === evt.id && $('#dialog').open) showTicket(evt.id, true);
  });
}

function renderShell() {
  const tabs = [['tickets', me.role === 'customer' ? 'My tickets' : 'Tickets']];
  if (me.role === 'admin') tabs.push(['dashboard', 'Dashboard'], ['users', 'Users']);
  $('#app').innerHTML = `
    <header class="topbar">
      <span class="brand">HelpDesk</span>
      <nav class="nav">${tabs.map(([k, l]) => `<button data-tab="${k}" class="${k === tab ? 'active' : ''}">${l}</button>`).join('')}</nav>
      <span class="spacer"></span>
      <span class="live ${socket?.connected ? 'on' : ''}" id="live"><i></i>Live</span>
      <div class="who">${esc(me.name)}<br><small>${esc(me.role)}</small></div>
      <button class="btn ghost small" id="logout">Log out</button>
    </header>
    <main id="view"></main>`;
  document.querySelectorAll('.nav button').forEach((b) => {
    b.onclick = () => { tab = b.dataset.tab; renderShell(); };
  });
  $('#logout').onclick = logout;
  refreshCurrentView(true);
}

function refreshCurrentView(fresh = false) {
  if (tab === 'tickets') renderTickets(fresh);
  if (tab === 'dashboard') renderDashboard();
  if (tab === 'users') renderUsers();
}

// ---------- Tickets list ----------
function renderTickets(fresh) {
  const view = $('#view');
  if (fresh || !$('#list')) {
    view.innerHTML = `
      <div class="page-head">
        <h2>${me.role === 'customer' ? 'My tickets' : me.role === 'agent' ? 'Assigned to me' : 'All tickets'}</h2>
        ${me.role === 'customer' ? '<button class="btn" id="new">New ticket</button>' : ''}
      </div>
      <div class="filters">
        <input id="q" placeholder="Search tickets" aria-label="Search tickets">
        <select id="fs" aria-label="Filter by status"><option value="">All statuses</option>${opts(STATUSES)}</select>
        <select id="fp" aria-label="Filter by priority"><option value="">All priorities</option>${opts(PRIORITIES)}</select>
      </div>
      <div id="list"></div>`;
    let timer;
    $('#q').oninput = () => { clearTimeout(timer); timer = setTimeout(loadTickets, 250); };
    $('#fs').onchange = loadTickets;
    $('#fp').onchange = loadTickets;
    if ($('#new')) $('#new').onclick = newTicketDialog;
  }
  loadTickets();
}

async function loadTickets() {
  const params = new URLSearchParams({ q: $('#q').value, status: $('#fs').value, priority: $('#fp').value });
  try {
    const rows = await api('/tickets?' + params);
    const list = $('#list');
    if (!list) return;
    if (!rows.length) {
      list.innerHTML = `<div class="empty">${
        me.role === 'customer' ? 'No tickets yet. Select New ticket to ask for help.' : 'No tickets match these filters.'
      }</div>`;
      return;
    }
    list.innerHTML = rows.map((t) => `
      <button class="ticket-row" data-id="${t.id}">
        <span class="id">#${t.id}</span>
        <span><span class="title">${esc(t.title)}</span><br>
          <span class="sub">${esc(t.category)} - ${esc(t.customer_name)}${t.agent_name ? ' - Agent: ' + esc(t.agent_name) : ''}</span></span>
        <span class="pri"><i class="dot ${t.priority}"></i>${t.priority}</span>
        <span><span class="pill ${slug(t.status)}">${t.status}</span></span>
      </button>`).join('');
    list.querySelectorAll('.ticket-row').forEach((r) => { r.onclick = () => showTicket(Number(r.dataset.id)); });
  } catch (err) { toast(err.message); }
}

// ---------- New ticket ----------
function newTicketDialog() {
  const dlg = $('#dialog');
  dlg.innerHTML = `
    <form class="dlg" id="new-form" novalidate>
      <div class="dlg-head"><h2>New ticket</h2><button type="button" class="btn ghost small" id="x">Close</button></div>
      <div class="field"><label for="t-title">Title</label><input id="t-title" placeholder="Short summary of the problem"></div>
      <div class="field"><label for="t-desc">Details</label><textarea id="t-desc" placeholder="What happened? What did you expect?"></textarea></div>
      <div class="row-2">
        <div class="field"><label for="t-cat">Category</label><select id="t-cat">${opts(CATEGORIES, 'General')}</select></div>
        <div class="field"><label for="t-pri">Priority</label><select id="t-pri">${opts(PRIORITIES, 'Medium')}</select></div>
      </div>
      <p class="error" id="t-error"></p>
      <div class="actions"><button class="btn" type="submit">Submit ticket</button></div>
    </form>`;
  dlg.showModal();
  $('#x').onclick = () => dlg.close();
  $('#new-form').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api('/tickets', {
        method: 'POST',
        body: { title: $('#t-title').value, description: $('#t-desc').value, category: $('#t-cat').value, priority: $('#t-pri').value },
      });
      dlg.close();
      toast('Ticket submitted');
      loadTickets();
    } catch (err) { $('#t-error').textContent = err.message; }
  };
}

// ---------- Ticket detail ----------
async function showTicket(id, keepScroll = false) {
  openTicketId = id;
  const dlg = $('#dialog');
  try {
    const t = await api('/tickets/' + id);
    const agents = me.role === 'admin' ? await api('/agents') : [];
    const prevScroll = dlg.scrollTop;
    const isAdmin = me.role === 'admin';
    const isAgent = me.role === 'agent';

    let controls = '';
    if (isAdmin) {
      controls = `<div class="controls">
        <div><label for="c-status">Status</label><select id="c-status">${opts(STATUSES, t.status)}</select></div>
        <div><label for="c-pri">Priority</label><select id="c-pri">${opts(PRIORITIES, t.priority)}</select></div>
        <div><label for="c-agent">Assigned agent</label><select id="c-agent"><option value="">Unassigned</option>
          ${agents.map((a) => `<option value="${a.id}" ${a.id === t.agent_id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></div>
      </div>`;
    } else if (isAgent) {
      controls = `<div class="controls"><div><label for="c-status">Status</label><select id="c-status">${opts(STATUSES, t.status)}</select></div></div>`;
    } else if (t.status !== 'Closed') {
      controls = `<div class="actions" style="justify-content:flex-start;margin-bottom:16px"><button class="btn ghost small" id="close-ticket">Close this ticket</button></div>`;
    }

    dlg.innerHTML = `
      <div class="dlg">
        <div class="dlg-head"><h2>#${t.id} ${esc(t.title)}</h2><button class="btn ghost small" id="x">Close</button></div>
        <div class="meta">
          <span class="pill ${slug(t.status)}">${t.status}</span>
          <span><i class="dot ${t.priority}"></i> ${t.priority}</span>
          <span>${esc(t.category)}</span>
          <span>By ${esc(t.customer_name)}</span>
          <span>Agent: ${t.agent_name ? esc(t.agent_name) : 'not assigned yet'}</span>
          <span>Opened ${when(t.created_at)}</span>
        </div>
        <div class="desc">${esc(t.description)}</div>
        ${controls}
        <section class="thread">
          <h3>Conversation</h3>
          ${t.comments.length ? t.comments.map((c) => `
            <div class="msg ${c.user_role !== 'customer' ? 'staff' : ''}">
              <small>${esc(c.user_name)} - ${when(c.created_at)}</small><p>${esc(c.message)}</p>
            </div>`).join('') : '<p class="sub" style="color:var(--muted)">No replies yet.</p>'}
          ${t.status === 'Closed' ? '' : `<form class="reply" id="reply-form">
            <input id="reply" placeholder="Write a reply" aria-label="Write a reply"><button class="btn" type="submit">Send</button></form>`}
        </section>
      </div>`;
    if (!dlg.open) dlg.showModal();
    if (keepScroll) dlg.scrollTop = prevScroll;
    dlg.onclose = () => { openTicketId = null; };

    $('#x').onclick = () => dlg.close();
    const patch = async (body) => {
      try { await api('/tickets/' + id, { method: 'PATCH', body }); await showTicket(id, true); loadTickets(); }
      catch (err) { toast(err.message); }
    };
    $('#c-status')?.addEventListener('change', (e) => patch({ status: e.target.value }));
    $('#c-pri')?.addEventListener('change', (e) => patch({ priority: e.target.value }));
    $('#c-agent')?.addEventListener('change', (e) => patch({ agent_id: e.target.value ? Number(e.target.value) : null }));
    $('#close-ticket')?.addEventListener('click', () => patch({ status: 'Closed' }));
    $('#reply-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const message = $('#reply').value;
      try { await api(`/tickets/${id}/comments`, { method: 'POST', body: { message } }); await showTicket(id, true); loadTickets(); }
      catch (err) { toast(err.message); }
    });
  } catch (err) { toast(err.message); }
}

// ---------- Dashboard (admin) ----------
async function renderDashboard() {
  try {
    const s = await api('/stats');
    const n = (list, label) => list.find((x) => x.label === label)?.n || 0;
    const bars = (list, order) => {
      const max = Math.max(1, ...list.map((x) => x.n));
      return order.map((l) => `<div class="bar-row"><span>${l}</span>
        <span class="bar"><i style="width:${(n(list, l) / max) * 100}%"></i></span><b>${n(list, l)}</b></div>`).join('');
    };
    const wl = s.workload;
    const wmax = Math.max(1, ...wl.map((x) => x.n));
    $('#view').innerHTML = `
      <div class="page-head"><h2>Dashboard</h2></div>
      <div class="cards">
        <div class="stat"><b>${s.total}</b><span>Total tickets</span></div>
        <div class="stat"><b>${n(s.byStatus, 'Open') + n(s.byStatus, 'Assigned') + n(s.byStatus, 'In Progress')}</b><span>Still active</span></div>
        <div class="stat"><b>${n(s.byStatus, 'Resolved') + n(s.byStatus, 'Closed')}</b><span>Resolved or closed</span></div>
      </div>
      <div class="panels">
        <div class="panel"><h3>By status</h3>${bars(s.byStatus, STATUSES)}</div>
        <div class="panel"><h3>By priority</h3>${bars(s.byPriority, PRIORITIES)}</div>
        <div class="panel"><h3>Agent workload</h3>${wl.length ? wl.map((a) => `<div class="bar-row"><span>${esc(a.label)}</span>
          <span class="bar"><i style="width:${(a.n / wmax) * 100}%"></i></span><b>${a.n}</b></div>`).join('') : '<p style="color:var(--muted)">No agents yet.</p>'}</div>
      </div>`;
  } catch (err) { toast(err.message); }
}

// ---------- Users (admin) ----------
async function renderUsers() {
  try {
    const users = await api('/users');
    $('#view').innerHTML = `
      <div class="page-head"><h2>Users</h2></div>
      <table><thead><tr><th>Name</th><th>Email</th><th>Role</th></tr></thead><tbody>
        ${users.map((u) => `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>
          ${u.id === me.id ? esc(u.role) : `<select data-id="${u.id}" aria-label="Role for ${esc(u.name)}">${opts(['customer', 'agent', 'admin'], u.role)}</select>`}
        </td></tr>`).join('')}
      </tbody></table>`;
    document.querySelectorAll('td select').forEach((sel) => {
      sel.onchange = async () => {
        try { await api(`/users/${sel.dataset.id}/role`, { method: 'PATCH', body: { role: sel.value } }); toast('Role updated'); }
        catch (err) { toast(err.message); }
      };
    });
  } catch (err) { toast(err.message); }
}

// ---------- Start ----------
(async function init() {
  if (!token) return renderAuth('login');
  try { me = await api('/me'); startApp(); }
  catch { renderAuth('login'); }
})();
