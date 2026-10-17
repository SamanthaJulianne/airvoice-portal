const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const SAMPLE = path.join(__dirname, 'sample.json');
const readSample = () => JSON.parse(fs.readFileSync(SAMPLE, 'utf8'));
const useSheets = () => process.env.USE_SHEETS === 'true';

function sheetsClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_CREDENTIALS,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

// Read one tab ("Subscribers", "Bills" or "Payments") as a list of objects
async function readTab(tab) {
  if (useSheets()) {
    try {
      const res = await sheetsClient().spreadsheets.values.get({
        spreadsheetId: process.env.SHEET_ID,
        range: tab,
      });
      const [header, ...rows] = res.data.values || [[]];
      return rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
    } catch (err) {
      console.warn(`Google Sheets failed (${err.message}). Using local sample data.`);
    }
  }
  return readSample()[tab];
}

async function getSubscriber(mobile) {
  const subs = await readTab('Subscribers');
  return subs.find((s) => s.mobile === mobile);
}

// Work out total, paid, due and status for one bill. Nothing is stored in the sheet.
function enrich(bill, allPayments) {
  const voice = Number(bill.voice) || 0;
  const dth = Number(bill.dth) || 0;
  const internet = Number(bill.internet) || 0;
  const total = voice + dth + internet;
  const payments = allPayments.filter((p) => p.bill_id === bill.bill_id);
  const paid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const due = Math.max(total - paid, 0);
  const status = due === 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
  const overdue = due > 0 && new Date(bill.due_date) < new Date();
  return { ...bill, voice, dth, internet, total, paid, due, status, overdue, payments };
}

// All bills of ONE subscriber, newest first
async function getBillsFor(mobile) {
  const [bills, payments] = await Promise.all([readTab('Bills'), readTab('Payments')]);
  return bills
    .filter((b) => b.mobile === mobile)
    .map((b) => enrich(b, payments))
    .sort((a, b) => b.issue_date.localeCompare(a.issue_date));
}

// One bill, but only if it belongs to this subscriber (security check)
async function getBillFor(mobile, billId) {
  const bills = await getBillsFor(mobile);
  return bills.find((b) => b.bill_id === billId);
}

async function addPayment(p) {
  if (useSheets()) {
    try {
      await sheetsClient().spreadsheets.values.append({
        spreadsheetId: process.env.SHEET_ID,
        range: 'Payments',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[p.payment_id, p.bill_id, p.date, p.amount, p.mode, p.reference]] },
      });
      return;
    } catch (err) {
      console.warn(`Could not write to Google Sheets (${err.message}). Saving locally.`);
    }
  }
  const data = readSample();
  data.Payments.push({ ...p, amount: String(p.amount) });
  fs.writeFileSync(SAMPLE, JSON.stringify(data, null, 2));
}

module.exports = { getSubscriber, getBillsFor, getBillFor, addPayment };