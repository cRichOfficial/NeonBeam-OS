# NeonBeam OS
### Progressive Web App — Laser Engraver Control Interface

NeonBeam OS is the browser-based PWA that provides the full operator interface for a grblHAL laser engraver. It runs entirely in the client browser (React + Vite) and communicates with **NeonBeam Core** and **NeonBeam Lens** over a local network.

> **Part of the NeonBeam Suite.** See the [root README](../README.md) for the full system architecture.

---

## Stack

| Layer | Technology |
|---|---|
| UI Framework | React 18 + TypeScript |
| Build Tool | Vite 6 |
| Styling | TailwindCSS v4 |
| State | Zustand (persisted to localStorage) |
| PWA | vite-plugin-pwa (Workbox) |
| GCode Engine | Custom TypeScript (client-side only) |

---

## Environment Variables

Copy `.env.example` from the repo root and adjust to match your deployment.

| Variable | Purpose | Example |
|---|---|---|
| `VITE_COMM_API_URL` | NeonBeam Core base URL | `http://192.168.1.10:8000` |
| `VITE_VISION_API_URL` | NeonBeam Lens base URL | `http://192.168.1.11:8001` |
| `DISCOVERY_SIDECAR_URL` | mDNS Sidecar (set by Docker/Vite proxy) | `http://host.docker.internal:3001` |

> In production builds these values are **baked into the JS bundle at build time** by Vite.  
> You must pass them as build args — see Production section below.

---

## Development — Full Stack on One Host

Use this mode when running everything (frontend dev server, NeonBeam Core, mDNS Sidecar) on a single development machine.

### Prerequisites

- Node.js ≥ 20
- npm ≥ 10
- Docker Desktop (for NeonBeam Core)
- Python 3.11+ (for the mDNS Sidecar — runs natively, not in Docker)

### Steps

```bash
# 1. Install dependencies
cd frontend
npm install

# 2. Copy and configure environment
cp ../.env.example ../.env
#    Edit .env — set VITE_COMM_API_URL to http://localhost:8000

# 3. Start the mDNS Sidecar (native, in a separate terminal)
#    Windows:
cd ../discovery_sidecar && .\start_sidecar.ps1
#    Linux / macOS:
cd ../discovery_sidecar && ./start_sidecar.sh

# 4. Start NeonBeam Core (Docker, from repo root)
docker compose up hardware-comm

# 5. Start the Vite dev server
cd frontend
npm run dev
```

The UI is served at **http://localhost:3000** (or the port shown by Vite).  
Hot-reload is active — changes to `src/` update instantly in the browser.

### Accessing from a Mobile Device on the Same LAN

Vite binds to `0.0.0.0` by default in Docker. When loading from a phone:

1. Find your laptop's LAN IP (e.g. `192.168.1.50`).
2. In `.env`, set `VITE_COMM_API_URL=http://192.168.1.50:8000`.
3. Restart the frontend container / dev server.
4. Open `http://192.168.1.50:3000` on your phone.

---

## Production

The production build compiles the React app via Vite and serves it through an nginx container. Backend URLs are embedded in the bundle at build time.

### Prerequisites

- Docker + Docker Compose on the host machine
- NeonBeam Core running on a Raspberry Pi 4 (`neonbeam-core.local` or a known IP)
- NeonBeam Lens running on a Raspberry Pi 5 (`neonbeam-lens.local` or a known IP)

### Steps

```bash
# 1. Build and start (from repo root)
VITE_COMM_API_URL=http://neonbeam-core.local:8000 \
VITE_VISION_API_URL=http://neonbeam-lens.local:8001 \
docker compose -f docker-compose.prod.yml up -d --build

# 2. The app is served on http://<host-ip>:80
#    Install it as a PWA from the browser address bar (Android/iOS share button).
```

To rebuild after a frontend code change:

```bash
docker compose -f docker-compose.prod.yml up -d --build frontend
```

---

## Git Repository

NeonBeam OS is designed to be maintained as its own standalone git repository.

```bash
cd frontend
git init
git remote add origin <your-remote-url>
git add .
git commit -m "Initial commit — NeonBeam OS"
git push -u origin main
```

A `.gitignore` is included that excludes `node_modules/`, `dist/`, and `.env` files.

---

## Project Layout

```
frontend/
├── src/
│   ├── views/          # Page-level modules (Dashboard, Studio, Settings…)
│   ├── store/          # Zustand state stores
│   ├── studio/         # GCode engine, SVG parser, dithering
│   ├── components/     # Shared UI components
│   └── index.css       # Global styles + Tailwind theme
├── public/             # Static assets + PWA manifest
├── Dockerfile          # Dev container (Vite dev server)
├── Dockerfile.prod     # Production container (nginx)
└── vite.config.ts
```
