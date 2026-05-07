import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AppSettings {
    // Workspace Machine Overrides
    machineWidth: number;
    machineHeight: number;
    toolHeadSize: number;
    probeOffsetX: number;
    probeOffsetY: number;
    zAxisEnabled: boolean;
    zProbeOffset: number;
    homingOffsetX: number;
    homingOffsetY: number;

    // Display / UX Overrides
    gridWidth: number;
    gridHeight: number;
    majorSpacing: number;
    minorSpacing: number;
    feedUnits: 'mm/min' | 'mm/s';
    systemTheme: 'Miami Neon' | 'Dark';
    svgDpi: number;
    bitmapDpi: number;
    maxSpindleS: number;    // mirrors $30 firmware setting — laser S scale (default 1000)
    laserTestPower: number;
    laserTestDuration: number;

    // Network — runtime-editable, persisted to localStorage
    coreApiUrl: string;
    lensApiUrl: string;
    debugMode: boolean;
    systemFont: string;
}

interface AppSettingsStore {
    settings: AppSettings;
    updateSettings: (newSettings: Partial<AppSettings>) => void;
}

// Exported so any module can reference the defaults (e.g. as a fallback guard)
export const DEFAULT_SETTINGS: AppSettings = {
    machineWidth: 400,
    machineHeight: 400,
    toolHeadSize: 0.1,
    probeOffsetX: 0,
    probeOffsetY: 0,
    zProbeOffset: -1.5,
    zAxisEnabled: false,
    homingOffsetX: 0,
    homingOffsetY: 0,

    gridWidth: 400,
    gridHeight: 400,
    majorSpacing: 50,
    minorSpacing: 10,
    feedUnits: 'mm/min',
    systemTheme: 'Miami Neon',
    svgDpi: 96,
    bitmapDpi: 96,
    maxSpindleS: 1000,      // matches grblHAL $30 default — change if your firmware differs
    laserTestPower: 5,
    laserTestDuration: 20,

    // Default backend URLs from environment variables (baked in at build time)
    // or empty strings if not provided.
    coreApiUrl: import.meta.env.VITE_COMM_API_URL || '',
    lensApiUrl: import.meta.env.VITE_VISION_API_URL || '',
    debugMode: false,
    systemFont: 'Anta',
};

export const useAppSettingsStore = create<AppSettingsStore>()(
    persist(
        (set) => ({
            settings: DEFAULT_SETTINGS,
            updateSettings: (data) =>
                set((state) => ({ settings: { ...state.settings, ...data } })),
        }),
        {
            name: 'neonbeam-app-settings',

            // ── Deep-merge fix ────────────────────────────────────────────────
            // Zustand's default persist merge is a shallow Object.assign at the
            // root level.  A stored { settings: { ...old } } replaces the entire
            // settings object, silently wiping every field added after the user
            // first visited (e.g. coreApiUrl / lensApiUrl become undefined).
            //
            // Consequence without this fix:
            //   ${undefined}/api/jog → "undefined/api/jog" (relative URL) →
            //   Vite dev-server responds with index.html (200 OK) →
            //   commands appear to send but are never received by the backend.
            //
            // This custom merge spreads DEFAULT_SETTINGS first so every new field
            // always has a valid default, then overlays the user's stored values.
            // Existing preferences are preserved; new fields get their defaults.
            merge: (persisted, current) => {
                const p = (persisted as Partial<AppSettingsStore> | null) ?? {};
                return {
                    ...current,
                    settings: {
                        ...DEFAULT_SETTINGS,    // ← guarantees new fields exist
                        ...(p.settings ?? {}),  // ← overlays user's stored prefs
                    },
                };
            },
        }
    )
);
