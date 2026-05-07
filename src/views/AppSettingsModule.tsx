import React, { useState, useCallback } from 'react';
import { useAppSettingsStore } from '../store/appSettingsStore';
import { NumericInput } from '../components/NumericInput';
import { View } from '../components/layout/View';
import { SectionCard } from '../components/layout/SectionCard';
import { ActionButton } from '../components/ui/ActionButton';
import { RadioGroup } from '../components/ui/RadioGroup';
import { SegmentedControl } from '../components/ui/SegmentedControl';

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

/** Extract font family names from a Google Fonts URL */
function parseGoogleFonts(url: string): string[] {
    try {
        const u = new URL(url);
        // Supports both css?family=Name and css2?family=Name:wght@...
        const families = u.searchParams.getAll('family');
        return families.map(f => f.split(':')[0].replace(/\+/g, ' '));
    } catch {
        return [];
    }
}

const FontPicker: React.FC<{
    current: string;
    onSelect: (font: string) => void;
    onClose: () => void;
    importedUrls: string[];
}> = ({ current, onSelect, onClose, importedUrls }) => {
    const defaultFonts = [
        'Anta',
        'Audiowide',
        'Jaro',
        'Stalinist One',
        'Wallpoet'
    ];

    const importedFonts = Array.from(new Set(importedUrls.flatMap(parseGoogleFonts)));
    const allFonts = [...defaultFonts, ...importedFonts];

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-sm bg-miami-dark border border-gray-700 rounded-[2rem] p-6 shadow-2xl animate-in zoom-in-95 fade-in duration-200">
                <h3 className="text-miami-cyan font-black text-sm uppercase tracking-widest mb-6 text-center">Select System Font</h3>
                <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1 custom-scrollbar">
                    {allFonts.map(font => (
                        <button
                            key={font}
                            onClick={() => { onSelect(font); onClose(); }}
                            className={`w-full text-left px-5 py-4 rounded-2xl border transition-all ${
                                current === font 
                                    ? 'bg-miami-cyan/10 border-miami-cyan text-white shadow-[0_0_15px_rgba(0,240,255,0.2)]' 
                                    : 'bg-black/40 border-gray-800 text-gray-400 hover:border-gray-600'
                            }`}
                            style={{ fontFamily: `'${font}', sans-serif` }}
                        >
                            <span className="text-xl">{font}</span>
                        </button>
                    ))}
                </div>
                <button
                    onClick={onClose}
                    className="mt-8 w-full py-3.5 bg-gray-800/50 hover:bg-gray-800 text-gray-400 rounded-2xl text-xs font-black uppercase tracking-widest transition-colors border border-gray-700"
                >
                    Cancel
                </button>
            </div>
        </div>
    );
};

const ImportFontWizard: React.FC<{
    onImport: (url: string) => void;
    onClose: () => void;
}> = ({ onImport, onClose }) => {
    const [url, setUrl] = useState('');

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-sm bg-miami-dark border border-gray-700 rounded-[2rem] p-6 shadow-2xl animate-in zoom-in-95 fade-in duration-200">
                <h3 className="text-miami-cyan font-black text-sm uppercase tracking-widest mb-2 text-center">Import Google Font</h3>
                <p className="text-[10px] text-gray-500 text-center mb-6 px-4">Paste a Google Fonts CSS URL to add new families to your system.</p>
                
                <div className="space-y-4">
                    <input
                        type="text"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="https://fonts.googleapis.com/css2?family=..."
                        className="w-full bg-black/40 border border-gray-700 focus:border-miami-cyan rounded-xl p-4 text-white text-xs font-mono outline-none transition-colors"
                    />
                    
                    <ActionButton 
                        variant="normal" 
                        className="w-full py-4 text-xs"
                        disabled={!url.includes('fonts.googleapis.com')}
                        onClick={() => { onImport(url); onClose(); }}
                    >
                        Load Font families
                    </ActionButton>
                    
                    <button
                        onClick={onClose}
                        className="w-full py-3.5 text-gray-500 hover:text-gray-300 text-[10px] font-black uppercase tracking-widest transition-colors"
                    >
                        Cancel
                    </button>
                </div>
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

    const [forceCustomSvg, setForceCustomSvg] = useState(false);
    const [forceCustomBitmap, setForceCustomBitmap] = useState(false);
    const [showFontPicker, setShowFontPicker] = useState(false);
    const [showFontImportWizard, setShowFontImportWizard] = useState(false);

    const isSvgCustom = forceCustomSvg || ![72, 96, 150, 300].includes(settings.svgDpi);
    const activeSvgRadio = isSvgCustom ? 'custom' : settings.svgDpi;

    const isBitmapCustom = forceCustomBitmap || ![72, 96, 150, 300, 600].includes(settings.bitmapDpi);
    const activeBitmapRadio = isBitmapCustom ? 'custom' : settings.bitmapDpi;

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
        <View title="App Settings" subtitle="Configure system parameters" showHomeButton>
            <div className="p-4 space-y-4 pb-12">

                {/* ── Canvas Settings ──────────────────────────────────── */}
                <SectionCard title="Canvas Settings">
                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                            <label className="block text-[10px] text-gray-400 mb-2 uppercase font-bold text-left">Canvas Width</label>
                            <NumericInput value={settings.gridWidth}   onChange={val => updateSettings({ gridWidth:   val })} min={1} className="w-full bg-miami-cyan/10 border border-miami-cyan/50 focus:border-miami-cyan rounded-lg p-3 text-white text-sm font-mono outline-none transition-colors" />
                        </div>
                        <div>
                            <label className="block text-[10px] text-gray-400 mb-2 uppercase font-bold text-left">Canvas Height</label>
                            <NumericInput value={settings.gridHeight}  onChange={val => updateSettings({ gridHeight:  val })} min={1} className="w-full bg-miami-cyan/10 border border-miami-cyan/50 focus:border-miami-cyan rounded-lg p-3 text-white text-sm font-mono outline-none transition-colors" />
                        </div>
                        <div>
                            <label className="block text-[10px] text-gray-400 mb-2 uppercase font-bold text-left">Major Rules (Spacing)</label>
                            <NumericInput value={settings.majorSpacing} onChange={val => updateSettings({ majorSpacing: val })} min={1} className="w-full bg-miami-cyan/10 border border-miami-cyan/50 focus:border-miami-cyan rounded-lg p-3 text-white text-sm font-mono outline-none transition-colors" />
                        </div>
                        <div>
                            <label className="block text-[10px] text-gray-400 mb-2 uppercase font-bold text-left">Minor Rules Grid</label>
                            <NumericInput value={settings.minorSpacing} onChange={val => updateSettings({ minorSpacing: val })} min={1} className="w-full bg-miami-cyan/10 border border-miami-cyan/50 focus:border-miami-cyan rounded-lg p-3 text-white text-sm font-mono outline-none transition-colors" />
                        </div>
                    </div>

                    <ActionButton variant="normal" className="w-full py-3">
                        Snap to Machine Dimensions
                    </ActionButton>
                </SectionCard>

                {/* ── Image Import Settings ──────────────────────────────────── */}
                <SectionCard title="Image Import Settings">
                    {/* SVG DPI */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <div>
                                <span className="block text-xs font-bold text-gray-200">SVG Import DPI</span>
                                <span className="block text-[10px] text-gray-500 mt-0.5">px → mm for vector files · CSS standard is 96</span>
                            </div>
                            {isSvgCustom && (
                                <NumericInput
                                    min={1} max={2400}
                                    value={settings.svgDpi}
                                    onChange={val => updateSettings({ svgDpi: val })}
                                    className="w-20 bg-miami-cyan/10 border border-miami-cyan/50 focus:border-miami-cyan rounded-lg p-2 text-white font-mono text-sm outline-none transition-colors text-center"
                                />
                            )}
                        </div>
                        <RadioGroup
                            options={[
                                { value: 72, label: 72 },
                                { value: 96, label: 96 },
                                { value: 150, label: 150 },
                                { value: 300, label: 300 },
                                { value: 'custom', label: 'Custom' },
                            ]}
                            value={activeSvgRadio}
                            onChange={(val) => {
                                if (val === 'custom') setForceCustomSvg(true);
                                else {
                                    setForceCustomSvg(false);
                                    updateSettings({ svgDpi: val as number });
                                }
                            }}
                            accentColor="cyan"
                        />
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
                            {isBitmapCustom && (
                                <NumericInput
                                    min={1} max={2400}
                                    value={settings.bitmapDpi}
                                    onChange={val => updateSettings({ bitmapDpi: val })}
                                    className="w-20 bg-miami-cyan/10 border border-miami-cyan/50 focus:border-miami-cyan rounded-lg p-2 text-white font-mono text-sm outline-none transition-colors text-center"
                                />
                            )}
                        </div>
                        <RadioGroup
                            options={[
                                { value: 72, label: 72 },
                                { value: 96, label: 96 },
                                { value: 150, label: 150 },
                                { value: 300, label: 300 },
                                { value: 600, label: 600 },
                                { value: 'custom', label: 'Custom' },
                            ]}
                            value={activeBitmapRadio}
                            onChange={(val) => {
                                if (val === 'custom') setForceCustomBitmap(true);
                                else {
                                    setForceCustomBitmap(false);
                                    updateSettings({ bitmapDpi: val as number });
                                }
                            }}
                            accentColor="cyan"
                        />
                        <p className="text-[9px] text-gray-700 font-mono">
                            1 px = {(25.4 / settings.bitmapDpi).toFixed(4)} mm at {settings.bitmapDpi} DPI
                        </p>
                    </div>

                </SectionCard>

                {/* ── Display Preferences ──────────────────────────────────── */}
                <SectionCard title="Display Preferences">
                    <div className="flex items-center justify-between py-3 border-b border-gray-800/50">
                        <span className="text-sm font-medium text-gray-200">System Speed Units</span>
                        <SegmentedControl
                            options={[
                                { value: 'mm/min', label: 'mm/min' },
                                { value: 'mm/s', label: 'mm/sec' }
                            ]}
                            value={settings.feedUnits}
                            onChange={(val) => updateSettings({ feedUnits: val as 'mm/min' | 'mm/s' })}
                        />
                    </div>

                    <div className="flex items-center justify-between py-3 border-b border-gray-800/50">
                        <span className="text-sm font-medium text-gray-200">System Font</span>
                        <ActionButton 
                            variant="normal" 
                            className="py-1.5 px-3 text-xs"
                            onClick={() => setShowFontPicker(true)}
                        >
                            {settings.systemFont}
                        </ActionButton>
                    </div>

                    <div className="flex items-center justify-between pt-4 pb-2">
                        <span className="text-sm font-medium text-gray-200">System Theme</span>
                        <span className="text-sm font-bold bg-gradient-to-r from-miami-pink to-miami-purple bg-clip-text text-transparent tracking-wide">Miami Neon</span>
                    </div>
                </SectionCard>

                {/* ── Font Imports ────────────────────────────────────────── */}
                <SectionCard 
                    title="Font Imports"
                    action={
                        <ActionButton 
                            variant="normal" 
                            className="py-1.5 px-3 text-xs"
                            onClick={() => setShowFontImportWizard(true)}
                        >
                            Add Fonts
                        </ActionButton>
                    }
                >
                    <div className="space-y-3">
                        {settings.googleFontUrls.length === 0 ? (
                            <p className="text-[10px] text-gray-500 italic text-center py-2">No custom fonts imported.</p>
                        ) : (
                            settings.googleFontUrls.map(url => (
                                <div key={url} className="flex items-center justify-between bg-black/40 border border-gray-800 rounded-xl px-3 py-2">
                                    <div className="flex-1 min-w-0 pr-4">
                                        <p className="text-[10px] text-miami-cyan font-bold truncate">{parseGoogleFonts(url).join(', ') || 'Unknown Fonts'}</p>
                                        <p className="text-[8px] text-gray-600 truncate font-mono">{url}</p>
                                    </div>
                                    <button 
                                        onClick={() => {
                                            updateSettings({ googleFontUrls: settings.googleFontUrls.filter(u => u !== url) });
                                        }}
                                        className="p-2 text-gray-600 hover:text-neon-red transition-colors"
                                    >
                                        ✕
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </SectionCard>

                {/* ── Laser Configuration ──────────────────────────────────── */}
                <SectionCard title="Laser Configuration">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] text-gray-400 mb-2 uppercase font-bold text-left">Test Power (%)</label>
                            <NumericInput value={settings.laserTestPower} onChange={val => updateSettings({ laserTestPower: val })} min={1} max={100} className="w-full bg-miami-cyan/10 border border-miami-cyan/50 focus:border-miami-cyan rounded-lg p-3 text-white text-sm font-mono outline-none transition-colors" />
                        </div>
                        <div>
                            <label className="block text-[10px] text-gray-400 mb-2 uppercase font-bold text-left">Test Duration (ms)</label>
                            <NumericInput value={settings.laserTestDuration} onChange={val => updateSettings({ laserTestDuration: val })} min={1} className="w-full bg-miami-cyan/10 border border-miami-cyan/50 focus:border-miami-cyan rounded-lg p-3 text-white text-sm font-mono outline-none transition-colors" />
                        </div>
                    </div>
                </SectionCard>

                {/* ── Network Bridge ───────────────────────────────────────── */}
                <SectionCard 
                    title="Network Bridge"
                    action={
                        <ActionButton
                            id="scan-network-btn"
                            onClick={scanNetwork}
                            disabled={scanning}
                            variant="normal"
                            className="py-1.5 px-3"
                        >
                            {scanning ? (
                                <svg className="w-3 h-3 animate-spin inline-block mr-1.5" viewBox="0 0 24 24" fill="none">
                                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25"/>
                                    <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                                </svg>
                            ) : <span className="mr-1.5">🔍</span>}
                            {scanning ? 'Scanning…' : 'Scan Network'}
                        </ActionButton>
                    }
                >

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
                                    className="flex-1 bg-miami-cyan/10 border border-miami-cyan/50 focus:border-miami-cyan rounded-lg p-3 text-white font-mono text-sm outline-none transition-colors"
                                    placeholder={import.meta.env.VITE_COMM_API_URL || "http://neonbeam-core.local:8000"}
                                />
                                <ActionButton
                                    id="test-core-btn"
                                    onClick={() => coreTest.test(settings.coreApiUrl)}
                                    disabled={coreTest.status === 'testing'}
                                    variant="normal"
                                    className="px-3"
                                    title="Test connection"
                                >Test</ActionButton>
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
                                    className="flex-1 bg-miami-cyan/10 border border-miami-cyan/50 focus:border-miami-cyan rounded-lg p-3 text-white font-mono text-sm outline-none transition-colors"
                                    placeholder={import.meta.env.VITE_VISION_API_URL || "http://neonbeam-lens.local:8001"}
                                />
                                <ActionButton
                                    id="test-lens-btn"
                                    onClick={() => lensTest.test(settings.lensApiUrl)}
                                    disabled={lensTest.status === 'testing'}
                                    variant="normal"
                                    className="px-3"
                                    title="Test connection"
                                >Test</ActionButton>
                            </div>
                        </div>
                    </div>

                    <p className="text-[9px] text-gray-500 font-mono mt-4 text-center">
                        URLs are saved locally. Changes take effect immediately — no restart needed.
                    </p>
                </SectionCard>

                {/* ── Developer Options ────────────────────────────────────── */}
                <SectionCard title="Developer Options">
                    <div className="flex items-center justify-between py-3">
                        <div>
                            <span className="block text-sm font-medium text-gray-200">Debug Mode</span>
                            <span className="block text-[10px] text-gray-500 mt-0.5">Show internal sandbox modules</span>
                        </div>
                        <SegmentedControl
                            options={[
                                { value: false, label: 'OFF' },
                                { value: true, label: 'ON' }
                            ]}
                            value={settings.debugMode}
                            onChange={(val) => updateSettings({ debugMode: val as boolean })}
                        />
                    </div>
                </SectionCard>
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

            {showFontPicker && (
                <FontPicker 
                    current={settings.systemFont}
                    onSelect={(f) => updateSettings({ systemFont: f })}
                    onClose={() => setShowFontPicker(false)}
                    importedUrls={settings.googleFontUrls}
                />
            )}

            {showFontImportWizard && (
                <ImportFontWizard
                    onClose={() => setShowFontImportWizard(false)}
                    onImport={(url) => {
                        const next = [...settings.googleFontUrls, url];
                        updateSettings({ googleFontUrls: Array.from(new Set(next)) });
                    }}
                />
            )}
        </View>
    );
};
