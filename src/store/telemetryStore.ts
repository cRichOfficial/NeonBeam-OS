import { create } from 'zustand';
import type { MachineTelemetry } from '../types/grbl';

interface TelemetryState {
    telemetry:       MachineTelemetry;
    connected:       boolean;
    updateTelemetry: (data: Partial<MachineTelemetry>) => void;
    updateStatusRaw: (data: any) => void;
    setConnected:    (v: boolean) => void;
}

const defaultTelemetry: MachineTelemetry = {
    state: 'Connecting',
    mpos: { x: 0, y: 0, z: 0 },
    wpos: { x: 0, y: 0, z: 0 },
    feedRate: 0,
    spindleSpeed: 0,
};

export const useTelemetryStore = create<TelemetryState>((set) => ({
    telemetry: defaultTelemetry,
    connected: false,
    setConnected: (v) => set({ connected: v }),
    updateTelemetry: (data) => set((state) => ({ telemetry: { ...state.telemetry, ...data } })),

    updateStatusRaw: (data: any) => {
        set((state) => {
            const t = { ...state.telemetry };

            // ── State ──────────────────────────────────────────────────────────
            if (data.state) t.state = data.state;

            // ── Positions ─────────────────────────────────────────────────────
            // New backend sends pre-parsed {x,y,z} objects.
            // Legacy / raw backend sends comma-separated strings.
            if (data.mpos && typeof data.mpos === 'object') {
                t.mpos = data.mpos;
            } else if (data.MPos && typeof data.MPos === 'string') {
                const p = data.MPos.split(',');
                t.mpos = { x: parseFloat(p[0]), y: parseFloat(p[1]), z: parseFloat(p[2] ?? '0') };
            }

            if (data.wpos && typeof data.wpos === 'object') {
                t.wpos = data.wpos;
            } else if (data.WPos && typeof data.WPos === 'string') {
                const p = data.WPos.split(',');
                t.wpos = { x: parseFloat(p[0]), y: parseFloat(p[1]), z: parseFloat(p[2] ?? '0') };
            }

            // ── Feed & Spindle ─────────────────────────────────────────────────
            if (typeof data.feedRate     === 'number') t.feedRate     = data.feedRate;
            if (typeof data.spindleSpeed === 'number') t.spindleSpeed = data.spindleSpeed;

            // Legacy FS string fallback
            if (data.FS && typeof data.FS === 'string') {
                const p = data.FS.split(',');
                t.feedRate     = parseFloat(p[0]);
                t.spindleSpeed = parseFloat(p[1] ?? '0');
            }

            return { telemetry: t };
        });
    },
}));
