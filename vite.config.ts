import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The sidecar always runs natively on the HOST OS (not in Docker) so Zeroconf
// can access the real network stack.  The proxy target therefore differs:
//
//   Native dev (npm run dev on host):
//     Vite IS on the host → 127.0.0.1:3001 works fine.
//
//   Docker dev (frontend container):
//     Vite's localhost = container loopback, NOT the host.
//     Use host.docker.internal:3001 (Docker Desktop auto-resolves this to
//     the host IP; on Linux add extra_hosts: host.docker.internal:host-gateway
//     to the compose service).
//
// DISCOVERY_SIDECAR_URL is set in docker-compose.yml for Docker environments.
// For native dev it defaults to http://127.0.0.1:3001.
const sidecarUrl = process.env.DISCOVERY_SIDECAR_URL ?? 'http://127.0.0.1:3001';
const fileServerUrl = process.env.FILE_SERVER_URL ?? 'http://127.0.0.1:8002';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    allowedHosts: true,
    watch: {
      usePolling: true,
    },
    proxy: {
      '/api/discovery': {
        target: sidecarUrl,
        changeOrigin: true,
      },
      '/api/images': {
        target: fileServerUrl,
        changeOrigin: true,
      },
    },
  },
})

