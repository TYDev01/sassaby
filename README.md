# Sassaby

A crypto off-ramp platform that bridges crypto to local bank accounts across Africa. Users deposit to a desk address and receive fiat in any local bank — no wallet connection required.

**Live:** [sassaby.vercel.app](https://sassaby.vercel.app)

---

## Features

- **Account sign-in** — email accounts, since a fiat credit has to match a person, not an address
- **Multi-token support** — BTC self-custody, plus USDT/USDC/ETH/BNB/TRX/SOL/LTC routed through Bitget
- **Multi-currency payouts** — receive NGN, GHS, or KES
- **Real-time rates** — live exchange rates fetched from the backend, admin-configurable
- **1.5% flat fee** — deducted automatically, shown before confirmation
- **QR code deposit** — per-token deposit address with QR code displayed in transfer modal
- **Transfer confirmation modal** — review amounts and confirm before funds are sent
- **Transfer history** — track past transfers with status updates
- **Admin dashboard** — protected route for managing rates, transfer history, and deposit addresses
- **Flutterwave payouts** — bank transfers powered by Flutterwave
- **Fully responsive** — mobile-first UI with dark theme
---

## Tech Stack

### Frontend
| Library | Purpose |
|---|---|
| Next.js 16 (App Router) | Framework, SSR/SSG, routing |
| TypeScript | Type safety |
| Tailwind CSS v4 | Styling |
| shadcn/ui | UI primitives |
| Framer Motion | Animations |
| react-qr-code | QR code display in transfer modal |
| Lucide React | Icons |
| Sonner | Toast notifications |
| Recharts | Admin analytics charts |

### Backend
| Library | Purpose |
|---|---|
| Express 4 | HTTP server |
| TypeScript | Type safety |
| Prisma 5 | ORM |
| PostgreSQL | Database |
| Axios | Flutterwave API calls |
| dotenv | Environment config |

---

## Project Structure

```
Sassaby/
├── README.md
├── Backend/
│   ├── railway.toml              # Railway deployment config
│   ├── package.json
│   ├── tsconfig.json
│   ├── prisma/
│   │   ├── schema.prisma         # Transfer, RateConfig, DepositAddress models
│   │   └── migrations/
│   └── src/
│       ├── index.ts              # Express app entry point
│       ├── store.ts              # In-memory rate store
│       └── routes/
│           ├── transfers.ts      # POST/GET transfers
│           ├── rates.ts          # GET/POST exchange rates
│           ├── admin.ts          # Admin-only protected routes
│           ├── flutterwave.ts    # Bank transfer execution
│           └── depositAddresses.ts # Deposit address management
└── frontend/
    └── src/
        ├── app/
        │   ├── layout.tsx        # Root layout, viewport, ClientProviders
        │   ├── page.tsx          # Home → TransferPage
        │   ├── error.tsx         # Global error boundary
        │   ├── globals.css
        │   ├── admin/page.tsx    # Admin dashboard route
        │   └── history/page.tsx  # Transfer history route
        ├── components/
        │   ├── TransferPage.tsx          # Main transfer flow
        │   ├── TransferModal.tsx         # Confirmation modal with QR code
        │   ├── TransferCard.tsx          # Send amount input
        │   ├── ReceiveCard.tsx           # Receive amount display
        │   ├── BankSelector.tsx          # Bank + account number input
        │   ├── Navbar.tsx                # Top navigation
        │   ├── AdminDashboard.tsx        # Admin: overview, history, addresses
        │   ├── AdminChainHistory.tsx     # On-chain transaction history
        │   ├── HistoryPage.tsx           # User transfer history
        │   ├── ClientProviders.tsx       # Auth context provider
        │   └── MouseGlow.tsx             # Cursor glow effect
        └── lib/
            ├── api.ts            # All backend API calls
            └── utils.ts          # Shared utilities
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+
- PostgreSQL database

### Backend

```bash
cd Backend
cp .env.example .env   # fill in DATABASE_URL and FLW_SECRET_KEY
npm install
npx prisma migrate deploy
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Environment Variables

### Backend (`Backend/.env`)

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `FLW_SECRET_KEY` | Flutterwave secret key |
| `FRONTEND_URL` | Frontend origin for CORS |
| `PORT` | Server port (default: 4000) |

### Frontend (`frontend/.env.local`)

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_API_URL` | Backend URL |
| `BACKEND_URL` | Backend origin for server-side route handlers (never `NEXT_PUBLIC_`) |
| `ADMIN_API_KEY` | Admin API key, server-side only |

---

## Deployment

| Service | Platform |
|---|---|
| Frontend | [Vercel](https://vercel.com) |
| Backend | [Railway](https://railway.app) |
| Database | Railway PostgreSQL |

Railway reads `Backend/railway.toml` for build and start commands. Set **Root Directory** to `Backend` in Railway service settings.

---

## Admin Access

The admin dashboard at `/admin` is protected — only an account flagged as an operator can reach it. From the dashboard you can:

- View platform stats and transfer history
- Set the USD→fiat rate per currency, or let it derive from your published Bitget P2P ads
- Manage deposit addresses per (token, chain) pair

---

## License

MIT
