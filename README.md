# Supermarket Billing Software

A complete, production-ready billing/POS system for supermarkets — dashboard, product
management, billing/POS, customer management, inventory tracking, reports (with Excel/PDF
export), and role-based authentication (Admin/Staff).

**Stack:** React (Vite) frontend + Node.js/Express backend + SQLite (file-based, zero
external DB server required). Single Node process serves both the API and the built
frontend, so deployment is just "run one server."

---

## 1. What's included

| Module | Status |
|---|---|
| Dashboard (sales summary, product count, low stock, recent bills) | Done |
| Product Management (CRUD, barcode, categories, stock update) | Done |
| Billing / POS (search/scan, cart, tax+discount calc, invoice, print) | Done |
| Customer Management (CRUD, purchase history, loyalty points) | Done |
| Inventory (stock in/out, auto-deduction on sale, low stock alerts) | Done |
| Reports (daily/weekly/monthly, best sellers, profit, Excel/PDF export) | Done |
| Auth & Security (JWT login, Admin/Staff roles, bcrypt password hashing) | Done |
| Automated tests (29 backend integration tests covering all modules) | Done |

---

## 2. Quick Start (local machine)

Requirements: **Node.js 18+** (Node 20 recommended). No external database needed.

```bash
# from the project root
npm run setup       # installs both frontend & backend deps, builds the frontend, creates the DB
npm start            # starts the server on http://localhost:5000
```

Then open `http://localhost:5000` in your browser.

**Default login:**
- Username: `admin`
- Password: `Admin@123`

Change this password immediately after your first login (Settings -> Change Your Password).

---

## 3. Configuration

All configuration lives in `backend/.env` (copy `backend/.env.example` to `backend/.env` and edit):

```env
PORT=5000
JWT_SECRET=<a long random string - REQUIRED, the app will not start without it>
JWT_EXPIRES_IN=12h
CORS_ORIGIN=*                      # set to your real domain in production, e.g. https://billing.mystore.com
DEFAULT_ADMIN_PASSWORD=Admin@123   # only used the very first time the DB is created
```

Generate a strong `JWT_SECRET` with:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Store-level settings (store name, currency symbol, tax %, invoice number prefix) are
configured **inside the app** under **Settings** (Admin only) - no code changes needed.

---

## 4. Deployment (hosted online)

Since this will run hosted online, here are two supported paths.

### Option A - Plain Node hosting (Render, Railway, a VPS, etc.) - recommended, verified

This is the path that has been tested end-to-end in this build.

1. Push this project to a Git repository.
2. On your host, set the **build command**:
   ```bash
   npm run setup
   ```
3. Set the **start command**:
   ```bash
   npm start
   ```
4. Set environment variables on the host (same as `.env` above) - at minimum `JWT_SECRET`.
5. **Persist the `backend/data` folder.** This is where `supermarket.db` lives. On platforms
   with ephemeral filesystems (e.g. most free-tier PaaS dynos), attach a persistent disk/volume
   to this path, or your data will be wiped on every redeploy/restart. Render and Railway both
   support persistent volumes/disks - attach one mounted at `backend/data`.
6. Point your domain at the host. The app serves both API and UI from one port, so no separate
   frontend hosting is needed.

### Option B - Docker

A `Dockerfile` and `docker-compose.yml` are included for containerized hosting.

```bash
echo "JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")" > .env
docker compose up -d --build
```

This builds the frontend, starts the API+UI on port 5000, and persists the database in a
named Docker volume (`billing_data`) so data survives container restarts/upgrades.

> **Note:** the Docker path could not be build-tested in the environment this project was
> developed in (no Docker daemon available there). The Dockerfile follows standard,
> well-established patterns, but please run `docker compose up --build` yourself once and
> confirm `http://localhost:5000` responds before relying on it for production. The plain
> Node path (Option A) **was** fully tested and is the recommended route if you want the
> most-verified path to production.

### Reverse proxy / HTTPS

Whichever host you use, put the app behind HTTPS (most PaaS hosts do this automatically; on
a raw VPS, use Caddy or Nginx + Let's Encrypt in front of port 5000).

---

## 5. Running tests

```bash
npm test
```

This runs 29 backend integration tests (using an isolated, temporary SQLite file - your real
data is never touched) covering: authentication & role enforcement, product CRUD & stock
rules, billing math correctness (tax/discount/total to the cent) & auto stock deduction,
customer history, dashboard aggregation, and report/export generation.

All 29 currently pass.

---

## 6. Project structure

```
supermarket-billing/
├── backend/
│   ├── src/
│   │   ├── database/        # schema.sql, migration, db connection
│   │   ├── routes/          # auth, products, bills, customers, inventory, dashboard, reports, settings
│   │   ├── middleware/      # auth (JWT + roles), centralized error handling
│   │   ├── utils/           # JWT helpers
│   │   ├── app.js           # Express app (also serves built frontend)
│   │   └── server.js        # entry point
│   ├── tests/                # Jest + Supertest integration tests
│   └── data/                  # supermarket.db lives here (gitignored, persist this in prod)
├── frontend/
│   └── src/
│       ├── pages/            # Dashboard, POS, Products, Customers, Inventory, Reports, Settings, etc.
│       ├── components/       # AppLayout, Modal, ConfirmDialog
│       ├── context/          # Auth + Settings React context
│       └── api/              # Axios client
├── Dockerfile
├── docker-compose.yml
└── package.json               # root convenience scripts (setup/start/test)
```

---

## 7. User roles

- **Admin**: full access - products, billing, customers, inventory, reports (incl. profit
  margins), settings, and staff account management.
- **Staff**: billing/POS, products, customers, inventory, and non-profit reports. Cannot
  delete products, change store settings, view profit analysis, or manage other accounts.

Create staff accounts under **Staff Accounts** (Admin only) after logging in.

---

## 8. Notes on the database

This project uses SQLite via `node-sqlite3-wasm` - a pure WebAssembly SQLite engine with no
native compilation step. This was a deliberate choice for deployment reliability: it avoids
the common "native module won't build on the server" failure mode that affects
`better-sqlite3`/`sqlite3` on many minimal hosting images, while still being a real
file-backed relational database with full SQL, transactions, and foreign keys.

For a single supermarket counter or small chain, SQLite is genuinely sufficient - it
comfortably handles far more throughput than a single billing counter generates. If you later
scale to many concurrent stores writing simultaneously, migrating to PostgreSQL is a
contained change (the `database/db.js` module is the only file that would need to change,
since all routes go through its `run/get/all/transaction` helpers).

---

## 9. Support / next steps

- First login -> change the admin password (Settings page).
- Add your real products (Products page) or staff accounts (Staff Accounts page).
- Configure your store name, currency symbol, and tax % (Settings page).
- Start billing from the **Billing / POS** page.
