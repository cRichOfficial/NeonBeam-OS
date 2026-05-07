import React, { useState, useCallback, useEffect, useMemo } from 'react';
import axios from 'axios';
import { useTelemetryStore } from '../store/telemetryStore';
import { useAppSettingsStore } from '../store/appSettingsStore';
import { useJobStore } from '../store/jobStore';
import { useMacroStore } from '../store/macroStore';
import type { GCodeMacro } from '../store/macroStore';
import { View } from '../components/layout/View';
import { ActionGrid } from '../components/ui/actions/ActionGrid';
import type { BaseAction, ActionTheme } from '../components/ui/actions/types';

const mapColorToTheme = (color?: string): ActionTheme => {
    switch (color) {
        case 'pink':
        case 'purple':
            return 'miami-pink';
        case 'green':
            return 'neon-green';
        case 'yellow':
            return 'neon-orange';
        case 'cyan':
        case 'gray':
        default:
            return 'miami-cyan';
    }
};

// COMM_API is read from the persisted settings store so users can change it
// at runtime via NeonBeam Settings → Network Bridge without a code restart.
// The constant below is kept only for helper functions defined outside the
// component; the component body re-reads from the store on every render.
let _commApi = '';

const JOG_FEED_BY_STEP: Record<number, number> = {
    0.01: 60, 0.1: 300, 1: 1500, 10: 3000, 100: 6000,
};
const JOG_STEPS = [0.01, 0.1, 1, 10, 100];

// ── API helpers ───────────────────────────────────────────────────────────────
// These helpers capture _commApi at call time, so they always use whatever URL
// the component has last synced from the store.
async function sendCommand(cmd: string) {
    try { await axios.post(`${_commApi}/api/gcode/command`, { command: cmd }); }
    catch (e) { console.error('[NeonBeam] Command failed:', cmd, e); }
}
async function sendJog(axis: 'X' | 'Y' | 'Z', step: number, feed: number) {
    try   { const r = await axios.post(`${_commApi}/api/jog`, { axis, step, feed }); return r.data; }
    catch { return { status: 'error', message: 'Network error' }; }
}

// ── State badge ───────────────────────────────────────────────────────────────
const STATE_COLORS: Record<string, string> = {
    Idle:       'bg-green-500/20 text-green-400 border-green-500/30',
    Run:        'bg-miami-pink/20 text-miami-pink border-miami-pink/30',
    Hold:       'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    Jog:        'bg-miami-cyan/20 text-miami-cyan border-miami-cyan/30',
    Alarm:      'bg-red-500/20 text-red-400 border-red-500/30',
    Offline:    'bg-gray-700/40 text-gray-500 border-gray-700/40',
    Connecting: 'bg-blue-900/30 text-blue-400 border-blue-700/40',
    Home:       'bg-miami-purple/20 text-miami-purple border-miami-purple/30',
};
const StateBadge: React.FC<{ state: string }> = ({ state }) => (
    <span className={`px-2.5 py-0.5 rounded-full font-black text-[11px] border tracking-widest ${STATE_COLORS[state] ?? STATE_COLORS['Offline']}`}>
        {state.toUpperCase()}
    </span>
);

// ── Jog button ────────────────────────────────────────────────────────────────
const JogBtn: React.FC<{
    label: React.ReactNode; onClick: () => void;
    disabled?: boolean; color?: 'cyan' | 'purple'; sm?: boolean;
}> = ({ label, onClick, disabled = false, color = 'cyan', sm = false }) => {
    const clr = color === 'purple'
        ? 'border-miami-purple/50 text-miami-purple hover:bg-miami-purple/20 hover:border-miami-purple active:bg-miami-purple/35'
        : 'border-miami-cyan/50 text-miami-cyan hover:bg-miami-cyan/20 hover:border-miami-cyan active:bg-miami-cyan/35';

    // sm = Z-axis buttons, lg = XY buttons
    const size = sm ? 'w-14 h-14' : 'w-[4.25rem] h-[4.25rem]';

    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={`${size} flex flex-col items-center justify-center rounded-2xl bg-black/70 border-2 font-bold transition-all select-none active:scale-95 ${
                disabled ? 'opacity-25 cursor-not-allowed border-gray-800 text-gray-700' : clr
            }`}
        >
            {label}
        </button>
    );
};

// ── Axis arrow label helper ───────────────────────────────────────────────────
// Consistent: label text above/below the arrow for Y, left/right of arrow for X
const AxisLabel: React.FC<{ axis: 'X'|'Y'|'Z'; dir: '+'|'-' }> = ({ axis, dir }) => {
    const arrow = axis === 'X' ? (dir === '-' ? '◀' : '▶') : axis === 'Z' ? (dir === '+' ? '↑' : '↓') : (dir === '+' ? '▲' : '▼');
    const isLeftArrow = axis === 'X' && dir === '-';
    const isUpArrow = (axis === 'Y' || axis === 'Z') && dir === '+';

    if (axis === 'X') return (
        <span className="flex items-center gap-0.5 text-xl font-black leading-none">
            {isLeftArrow && <span className="text-2xl">{arrow}</span>}
            <span className="text-[11px] font-black">{axis}{dir}</span>
            {!isLeftArrow && <span className="text-2xl">{arrow}</span>}
        </span>
    );

    // Y or Z: arrow above/below label
    return (
        <span className="flex flex-col items-center gap-0 leading-none">
            {isUpArrow && <span className="text-2xl">{arrow}</span>}
            <span className="text-[11px] font-black">{axis}{dir}</span>
            {!isUpArrow && <span className="text-2xl">{arrow}</span>}
        </span>
    );
};

// ── Main Component ────────────────────────────────────────────────────────────
export const DashboardModule: React.FC = () => {
    const telemetry    = useTelemetryStore(s => s.telemetry);
    const feedUnits    = useAppSettingsStore(s => s.settings.feedUnits);
    const zAxisEnabled = useAppSettingsStore(s => s.settings.zAxisEnabled);
    const coreApiUrl   = useAppSettingsStore(s => s.settings.coreApiUrl);
    const maxSpindleS  = useAppSettingsStore(s => s.settings.maxSpindleS) || 1000;
    const homingOffsetX = useAppSettingsStore(s => s.settings.homingOffsetX);
    const homingOffsetY = useAppSettingsStore(s => s.settings.homingOffsetY);
    const laserTestPower = useAppSettingsStore(s => s.settings.laserTestPower);
    const laserTestDuration = useAppSettingsStore(s => s.settings.laserTestDuration);
    const jobStatus    = useJobStore(s => s.jobStatus);
    const setJobStatus = useJobStore(s => s.setJobStatus);

    const macros = useMacroStore(s => s.macros);
    const layout = useMacroStore(s => s.layout);
    const toggleStates = useMacroStore(s => s.toggleStates);
    const flipToggle = useMacroStore(s => s.flipToggle);

    // Keep module-level var in sync so helper functions outside the component pick up changes
    _commApi = coreApiUrl;

    const [jogStep,        setJogStep]        = useState<number>(1);
    const [liveJogEnabled, setLiveJogEnabled] = useState(false);
    const [liveJogLoading, setLiveJogLoading] = useState(false);
    const [jogError,       setJogError]       = useState<string | null>(null);
    const [isTestingLaser, setIsTestingLaser] = useState(false);

    // ── On mount & resume: sync settings and recover any in-progress job ──────
    useEffect(() => {
        const recover = () => {
            if (!coreApiUrl) return;
            // Recover live-jog setting
            axios.get(`${coreApiUrl}/api/jog/settings`)
                .then(r => setLiveJogEnabled(r.data.live_jog_enabled))
                .catch(() => {});

            // Recover job status — restores progress display after browser refresh or PWA resume
            axios.get(`${coreApiUrl}/api/gcode/status`)
                .then(r => {
                    const d = r.data;
                    if (d.is_streaming || d.is_queued || d.job_name) {
                        setJobStatus({
                            is_streaming: d.is_streaming,
                            is_queued:    d.is_queued ?? false,
                            job_name:     d.job_name,
                            total_lines:  d.total_lines,
                            lines_sent:   d.lines_sent,
                            feed_rate_mm_min: d.feed_rate_mm_min,
                        });
                    }
                })
                .catch(() => {});
        };

        const handleVisibility = () => {
            if (document.visibilityState === 'visible') {
                console.log('[NeonBeam] Dashboard resumed, refreshing status...');
                recover();
            }
        };

        document.addEventListener('visibilitychange', handleVisibility);
        recover();

        return () => document.removeEventListener('visibilitychange', handleVisibility);
    }, [coreApiUrl, setJobStatus]);

    const toggleLiveJog = useCallback(async () => {
        setLiveJogLoading(true);
        try {
            const r = await axios.post(`${coreApiUrl}/api/jog/settings`, { live_jog_enabled: !liveJogEnabled });
            setLiveJogEnabled(r.data.live_jog_enabled);
        } catch { /* offline */ }
        setLiveJogLoading(false);
    }, [coreApiUrl, liveJogEnabled]);

    // Machine state derivations
    const machineState = telemetry.state;
    const isOffline = machineState === 'Offline' || machineState === 'Connecting';
    const isAlarm   = machineState === 'Alarm';
    const isHold    = machineState === 'Hold';
    const isRunning = machineState === 'Run';
    const canJog    = !isOffline && !isAlarm && (!isRunning || liveJogEnabled);

    // Feed rate display:
    // During a streaming job the live FS telemetry value is instantaneous and
    // almost always catches the machine mid-acceleration or mid-direction-reversal
    // (esp. raster boustrophedon with 0.1mm line spacing). It isn't meaningful.
    // Instead, show the programmed feed rate parsed from the GCode header at load
    // time (returned by /api/gcode/status as feed_rate_mm_min).
    // During Idle/Jog the live telemetry IS meaningful — it's the actual jog speed.
    const streamingFeedMmMin = jobStatus?.is_streaming ? (jobStatus.feed_rate_mm_min ?? null) : null;
    const showLiveFeed       = streamingFeedMmMin === null;   // no programmed rate = fall back to live
    const liveFeedMmMin      = telemetry.feedRate;

    const displayFeedVal = showLiveFeed
        ? (feedUnits === 'mm/s' ? (liveFeedMmMin / 60).toFixed(1) : liveFeedMmMin.toFixed(0))
        : feedUnits === 'mm/s'
            ? (streamingFeedMmMin! / 60).toFixed(1)
            : streamingFeedMmMin!.toFixed(0);
    const feedSourceLabel = feedUnits;
    const feedSourceBadge = !showLiveFeed ? 'PROG' : null;   // shown when displaying programmed rate


    const jog = useCallback(async (axis: 'X' | 'Y' | 'Z', dir: 1 | -1) => {
        if (!canJog) return;
        setJogError(null);
        const result = await sendJog(axis, dir * jogStep, JOG_FEED_BY_STEP[jogStep] ?? 1500);
        if (result.status === 'error') {
            setJogError(result.message ?? 'Jog failed');
            setTimeout(() => setJogError(null), 3000);
        }
    }, [canJog, jogStep]);

    // Homing action helper
    const doHome = useCallback((type: 'All' | 'X' | 'Y') => {
        let cmd = type === 'All' ? '$HX\n$HY' : `$H${type}`;
        
        let g92Args = [];
        if (type === 'All' || type === 'X') {
            g92Args.push(`X${homingOffsetX}`);
        }
        if (type === 'All' || type === 'Y') {
            g92Args.push(`Y${homingOffsetY}`);
        }
        
        if (g92Args.length > 0) {
            cmd += `\nG92 ${g92Args.join(' ')}`;
        }
        
        sendCommand(cmd);
    }, [homingOffsetX, homingOffsetY]);

    const executeMacro = useCallback((m: GCodeMacro) => {
        if (isOffline) return;
        if (m.isBuiltIn) {
            if (m.id === 'builtin_h_all') doHome('All');
            else if (m.id === 'builtin_h_x') doHome('X');
            else if (m.id === 'builtin_h_y') doHome('Y');
            else if (m.id === 'builtin_set_x') { if (!isAlarm) sendCommand('G10 L20 P1 X0'); }
            else if (m.id === 'builtin_set_y') { if (!isAlarm) sendCommand('G10 L20 P1 Y0'); }
            else if (m.id === 'builtin_set_origin') { if (!isAlarm) sendCommand('G10 L20 P1 X0 Y0'); }
        } else {
            if (m.isToggle) {
                const isCurrentlyOn = toggleStates[m.id] || false;
                if (isCurrentlyOn) {
                    if (m.gcodeOff) sendCommand(m.gcodeOff);
                    flipToggle(m.id, false);
                } else {
                    sendCommand(m.gcode);
                    flipToggle(m.id, true);
                }
            } else {
                sendCommand(m.gcode);
            }
        }
    }, [doHome, isAlarm, isOffline, toggleStates, flipToggle]);

    // Machine actions
    const feedHold  = () => sendCommand('!');
    const softReset = () => sendCommand('\x18');
    const unlock    = () => sendCommand('$X');

    const testLaser = useCallback(async () => {
        if (!canJog || isTestingLaser) return;
        setIsTestingLaser(true);
        const sVal = Math.round((laserTestPower / 100) * maxSpindleS);
        const durationSec = (laserTestDuration / 1000).toFixed(3);
        
        try {
            await sendCommand(`M3 S${sVal}`);
            await sendCommand(`G4 P${durationSec}`);
            await sendCommand(`M5`);
        } finally {
            setTimeout(() => setIsTestingLaser(false), Math.max(laserTestDuration, 200));
        }
    }, [canJog, laserTestPower, maxSpindleS, laserTestDuration, isTestingLaser]);

    const cycleStartOrBegin = useCallback(async () => {
        if (jobStatus?.is_queued) {
            await axios.post(`${coreApiUrl}/api/gcode/start`).catch(() => {});
        } else {
            await sendCommand('~');
        }
    }, [coreApiUrl, jobStatus]);

    const eStop = useCallback(async () => {
        await axios.post(`${coreApiUrl}/api/gcode/estop`).catch(() => {});
        setJobStatus(null);
    }, [coreApiUrl, setJobStatus]);

    const cancelJob = useCallback(async () => {
        await axios.post(`${coreApiUrl}/api/gcode/cancel`).catch(() => {});
        setJobStatus(null);
    }, [coreApiUrl, setJobStatus]);

    const jobPct = (jobStatus?.total_lines ?? 0) > 0
        ? Math.round((jobStatus!.lines_sent / jobStatus!.total_lines) * 100)
        : 0;

    const macroToAction = useCallback((m: GCodeMacro): BaseAction => {
        const isToggleOn = m.isToggle ? (toggleStates[m.id] ?? false) : false;
        const disabled = isOffline || (m.isBuiltIn && m.id.startsWith('builtin_set_') && isAlarm);

        return {
            id: m.id,
            title: m.label,
            subtitle: m.isToggle ? (isToggleOn ? '• ON' : '○ OFF') : (m.isBuiltIn ? 'Built-in Macro' : 'Custom Macro'),
            theme: m.isBuiltIn ? 'miami-cyan' : mapColorToTheme(m.color),
            functionToCall: 'executeMacro',
            functionArgs: m,
            disabled: disabled
        };
    }, [isOffline, isAlarm, toggleStates]);

    const allActions = useMemo(() => {
        const actions: (BaseAction | undefined)[] = [];
        const assignedIds = new Set<string>();

        // Map layout to exactly 8 slots
        for (let i = 0; i < 8; i++) {
            const id = layout[i];
            if (id) {
                const m = macros.find(m => m.id === id);
                if (m) {
                    assignedIds.add(id);
                    actions.push(macroToAction(m));
                    continue;
                }
            }
            actions.push(undefined);
        }

        // Append remaining unassigned macros for the overflow dropdown
        const unassignedMacros = macros.filter(m => !assignedIds.has(m.id));
        for (const m of unassignedMacros) {
            actions.push(macroToAction(m));
        }

        return actions as BaseAction[];
    }, [layout, macros, macroToAction]);

    return (
        <View title="Machine Control" showHomeButton className="bg-black">
        <div className="min-h-full flex flex-col gap-3 p-3 select-none">

            {/* ── Row 1: Emergency Stop ───────────────────────────────────── */}
            <button
                onClick={eStop}
                className="w-full h-12 flex-shrink-0 flex items-center justify-center gap-2 bg-red-700/25 border-2 border-red-600/70 hover:bg-red-700/50 hover:border-red-500 text-red-300 font-black text-sm uppercase tracking-widest rounded-2xl active:scale-[0.98] transition-all shadow-[0_0_16px_rgba(220,38,38,0.2)] hover:shadow-[0_0_28px_rgba(220,38,38,0.45)]"
            >
                🛑 Emergency Stop
            </button>

            {/* ── Row 2: Compact machine status card ──────────────────────── */}
            <div className="flex-shrink-0 bg-black/50 border border-miami-purple/20 rounded-2xl px-3 py-2.5">

                {/* State + positions */}
                <div className="flex items-center gap-2 mb-1.5">
                    <StateBadge state={machineState} />
                    <div className="flex gap-3 flex-1 justify-end font-mono text-sm font-bold">
                        {(['x', 'y', 'z'] as const).map((ax) => (
                            <span key={ax} className="text-miami-cyan">
                                <span className="text-[9px] text-gray-500 font-bold uppercase mr-0.5">{ax}</span>
                                {telemetry.wpos[ax].toFixed(2)}
                            </span>
                        ))}
                    </div>
                </div>

                {/* Feed + Spindle + job state badge */}
                <div className="flex items-center gap-3 text-xs font-mono">
                    <span className="text-gray-500 flex items-center gap-1">
                        <span className="text-gray-500">F</span>
                        <span className="text-gray-200 font-bold">{displayFeedVal}</span>
                        <span className="text-gray-600">{feedSourceLabel}</span>
                        {feedSourceBadge && (
                            <span
                                title="Showing programmed feed rate from GCode header. Live FS telemetry is suppressed during streaming — it fluctuates with acceleration and is not representative of burn speed."
                                className="text-[8px] font-black text-miami-cyan/50 border border-miami-cyan/20 rounded px-0.5 leading-tight cursor-help"
                            >{feedSourceBadge}</span>
                        )}
                    </span>
                    <span className="text-gray-500">
                        S <span className="text-gray-200 font-bold">
                            {Math.round((telemetry.spindleSpeed / maxSpindleS) * 100)}%
                        </span>
                    </span>
                    <span className="flex-1" />
                    {jobStatus && (
                        <span className={`text-xs font-black tracking-wider ${
                            jobStatus.is_streaming ? 'text-miami-pink'
                            : 'text-green-400'
                        }`}>
                            {jobStatus.is_streaming ? '⚙ RUNNING' : jobStatus.is_queued ? 'READY' : '✓ DONE'}
                        </span>
                    )}
                </div>

                {/* Job progress bar */}
                {jobStatus && (
                    <div className="mt-2 space-y-1">
                        <div className="flex justify-between text-xs font-mono text-gray-400">
                            <span className="truncate max-w-[60%] font-semibold">{jobStatus.job_name}</span>
                            <span className="font-bold">{jobStatus.is_queued ? `${jobStatus.total_lines} lines` : `${jobPct}%`}</span>
                        </div>
                        <div className="h-2 bg-gray-900 rounded-full overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all duration-700 ${
                                    jobStatus.is_streaming ? 'bg-miami-pink'
                                    : jobStatus.is_queued  ? 'bg-green-500 opacity-30'
                                    : 'bg-green-500'
                                }`}
                                style={{ width: `${jobStatus.is_queued ? 100 : jobPct}%` }}
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* ── Row 3: Jog control card ── */}
            <div className="bg-black/40 border border-gray-800 rounded-2xl p-3 flex flex-col gap-2">

                {/* Jog card header */}
                <div className="flex items-center justify-between flex-shrink-0">
                    <div className="flex flex-col">
                        <p className="text-[10px] uppercase text-gray-400 font-black tracking-widest">Jog Control</p>
                        {!canJog && (
                            <p className="text-[8px] font-bold text-red-400/80 font-mono tracking-tight -mt-0.5">
                                {isAlarm ? 'ALARM — LOCK' : isOffline ? 'MCU OFFLINE' : 'JOG BLOCKED'}
                            </p>
                        )}
                    </div>

                    <div className="flex gap-2 items-center">
                        {/* Test Laser Button */}
                        <button
                            onClick={testLaser}
                            disabled={!canJog || isTestingLaser}
                            title={`Fire laser at ${laserTestPower}% for ${laserTestDuration}ms`}
                            className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-[10px] font-black transition-all active:scale-95 ${
                                !canJog
                                    ? 'bg-black/60 border-gray-700 text-gray-500 cursor-not-allowed'
                                    : isTestingLaser
                                        ? 'bg-red-500 border-red-500 text-white shadow-[0_0_15px_rgba(239,68,68,0.6)] scale-95'
                                        : 'bg-red-500/10 border-red-500/50 text-red-400 hover:bg-red-500/20 shadow-[0_0_8px_rgba(239,68,68,0.2)]'
                            }`}
                        >
                            💥 {isTestingLaser ? 'FIRING...' : 'Test Laser'}
                        </button>

                        {/* Live-jog toggle pill */}
                        <button
                            onClick={toggleLiveJog}
                            disabled={liveJogLoading}
                            title={liveJogEnabled ? 'Disable live jog during job?' : 'Allow jogging while job runs?'}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-black transition-all ${
                                liveJogEnabled
                                    ? 'bg-miami-pink/15 border-miami-pink/50 text-miami-pink'
                                    : 'bg-black/60 border-gray-700 text-gray-500 hover:border-gray-500'
                            } ${liveJogLoading ? 'opacity-50 cursor-wait' : ''}`}
                        >
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${liveJogEnabled ? 'bg-miami-pink shadow-[0_0_6px_rgba(255,0,127,0.8)]' : 'bg-gray-700'}`} />
                            Live Jog
                        </button>
                    </div>
                </div>

                {/* Step size buttons */}
                <div className="flex gap-1.5 flex-shrink-0">
                    {JOG_STEPS.map(s => (
                        <button key={s} onClick={() => setJogStep(s)}
                            className={`flex-1 py-2.5 rounded-xl text-xs font-black border transition-all ${
                                jogStep === s
                                    ? 'bg-miami-cyan text-black border-miami-cyan shadow-[0_0_10px_rgba(0,240,255,0.4)]'
                                    : 'bg-black/60 text-gray-400 border-gray-700 hover:border-gray-400 hover:text-white'
                            }`}>
                            {s}
                        </button>
                    ))}
                    <span className="text-[10px] text-gray-500 font-mono self-center ml-0.5 flex-shrink-0">mm</span>
                </div>

                {/* Error Banner (only for transient errors, not persistent status) */}
                {jogError && (
                    <div className="flex-shrink-0 bg-red-900/30 border border-red-800 rounded-xl px-3 py-1.5">
                        <p className="text-xs text-red-400 font-bold">⚠ {jogError}</p>
                    </div>
                )}

                {/* ── Jog pad ─────────────────────────────────────── */}
                <div className="flex-shrink-0 flex items-center justify-center gap-2">

                    {/* XY D-pad */}
                    <div className="flex flex-col items-center gap-1">
                        <JogBtn label={<AxisLabel axis="Y" dir="+" />} onClick={() => jog('Y', 1)} disabled={!canJog} />
                        <div className="flex gap-1 items-center">
                            <JogBtn label={<AxisLabel axis="X" dir="-" />} onClick={() => jog('X', -1)} disabled={!canJog} />

                            {/* Go-to-Work-Origin button */}
                            <button
                                onClick={() => !isAlarm && !isOffline && sendCommand('G90 G0 X0 Y0')}
                                disabled={isAlarm || isOffline}
                                title="Go to Work Origin (G0 X0 Y0)"
                                className={`w-[4.25rem] h-[4.25rem] rounded-full bg-black/80 border-2 flex items-center justify-center transition-all active:scale-95 ${
                                    isAlarm || isOffline ? 'border-gray-800 opacity-25 cursor-not-allowed' : 'border-gray-700 hover:border-miami-cyan/60'
                                }`}
                            >
                                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" className="text-gray-400">
                                    <circle cx="12" cy="12" r="8"   stroke="currentColor" strokeWidth="1.2" strokeOpacity="0.6"/>
                                    <circle cx="12" cy="12" r="3"   stroke="currentColor" strokeWidth="1.2"/>
                                    <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
                                    <line x1="12" y1="3"  x2="12" y2="9"  stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                                    <line x1="12" y1="15" x2="12" y2="21" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                                    <line x1="3"  y1="12" x2="9"  y2="12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                                    <line x1="15" y1="12" x2="21" y2="12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                                </svg>
                            </button>

                            <JogBtn label={<AxisLabel axis="X" dir="+" />} onClick={() => jog('X', 1)} disabled={!canJog} />
                        </div>
                        <JogBtn label={<AxisLabel axis="Y" dir="-" />} onClick={() => jog('Y', -1)} disabled={!canJog} />
                    </div>

                    {/* Z axis (if enabled) */}
                    {zAxisEnabled && (
                        <div className="flex flex-col items-center gap-1">
                            <JogBtn label={<AxisLabel axis="Z" dir="+" />} onClick={() => jog('Z', 1)} disabled={!canJog} color="purple" sm />
                            <div className="w-px h-3 bg-gray-800" />
                            <JogBtn label={<AxisLabel axis="Z" dir="-" />} onClick={() => jog('Z', -1)} disabled={!canJog} color="purple" sm />
                        </div>
                    )}
                </div>

                {/* ── Macro Grid (replaces Homing/Work Origin) ────────────── */}
                <div className="flex-shrink-0 relative mt-1">
                    <ActionGrid 
                        rows={2} 
                        cols={4} 
                        actions={allActions} 
                        enableOverflow={true} 
                        onExecute={(act) => executeMacro(act.functionArgs as GCodeMacro)} 
                    />
                </div>
            </div>

    {/* ── Row 4: Machine action bar ─────────────────────────────────── */}
    <div className="flex-shrink-0 flex gap-2">
                <button onClick={feedHold}
                    className="flex-1 py-4 bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 font-black text-xs uppercase tracking-wide rounded-xl hover:bg-yellow-500/20 hover:border-yellow-400 active:scale-95 transition-all">
                    ⏸ Hold
                </button>

                <button onClick={cycleStartOrBegin} disabled={!isHold && !jobStatus?.is_queued}
                    className={`flex-1 py-4 font-black text-xs uppercase tracking-wide rounded-xl border active:scale-95 transition-all ${
                        isHold || jobStatus?.is_queued
                            ? 'bg-green-500/10 border-green-500/30 text-green-400 hover:bg-green-500/20 hover:border-green-400'
                            : 'bg-black/20 border-gray-800 text-gray-700 cursor-not-allowed'
                    }`}>
                    ▶ {jobStatus?.is_queued ? 'Start' : 'Resume'}
                </button>

                {(jobStatus?.is_streaming || jobStatus?.is_queued) && (
                    <button onClick={cancelJob}
                        className="flex-1 py-4 bg-red-900/30 border border-red-800/60 text-red-400 font-black text-xs uppercase tracking-wide rounded-xl hover:bg-red-800/50 hover:border-red-700 active:scale-95 transition-all">
                        ⛔ Cancel
                    </button>
                )}

                {isAlarm && (
                    <button onClick={unlock}
                        className="flex-1 py-4 bg-miami-purple/10 border border-miami-purple/40 text-miami-purple font-black text-xs uppercase tracking-wide rounded-xl hover:bg-miami-purple/20 hover:border-miami-purple active:scale-95 transition-all">
                        🔓 Unlock
                    </button>
                )}

                <button onClick={softReset}
                    className="flex-1 py-4 bg-red-500/10 border border-red-500/30 text-red-400 font-black text-xs uppercase tracking-wide rounded-xl hover:bg-red-500/20 hover:border-red-500 active:scale-95 transition-all">
                    ↺ Reset
                </button>
            </div>

        </div>
        </View>
    );
};
