// Fills the database with realistic sample data: npm run seed
// Safe to run once. Use "npm run seed -- --force" to add the data again.

const bcrypt = require('bcryptjs');
const db = require('./db');

if (db.prepare('SELECT COUNT(*) AS n FROM tickets').get().n > 0 && !process.argv.includes('--force')) {
  console.log('Tickets already exist. Run "npm run seed -- --force" to add sample data anyway.');
  process.exit(0);
}

const hash = bcrypt.hashSync('pass1234', 10);
const userId = (email) => db.prepare('SELECT id FROM users WHERE email = ?').get(email)?.id;

function addUser(name, email, role) {
  if (!userId(email)) {
    db.prepare('INSERT INTO users (name, email, password, role, created_at) VALUES (?, ?, ?, ?, datetime(\'now\', \'-30 days\'))')
      .run(name, email, hash, role);
  }
  return userId(email);
}

// Support team
const agents = [
  userId('agent@helpdesk.com'), // Priya (demo agent)
  addUser('Arun Kumar', 'arun.kumar@helpdesk.com', 'agent'),
  addUser('Divya Lakshmi', 'divya.lakshmi@helpdesk.com', 'agent'),
  addUser('Karthik Raja', 'karthik.raja@helpdesk.com', 'agent'),
];

// Customers (staff of client companies)
const customers = [
  userId('customer@helpdesk.com'), // demo customer
  addUser('Ramesh Iyer', 'ramesh.iyer@sundaramtextiles.in', 'customer'),
  addUser('Anitha Selvam', 'anitha.s@kovaihospitals.in', 'customer'),
  addUser('Mohammed Faizal', 'faizal@chennailogistics.in', 'customer'),
  addUser('Sneha Reddy', 'sneha.reddy@bluepeakfinance.com', 'customer'),
  addUser('Vignesh Babu', 'vignesh.b@tamilfoods.in', 'customer'),
  addUser('Lakshmi Narayanan', 'lakshmi.n@greenfieldschool.edu.in', 'customer'),
  addUser('Rohit Sharma', 'rohit.sharma@urbanretail.in', 'customer'),
];

// [title, description, category, priority, status, customer, agent (null = unassigned), daysAgo, replies]
// replies: [who ('c' = customer, 'a' = agent), message]
const T = [
  ['VPN not connecting from home', 'Since this morning the VPN client shows "authentication failed" even with the correct password. I cannot reach the internal ERP.', 'Technical', 'High', 'In Progress', 1, 1, 2, [['a', 'Thanks Ramesh. Your account was locked after several failed attempts. I have unlocked it, please try again.'], ['c', 'Still failing on my laptop, works on my phone.'], ['a', 'Looks like an outdated client. Sending you the latest installer now.']]],
  ['Invoice INV-4821 shows wrong GST amount', 'The GST on our March invoice is calculated at 28% but our items fall under 18%. Please correct and reissue.', 'Billing', 'High', 'Assigned', 4, 2, 1, [['a', 'Received. I am checking the HSN codes with our billing team.']]],
  ['Unable to reset payroll portal password', 'The reset email never arrives. I checked spam as well. Salary slips are due tomorrow.', 'Account', 'Urgent', 'Resolved', 2, 3, 5, [['a', 'The email was bouncing because of an old address on file. Updated and sent a fresh link.'], ['c', 'Got it, I could log in. Thank you!']]],
  ['Request: add 5 new user licences', 'We are onboarding five new coordinators next month. Please share the pricing and steps to add licences.', 'Billing', 'Low', 'Open', 6, null, 0, []],
  ['Dashboard loading very slowly', 'The reports dashboard takes more than 40 seconds to load since last week, especially the monthly view.', 'Technical', 'Medium', 'In Progress', 3, 1, 3, [['a', 'We found a heavy query on the monthly report. A fix is being tested.'], ['c', 'Okay, please update us once deployed.']]],
  ['Cannot upload patient reports (PDF)', 'Uploading PDF files above 5 MB fails with "network error". Smaller files work fine.', 'Technical', 'High', 'Resolved', 2, 2, 8, [['a', 'Upload limit on the server was 5 MB. Raised it to 25 MB.'], ['c', 'Confirmed, working now.']]],
  ['Two-factor code not received on SMS', 'I do not get the OTP on my registered number. Tried five times.', 'Account', 'Medium', 'Assigned', 5, 3, 1, [['a', 'Checking with the SMS provider if your number is blocked.']]],
  ['Need monthly usage report in Excel', 'Can we get the monthly usage summary as an Excel download instead of PDF?', 'General', 'Low', 'Open', 7, null, 1, []],
  ['Shipment tracking page shows old status', 'Tracking for AWB 88213 still shows "In transit" though delivered two days ago. Customers are calling us.', 'Technical', 'Urgent', 'In Progress', 3, 0, 1, [['a', 'We are re-syncing the courier feed now.'], ['c', 'Please prioritise, many customers are affected.'], ['a', 'Sync completed for 60% of shipments. Remaining will finish within the hour.']]],
  ['Wrong company name on invoice', 'Our invoices show "Urban Retail" instead of "Urban Retail Pvt Ltd".', 'Billing', 'Low', 'Closed', 7, 1, 12, [['a', 'Updated the legal name in your profile.'], ['c', 'Looks correct now, thanks.']]],
  ['Student login not working for Class 8', 'Around 30 Class 8 students cannot log in. They get "invalid credentials".', 'Account', 'High', 'Resolved', 6, 2, 6, [['a', 'Passwords for that class were reset by a bulk import. I have regenerated them and emailed the sheet to you.'], ['c', 'Received. Students are able to log in now.']]],
  ['Mobile app crashes on opening orders', 'The Android app closes immediately when I open the Orders tab. Phone: Redmi Note 11, Android 13.', 'Technical', 'Medium', 'Assigned', 5, 0, 2, []],
  ['Change registered email address', 'Our admin has left the company. Please change the registered email to anitha.s@kovaihospitals.in.', 'Account', 'Medium', 'Closed', 2, 3, 15, [['a', 'Done. A verification email was sent to the new address.'], ['c', 'Verified, thanks.']]],
  ['Duplicate charge on credit card', 'We were charged twice for the April subscription (two entries on 3 April).', 'Billing', 'Urgent', 'In Progress', 4, 2, 2, [['a', 'Confirmed duplicate payment. Refund has been initiated and takes 5 to 7 working days.']]],
  ['Feature request: dark mode', 'Our night shift team would love a dark theme for the dashboard.', 'General', 'Low', 'Open', 1, null, 4, []],
  ['Email alerts arriving twice', 'Every stock alert email comes two times. Please check.', 'Technical', 'Low', 'Resolved', 7, 1, 9, [['a', 'A duplicate subscription was found on the account. Removed it.'], ['c', 'Great, only one email now.']]],
  ['How to export attendance data?', 'Where can I download the term attendance as CSV?', 'General', 'Low', 'Closed', 6, 3, 18, [['a', 'Go to Reports, then Attendance, then Export CSV. Shared a screenshot by email.'], ['c', 'Found it, thanks!']]],
  ['Payment gateway failing for UPI', 'UPI payments from our customers fail at the last step. Card payments work.', 'Technical', 'Urgent', 'Assigned', 1, 0, 0, [['a', 'Investigating with the payment provider. Will update within 30 minutes.']]],
  ['Account suspended without notice', 'Our account shows suspended since this morning but we paid last week.', 'Billing', 'High', 'Open', 5, null, 0, []],
  ['Request for API documentation', 'Our developers need the API docs and a sandbox key to integrate with our billing system.', 'General', 'Medium', 'Assigned', 4, 2, 3, [['a', 'Sharing the API guide today and arranging a sandbox key.']]],
  ['Profile photo not saving', 'I upload a new photo but it goes back to the old one after refresh.', 'Technical', 'Low', 'Resolved', 0, 0, 7, [['a', 'Browser cache issue. A hard refresh fixed it on my side. Please confirm.'], ['c', 'Yes, it works now.']]],
  ['Need invoice copy for FY 2025-26', 'Please send all invoices for the last financial year for audit.', 'Billing', 'Medium', 'In Progress', 0, 0, 2, [['a', 'Compiling the invoices into one zip. Will share by end of day.']]],
];

const insertTicket = db.prepare(`
  INSERT INTO tickets (title, description, category, priority, status, customer_id, agent_id, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', ?, ?), datetime('now', ?, ?))`);
const insertComment = db.prepare(`
  INSERT INTO comments (ticket_id, user_id, message, created_at) VALUES (?, ?, ?, datetime('now', ?, ?))`);

db.transaction(() => {
  T.forEach(([title, desc, cat, pri, status, c, a, daysAgo, replies], i) => {
    const customer = customers[c];
    const agent = a === null ? null : agents[a];
    const hrs = (i * 3) % 9; // spread the times of day
    const created = [`-${daysAgo} days`, `-${hrs + replies.length * 2 + 1} hours`];
    const updated = [`-${Math.max(daysAgo - 1, 0)} days`, `-${hrs} hours`];
    const id = insertTicket.run(title, desc, cat, pri, status, customer, agent, ...created, ...updated).lastInsertRowid;
    replies.forEach(([who, msg], k) => {
      const author = who === 'a' ? agent : customer;
      insertComment.run(id, author, msg, `-${daysAgo} days`, `-${hrs + (replies.length - k)} hours`);
    });
  });
})();

console.log(`Added ${T.length} sample tickets, ${agents.length} agents and ${customers.length} customers.`);
console.log('Sample users log in with password: pass1234 (e.g. arun.kumar@helpdesk.com)');
