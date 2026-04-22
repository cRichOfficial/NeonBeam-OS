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
        let dead = false;   // true after component unmounts — stops reconnect loop

        const connect = () => {
            if (dead) return;

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
                } catch {
                    // Ignore malformed frames
                }
            };

            ws.onerror = (err) => {
                // onerror always fires before onclose — log only, don't mutate state here
                console.warn('[NeonBeam] Telemetry WS error', err);
            };

            ws.onclose = () => {
                setConnected(false);

                // Show "Connecting" — NOT "Offline".
                // The serial connection and any running job on the backend are
                // completely unaffected by this WS drop. We'll get fresh machine
                // state as soon as the WS reconnects.
                updateTelemetry({ state: 'Connecting' });

                if (!dead) {
                    reconnectTimeout = setTimeout(connect, 3000);
                }
            };
        };

        connect();

        return () => {
            dead = true;
            clearTimeout(reconnectTimeout);
            wsRef.current?.close();
        };
    }, [wsUrl, updateStatusRaw, updateTelemetry, setConnected]);
};
