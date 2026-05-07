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
import { DemoModule } from './views/DemoModule';
import { View } from './components/layout/View';
import { ModuleIcon } from './components/ui/ModuleIcon';

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

ModuleRegistry.register({ 
    id: 'studio',           
    title: 'Design Studio',     
    icon: (
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Drafting board surface — angled rectangle */}
            <rect x="6" y="14" width="36" height="24" rx="2" stroke="currentColor" strokeWidth="1.5" />
            {/* Horizontal rule line on board */}
            <line x1="10" y1="26" x2="38" y2="26" stroke="currentColor" strokeWidth="1" strokeOpacity="0.45" strokeDasharray="2 2" />
            {/* Triangle set-square in bottom-left corner */}
            <path d="M10 34 L10 20 L22 34 Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            {/* Pencil — body */}
            <rect x="28" y="10" width="5" height="18" rx="1" transform="rotate(35 28 10)" stroke="currentColor" strokeWidth="1.5" />
            {/* Pencil — tip point */}
            <path d="M37.5 28.5 L40 33 L35.5 31.5 Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
        </svg>
    ), 
    component: StudioModule,          
    isCore: true 
});
ModuleRegistry.register({ 
    id: 'material_presets',  
    title: 'Material Presets',  
    icon: (
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M24 8C16 16 14 24 14 28C14 34.6274 18.4772 40 24 40C29.5228 40 34 34.6274 34 28C34 24 32 16 24 8Z" stroke="currentColor" strokeWidth="1.5" />
            <path d="M24 20C20 24 19 28 19 30C19 33.3137 21.2386 36 24 36C26.7614 36 29 33.3137 29 30C29 28 28 24 24 20Z" fill="currentColor" fillOpacity="0.5" />
        </svg>
    ), 
    component: MaterialPresetsModule,  
    isCore: true 
});
ModuleRegistry.register({ 
    id: 'gcode_studio',      
    title: 'Macro Studio',      
    icon: (
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Top-left button */}
            <rect x="6" y="6" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="1.5" />
            {/* Top-right button — active/highlighted */}
            <rect x="26" y="6" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="1.5" fill="currentColor" fillOpacity="0.15" />
            {/* Lightning bolt inside active button */}
            <path d="M36 9 L33 16 L35.5 16 L32 23 L38 15 L35.5 15 Z" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" fill="currentColor" fillOpacity="0.5" />
            {/* Bottom-left button */}
            <rect x="6" y="26" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="1.5" />
            {/* Bottom-right button */}
            <rect x="26" y="26" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="1.5" />
            {/* Small label lines in non-active buttons */}
            <line x1="10" y1="13" x2="18" y2="13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.5" />
            <line x1="10" y1="33" x2="18" y2="33" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.5" />
            <line x1="30" y1="33" x2="38" y2="33" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.5" />
        </svg>
    ), 
    component: GCodeStudioModule,      
    isCore: true 
});

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

ModuleRegistry.register({ 
    id: 'machine_settings',  
    title: 'Machine Config',    
    icon: (
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M24 16C28.4183 16 32 19.5817 32 24C32 28.4183 28.4183 32 24 32C19.5817 32 16 28.4183 16 24C16 19.5817 19.5817 16 24 16Z" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M21 4H27L28 10L31 11L36 7L41 12L37 17L38 20L44 21V27L38 28L37 31L41 36L36 41L31 37L28 38L27 44H21L20 38L17 37L12 41L7 36L11 31L10 28L4 27V21L10 20L11 17L7 12L12 7L17 11L20 10L21 4Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
    ), 
    component: MachineSettingsModule,  
    isCore: true 
});
ModuleRegistry.register({ 
    id: 'app_settings',      
    title: 'App Settings',      
    icon: (
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <line x1="12" y1="10" x2="12" y2="38" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="24" y1="10" x2="24" y2="38" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="36" y1="10" x2="36" y2="38" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <rect x="8" y="28" width="8" height="4" rx="1" fill="currentColor" />
            <rect x="20" y="16" width="8" height="4" rx="1" fill="currentColor" />
            <rect x="32" y="32" width="8" height="4" rx="1" fill="currentColor" />
        </svg>
    ), 
    component: AppSettingsModule,      
    isCore: true 
});
ModuleRegistry.register({ 
    id: 'ui_demo',           
    title: 'UI Demo',           
    icon: (
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M10 24C10 24 16 14 24 14C32 14 38 24 38 24C38 24 32 34 24 34C16 34 10 24 10 24Z" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="24" cy="24" r="5" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="24" cy="24" r="2" fill="currentColor" />
        </svg>
    ), 
    component: DemoModule,             
    isCore: true 
});

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
    const debugMode = useAppSettingsStore(s => s.settings.debugMode);
    const systemFont = useAppSettingsStore(s => s.settings.systemFont);

    return (
        <div 
            className="h-dvh bg-miami-dark text-white overflow-hidden fixed inset-0 pb-safe pt-safe pt-2 overscroll-none select-none"
            style={{ fontFamily: `'${systemFont}', system-ui, sans-serif` }}
        >
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-miami-purple/10 via-miami-dark to-miami-dark pointer-events-none" />

            <div className="relative z-10 w-full h-full max-w-md mx-auto bg-black/20 backdrop-blur-[2px] shadow-2xl flex flex-col">

                {/* ── Home Screen ──────────────────────────────────────────────
                    Hidden (not unmounted) when a module is active.
                    Using visibility + pointer-events rather than `display:none`
                    so the home grid stays in the DOM and snaps back instantly. */}
                <div className={`absolute inset-0 transition-opacity duration-150 ${
                    activeModuleId ? 'opacity-0 pointer-events-none' : 'opacity-100'
                }`}>
                    <View title="NEONBEAM OS" subtitle="Select a module to begin">
                        <div className="p-4 grid grid-cols-2 gap-4">
                            {modules
                                .filter(mod => mod.id !== 'ui_demo' || debugMode)
                                .map(mod => (
                                    <ModuleIcon
                                        key={mod.id}
                                        label={mod.title}
                                        icon={mod.icon}
                                        onClick={() => navigateTo(mod.id)}
                                    />
                                ))
                            }
                        </div>
                    </View>
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
                            {/* Sticky header with back button (hidden for modules using the new View component) */}
                            {mod.id !== 'dashboard' && mod.id !== 'ui_demo' && mod.id !== 'machine_settings' && mod.id !== 'app_settings' && mod.id !== 'material_presets' && mod.id !== 'gcode_studio' && mod.id !== 'studio' && mod.id !== 'lens' && (
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
                            )}

                            {/* Module content — dashboard is fixed-height (no scroll); all others scroll */}
                            <div className="flex-1 min-h-0 overflow-y-auto">
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
