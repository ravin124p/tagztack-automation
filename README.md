# TagZtack Automation

Single-URL marketing tag inventory + automation testing dashboard.

Capture a page in headless Chromium, see every third-party tag that fires
(Adobe Analytics, GA4, GTM, Facebook Pixel, LinkedIn, Pinterest, Snap, TikTok,
The Trade Desk, Hotjar, Quantum Metric, Tealium, OneTrust, Marketo, and ~70
others), drill into each tag's variables (eVars, props, pixel IDs, payloads),
and assert pass/fail with an inline test builder or uploaded JSON/CSV test docs.

---

## Prerequisites

You need these installed on your machine before running the app.

| Tool | Version | Why |
|------|---------|-----|
| **Node.js** | 18 or newer | runs the backend (Express) and frontend (Vite) |
| **npm** | bundled with Node | package install + run scripts |
| **~300 MB free disk** | — | Playwright Chromium binary (~150 MB) + node_modules |
| **macOS / Linux / Windows** | any modern | tested on macOS Apple Silicon, runs on all three |

### Installing Node.js

- **macOS (recommended via Homebrew):**
  ```bash
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  brew install node
  ```
- **macOS / Windows (official installer):** download the LTS `.pkg` or `.msi` from <https://nodejs.org>
- **Linux (Ubuntu/Debian):** `curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - && sudo apt install nodejs`

Verify:
```bash
node -v   # should print v18.x or higher
npm -v
```

---

## One-time setup

From the project root:

```bash
npm run install:all
```

This installs:
- root dev dependencies (`concurrently`)
- backend dependencies (Express, better-sqlite3, Playwright)
- frontend dependencies (React, Vite)
- Playwright's headless Chromium browser (~150 MB, one-time download)

Takes 2–5 minutes on a fresh machine.

---

## Running the app

From the project root:

```bash
npm start
```

This starts both servers in one terminal with color-prefixed output:

- `[backend]` (yellow) — Express API on **<http://localhost:3000>**
- `[frontend]` (cyan)  — Vite dev server on **<http://localhost:5173>**

When you see both `API listening on http://localhost:3000` and Vite's
`ready in NNNms`, open **<http://localhost:5173>** in your browser.

`Ctrl+C` once stops both.

---

## Using the app

### Tag Inventory

1. Type a URL in the **URL** bar at the top → click **▶ Capture** (or press Enter).
2. Wait 5–60 seconds while headless Chromium loads the page and records every
   network request.
3. The dashboard populates:
   - 4 stat cards (Pages Scanned · Unique Tags · Broken Tag Requests · Broken Pages)
   - Category breakdown bar (Advertising / Web Analytics / Tag Management / etc.)
   - Tag table grouped by tag name; expand any row to see per-account breakdown.
4. Click any account row → slide-in panel shows extracted **variables**
   (Adobe eVars/props, Pinterest event params, GA4 measurement IDs, etc.) with
   search and copy-to-clipboard.
5. Click any stat card or the category bar → drill-in panel with that slice.

### Automation Testing

1. Switch to **Automation Testing** in the left sidebar.
2. Two ways to define tests:
   - **Upload Test Document** — drop a JSON or CSV file. Click `↓ Sample JSON`
     to see the format.
   - **Build Tests Inline** — pick a Tag → Assertion → Variable → Expected
     value → `+ Add Condition`. Stack multiple conditions with **AND** (all
     must pass) or **OR** (any can pass) logic. The tag stays selected so you
     can quickly add multiple variable checks for the same tag.
3. Mix uploaded + inline tests freely; both run in one suite.
4. Click **▶ Run All Tests** → results panel shows pass/fail per test, click
   any row to expand for full actual-vs-expected diff.

### Supported assertions
`fires`, `not-fires`, `equals`, `not-equals`, `contains`, `not-contains`,
`regex`, `exists`, `not-exists`.

---

## Project layout

```
tagztack-automation/
├── package.json                  one-shot npm start runs both
├── README.md
├── backend/                      Express + Playwright + SQLite
│   ├── package.json
│   └── src/
│       ├── server.js             API routes
│       ├── capture.js            Playwright capture engine
│       └── db.js                 SQLite schema (auto-created on first run)
└── frontend/                     React + Vite
    ├── package.json
    ├── index.html
    ├── public/favicon.svg
    └── src/
        ├── App.jsx
        ├── main.jsx
        ├── styles.css
        ├── tags/                 vendor taxonomy + variable extractors
        │   ├── taxonomy.js       ~77 vendors with detection rules
        │   ├── detector.js       matches captured requests to vendors
        │   └── variables.js      decodes payloads into named variables
        ├── automation/
        │   └── runner.js         test parser + assertion engine
        ├── assets/us-bank.png
        └── components/
            ├── OpHeader.jsx          top header with branding + URL
            ├── OpSidebar.jsx         2-item nav
            ├── TagsView.jsx          Tag Inventory main view
            ├── AutomationTestingView.jsx
            ├── TagZtackMark.jsx      brand SVG mark
            └── LogoOptions.jsx       7 alternate logo variants
```

---

## API reference

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/captures` | `{ url }` → triggers capture, returns full result |
| `GET`  | `/api/captures` | list of all past captures |
| `GET`  | `/api/captures/:id` | single capture with all requests |
| `DELETE` | `/api/captures/:id` | delete a capture |

Captures persist in `backend/data/app.db` (SQLite). Safe to delete the file —
it'll be recreated on next run.

---

## Troubleshooting

**`EADDRINUSE: address already in use ::3000` (or `:5173`)**
Another process is bound to that port. Free both ports with:
```bash
lsof -ti:3000,5173 | xargs kill
```
then `npm start` again.

**`command not found: node` or `npm`**
Node.js isn't on your PATH. On macOS with Homebrew, add this once:
```bash
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
```
then close and reopen the terminal.

**Capture times out / takes 60s**
Marketing-heavy pages (banking, retail) often have constant beacons that
prevent the network from going idle, so the capture waits the full timeout.
Tags themselves usually fire in the first 5 seconds — the rest is heartbeats.
Open `backend/src/capture.js` and switch `waitUntil: 'networkidle'` to
`waitUntil: 'load'` for faster captures (~5–10s) at the cost of missing
late-firing widgets.

**Playwright browser missing**
If you see `browserType.launch: Executable doesn't exist`, install it:
```bash
cd backend
npx playwright install chromium
```
