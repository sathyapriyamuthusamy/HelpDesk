// HelpDesk - Ticket Management System
// Backend: Express + SQLite + JWT auth + Socket.IO (real-time)

const express = require('express');
const http = require('http');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const SECRET = process.env.JWT_SECRET || 'dev-secret-change-before-deploying';

const STATUSES = ['Open', 'Assigned', 'In Progress', 'Resolved', 'Closed'];
const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];
const CATEGORIES = ['Technical', 'Billing', 'Account', 'General'];
const ROLES = ['customer', 'agent', 'admin'];

// ---------- Database ----------
const db = require('./db');

// ---------- App + Socket.IO ----------
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Helpers ----------
const TICKET_SQL = `
  SELECT t.*, c.name AS customer_name, a.name AS agent_name
  FROM tickets t
  JOIN users c ON c.id = t.customer_id
  LEFT JOIN users a ON a.id = t.agent_id`;

const getTicket = (id) => db.prepare(TICKET_SQL + ' WHERE t.id = ?').get(id);

function canView(user, ticket) {
  if (user.role === 'admin') return true;
  if (user.role === 'agent') return ticket.agent_id === user.id;
  return ticket.customer_id === user.id;
}

function signToken(user) {
  return jwt.sign({ id: user.id }, SECRET, { expiresIn: '7d' });
}

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role });

// Tell everyone involved in a ticket that something changed (real-time)
function notify(ticket, message, actorId) {
  let target = io.to('admins');
  [ticket.customer_id, ticket.agent_id].filter(Boolean).forEach((id) => {
    target = target.to('user:' + id);
  });
  target.emit('ticket:changed', { id: ticket.id, message, actorId });
}

// ---------- Auth middleware ----------
function auth(req, res, next) {
  const header = req.headers.authorization || '';
  try {
    const payload = jwt.verify(header.replace('Bearer ', ''), SECRET);
    const user = db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(payload.id);
    if (!user) throw new Error('no user');
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Please log in again.' });
  }
}

const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'You do not have access to this.' });

// ---------- Auth routes ----------
app.post('/api/signup', (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || name.trim().length < 2) return res.status(400).json({ error: 'Enter your name.' });
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email.' });
  if (!password || password.length < 6) return res.status(400).json({ error: 'Password needs at least 6 characters.' });
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (exists) return res.status(409).json({ error: 'This email is already registered.' });
  const info = db
    .prepare('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)')
    .run(name.trim(), email.toLowerCase(), bcrypt.hashSync(password, 10), 'customer');
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get((email || '').toLowerCase());
  if (!user || !bcrypt.compareSync(password || '', user.password)) {
    return res.status(401).json({ error: 'Email or password is incorrect.' });
  }
  res.json({ token: signToken(user), user: publicUser(user) });
});

app.get('/api/me', auth, (req, res) => res.json(req.user));

// ---------- Ticket routes ----------
app.get('/api/tickets', auth, (req, res) => {
  const { status, priority, q } = req.query;
  const where = [];
  const args = [];
  if (req.user.role === 'customer') { where.push('t.customer_id = ?'); args.push(req.user.id); }
  if (req.user.role === 'agent') { where.push('t.agent_id = ?'); args.push(req.user.id); }
  if (status) { where.push('t.status = ?'); args.push(status); }
  if (priority) { where.push('t.priority = ?'); args.push(priority); }
  if (q) { where.push('(t.title LIKE ? OR t.description LIKE ?)'); args.push(`%${q}%`, `%${q}%`); }
  const sql = TICKET_SQL + (where.length ? ' WHERE ' + where.join(' AND ') : '') + ' ORDER BY t.updated_at DESC, t.id DESC';
  res.json(db.prepare(sql).all(...args));
});

app.post('/api/tickets', auth, requireRole('customer'), (req, res) => {
  const { title, description, category, priority } = req.body || {};
  if (!title || title.trim().length < 3) return res.status(400).json({ error: 'Add a short title (3+ characters).' });
  if (!description || description.trim().length < 5) return res.status(400).json({ error: 'Describe the problem.' });
  const cat = CATEGORIES.includes(category) ? category : 'General';
  const pri = PRIORITIES.includes(priority) ? priority : 'Medium';
  const info = db
    .prepare('INSERT INTO tickets (title, description, category, priority, customer_id) VALUES (?, ?, ?, ?, ?)')
    .run(title.trim(), description.trim(), cat, pri, req.user.id);
  const ticket = getTicket(info.lastInsertRowid);
  notify(ticket, `New ticket #${ticket.id}: ${ticket.title}`, req.user.id);
  res.status(201).json(ticket);
});

app.get('/api/tickets/:id', auth, (req, res) => {
  const ticket = getTicket(req.params.id);
  if (!ticket || !canView(req.user, ticket)) return res.status(404).json({ error: 'Ticket not found.' });
  const comments = db
    .prepare(`SELECT c.*, u.name AS user_name, u.role AS user_role
              FROM comments c JOIN users u ON u.id = c.user_id
              WHERE c.ticket_id = ? ORDER BY c.id`)
    .all(ticket.id);
  res.json({ ...ticket, comments });
});

app.patch('/api/tickets/:id', auth, (req, res) => {
  const ticket = getTicket(req.params.id);
  if (!ticket || !canView(req.user, ticket)) return res.status(404).json({ error: 'Ticket not found.' });

  const { status, priority, agent_id } = req.body || {};
  const role = req.user.role;

  if (role === 'customer' && (status !== 'Closed' || priority !== undefined || agent_id !== undefined)) {
    return res.status(403).json({ error: 'You can only close your own ticket.' });
  }
  if (role === 'agent' && (priority !== undefined || agent_id !== undefined)) {
    return res.status(403).json({ error: 'Agents can only change the status.' });
  }
  if (status !== undefined && !STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status.' });
  if (priority !== undefined && !PRIORITIES.includes(priority)) return res.status(400).json({ error: 'Invalid priority.' });

  let newAgent = ticket.agent_id;
  if (agent_id !== undefined) {
    if (agent_id === null || agent_id === '') {
      newAgent = null;
    } else {
      const agent = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'agent'").get(agent_id);
      if (!agent) return res.status(400).json({ error: 'Choose a valid agent.' });
      newAgent = agent.id;
    }
  }

  let newStatus = status ?? ticket.status;
  // Assigning an open ticket moves it to "Assigned" automatically
  if (agent_id !== undefined && newAgent && ticket.status === 'Open' && status === undefined) newStatus = 'Assigned';

  db.prepare("UPDATE tickets SET status = ?, priority = ?, agent_id = ?, updated_at = datetime('now') WHERE id = ?")
    .run(newStatus, priority ?? ticket.priority, newAgent, ticket.id);

  const updated = getTicket(ticket.id);
  const changes = [];
  if (updated.status !== ticket.status) changes.push(`status is now ${updated.status}`);
  if (updated.agent_id !== ticket.agent_id) changes.push(updated.agent_name ? `assigned to ${updated.agent_name}` : 'unassigned');
  if (updated.priority !== ticket.priority) changes.push(`priority is now ${updated.priority}`);
  if (changes.length) notify(updated, `Ticket #${updated.id}: ${changes.join(', ')}`, req.user.id);
  res.json(updated);
});

app.post('/api/tickets/:id/comments', auth, (req, res) => {
  const ticket = getTicket(req.params.id);
  if (!ticket || !canView(req.user, ticket)) return res.status(404).json({ error: 'Ticket not found.' });
  const message = (req.body?.message || '').trim();
  if (!message) return res.status(400).json({ error: 'Write a message first.' });
  db.prepare('INSERT INTO comments (ticket_id, user_id, message) VALUES (?, ?, ?)').run(ticket.id, req.user.id, message);
  db.prepare("UPDATE tickets SET updated_at = datetime('now') WHERE id = ?").run(ticket.id);
  notify(ticket, `${req.user.name} replied on ticket #${ticket.id}`, req.user.id);
  res.status(201).json({ ok: true });
});

// ---------- Admin routes ----------
app.get('/api/agents', auth, requireRole('admin'), (req, res) => {
  res.json(db.prepare("SELECT id, name FROM users WHERE role = 'agent' ORDER BY name").all());
});

app.get('/api/users', auth, requireRole('admin'), (req, res) => {
  res.json(db.prepare('SELECT id, name, email, role, created_at FROM users ORDER BY id').all());
});

app.patch('/api/users/:id/role', auth, requireRole('admin'), (req, res) => {
  const { role } = req.body || {};
  if (!ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role.' });
  if (Number(req.params.id) === req.user.id) return res.status(400).json({ error: 'You cannot change your own role.' });
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id);
  res.json({ ok: true });
});

app.get('/api/stats', auth, requireRole('admin'), (req, res) => {
  const count = (col) => db.prepare(`SELECT ${col} AS label, COUNT(*) AS n FROM tickets GROUP BY ${col}`).all();
  res.json({
    total: db.prepare('SELECT COUNT(*) AS n FROM tickets').get().n,
    byStatus: count('status'),
    byPriority: count('priority'),
    workload: db
      .prepare(`SELECT u.name AS label, COUNT(t.id) AS n
                FROM users u LEFT JOIN tickets t
                  ON t.agent_id = u.id AND t.status NOT IN ('Resolved', 'Closed')
                WHERE u.role = 'agent' GROUP BY u.id ORDER BY n DESC`)
      .all(),
  });
});

// ---------- Real-time connections ----------
io.use((socket, next) => {
  try {
    const payload = jwt.verify(socket.handshake.auth?.token || '', SECRET);
    const user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(payload.id);
    if (!user) throw new Error('no user');
    socket.user = user;
    next();
  } catch {
    next(new Error('unauthorized'));
  }
});

io.on('connection', (socket) => {
  socket.join('user:' + socket.user.id);
  if (socket.user.role === 'admin') socket.join('admins');
});

server.listen(PORT, () => console.log(`HelpDesk running on http://localhost:${PORT}`));
