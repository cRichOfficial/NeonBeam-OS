import React, { useState, useCallback, useEffect } from 'react';
import axios from 'axios';
import { useAppSettingsStore } from '../store/appSettingsStore';
import { NumericInput } from '../components/NumericInput';

// ── Tab types ─────────────────────────────────────────────────────────────────
type Tab = 'workspace' | 'firmware';

// ── Firmware grid helpers ─────────────────────────────────────────────────────
// Human-readable labels for common grblHAL settings
const SETTING_LABELS: Record<string, string> = {
    '$0':  'Step Pulse (µs)',           '$1':  'Step Idle Delay (ms)',
    '$2':  'Step Port Invert',          '$3':  'Direction Port Invert',
    '$4':  'Step Enable Invert',        '$5':  'Limit Pins Invert',
    '$6':  'Probe Pin Invert',          '$10': 'Status Report Mask',
    '$11': 'Junction Deviation (mm)',   '$12': 'Arc Tolerance (mm)',
    '$13': 'Report Inches',             '$20': 'Soft Limits',
    '$21': 'Hard Limits',               '$22': 'Homing Cycle',
    '$23': 'Homing Dir Invert',         '$24': 'Homing Feed (mm/min)',
    '$25': 'Homing Seek (mm/min)',      '$26': 'Homing Debounce (ms)',
    '$27': 'Homing Pull-off (mm)',      '$30': 'Max Spindle Speed (S)',
    '$31': 'Min Spindle Speed (S)',     '$32': 'Laser Mode',
    '$100':'X Steps/mm',                '$101':'Y Steps/mm',
    '$102':'Z Steps/mm',                '$110':'X Max Rate (mm/min)',
    '$111':'Y Max Rate (mm/min)',        '$112':'Z Max Rate (mm/min)',
    '$120':'X Acceleration (mm/s²)',    '$121':'Y Acceleration (mm/s²)',
    '$122':'Z Acceleration (mm/s²)',    '$130':'X Max Travel (mm)',
    '$131':'Y Max Travel (mm)',          '$132':'Z Max Travel (mm)',
};

function settingLabel(key: string): string {
    return SETTING_LABELS[key] ?? key;
}

// ── Flash status badge ────────────────────────────────────────────────────────
type FlashStatus = 'idle' | 'flashing' | 'done' | 'error';

export const MachineSettingsModule: React.FC = () => {
    const { settings, updateSettings } = useAppSettingsStore();
    const coreApiUrl = useAppSettingsStore(s => s.settings.coreApiUrl);

    const [activeTab, setActiveTab] = useState<Tab>('workspace');
    const [showAdvanced, setShowAdvanced] = useState(false);

    // ── Firmware tab state ────────────────────────────────────────────────────
    const [fwSettings,  setFwSettings]  = useState<Record<string, number>>({});
    const [fwLoading,   setFwLoading]   = useState(false);
    const [fwError,     setFwError]     = useState<string | null>(null);
    const [flashStatus, setFlashStatus] = useState<FlashStatus>('idle');
    const [dirty,       setDirty]       = useState<Record<string, number>>({});

    const pollFirmware = useCallback(async () => {
        setFwLoading(true);
        setFwError(null);
        try {
            const r = await axios.get(`${coreApiUrl}/api/firmware/settings`);
            if (r.data.status === 'ok') {
                setFwSettings(r.data.settings);
                setDirty({});
            } else {
                setFwError(r.data.message ?? 'Poll failed');
            }
        } catch {
            setFwError('Machine not reachable');
        }
        setFwLoading(false);
    }, [coreApiUrl]);

    // Auto-poll when firmware tab is activated
    useEffect(() => {
        if (activeTab === 'firmware' && Object.keys(fwSettings).length === 0) {
            pollFirmware();
        }
    }, [activeTab, fwSettings, pollFirmware]);

    const handleFwChange = (key: string, value: number) => {
        setFwSettings(prev => ({ ...prev, [key]: value }));
        setDirty(prev => ({ ...prev, [key]: value }));
        setFlashStatus('idle');
    };

    const flashFirmware = useCallback(async () => {
        if (Object.keys(dirty).length === 0) return;
        setFlashStatus('flashing');
        try {
            await axios.post(`${coreApiUrl}/api/firmware/settings`, { settings: dirty });
            setFlashStatus('done');
            setDirty({});
            setTimeout(() => setFlashStatus('idle'), 3000);
        } catch {
            setFlashStatus('error');
        }
    }, [coreApiUrl, dirty]);

    const dirtyCount = Object.keys(dirty).length;

    return (
        <div className="p-4 animate-in fade-in zoom-in duration-300 pb-12">
            <h2 className="text-2xl font-bold text-miami-cyan mb-5 tracking-tight">Machine Configuration</h2>

            {/* ── Tab pills ────────────────────────────────────────────────── */}
            <div className="flex gap-1.5 bg-black/40 border border-gray-800 rounded-xl p-1 mb-5">
                {(['workspace', 'firmware'] as Tab[]).map(tab => (
                    <button
                        key={tab}
                        id={`tab-${tab}`}
                        onClick={() => setActiveTab(tab)}
                        className={`flex-1 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${
                            activeTab === tab
                                ? tab === 'workspace'
                                    ? 'bg-miami-cyan text-black shadow-[0_0_12px_rgba(0,240,255,0.3)]'
                                    : 'bg-miami-pink text-black shadow-[0_0_12px_rgba(255,0,127,0.3)]'
                                : 'text-gray-500 hover:text-gray-300'
                        }`}
                    >
                        {tab === 'workspace' ? '⚙ Workspace' : '⚡ Firmware'}
                    </button>
                ))}
            </div>

            {/* ═══════════════════════════════════════════════════════════════
                WORKSPACE TAB
            ═══════════════════════════════════════════════════════════════ */}
            {activeTab === 'workspace' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-left-2 duration-150">

                    {/* App Workspace Overrides */}
                    <div className="bg-black/40 border border-gray-800 rounded-xl p-5 shadow-lg">
                        <h3 className="text-gray-300 text-xs font-bold uppercase tracking-widest mb-4 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-miami-cyan" />
                            App Workspace Overrides
                        </h3>

                        <div className="grid grid-cols-2 gap-4 mb-4">
                            <div>
                                <label className="block text-[10px] uppercase text-gray-300 mb-1">X Width (mm)</label>
                                <NumericInput value={settings.machineWidth}  onChange={val => updateSettings({ machineWidth:  val })} min={1} className="w-full bg-black/60 border border-gray-700 focus:border-miami-cyan rounded-lg p-2 text-white font-mono outline-none transition-colors" />
                            </div>
                            <div>
                                <label className="block text-[10px] uppercase text-gray-300 mb-1">Y Height (mm)</label>
                                <NumericInput value={settings.machineHeight} onChange={val => updateSettings({ machineHeight: val })} min={1} className="w-full bg-black/60 border border-gray-700 focus:border-miami-cyan rounded-lg p-2 text-white font-mono outline-none transition-colors" />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                            <div>
                                <label className="block text-[10px] uppercase text-miami-pink mb-1">Laser Kerf / Beam (mm)</label>
                                <NumericInput value={settings.toolHeadSize} onChange={val => updateSettings({ toolHeadSize: val })} min={0} className="w-full bg-black/60 border border-miami-pink/30 focus:border-miami-pink rounded-lg p-2 text-white font-mono outline-none transition-colors" />
                            </div>

                            {/* Z Axis Enable */}
                            <div className="col-span-2">
                                <label className="flex items-center justify-between cursor-pointer group bg-black/30 px-3 py-3 rounded-lg border border-gray-800 hover:border-gray-700 transition-colors">
                                    <div>
                                        <span className="block text-xs font-bold text-gray-200 uppercase tracking-wider">Z Axis Control</span>
                                        <span className="block text-[10px] text-gray-600 mt-0.5">Enable Z jog buttons on Machine Control</span>
                                    </div>
                                    <div className="relative flex items-center ml-4 flex-shrink-0" onClick={() => updateSettings({ zAxisEnabled: !settings.zAxisEnabled })}>
                                        <div className={`w-11 h-6 rounded-full transition-colors ${settings.zAxisEnabled ? 'bg-miami-cyan' : 'bg-gray-700'}`} />
                                        <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full shadow transition-transform ${settings.zAxisEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                                    </div>
                                </label>
                            </div>

                            <div className={settings.zAxisEnabled ? '' : 'opacity-40 pointer-events-none'}>
                                <label className="block text-[10px] uppercase text-gray-300 mb-1">Z-Probe Offset (mm)</label>
                                <NumericInput value={settings.zProbeOffset} onChange={val => updateSettings({ zProbeOffset: val })} className="w-full bg-black/60 border border-gray-700 focus:border-gray-400 rounded-lg p-2 text-white font-mono outline-none transition-colors" />
                            </div>
                            <div>
                                <label className="block text-[10px] uppercase text-gray-300 mb-1">Camera/Probe Offset X</label>
                                <NumericInput value={settings.probeOffsetX} onChange={val => updateSettings({ probeOffsetX: val })} className="w-full bg-black/60 border border-gray-700 focus:border-gray-400 rounded-lg p-2 text-white font-mono outline-none transition-colors" />
                            </div>
                            <div>
                                <label className="block text-[10px] uppercase text-gray-300 mb-1">Camera/Probe Offset Y</label>
                                <NumericInput value={settings.probeOffsetY} onChange={val => updateSettings({ probeOffsetY: val })} className="w-full bg-black/60 border border-gray-700 focus:border-gray-400 rounded-lg p-2 text-white font-mono outline-none transition-colors" />
                            </div>
                            <div>
                                <label className="block text-[10px] uppercase text-gray-300 mb-1">Homing Offset X (G92)</label>
                                <NumericInput value={settings.homingOffsetX} onChange={val => updateSettings({ homingOffsetX: val })} className="w-full bg-black/60 border border-gray-700 focus:border-gray-400 rounded-lg p-2 text-white font-mono outline-none transition-colors" />
                            </div>
                            <div>
                                <label className="block text-[10px] uppercase text-gray-300 mb-1">Homing Offset Y (G92)</label>
                                <NumericInput value={settings.homingOffsetY} onChange={val => updateSettings({ homingOffsetY: val })} className="w-full bg-black/60 border border-gray-700 focus:border-gray-400 rounded-lg p-2 text-white font-mono outline-none transition-colors" />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════
                FIRMWARE TAB
            ═══════════════════════════════════════════════════════════════ */}
            {activeTab === 'firmware' && (
                <div className="space-y-4 animate-in fade-in slide-in-from-right-2 duration-150">

                    {/* Error banner */}
                    {fwError && (
                        <div className="bg-red-900/30 border border-red-800/60 rounded-xl px-4 py-3">
                            <p className="text-red-400 text-xs font-bold">⚠ {fwError}</p>
                        </div>
                    )}

                    {/* Toolbar */}
                    <div className="flex items-center justify-between">
                        <p className="text-[10px] uppercase text-gray-500 font-bold tracking-widest">
                            {fwLoading ? 'Polling MCU…' : `${Object.keys(fwSettings).length} settings loaded`}
                            {dirtyCount > 0 && <span className="ml-2 text-yellow-400">· {dirtyCount} unsaved</span>}
                        </p>
                        <button
                            id="poll-firmware-btn"
                            onClick={pollFirmware}
                            disabled={fwLoading}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400 text-xs font-black hover:border-miami-cyan hover:text-miami-cyan transition-colors disabled:opacity-40"
                        >
                            {fwLoading ? (
                                <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25"/>
                                    <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                                </svg>
                            ) : '↻'} Poll $$
                        </button>
                    </div>

                    {/* Settings grid */}
                    {Object.keys(fwSettings).length > 0 ? (
                        <div className="bg-black/40 border border-gray-800 rounded-xl overflow-hidden">
                            {/* Show up to $132, then a toggle for everything else */}
                            {Object.entries(fwSettings)
                                .filter(([key]) => showAdvanced || parseInt(key.slice(1)) <= 132)
                                .sort(([a], [b]) => parseInt(a.slice(1)) - parseInt(b.slice(1)))
                                .map(([key], idx) => {
                                    const isDirty = key in dirty;
                                    return (
                                        <div
                                            key={key}
                                            className={`flex items-center gap-3 px-4 py-2.5 border-b border-gray-800/50 last:border-b-0 ${
                                                isDirty ? 'bg-yellow-500/5' : idx % 2 === 0 ? 'bg-black/20' : ''
                                            }`}
                                        >
                                            <div className="w-12 flex-shrink-0">
                                                <span className={`text-xs font-black font-mono ${isDirty ? 'text-yellow-400' : 'text-miami-cyan'}`}>{key}</span>
                                            </div>
                                            <span className="flex-1 text-[10px] text-gray-400 truncate">{settingLabel(key)}</span>
                                            <NumericInput
                                                value={fwSettings[key]}
                                                onChange={val => handleFwChange(key, val)}
                                                className={`w-24 bg-black/60 border rounded-lg px-2 py-1 text-xs font-mono text-right outline-none transition-colors ${
                                                    isDirty
                                                        ? 'border-yellow-500/50 text-yellow-300 focus:border-yellow-400'
                                                        : 'border-gray-700 text-white focus:border-miami-cyan'
                                                }`}
                                            />
                                        </div>
                                    );
                                })
                            }
                        </div>
                    ) : !fwLoading ? (
                        <div className="bg-black/40 border border-gray-800 rounded-xl p-8 text-center">
                            <p className="text-gray-600 text-sm mb-3">No settings loaded yet.</p>
                            <button onClick={pollFirmware} className="px-4 py-2 bg-miami-cyan/10 border border-miami-cyan/30 text-miami-cyan text-xs font-black rounded-lg hover:bg-miami-cyan/20 transition-colors">
                                Poll MCU ($$)
                            </button>
                        </div>
                    ) : (
                        <div className="bg-black/40 border border-gray-800 rounded-xl p-8 text-center">
                            <div className="w-6 h-6 border-2 border-miami-cyan/30 border-t-miami-cyan rounded-full animate-spin mx-auto mb-3" />
                            <p className="text-gray-500 text-xs">Waiting for MCU response…</p>
                        </div>
                    )}

                    {/* Show/Hide advanced parameters */}
                    {Object.keys(fwSettings).some(k => parseInt(k.slice(1)) > 132) && (
                        <button
                            onClick={() => setShowAdvanced(!showAdvanced)}
                            className="w-full py-2 bg-black/40 border border-gray-800 text-gray-500 text-xs font-bold uppercase rounded-xl hover:bg-gray-800 hover:text-gray-300 transition-colors"
                        >
                            {showAdvanced ? 'Hide Extended Parameters' : `Show Extended Parameters (>${132})`}
                        </button>
                    )}

                    {/* Flash action bar */}
                    <div className="flex gap-3 pt-1 pb-2">
                        <button
                            id="flash-firmware-btn"
                            onClick={flashFirmware}
                            disabled={dirtyCount === 0 || flashStatus === 'flashing'}
                            className={`flex-1 py-3 rounded-xl font-black text-xs uppercase tracking-wider border transition-all ${
                                flashStatus === 'done'  ? 'bg-green-500/20 border-green-500/50 text-green-400' :
                                flashStatus === 'error' ? 'bg-red-500/20 border-red-500/50 text-red-400' :
                                dirtyCount === 0        ? 'bg-black/20 border-gray-800 text-gray-700 cursor-not-allowed' :
                                'bg-gradient-to-r from-miami-cyan to-blue-500 border-transparent text-black hover:shadow-[0_0_20px_rgba(0,240,255,0.4)]'
                            }`}
                        >
                            {flashStatus === 'flashing' ? '⏳ Writing…' :
                             flashStatus === 'done'     ? '✅ Flashed!' :
                             flashStatus === 'error'    ? '❌ Failed' :
                             dirtyCount > 0 ? `⚡ Flash ${dirtyCount} Change${dirtyCount > 1 ? 's' : ''}` : 'No Changes'}
                        </button>
                    </div>

                    <p className="text-[9px] text-gray-700 font-mono text-center">
                        Each changed value is written as <span className="text-gray-600">$N=value</span> — equivalent to typing in the Grbl terminal.
                    </p>
                </div>
            )}
        </div>
    );
};
