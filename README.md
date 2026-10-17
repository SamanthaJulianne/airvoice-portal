# AirVoice Postpaid Billing Portal

A web portal where AirVoice postpaid subscribers log in with their mobile number and an emailed OTP, view their bill history with a service-wise breakdown, download any bill as PDF, XLS or CSV, and pay a bill through a mock UPI QR flow.

Subscriber, bill and payment data lives in a **Google Sheet**. The app validates the mobile number and subscriber status against that sheet at login and reads bills and payments from it.

## Features

- OTP login (6 digits, emailed, expires in 5 minutes, 3 attempts)
- Clear error messages for invalid, unregistered and inactive numbers
- Dashboard with total outstanding amount and all bills, newest first
- Bill detail with Voice / DTH / Internet breakdown, donut chart and payment history
- "Bill explainer" sentence comparing a bill with the previous month (for example, "Rs. 150 more than Aug 2026, mostly because of Internet")
- Bill status derived from payments: Paid, Partially paid, Unpaid, Overdue
- Download any bill as PDF, XLS or CSV
- Mock payment screen with UPI QR code, 5-minute countdown and a "simulate payment" button that writes a payment row back to the Google Sheet
- Local fallback data so a demo still works if Google is unreachable

## Tech stack

| Part | Tool |
|---|---|
| Frontend | React (Vite), React Router, Recharts |
| Backend | Node.js, Express |
| Data source | Google Sheets, accessed through a small Google Apps Script web app |
| OTP delivery | Email via Nodemailer to Mailpit (local test inbox) |
| Files and QR | pdfkit, exceljs, qrcode |
| Auth | JSON Web Token in an httpOnly cookie |

## How it fits together

```
Browser (React, :5173)  -->  Express API (:4000)  -->  Google Apps Script web app  -->  Google Sheet
                                   |
                                   +-->  Mailpit SMTP (:1025), inbox at :8025
                                   +-->  sample.json (fallback if the sheet is unreachable)
```

## Setup and run

### Prerequisites

- Node.js 18 or newer
- Mailpit (download the binary for your OS from the Mailpit GitHub releases page)
- A Google account

### 1. Start Mailpit

Run the `mailpit` executable. It listens for email on port 1025, and the inbox is at http://localhost:8025.

### 2. Create the Google Sheet

1. Create a Google Sheet with three tabs named exactly `Subscribers`, `Bills` and `Payments`.
2. Open **Extensions > Apps Script**, paste the code from `apps-script/Code.gs`, and set your own value for `SECRET` on the first line.
3. Select the `seed` function and click **Run** once (approve the permissions). This fills the three tabs with the demo data.
4. Click **Deploy > New deployment > Web app**, set **Execute as: Me** and **Who has access: Anyone**, and copy the Web app URL (it ends in `/exec`).

### 3. Configure the backend

```
cd server
cp .env.example .env      (on Windows: copy .env.example .env)
```

Edit `server/.env`:

```
PORT=4000
JWT_SECRET=any-long-random-text
USE_SHEETS=true
SHEETS_URL=<your Apps Script web app URL>
SHEETS_KEY=<the SECRET you set in the script>
SMTP_HOST=localhost
SMTP_PORT=1025
```

Set `USE_SHEETS=false` to run entirely from `server/sample.json` without Google.

### 4. Run the backend

```
cd server
npm install
npm run dev
```

### 5. Run the frontend

```
cd client
npm install
npm run dev
```

Open http://localhost:5173 (use `localhost`, not `127.0.0.1`, so the login cookie works).

### Demo accounts

| Mobile | Subscriber | What it shows |
|---|---|---|
| 9876543210 | Priya Raman | Active. One paid bill and one partially paid bill |
| 9876501234 | Arjun Mehta | Active. One unpaid, overdue bill |
| 9123456780 | Kavya Nair | Inactive. Login is blocked with an error message |

OTP emails appear in Mailpit at http://localhost:8025.

## Google Sheet schema

One row per subscriber, one row per monthly bill, one row per payment. `mobile` links subscribers to bills, and `bill_id` links bills to payments.

**Subscribers**

| Column | Meaning |
|---|---|
| mobile | 10-digit mobile number (key) |
| name | Subscriber name |
| email | Address where the OTP is sent |
| status | `active` or `inactive` |
| plan | Plan name |
| address | City or address |

**Bills**

| Column | Meaning |
|---|---|
| bill_id | Unique bill ID (key) |
| mobile | Subscriber the bill belongs to |
| period | Billing month, for example `Sep 2026` |
| issue_date | Date issued (YYYY-MM-DD) |
| due_date | Payment due date (YYYY-MM-DD) |
| voice, dth, internet | Service-wise charges in INR |

**Payments**

| Column | Meaning |
|---|---|
| payment_id | Unique payment ID (key) |
| bill_id | Bill the payment is for |
| date | Payment date (YYYY-MM-DD) |
| amount | Amount paid in INR |
| mode | UPI, Card, and so on |
| reference | Transaction reference |

The bill total, amount paid, amount due and status are **not stored**. They are calculated from the rows above, so the sheet has a single source of truth and cannot contradict itself.

## API summary

| Method | Route | Purpose |
|---|---|---|
| POST | /api/auth/request-otp | Validate number and status, email an OTP |
| POST | /api/auth/verify-otp | Check the OTP, start a session |
| GET | /api/auth/me | Current subscriber |
| POST | /api/auth/logout | End the session |
| GET | /api/bills | All bills of the logged-in subscriber |
| GET | /api/bills/:id | One bill with payment history |
| GET | /api/bills/:id/download?format=pdf\|xls\|csv | Download a bill |
| GET | /api/bills/:id/pay | UPI link and QR code for the amount due |
| POST | /api/bills/:id/simulate-payment | Record a mock payment |

## Assumptions and why

1. **The OTP is sent by email, to the address on the subscriber's row.** The brief mentions Mailpit, which only catches email, so the email column doubles as the OTP channel. No SMS is involved.
2. **Mobile numbers are 10 digits with no country code.** This is an Indian operator, and it keeps validation simple and strict.
3. **"Inactive" means the `status` column is anything other than `active`** (case-insensitive). Inactive subscribers are stopped at the OTP request with a clear message, before any OTP is generated.
4. **An unregistered number gets a different error from an invalid one.** Invalid means the wrong format. Unregistered means the format is fine but the number is not in the sheet. This matches the requirement to show an appropriate message in each case. (A production system might hide this difference to prevent number enumeration.)
5. **OTP rules: 6 digits, valid for 5 minutes, 3 attempts.** The OTP is stored only as a hash. Requests are rate limited to 10 per 10 minutes per IP.
6. **The session lasts 30 minutes** and is a JWT in an httpOnly cookie, so page scripts cannot read it.
7. **Bill totals are calculated** as voice + dth + internet, not stored, to avoid mismatches between the breakdown and the total.
8. **Payment status is derived from the Payments tab**: no payments is Unpaid, some payments is Partially paid, and payments covering the total is Paid. This allows partial payments without a separate status column.
9. **Overdue** means an amount is still due and the due date has passed.
10. **Currency is INR.** The PDF prints "Rs." because the default PDF font cannot draw the rupee symbol.
11. **Payment is a mock.** The QR encodes a standard `upi://pay` link for the amount due. The "Simulate successful payment" button records one payment for the full due amount. The 5-minute QR countdown runs in the browser only. No real money moves.
12. **A subscriber can only open their own bills.** Every bill route checks that the bill belongs to the logged-in mobile number, so changing an ID in the URL returns "not found".
13. **Google Sheets is accessed through an Apps Script web app.** Google blocked service-account key creation on my account (an organisation policy enforced by default), so I used a small script bound to the sheet. The script returns tab data as JSON and appends payment rows, and every request must carry a shared secret.
14. **If the sheet cannot be reached, the app falls back to `server/sample.json`** and prints a warning in the server console, so a demo is not lost to a network problem. Set `USE_SHEETS=false` to use the fallback deliberately.
15. **Demo data is small**: three subscribers and five bills, chosen to cover paid, partially paid, unpaid and inactive cases.

## Security notes

- Secrets (`.env`, any key files) are excluded by `.gitignore`. `server/.env.example` holds placeholders only.
- OTPs are hashed, expire, and are limited to 3 attempts.
- The session cookie is httpOnly, and bill access is checked against the logged-in subscriber.
- CORS only allows the frontend origin (http://localhost:5173).

## Known limitations

- OTPs are held in server memory, so a backend restart invalidates any pending OTP. A real system would use Redis or a database.
- The Apps Script secret travels in the URL query string for reads. That is acceptable for a demo but would move to a request header or a proper OAuth flow in production.
- The sheet is read on every request with no caching, so responses depend on Google's latency and Apps Script quotas.
- Payments are mock, and the simulated payment always covers the full amount due.
- The CSV export does not escape commas inside values (no current field contains one).
- There are no automated tests, and no pagination for subscribers with very long bill histories.

## Project structure

```
airvoice-portal/
  apps-script/Code.gs     Google Apps Script bridge for the sheet
  server/
    index.js              Express app and routes mounting
    data.js               Sheet access, totals and status calculation
    middleware.js         Login check
    routes/auth.js        OTP request and verify, session
    routes/bills.js       Bills, downloads, payment
    sample.json           Fallback and demo data
    .env.example          Settings template
  client/
    src/api.js            API helper
    src/pages/            Login, Dashboard, BillDetail, Pay
    src/components/       Header, Logo, Badge
```

## Author
Samantha Julianne S
