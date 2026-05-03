import React, { useState, useCallback, useEffect } from 'react';
import axios from 'axios';
import { useAppSettingsStore } from '../store/appSettingsStore';
import { NumericInput } from '../components/NumericInput';
import { View } from '../components/layout/View';
import { SectionCard } from '../components/layout/SectionCard';
import { TabPage } from '../components/layout/TabPage';
import { TabControl } from '../components/ui/TabControl';
import { ActionButton } from '../components/ui/ActionButton';
import { ToggleSwitch } from '../components/ui/ToggleSwitch';

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

    const tabsList = [
        { id: 'workspace', label: 'Workspace' },
        { id: 'firmware', label: 'Firmware' }
    ];

    return (
        <View title="Machine Configuration" subtitle="Workspace and Firmware Settings" showHomeButton>
            <div className="p-4 space-y-4 pb-12">
                <TabControl tabs={tabsList} activeTab={activeTab} onChange={(id) => setActiveTab(id as Tab)} />

            {/* ═══════════════════════════════════════════════════════════════
                WORKSPACE TAB
            ═══════════════════════════════════════════════════════════════ */}
            <TabPage title="Workspace Settings" description="Configure local application overrides for machine dimensions and offsets." className={activeTab !== 'workspace' ? 'hidden' : ''}>
                {/* App Workspace Overrides */}
                <SectionCard title="App Workspace Overrides">
                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                            <label className="block text-[10px] text-gray-400 mb-2 uppercase font-bold text-left">X Width (mm)</label>
                            <NumericInput value={settings.machineWidth}  onChange={val => updateSettings({ machineWidth:  val })} min={1} className="w-full bg-miami-cyan/10 border border-miami-cyan/50 focus:border-miami-cyan rounded-lg p-3 text-white text-sm font-mono outline-none transition-colors" />
                        </div>
                        <div>
                            <label className="block text-[10px] text-gray-400 mb-2 uppercase font-bold text-left">Y Height (mm)</label>
                            <NumericInput value={settings.machineHeight} onChange={val => updateSettings({ machineHeight: val })} min={1} className="w-full bg-miami-cyan/10 border border-miami-cyan/50 focus:border-miami-cyan rounded-lg p-3 text-white text-sm font-mono outline-none transition-colors" />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                        <div>
                            <label className="block text-[10px] text-gray-400 mb-2 uppercase font-bold text-left">Laser Kerf / Beam (mm)</label>
                            <NumericInput value={settings.toolHeadSize} onChange={val => updateSettings({ toolHeadSize: val })} min={0} className="w-full bg-miami-cyan/10 border border-miami-cyan/50 focus:border-miami-cyan rounded-lg p-3 text-white text-sm font-mono outline-none transition-colors" />
                        </div>

                        {/* Z Axis Enable */}
                        <div className="col-span-2">
                            <ToggleSwitch
                                checked={settings.zAxisEnabled}
                                onChange={(checked) => updateSettings({ zAxisEnabled: checked })}
                                label="Z Axis Control"
                                description="Enable Z jog buttons on Machine Control"
                            />
                        </div>

                        <div className={settings.zAxisEnabled ? '' : 'opacity-40 pointer-events-none'}>
                            <label className="block text-[10px] text-gray-400 mb-2 uppercase font-bold text-left">Z-Probe Offset (mm)</label>
                            <NumericInput value={settings.zProbeOffset} onChange={val => updateSettings({ zProbeOffset: val })} className="w-full bg-miami-cyan/10 border border-miami-cyan/50 focus:border-miami-cyan rounded-lg p-3 text-white text-sm font-mono outline-none transition-colors" />
                        </div>
                        <div>
                            <label className="block text-[10px] text-gray-400 mb-2 uppercase font-bold text-left">Camera/Probe Offset X</label>
                            <NumericInput value={settings.probeOffsetX} onChange={val => updateSettings({ probeOffsetX: val })} className="w-full bg-miami-cyan/10 border border-miami-cyan/50 focus:border-miami-cyan rounded-lg p-3 text-white text-sm font-mono outline-none transition-colors" />
                        </div>
                        <div>
                            <label className="block text-[10px] text-gray-400 mb-2 uppercase font-bold text-left">Camera/Probe Offset Y</label>
                            <NumericInput value={settings.probeOffsetY} onChange={val => updateSettings({ probeOffsetY: val })} className="w-full bg-miami-cyan/10 border border-miami-cyan/50 focus:border-miami-cyan rounded-lg p-3 text-white text-sm font-mono outline-none transition-colors" />
                        </div>
                        <div>
                            <label className="block text-[10px] text-gray-400 mb-2 uppercase font-bold text-left">Homing Offset X (G92)</label>
                            <NumericInput value={settings.homingOffsetX} onChange={val => updateSettings({ homingOffsetX: val })} className="w-full bg-miami-cyan/10 border border-miami-cyan/50 focus:border-miami-cyan rounded-lg p-3 text-white text-sm font-mono outline-none transition-colors" />
                        </div>
                        <div>
                            <label className="block text-[10px] text-gray-400 mb-2 uppercase font-bold text-left">Homing Offset Y (G92)</label>
                            <NumericInput value={settings.homingOffsetY} onChange={val => updateSettings({ homingOffsetY: val })} className="w-full bg-miami-cyan/10 border border-miami-cyan/50 focus:border-miami-cyan rounded-lg p-3 text-white text-sm font-mono outline-none transition-colors" />
                        </div>
                    </div>
                </SectionCard>
            </TabPage>

            {/* ═══════════════════════════════════════════════════════════════
                FIRMWARE TAB
            ═══════════════════════════════════════════════════════════════ */}
            <TabPage title="Firmware Settings" description="Direct hardware configuration via grblHAL ($$ parameters)." className={activeTab !== 'firmware' ? 'hidden' : ''}>
                
                {/* Error banner */}
                {fwError && (
                    <div className="bg-neon-red/10 border border-neon-red/50 rounded-xl px-4 py-3">
                        <p className="text-neon-red text-xs font-bold text-left">⚠ {fwError}</p>
                    </div>
                )}

                {/* Toolbar */}
                <div className="flex items-center justify-between px-1">
                    <p className="text-[10px] uppercase text-gray-500 font-bold tracking-widest text-left">
                        {fwLoading ? 'Polling MCU…' : `${Object.keys(fwSettings).length} settings loaded`}
                        {dirtyCount > 0 && <span className="ml-2 text-neon-orange">· {dirtyCount} unsaved</span>}
                    </p>
                    <ActionButton
                        id="poll-firmware-btn"
                        onClick={pollFirmware}
                        disabled={fwLoading}
                        variant="normal"
                        className="py-1.5 px-3"
                    >
                        {fwLoading ? (
                            <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25"/>
                                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                            </svg>
                        ) : '↻'} Poll $$
                    </ActionButton>
                </div>

                <SectionCard>
                    {/* Settings grid */}
                    {Object.keys(fwSettings).length > 0 ? (
                        <div className="bg-black/60 border border-gray-800 rounded-xl overflow-hidden mb-4">
                            {/* Show up to $132, then a toggle for everything else */}
                            {Object.entries(fwSettings)
                                .filter(([key]) => showAdvanced || parseInt(key.slice(1)) <= 132)
                                .sort(([a], [b]) => parseInt(a.slice(1)) - parseInt(b.slice(1)))
                                .map(([key], idx) => {
                                    const isDirty = key in dirty;
                                    return (
                                        <div
                                            key={key}
                                            className={`flex items-center gap-3 px-4 py-2 border-b border-gray-800/50 last:border-b-0 ${
                                                isDirty ? 'bg-neon-orange/10' : idx % 2 === 0 ? 'bg-white/5' : ''
                                            }`}
                                        >
                                            <div className="w-12 flex-shrink-0 text-left">
                                                <span className={`text-xs font-black font-mono ${isDirty ? 'text-neon-orange' : 'text-miami-cyan'}`}>{key}</span>
                                            </div>
                                            <span className="flex-1 text-[10px] text-gray-400 truncate text-left">{settingLabel(key)}</span>
                                            <NumericInput
                                                value={fwSettings[key]}
                                                onChange={val => handleFwChange(key, val)}
                                                className={`w-24 bg-black/60 border rounded-lg px-2 py-1.5 text-xs font-mono text-right outline-none transition-colors ${
                                                    isDirty
                                                        ? 'border-neon-orange/50 text-neon-orange focus:border-neon-orange'
                                                        : 'border-gray-700 text-white focus:border-miami-cyan'
                                                }`}
                                            />
                                        </div>
                                    );
                                })
                            }
                        </div>
                    ) : !fwLoading ? (
                        <div className="bg-black/40 border border-gray-800 rounded-xl p-8 text-center mb-4">
                            <p className="text-gray-600 text-sm mb-4">No settings loaded yet.</p>
                            <ActionButton onClick={pollFirmware} variant="normal" className="mx-auto">
                                Poll MCU ($$)
                            </ActionButton>
                        </div>
                    ) : (
                        <div className="bg-black/40 border border-gray-800 rounded-xl p-8 text-center mb-4">
                            <div className="w-6 h-6 border-2 border-miami-cyan/30 border-t-miami-cyan rounded-full animate-spin mx-auto mb-3" />
                            <p className="text-gray-500 text-xs">Waiting for MCU response…</p>
                        </div>
                    )}

                    {/* Show/Hide advanced parameters */}
                    {Object.keys(fwSettings).some(k => parseInt(k.slice(1)) > 132) && (
                        <button
                            onClick={() => setShowAdvanced(!showAdvanced)}
                            className="w-full py-2 mb-4 bg-black border border-gray-800 text-gray-500 text-[10px] font-bold uppercase tracking-widest rounded-xl hover:bg-gray-800 hover:text-gray-300 transition-colors"
                        >
                            {showAdvanced ? 'Hide Extended Parameters' : `Show Extended Parameters (>${132})`}
                        </button>
                    )}

                    {/* Flash action bar */}
                    <div className="flex pt-2 border-t border-gray-800/50">
                        <ActionButton
                            id="flash-firmware-btn"
                            onClick={flashFirmware}
                            disabled={dirtyCount === 0 || flashStatus === 'flashing'}
                            variant={flashStatus === 'done' ? 'add' : flashStatus === 'error' ? 'remove' : 'normal'}
                            className="w-full py-3"
                        >
                            {flashStatus === 'flashing' ? '⏳ Writing…' :
                             flashStatus === 'done'     ? '✅ Flashed!' :
                             flashStatus === 'error'    ? '❌ Failed' :
                             dirtyCount > 0 ? `⚡ Flash ${dirtyCount} Change${dirtyCount > 1 ? 's' : ''}` : 'No Changes'}
                        </ActionButton>
                    </div>

                    <p className="text-[9px] text-gray-500 font-mono text-center mt-4">
                        Each changed value is written as <span className="text-gray-400">$N=value</span> — equivalent to typing in the Grbl terminal.
                    </p>
                </SectionCard>
            </TabPage>
            
            </div>
        </View>
    );
};
