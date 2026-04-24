import { useEffect, useRef } from 'react';
import { useTelemetryStore } from '../store/telemetryStore';

/**
 * Maintains a persistent WebSocket connection to the NeonBeam Core telemetry
 * endpoint and feeds parsed status frames into the Zustand store.
 *
 * Lifecycle rules:
 * ─────────────────────────────────────────────────────────────────────────────
 * • The WebSocket is a *read-only observer* of the machine. It has no influence
 *   on the serial connection or any running GCode job on the backend.
 *
 * • When the WS drops (network blip, phone app backgrounded, etc.) we show
 *   "Connecting" in the UI and keep retrying every 3 s. We do NOT set the
 *   machine state to "Offline" — the machine may be mid-job and perfectly fine.
 *
 * • "Offline" is only written by the backend telemetry parser when the serial
 *   connection to the MCU is actually lost (i.e. the backend sends it), or on
 *   the very first render before any frame has arrived.
 */
export const useTelemetry = (wsUrl: string) => {
    const updateStatusRaw = useTelemetryStore(state => state.updateStatusRaw);
    const updateTelemetry = useTelemetryStore(state => state.updateTelemetry);
    const setConnected    = useTelemetryStore(state => state.setConnected);
    const wsRef = useRef<WebSocket | null>(null);

    useEffect(() => {
        if (!wsUrl) return;
        let reconnectTimeout: ReturnType<typeof setTimeout>;
        let healthInterval: ReturnType<typeof setInterval>;
        let dead = false;

        const connect = () => {
            if (dead || (wsRef.current && wsRef.current.readyState === WebSocket.OPEN)) return;
            
            // Close existing if any (cleanup)
            if (wsRef.current) {
                try { wsRef.current.close(); } catch {}
            }

            console.log('[NeonBeam] Attempting telemetry connection:', wsUrl);
            const ws = new WebSocket(wsUrl);
            wsRef.current = ws;

            ws.onopen = () => {
                setConnected(true);
                console.log('[NeonBeam] Telemetry WS connected');
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    updateStatusRaw(data);
                } catch {}
            };

            ws.onerror = () => {};

            ws.onclose = () => {
                setConnected(false);
                updateTelemetry({ state: 'Connecting' });
                if (!dead) {
                    clearTimeout(reconnectTimeout);
                    reconnectTimeout = setTimeout(connect, 4000);
                }
            };
        };

        // ── Aggressive PWA Recovery Logic ─────────────────────────────────────
        
        // 1. User Gesture Trigger: Many mobile browsers restrict autonomously 
        //    opened WebSockets in PWAs. We force a poke on the first touch/click.
        const poke = () => {
            console.log('[NeonBeam] User gesture detected, poking connection...');
            connect();
        };
        window.addEventListener('pointerdown', poke, { once: true });
        window.addEventListener('touchstart',  poke, { once: true });

        // 2. Visibility Trigger: Reconnect immediately when app is resumed
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') {
                console.log('[NeonBeam] App visible, forcing sync...');
                connect();
            }
        };
        document.addEventListener('visibilitychange', handleVisibility);

        // 3. Active Health Probe: Periodically check if the backend is reachable via HTTP.
        //    If HTTP works but WS is down, the WS constructor might be blocked or 
        //    failing silently; we force a retry.
        healthInterval = setInterval(async () => {
            if (dead || (wsRef.current && wsRef.current.readyState === WebSocket.OPEN)) return;
            
            try {
                const httpUrl = wsUrl.replace(/^ws/, 'http').replace(/\/ws\/telemetry$/, '/api/health');
                const res = await fetch(httpUrl, { signal: AbortSignal.timeout(2000) });
                if (res.ok) {
                    console.log('[NeonBeam] Health probe OK, but WS is down. Retrying...');
                    connect();
                }
            } catch {}
        }, 6000);

        // Initial attempt
        connect();

        return () => {
            dead = true;
            window.removeEventListener('pointerdown', poke);
            window.removeEventListener('touchstart',  poke);
            document.removeEventListener('visibilitychange', handleVisibility);
            clearTimeout(reconnectTimeout);
            clearInterval(healthInterval);
            wsRef.current?.close();
        };
    }, [wsUrl, updateStatusRaw, updateTelemetry, setConnected]);
};
