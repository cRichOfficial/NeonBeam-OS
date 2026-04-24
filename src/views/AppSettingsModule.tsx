import React, { useState, useCallback } from 'react';
import { useAppSettingsStore } from '../store/appSettingsStore';
import { NumericInput } from '../components/NumericInput';

// ── Types ─────────────────────────────────────────────────────────────────────
interface DiscoveredService {
    name: string;
    url: string;
    service: 'hardware_comm' | 'machine_vision' | string;
}

type ConnStatus = 'idle' | 'testing' | 'ok' | 'error';

// ── Inline hook: URL connectivity test ────────────────────────────────────────
function useUrlTest() {
    const [status, setStatus] = useState<ConnStatus>('idle');
    const test = useCallback(async (url: string) => {
        // Guard: reject empty, undefined-string, or clearly relative URLs before
        // fetching — otherwise Vite's SPA fallback returns HTTP 200 index.html
        // for any path and the badge would always show ✅ Online.
        if (!url || url === 'undefined' || !url.startsWith('http')) {
            setStatus('error');
            return;
        }
        setStatus('testing');
        try {
            const res = await fetch(`${url}/api/health`, {
                signal: AbortSignal.timeout(3000),
            });
            // Accept only genuine 2xx responses; anything else (404, 502…) = unreachable
            setStatus(res.ok ? 'ok' : 'error');
        } catch {
            setStatus('error');
        }
    }, []);
    return { status, test };
}

// ── Status badge ──────────────────────────────────────────────────────────────
const StatusBadge: React.FC<{ status: ConnStatus }> = ({ status }) => {
    if (status === 'idle')    return null;
    if (status === 'testing') return <span className="text-yellow-400 text-xs font-mono animate-pulse">Testing…</span>;
    if (status === 'ok')      return <span className="text-green-400 text-xs font-black">✅ Online</span>;
    return                           <span className="text-red-400  text-xs font-black">❌ Unreachable</span>;
};

// ── Discovery result sheet ────────────────────────────────────────────────────
const DiscoverySheet: React.FC<{
    results: DiscoveredService[];
    onAdopt: (service: string, url: string) => void;
    onClose: () => void;
    sidecarNote?: string | null;
}> = ({ results, onAdopt, onClose, sidecarNote }) => {
    const groups: Record<string, DiscoveredService[]> = {};
    for (const r of results) { (groups[r.service] ??= []).push(r); }

    const label: Record<string, string> = {
        hardware_comm:  '🖥 Core Backend (hardware_comm)',
        machine_vision: '📷 Lens Backend (machine_vision)',
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
            {/* backdrop */}
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-md bg-miami-dark border border-gray-700 rounded-t-3xl p-5 pb-8 shadow-2xl animate-in slide-in-from-bottom duration-200">
                <div className="w-10 h-1 bg-gray-600 rounded mx-auto mb-4" />
                <h3 className="text-miami-cyan font-black text-sm uppercase tracking-widest mb-4">Discovered Services</h3>

                {Object.keys(groups).length === 0 ? (
                    <p className="text-gray-500 text-sm text-center py-6">No NeonBeam services found on the network.</p>
                ) : (
                    <div className="space-y-4">
                        {Object.entries(groups).map(([svc, items]) => (
                            <div key={svc}>
                                <p className="text-[10px] text-gray-400 uppercase font-bold tracking-widest mb-2">
                                    {label[svc] ?? svc}
                                </p>
                                {items.map(item => (
                                    <button
                                        key={item.name}
                                        onClick={() => onAdopt(item.service, item.url)}
                                        className="w-full flex items-center justify-between bg-black/40 border border-gray-700 hover:border-miami-cyan/60 rounded-xl px-4 py-3 mb-1.5 transition-colors group"
                                    >
                                        <div className="text-left">
                                            <p className="text-white text-xs font-bold">{item.url}</p>
                                            <p className="text-gray-500 text-[10px] truncate max-w-[220px]">{item.name}</p>
                                        </div>
                                        <span className="text-miami-cyan text-xs font-black opacity-0 group-hover:opacity-100 transition-opacity">Use →</span>
                                    </button>
                                ))}
                            </div>
                        ))}
                    </div>
                )}

                <button
                    onClick={onClose}
                    className="mt-5 w-full py-2.5 bg-black/40 border border-gray-700 text-gray-400 rounded-xl text-sm font-bold hover:bg-gray-800 transition-colors"
                >
                    Close
                </button>

                {sidecarNote && (
                    <p className="mt-3 text-[9px] text-gray-600 text-center font-mono">{sidecarNote}</p>
                )}
            </div>
        </div>
    );
};

// ── Main component ────────────────────────────────────────────────────────────
export const AppSettingsModule: React.FC = () => {
    const { settings, updateSettings } = useAppSettingsStore();
    const coreTest = useUrlTest();
    const lensTest = useUrlTest();

    const [scanning,    setScanning]    = useState(false);
    const [scanResults, setScanResults] = useState<DiscoveredService[] | null>(null);
    const [sidecarNote, setSidecarNote] = useState<string | null>(null);

    const scanNetwork = useCallback(async () => {
        setScanning(true);
        setScanResults(null);
        setSidecarNote(null);

        // All probing (localhost + mDNS) now runs server-side in the sidecar.
        // The sidecar substitutes the machine's real LAN IP into returned URLs
        // so remote clients (phone on Wi-Fi) can reach the services.
        // Vite's dev-server proxies /api/discovery → http://localhost:3001.
        try {
            const res = await fetch('/api/discovery?timeout=3&fallback=true');
            if (res.ok) {
                const data = await res.json();
                setScanResults(data.found ?? []);
            } else {
                setScanResults([]);
                setSidecarNote(`Sidecar returned HTTP ${res.status}. Is it running on port 3001?`);
            }
        } catch {
            setScanResults([]);
            setSidecarNote('Could not reach the discovery sidecar. Start it with start_sidecar.ps1 / start_sidecar.sh');
        }

        setScanning(false);
    }, []);

    const adoptDiscovery = useCallback((service: string, url: string) => {
        if (service === 'hardware_comm')  updateSettings({ coreApiUrl: url });
        if (service === 'machine_vision') updateSettings({ lensApiUrl: url });
        setScanResults(null);
    }, [updateSettings]);

    return (
        <div className="p-4 animate-in fade-in zoom-in duration-300 pb-12">
            <h2 className="text-2xl font-bold text-miami-purple mb-6 tracking-tight">App Settings</h2>

            <div className="space-y-4">

                {/* ── Studio Grid Display ──────────────────────────────────── */}
                <div className="bg-black/40 border border-gray-800 rounded-xl p-5 shadow-lg">
                    <h3 className="text-gray-300 text-xs uppercase font-bold tracking-widest mb-4">Studio Grid Display</h3>

                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                            <label className="block text-[10px] uppercase text-gray-300 mb-1">Canvas Width</label>
                            <NumericInput value={settings.gridWidth}   onChange={val => updateSettings({ gridWidth:   val })} min={1} className="w-full bg-black/60 border border-gray-700 rounded-lg p-2 text-white font-mono outline-none" />
                        </div>
                        <div>
                            <label className="block text-[10px] uppercase text-gray-300 mb-1">Canvas Height</label>
                            <NumericInput value={settings.gridHeight}  onChange={val => updateSettings({ gridHeight:  val })} min={1} className="w-full bg-black/60 border border-gray-700 rounded-lg p-2 text-white font-mono outline-none" />
                        </div>
                        <div>
                            <label className="block text-[10px] uppercase text-gray-300 mb-1">Major Rules (Spacing)</label>
                            <NumericInput value={settings.majorSpacing} onChange={val => updateSettings({ majorSpacing: val })} min={1} className="w-full bg-black/60 border border-gray-700 rounded-lg p-2 text-white font-mono outline-none" />
                        </div>
                        <div>
                            <label className="block text-[10px] uppercase text-gray-300 mb-1">Minor Rules Grid</label>
                            <NumericInput value={settings.minorSpacing} onChange={val => updateSettings({ minorSpacing: val })} min={1} className="w-full bg-black/60 border border-gray-700 rounded-lg p-2 text-white font-mono outline-none" />
                        </div>
                    </div>

                    {/* SVG DPI */}
                    <div className="border-t border-gray-800/60 pt-4 space-y-2">
                        <div className="flex items-center justify-between">
                            <div>
                                <span className="block text-xs font-bold text-gray-200">SVG Import DPI</span>
                                <span className="block text-[10px] text-gray-500 mt-0.5">px → mm for vector files · CSS standard is 96</span>
                            </div>
                            <NumericInput
                                min={1} max={2400}
                                value={settings.svgDpi}
                                onChange={val => updateSettings({ svgDpi: val })}
                                className="w-20 bg-black/60 border border-gray-700 focus:border-miami-cyan rounded-lg p-2 text-white font-mono text-sm outline-none transition-colors text-center"
                            />
                        </div>
                        <div className="flex gap-1.5">
                            {[72, 96, 150, 300].map(dpi => (
                                <button key={dpi} onClick={() => updateSettings({ svgDpi: dpi })}
                                    className={`flex-1 py-1.5 rounded-lg text-[10px] font-black border transition-all ${
                                        settings.svgDpi === dpi
                                            ? 'bg-miami-cyan text-black border-miami-cyan'
                                            : 'bg-black/60 text-gray-500 border-gray-700 hover:border-gray-400 hover:text-gray-300'
                                    }`}
                                >{dpi}</button>
                            ))}
                        </div>
                        <p className="text-[9px] text-gray-700 font-mono">
                            1 px = {(25.4 / settings.svgDpi).toFixed(4)} mm at {settings.svgDpi} DPI
                        </p>
                    </div>

                    {/* Bitmap DPI */}
                    <div className="border-t border-gray-800/60 pt-4 space-y-2">
                        <div className="flex items-center justify-between">
                            <div>
                                <span className="block text-xs font-bold text-gray-200">Bitmap Import DPI</span>
                                <span className="block text-[10px] text-gray-500 mt-0.5">px → mm for raster images · print scans often 300+</span>
                            </div>
                            <NumericInput
                                min={1} max={2400}
                                value={settings.bitmapDpi}
                                onChange={val => updateSettings({ bitmapDpi: val })}
                                className="w-20 bg-black/60 border border-miami-pink/30 focus:border-miami-pink rounded-lg p-2 text-white font-mono text-sm outline-none transition-colors text-center"
                            />
                        </div>
                        <div className="flex gap-1.5">
                            {[72, 96, 150, 300, 600].map(dpi => (
                                <button key={dpi} onClick={() => updateSettings({ bitmapDpi: dpi })}
                                    className={`flex-1 py-1.5 rounded-lg text-[10px] font-black border transition-all ${
                                        settings.bitmapDpi === dpi
                                            ? 'bg-miami-pink text-black border-miami-pink'
                                            : 'bg-black/60 text-gray-500 border-gray-700 hover:border-gray-400 hover:text-gray-300'
                                    }`}
                                >{dpi}</button>
                            ))}
                        </div>
                        <p className="text-[9px] text-gray-700 font-mono">
                            1 px = {(25.4 / settings.bitmapDpi).toFixed(4)} mm at {settings.bitmapDpi} DPI
                        </p>
                    </div>

                    <button className="w-full mt-4 py-2 bg-gray-800 text-xs font-bold text-gray-300 rounded hover:bg-gray-700 transition">
                        Snap to Machine Dimensions
                    </button>
                </div>

                {/* ── Display Preferences ──────────────────────────────────── */}
                <div className="bg-black/40 border border-gray-800 rounded-xl p-5 shadow-lg">
                    <h3 className="text-gray-300 text-xs uppercase font-bold tracking-widest mb-4">Display Preferences</h3>

                    <div className="flex items-center justify-between py-3 border-b border-gray-800/50">
                        <span className="text-sm font-medium text-gray-200">System Speed Units</span>
                        <div className="flex bg-black rounded-lg border border-gray-700 overflow-hidden">
                            <button onClick={() => updateSettings({ feedUnits: 'mm/min' })}
                                className={`px-3 py-1.5 text-xs font-bold ${settings.feedUnits === 'mm/min' ? 'bg-miami-cyan text-black' : 'text-gray-500 hover:text-white'}`}
                            >mm/min</button>
                            <button onClick={() => updateSettings({ feedUnits: 'mm/s' })}
                                className={`px-3 py-1.5 text-xs font-bold ${settings.feedUnits === 'mm/s' ? 'bg-miami-cyan text-black' : 'text-gray-500 hover:text-white'}`}
                            >mm/sec</button>
                        </div>
                    </div>

                    <div className="flex items-center justify-between pt-4 pb-2">
                        <span className="text-sm font-medium text-gray-200">System Theme</span>
                        <span className="text-sm font-bold bg-gradient-to-r from-miami-pink to-miami-purple bg-clip-text text-transparent tracking-wide">Miami Neon</span>
                    </div>
                </div>

                {/* ── Network Bridge ───────────────────────────────────────── */}
                <div className="bg-black/40 border border-gray-800 rounded-xl p-5 shadow-lg">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-gray-300 text-xs uppercase font-bold tracking-widest">Network Bridge</h3>
                        <button
                            id="scan-network-btn"
                            onClick={scanNetwork}
                            disabled={scanning}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-black transition-all ${
                                scanning
                                    ? 'bg-miami-cyan/10 border-miami-cyan/30 text-miami-cyan/60 cursor-wait'
                                    : 'bg-miami-cyan/10 border-miami-cyan/40 text-miami-cyan hover:bg-miami-cyan/20 hover:border-miami-cyan'
                            }`}
                        >
                            {scanning ? (
                                <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25"/>
                                    <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                                </svg>
                            ) : '🔍'}
                            {scanning ? 'Scanning…' : 'Scan Network'}
                        </button>
                    </div>

                    <div className="space-y-4">
                        {/* Core Backend */}
                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <label className="text-[10px] text-gray-400 font-bold uppercase">Core Backend (hardware_comm)</label>
                                <StatusBadge status={coreTest.status} />
                            </div>
                            <div className="flex gap-2">
                                <input
                                    id="core-api-url-input"
                                    type="text"
                                    value={settings.coreApiUrl}
                                    onChange={e => updateSettings({ coreApiUrl: e.target.value })}
                                    className="flex-1 bg-black/60 border border-gray-700 focus:border-miami-cyan rounded-lg p-2 text-white font-mono text-xs outline-none transition-colors"
                                    placeholder={import.meta.env.VITE_COMM_API_URL || "http://neonbeam-core.local:8000"}
                                />
                                <button
                                    id="test-core-btn"
                                    onClick={() => coreTest.test(settings.coreApiUrl)}
                                    disabled={coreTest.status === 'testing'}
                                    title="Test connection"
                                    className="px-3 py-2 bg-black/60 border border-gray-700 hover:border-miami-cyan text-miami-cyan text-xs font-black rounded-lg transition-colors disabled:opacity-50"
                                >🔌</button>
                            </div>
                        </div>

                        {/* Lens Backend */}
                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <label className="text-[10px] text-gray-400 font-bold uppercase">Lens Backend (machine_vision)</label>
                                <StatusBadge status={lensTest.status} />
                            </div>
                            <div className="flex gap-2">
                                <input
                                    id="lens-api-url-input"
                                    type="text"
                                    value={settings.lensApiUrl}
                                    onChange={e => updateSettings({ lensApiUrl: e.target.value })}
                                    className="flex-1 bg-black/60 border border-gray-700 focus:border-miami-purple rounded-lg p-2 text-white font-mono text-xs outline-none transition-colors"
                                    placeholder={import.meta.env.VITE_VISION_API_URL || "http://neonbeam-lens.local:8001"}
                                />
                                <button
                                    id="test-lens-btn"
                                    onClick={() => lensTest.test(settings.lensApiUrl)}
                                    disabled={lensTest.status === 'testing'}
                                    title="Test connection"
                                    className="px-3 py-2 bg-black/60 border border-gray-700 hover:border-miami-purple text-miami-purple text-xs font-black rounded-lg transition-colors disabled:opacity-50"
                                >🔌</button>
                            </div>
                        </div>
                    </div>

                    <p className="text-[9px] text-gray-700 font-mono mt-3">
                        URLs are saved locally. Changes take effect immediately — no restart needed.
                    </p>
                </div>
            </div>

            <div className="mt-8 text-center opacity-50">
                <p className="text-[10px] font-bold text-gray-500 tracking-widest uppercase">NeonBeam OS v1.0.0</p>
            </div>

            {/* ── Discovery result sheet (bottom drawer) ───────────────── */}
            {scanResults !== null && (
                <DiscoverySheet
                    results={scanResults}
                    onAdopt={adoptDiscovery}
                    onClose={() => setScanResults(null)}
                    sidecarNote={sidecarNote}
                />
            )}
        </div>
    );
};
