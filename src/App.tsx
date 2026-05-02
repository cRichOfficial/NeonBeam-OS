import React from 'react';
import { useTelemetry } from './hooks/useTelemetry';
import { ModuleRegistry } from './core/ModuleRegistry';
import { useNavigationStore } from './store/navigationStore';
import { useAppSettingsStore } from './store/appSettingsStore';
import { DashboardModule } from './views/DashboardModule';
import { StudioModule } from './views/StudioModule';
import { MachineSettingsModule } from './views/MachineSettingsModule';
import { AppSettingsModule } from './views/AppSettingsModule';
import { MaterialPresetsModule } from './views/MaterialPresetsModule';
import { GCodeStudioModule } from './views/GCodeStudioModule';
import { LensModule } from './views/LensModule';

// ── Core Module Registration ──────────────────────────────────────────────────
ModuleRegistry.register({
    id: 'dashboard',
    title: 'Machine Control',
    icon: (
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="24" cy="24" r="18" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.8" />
            <circle cx="24" cy="24" r="8"  stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.9" />
            <circle cx="24" cy="24" r="2.5" fill="currentColor" />
            <line x1="24" y1="6"  x2="24" y2="16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="24" y1="32" x2="24" y2="42" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="6"  y1="24" x2="16" y2="24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="32" y1="24" x2="42" y2="24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
    ),
    component: DashboardModule,
    isCore: true,
});

ModuleRegistry.register({ id: 'studio',           title: 'Design Studio',     icon: '🎨', component: StudioModule,          isCore: true });
ModuleRegistry.register({ id: 'material_presets',  title: 'Material Presets',  icon: '🔥', component: MaterialPresetsModule,  isCore: true });
ModuleRegistry.register({ id: 'gcode_studio',      title: 'Macro Studio',      icon: '📝', component: GCodeStudioModule,      isCore: true });

ModuleRegistry.register({
    id: 'lens',
    title: 'Lens Calibration',
    icon: (
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="8" y="12" width="32" height="24" rx="4" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="24" cy="24" r="6" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="34" cy="18" r="1.5" fill="currentColor" />
            <path d="M16 12L19 8H29L32 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    ),
    component: LensModule,
    isCore: true,
});

ModuleRegistry.register({ id: 'machine_settings',  title: 'Machine Config',    icon: '⚙️', component: MachineSettingsModule,  isCore: true });
ModuleRegistry.register({ id: 'app_settings',      title: 'App Settings',      icon: '🎛️', component: AppSettingsModule,      isCore: true });

// ── App ───────────────────────────────────────────────────────────────────────

function App() {
    // ── Derive WebSocket URL from the runtime-configurable coreApiUrl ─────────
    // coreApiUrl is persisted in localStorage and configurable in NeonBeam Settings.
    // We must NOT hardcode ws://localhost here — from a phone on Wi-Fi, localhost
    // is the phone's own loopback and the connection will never succeed.
    const coreApiUrl = useAppSettingsStore(s => s.settings.coreApiUrl);
    const [isHydrated, setIsHydrated] = React.useState(false);

    React.useEffect(() => {
        // Hydration check for PWA stability — ensures coreApiUrl is picked up
        // if it rehydrates after the initial App mount.
        const check = () => {
            if (useAppSettingsStore.persist.hasHydrated()) {
                setIsHydrated(true);
            }
        };
        check();
        return useAppSettingsStore.persist.onFinishHydration(() => setIsHydrated(true));
    }, []);

    const wsUrl = React.useMemo(() => {
        let url = coreApiUrl;
        
        // FAIL-SAFE: If the reactive store hasn't hydrated yet (common in PWAs),
        // we pull directly from localStorage to start the connection attempt
        // without waiting for the next render cycle.
        if (!url) {
            try {
                const raw = localStorage.getItem('neonbeam-app-settings');
                if (raw) {
                    const parsed = JSON.parse(raw);
                    url = parsed.state?.settings?.coreApiUrl;
                }
            } catch (e) { /* ignore parse errors */ }
        }

        if (!url) return '';
        const normalizedBase = url.includes('://') ? url : `http://${url}`;
        return normalizedBase.replace(/^http/, 'ws') + '/ws/telemetry';
    }, [coreApiUrl, isHydrated]);

    useTelemetry(wsUrl);

    const activeModuleId = useNavigationStore(s => s.activeModuleId);
    const navigateTo     = useNavigationStore(s => s.navigateTo);
    const navigateHome   = useNavigationStore(s => s.navigateHome);
    const modules = ModuleRegistry.getModules();

    return (
        <div className="h-dvh bg-miami-dark text-white font-sans overflow-hidden fixed inset-0 pb-safe pt-safe pt-2 overscroll-none select-none">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-miami-purple/10 via-miami-dark to-miami-dark pointer-events-none" />

            <div className="relative z-10 w-full h-full max-w-md mx-auto bg-black/20 backdrop-blur-[2px] shadow-2xl flex flex-col">

                {/* ── Home Screen ──────────────────────────────────────────────
                    Hidden (not unmounted) when a module is active.
                    Using visibility + pointer-events rather than `display:none`
                    so the home grid stays in the DOM and snaps back instantly. */}
                <div className={`absolute inset-0 transition-opacity duration-150 ${
                    activeModuleId ? 'opacity-0 pointer-events-none' : 'opacity-100 overflow-y-auto'
                }`}>
                    <div className="p-6 min-h-full flex flex-col">
                        <div className="mb-10 pt-8 text-center flex-shrink-0">
                            <h1 className="text-4xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-miami-cyan to-miami-pink mb-2">
                                NEONBEAM OS
                            </h1>
                            <p className="text-gray-400 font-medium">Select a module to begin</p>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            {modules.map(mod => (
                                <button
                                    key={mod.id}
                                    onClick={() => navigateTo(mod.id)}
                                    className="bg-black/40 border border-gray-800 hover:border-miami-cyan/50 hover:bg-black/60 transition-all rounded-3xl p-8 flex flex-col items-center justify-center gap-4 group shadow-xl relative overflow-hidden"
                                >
                                    <div className="absolute inset-0 bg-gradient-to-br from-miami-cyan/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                    <div className="text-5xl group-hover:scale-110 group-hover:-translate-y-1 transition-all z-10 drop-shadow-md">
                                        {mod.icon}
                                    </div>
                                    <span className="text-gray-200 font-bold tracking-wide group-hover:text-miami-cyan transition-colors z-10">
                                        {mod.title}
                                    </span>
                                </button>
                            ))}
                        </div>

                        <div className="mt-auto text-center pb-4 opacity-50">
                            <p className="text-xs">Modular System Environment Ready</p>
                        </div>
                    </div>
                </div>

                {/* ── Module Views ─────────────────────────────────────────────
                    Every module is permanently mounted — CSS show/hide only.
                    This preserves all useState, useRef, useEffect, and canvas
                    state across navigation without needing external stores.   */}
                {modules.map(mod => {
                    const ModComp  = mod.component;
                    const isActive = activeModuleId === mod.id;
                    return (
                        <div
                            key={mod.id}
                            className={`absolute inset-0 flex flex-col transition-opacity duration-150 ${
                                isActive ? 'opacity-100' : 'opacity-0 pointer-events-none'
                            }`}
                        >
                            {/* Sticky header with back button */}
                            <div className="h-14 flex items-center px-4 bg-black/90 border-b border-gray-800 backdrop-blur-xl sticky top-0 z-50 shadow-sm shadow-miami-pink/5 flex-shrink-0">
                                <button
                                    onClick={() => navigateHome()}
                                    className="text-miami-cyan font-bold flex items-center gap-2 hover:text-white transition-colors py-2 px-3 -ml-3 rounded-lg hover:bg-white/5"
                                >
                                    <span className="text-xl leading-none">←</span>
                                    <span>Home</span>
                                </button>
                                <span className="ml-3 text-gray-400 text-sm font-semibold">{mod.title}</span>
                            </div>

                            {/* Module content — dashboard is fixed-height (no scroll); all others scroll */}
                            <div className={`flex-1 min-h-0 ${mod.id === 'dashboard' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
                                <ModComp />
                            </div>
                        </div>
                    );
                })}

            </div>
        </div>
    );
}

export default App;
