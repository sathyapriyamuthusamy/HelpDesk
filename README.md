# HelpDesk - Real-Time Support Ticket System

A full-stack web application where customers raise support tickets, admins assign them to agents,
and everyone sees updates instantly (no page refresh).

## Features
- Sign up / log in with hashed passwords (bcrypt) and JWT sessions
- Three roles with different permissions: **customer**, **agent**, **admin**
- Customers: raise tickets (category + priority), reply, close their own ticket
- Admins: see all tickets, assign agents, change status/priority, manage user roles, dashboard with statistics
- Agents: see assigned tickets, update status, reply
- **Real-time updates** with Socket.IO: toast notifications and live list refresh when a ticket changes
- Search and filter by text, status and priority
- Role-based access control enforced on the server (not just hidden in the UI)
- Responsive layout, keyboard-accessible

## Tech stack
| Layer | Technology |
|---|---|
| Frontend | HTML, CSS, vanilla JavaScript |
| Backend | Node.js, Express |
| Database | SQLite (better-sqlite3) |
| Real time | Socket.IO |
| Auth | JWT + bcrypt |

## Run it
```bash
npm install
npm start
```
Open http://localhost:3000

On first run the app fills itself with realistic sample data (8 customers from different companies,
4 support agents and 22 tickets with conversations), so every screen has something to show.
Use `npm run start:empty` to start with a blank system instead.

Demo accounts (created automatically on first run):

| Role | Email | Password |
|---|---|---|
| Admin | admin@helpdesk.com | admin123 |
| Agent | agent@helpdesk.com | agent123 |
| Customer | customer@helpdesk.com | customer123 |

The sample agents and customers use the password `pass1234` (e.g. `arun.kumar@helpdesk.com`).

Tip: open two browser windows (one as customer, one as admin) and watch the live updates.

## Project structure
```
server.js          API routes, auth, Socket.IO
db.js              database tables
seed.js            realistic sample data
public/index.html  page shell
public/app.js      all frontend logic
public/style.css   styles
```

## API summary
| Method | Route | Who |
|---|---|---|
| POST | /api/signup, /api/login | anyone |
| GET | /api/tickets?status=&priority=&q= | logged in (results depend on role) |
| POST | /api/tickets | customer |
| GET | /api/tickets/:id | owner, assigned agent, admin |
| PATCH | /api/tickets/:id | admin (all fields), agent (status), customer (close) |
| POST | /api/tickets/:id/comments | anyone who can view the ticket |
| GET | /api/stats, /api/users, /api/agents | admin |
| PATCH | /api/users/:id/role | admin |

## Deploy (free) on Render
1. Push this folder to a GitHub repository (the `.gitignore` already excludes secrets and the database).
2. On render.com create a **Web Service** from the repo. Build command: `npm install`. Start command: `npm start` (it loads the sample data automatically).
3. Add an environment variable `JWT_SECRET` with a long random value.
4. Note: free hosting resets the SQLite file on redeploy. For permanent data, attach a persistent disk or move to PostgreSQL.

## Design decisions (good to explain in an interview)
- **Why SQLite?** Zero setup for a demo. The SQL is standard, so moving to MySQL/PostgreSQL only changes the database layer.
- **Why JWT?** Stateless login: the server verifies the token on each request without storing sessions.
- **Why check roles on the server?** Hiding a button is not security. Every route verifies the user's role.
- **How does real time work?** The browser opens a Socket.IO connection with its token. The server puts each user in a private room. When a ticket changes, the server emits an event to the customer, the assigned agent, and admins only.
- **Security touches:** parameterised SQL queries (prevents SQL injection), HTML escaping on output (prevents XSS), password hashing, input validation.

## Ideas to extend
Email notifications, file attachments, SLA timers, ticket history log, pagination, automated tests, PostgreSQL.
