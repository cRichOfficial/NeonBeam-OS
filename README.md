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

## Environment Discovery

NeonBeam OS runs purely client-side. Rather than baking API URLs into the container at compile-time (which hurts portability across mobile devices), NeonBeam OS dynamically connects to its backend peers. 
If running locally, it defaults to the host machine serving the UI (`window.location.hostname`). If operating across complex subnets, you can manually bridge connections inside the **NeonBeam Settings** UI at runtime.

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

Vite binds to `0.0.0.0` by default in Docker.
When loading from a phone, simply open your laptop's LAN IP configuration:

1. Find your laptop's LAN IP (e.g. `192.168.1.50`).
2. Open `http://192.168.1.50:3000` on your phone.

The application computes backend requests relative to its `window.location.hostname` (in this case `192.168.1.50`), gracefully allowing true mobile connectivity over WiFi without statically binding `.env` variables.

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
