import React, { useState, useEffect, useRef, useCallback } from 'react';
import { lensService } from '../services/lensService';
import { useAppSettingsStore } from '../store/appSettingsStore';
import { useJobOperationsStore } from '../store/jobOperationsStore';
import { useNavigationStore } from '../store/navigationStore';
import { NumericInput } from '../components/NumericInput';
import type { DetectionResult, TransformResponse, CalibrationPoint, LensHealthResponse, LensSessionStatus, LensCalibrationResult } from '../types/lens';
import { WorkspaceGrid } from '../components/workspace/WorkspaceGrid';
import { View } from '../components/layout/View';
import { TabControl } from '../components/ui/TabControl';
import { InstructionCard } from '../components/ui/InstructionCard';
import { SectionCard } from '../components/layout/SectionCard';
import { ActionButton } from '../components/ui/ActionButton';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { TextInput } from '../components/ui/TextInput';

// Canvas dimensions (similar to StudioModule)
const CW = 480, CH = 300;

type LensTab = 'optics' | 'mapping' | 'tags';


export const LensModule: React.FC = () => {
    // ── Store Selectors ──
    const mmW = useAppSettingsStore(s => s.settings.machineWidth);
    const mmH = useAppSettingsStore(s => s.settings.machineHeight);
    const lensApiUrl = useAppSettingsStore(s => s.settings.lensApiUrl);
    const major = useAppSettingsStore(s => s.settings.majorSpacing) || 50;
    const minor = useAppSettingsStore(s => s.settings.minorSpacing) || 10;
    
    const { designSource, designType, designName, setPlacement } = useJobOperationsStore();

    // ── UI State ──
    const [activeTab, setActiveTab] = useState<LensTab>('optics');
    const [isStreaming, setIsStreaming] = useState(true);
    const [detections, setDetections] = useState<DetectionResult[]>([]);
    const [selectedWorkpieceId, setSelectedWorkpieceId] = useState<string | null>(null);
    const [isDetecting, setIsDetecting] = useState(false);
    const [isTransforming, setIsTransforming] = useState(false);
    const [transformResult, setTransformResult] = useState<TransformResponse | null>(null);

    // ── Calibration State ──
    const [calibrationPoints, setCalibrationPoints] = useState<CalibrationPoint[]>([]);
    const [isCalibrating, setIsCalibrating] = useState(false);

    // ── Tag Generator State ──
    const [tagId, setTagId] = useState(0);
    const [tagSize, setTagSize] = useState(50);
    const [tagDpi, setTagDpi] = useState(300);
    const [isBatch, setIsBatch] = useState(false);
    const [paperFormat, setPaperFormat] = useState<'letter' | 'a4'>('letter');
    const [guideDistanceMm, setGuideDistanceMm] = useState(0);

    // ── Lens Calibration State ──
    const [healthStatus, setHealthStatus] = useState<LensHealthResponse | null>(null);
    const [lensSession, setLensSession] = useState<LensSessionStatus | null>(null);
    const [lensResult, setLensResult] = useState<LensCalibrationResult | null>(null);
    const [isLensLoading, setIsLensLoading] = useState(false);
    const [lensPreviewKey, setLensPreviewKey] = useState(0);
    const [showPreviewFlash, setShowPreviewFlash] = useState(false);

    // Flash the capture preview for 2s after each successful capture, then revert to stream
    useEffect(() => {
        if (lensPreviewKey === 0) return;
        setShowPreviewFlash(true);
        const t = setTimeout(() => setShowPreviewFlash(false), 2000);
        return () => clearTimeout(t);
    }, [lensPreviewKey]);

    const streamUrl = lensService.getStreamUrl();

    // ── Interaction ──
    const refreshDetections = async () => {
        setIsDetecting(true);
        try {
            const results = await lensService.detectObjects();
            if (Array.isArray(results)) {
                setDetections(results);
            } else {
                console.error('Detection API returned non-array:', results);
                setDetections([]);
            }
        } catch (err) {
            console.error('Detection failed', err);
            setDetections([]);
        } finally {
            setIsDetecting(false);
        }
    };


    const containerRef = useRef<HTMLDivElement>(null);
    const [gridWidth, setGridWidth] = useState(CW);
    useEffect(() => {
        if (!containerRef.current) return;
        const observer = new ResizeObserver(entries => {
            const w = entries[0].contentRect.width;
            if (w > 0) setGridWidth(w);
        });
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    const alignDesign = async () => {
        if (!selectedWorkpieceId || !designSource) return;
        setIsTransforming(true);
        try {
            let designFile: Blob | string = designSource;
            if (designType === 'bitmap' && designSource.startsWith('data:')) {
                const res = await fetch(designSource);
                designFile = await res.blob();
            }

            const result = await lensService.calculateTransform({
                workpiece_id: selectedWorkpieceId,
                design_file: designFile,
            });
            setTransformResult(result);
            if (result.success) {
                setPlacement({
                    posX: result.translation?.x ?? 0,
                    posY: result.translation?.y ?? 0,
                    scalePct: (result.scale ?? 1) * 100,
                    rotation: result.rotation ?? 0
                });
            }
        } catch (err) {
            console.error('Alignment failed', err);
            alert('Alignment failed. Check console for details.');
        } finally {
            setIsTransforming(false);
        }
    };

    const submitCalibration = async () => {
        if (calibrationPoints.length < 4) {
            alert('At least 4 points are required for calibration.');
            return;
        }
        setIsCalibrating(true);
        try {
            await lensService.calibrate(calibrationPoints);
            alert('Calibration successful!');
            // Refresh health status after calibration
            const h = await lensService.getHealthStatus();
            if (h) setHealthStatus(h);
        } catch (err) {
            console.error('Calibration failed', err);
            alert('Calibration failed.');
        } finally {
            setIsCalibrating(false);
        }
    };

    // ── Lens Calibration Handlers ──

    const fetchHealthStatus = async () => {
        const h = await lensService.getHealthStatus();
        if (h) setHealthStatus(h);
    };

    const fetchCalibrationTags = useCallback(async () => {
        try {
            const tags = await lensService.getCalibrationTags();
            if (tags && tags.length > 0) {
                setCalibrationPoints(tags);
            }
        } catch (err) {
            console.error('Failed to fetch calibration tags', err);
        }
    }, []);

    useEffect(() => { fetchHealthStatus(); }, [lensApiUrl]);

    // Fetch existing tags when switching to mapping tab or on mount
    useEffect(() => {
        if (activeTab === 'mapping') {
            fetchCalibrationTags();
        }
    }, [activeTab, fetchCalibrationTags]);

    const startLensSession = async () => {
        setIsLensLoading(true);
        setLensResult(null);
        try {
            const status = await lensService.lensCalibrationStart();
            setLensSession(status);
        } catch (err) {
            console.error('Failed to start lens session', err);
            alert('Failed to start lens calibration session.');
        } finally {
            setIsLensLoading(false);
        }
    };

    const captureLensFrame = async () => {
        setIsLensLoading(true);
        try {
            const status = await lensService.lensCalibrationCapture();
            setLensSession(status);
            setLensPreviewKey(k => k + 1);
        } catch (err) {
            console.error('Capture failed', err);
        } finally {
            setIsLensLoading(false);
        }
    };

    const finishLensCalibration = async () => {
        setIsLensLoading(true);
        try {
            const result = await lensService.lensCalibrationFinish();
            setLensResult(result);
            setLensSession(null);
            // Refresh health to reflect new lens_calibrated status
            await fetchHealthStatus();
        } catch (err) {
            console.error('Finish failed', err);
            alert('Lens calibration computation failed.');
        } finally {
            setIsLensLoading(false);
        }
    };

    const resetLensCalibration = async () => {
        if (!confirm('This will delete the saved lens calibration. You will need to recalibrate before using Mapping. Continue?')) return;
        setIsLensLoading(true);
        try {
            await lensService.lensCalibrationReset();
            setLensSession(null);
            setLensResult(null);
            await fetchHealthStatus();
        } catch (err) {
            console.error('Reset failed', err);
            alert('Failed to reset lens calibration.');
        } finally {
            setIsLensLoading(false);
        }
    };

    const addCalibrationPoint = (id: number, x: number, y: number, anchor: string = 'center', sizeMm?: number) => {
        setCalibrationPoints(prev => {
            const existing = prev.find(p => p.id === id);
            if (existing) {
                return prev.map(p => p.id === id 
                    ? { ...p, physical_x: x, physical_y: y, anchor, size_mm: sizeMm ?? p.size_mm ?? tagSize } 
                    : p
                );
            }
            return [...prev, { id, physical_x: x, physical_y: y, size_mm: sizeMm ?? tagSize, anchor }];
        });
    };



    return (
        <View title="Lens Calibration" subtitle="Vision Calibration & Tuning" showHomeButton>
            <div ref={containerRef} className="flex flex-col gap-4 p-4">
                
                {/* Calibration Status Banner (always visible) */}
                {healthStatus && (() => {
                    const opticsOk = healthStatus.lens_calibrated;
                    const mappingOk = opticsOk && healthStatus.homography_calibrated;
                    const allGood = opticsOk && mappingOk;
                    return (
                        <div className={`flex items-center gap-3 p-3 rounded-xl border ${
                            allGood
                                ? 'bg-emerald-500/10 border-emerald-500/30'
                                : 'bg-amber-500/10 border-amber-500/30'
                        }`}>
                            <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                                allGood ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'
                            }`} />
                            <div className="flex-1 flex items-center gap-4">
                                <div className="flex items-center gap-1.5">
                                    <span className={`text-[10px] font-black uppercase ${
                                        opticsOk ? 'text-emerald-400' : 'text-amber-400'
                                    }`}>
                                        Optics {opticsOk ? '✓' : '✗'}
                                    </span>
                                </div>
                                <div className="w-px h-3 bg-gray-700" />
                                <div className="flex items-center gap-1.5">
                                    <span className={`text-[10px] font-black uppercase ${
                                        mappingOk ? 'text-emerald-400' : 'text-amber-400'
                                    }`}>
                                        Mapping {mappingOk ? '✓' : '✗'}
                                    </span>
                                </div>
                                {!allGood && (
                                    <>
                                        <div className="w-px h-3 bg-gray-700" />
                                        <button 
                                            onClick={() => setActiveTab(!opticsOk ? 'optics' : 'mapping')}
                                            className="text-[9px] text-amber-400 font-bold uppercase hover:underline"
                                        >
                                            Setup →
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    );
                })()}

                <TabControl
                    tabs={[
                        { id: 'optics', label: 'Optics' },
                        { id: 'mapping', label: 'Mapping' },
                        { id: 'tags', label: 'Tags' }
                    ]}
                    activeTab={activeTab}
                    onChange={(id) => setActiveTab(id as LensTab)}
                />

                <div className="flex flex-col gap-4">

                    {/* ── MAPPING TAB (AprilTag Homography) ── */}
                    {activeTab === 'mapping' && (
                        <div className="flex flex-col gap-4">
                            <InstructionCard title="Machine Calibration">
                                Place AprilTags on your machine bed and enter their physical coordinates (mm) to map the camera view to your workspace.
                            </InstructionCard>

                            <WorkspaceGrid
                                width={gridWidth - 24}
                                height={CH}
                                machineWidthMm={mmW}
                                machineHeightMm={mmH}
                                majorSpacingMm={major}
                                minorSpacingMm={minor}
                                backgroundImageUrl={undefined} // No camera stream in mapping tab per request
                                enablePanZoom={false}
                                renderOverlay={(ctx, t) => {
                                    if (Array.isArray(calibrationPoints)) {
                                        calibrationPoints.forEach(p => {
                                            const size = p.size_mm || tagSize;
                                            let min_x = p.physical_x;
                                            let min_y = p.physical_y;

                                            if (p.anchor === 'center') {
                                                min_x -= size / 2;
                                                min_y -= size / 2;
                                            } else if (p.anchor?.includes('right')) {
                                                min_x -= size;
                                            }

                                            if (p.anchor?.includes('top')) {
                                                min_y -= size;
                                            }

                                            const px_min = min_x * t.baseScale;
                                            const py_max = -(min_y + size) * t.baseScale;
                                            const sizePx = size * t.baseScale;

                                            // Draw the tag box
                                            ctx.strokeStyle = 'rgba(0, 240, 255, 0.5)';
                                            ctx.lineWidth = 1 / t.zoom;
                                            ctx.setLineDash([4 / t.zoom, 4 / t.zoom]);
                                            ctx.strokeRect(px_min, py_max, sizePx, sizePx);
                                            ctx.setLineDash([]);
                                            
                                            // Fill the tag box lightly
                                            ctx.fillStyle = 'rgba(0, 240, 255, 0.05)';
                                            ctx.fillRect(px_min, py_max, sizePx, sizePx);

                                            // Draw the anchor point
                                            const anchorPx = p.physical_x * t.baseScale;
                                            const anchorPy = -p.physical_y * t.baseScale;
                                            ctx.fillStyle = '#00f0ff';
                                            ctx.beginPath(); ctx.arc(anchorPx, anchorPy, 4 / t.zoom, 0, Math.PI * 2); ctx.fill();
                                            ctx.strokeStyle = 'white'; ctx.lineWidth = 1 / t.zoom; ctx.stroke();
                                            
                                            ctx.save();
                                            ctx.font = `${9 / t.zoom}px sans-serif`; ctx.fillStyle = 'white';
                                            ctx.fillText(`ID:${p.id}`, anchorPx + (6 / t.zoom), anchorPy - (6 / t.zoom));
                                            ctx.restore();
                                        });
                                    }
                                }}
                            />

                            <SectionCard 
                                title={`Tag Mapping Points (${calibrationPoints.length})`}
                                action={
                                    <button onClick={() => setCalibrationPoints([])} className="text-[10px] text-red-400 hover:underline">Clear All</button>
                                }
                            >
                                <div className="grid grid-cols-2 gap-3 pb-4">
                                    {[0, 1, 2, 3].map(i => {
                                        const p = calibrationPoints.find(cp => cp.id === i);
                                        const anchor = p?.anchor || 'center';
                                        
                                        const AnchorDot = ({ pos, label }: { pos: string, label: string }) => (
                                            <button 
                                                onClick={() => addCalibrationPoint(i, p?.physical_x ?? 0, p?.physical_y ?? 0, pos, p?.size_mm ?? tagSize)}
                                                className={`absolute w-8 h-8 flex items-center justify-center transition-all z-20`}
                                                style={{
                                                    top: pos.includes('top') ? '-16px' : pos.includes('bottom') ? 'auto' : '50%',
                                                    bottom: pos.includes('bottom') ? '-16px' : 'auto',
                                                    left: pos.includes('left') ? '-16px' : pos.includes('right') ? 'auto' : '50%',
                                                    right: pos.includes('right') ? '-16px' : 'auto',
                                                    transform: pos === 'center' ? 'translate(-50%, -50%)' : 
                                                            pos.includes('top') || pos.includes('bottom') ? (pos.includes('left') || pos.includes('right') ? 'none' : 'translateX(-50%)') : 
                                                            'translateY(-50%)'
                                                }}
                                                title={label}
                                            >
                                                <div className={`w-4 h-4 rounded-full border-2 transition-all ${
                                                    anchor === pos 
                                                        ? 'bg-miami-cyan border-white scale-125 shadow-[0_0_12px_rgba(0,240,255,1)]' 
                                                        : 'bg-gray-800 border-gray-600'
                                                }`} />
                                            </button>
                                        );

                                        return (
                                            <div key={i} className="flex flex-col gap-3 bg-black/60 p-3 rounded-2xl border border-gray-800 relative overflow-hidden">
                                                <div className="flex justify-between items-center mb-1">
                                                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-tighter">Tag ID</span>
                                                    <span className="text-sm font-black text-miami-cyan">{i}</span>
                                                </div>

                                                {/* Visual Anchor Selector */}
                                                <div className="flex justify-center py-4">
                                                    <div className="relative w-16 h-16 bg-gray-900/50 border border-gray-700 rounded-lg">
                                                        {/* Background Pattern representing an AprilTag */}
                                                        <div className="absolute inset-2 border-2 border-dashed border-gray-800 rounded opacity-50" />
                                                        
                                                        <AnchorDot pos="top-left" label="Top Left" />
                                                        <AnchorDot pos="top-right" label="Top Right" />
                                                        <AnchorDot pos="center" label="Center" />
                                                        <AnchorDot pos="bottom-left" label="Bottom Left" />
                                                        <AnchorDot pos="bottom-right" label="Bottom Right" />
                                                    </div>
                                                </div>

                                                <div className="text-[9px] text-center font-bold text-gray-500 uppercase -mt-2 mb-1">
                                                    Anchor: <span className="text-miami-cyan">{anchor}</span>
                                                </div>

                                                {/* Coordinate + Size Inputs */}
                                                <div className="flex flex-col gap-3">
                                                    <TextInput 
                                                        label="Physical X (mm)"
                                                        inputMode="decimal"
                                                        value={p?.physical_x ?? 0} 
                                                        onChange={e => addCalibrationPoint(i, parseFloat(e.target.value) || 0, p?.physical_y ?? 0, anchor, p?.size_mm ?? tagSize)} 
                                                    />
                                                    <TextInput 
                                                        label="Physical Y (mm)"
                                                        inputMode="decimal"
                                                        value={p?.physical_y ?? 0} 
                                                        onChange={e => addCalibrationPoint(i, p?.physical_x ?? 0, parseFloat(e.target.value) || 0, anchor, p?.size_mm ?? tagSize)} 
                                                    />
                                                    <TextInput 
                                                        label="Size (mm)"
                                                        inputMode="decimal"
                                                        value={p?.size_mm ?? tagSize} 
                                                        onChange={e => addCalibrationPoint(i, p?.physical_x ?? 0, p?.physical_y ?? 0, anchor, parseFloat(e.target.value) || 0)}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Empty-bed reminder — reference frame is captured automatically */}
                                <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 mb-4">
                                    <span className="text-amber-400 text-base mt-0.5 shrink-0">⚠️</span>
                                    <p className="text-[11px] text-amber-300 leading-relaxed">
                                        <span className="font-black">Make sure the bed is empty</span> before submitting.
                                        Calibration will automatically capture an empty-bed reference photo used for
                                        background subtraction during workpiece detection.
                                    </p>
                                </div>

                                <ActionButton 
                                    onClick={submitCalibration} 
                                    disabled={isCalibrating || calibrationPoints.length < 4}
                                    variant="global"
                                    className="w-full py-4"
                                >
                                    {isCalibrating ? 'SUBMITTING...' : 'UPDATE CALIBRATION'}
                                </ActionButton>
                            </SectionCard>
                        </div>
                    )}

                    {/* ── OPTICS TAB (Lens Distortion Calibration) ── */}
                    {activeTab === 'optics' && (
                        <div className="flex flex-col gap-4">
                            <InstructionCard title="Lens Distortion Calibration">
                                Print a checkerboard, hold it in front of the camera at various positions and angles. 
                                The system computes your camera's intrinsic parameters to correct barrel distortion.
                                <div className="mt-4">
                                    <a 
                                        href={lensService.getCheckerboardUrl()}
                                        target="_blank" rel="noopener noreferrer"
                                        className="inline-block px-4 py-2 bg-miami-pink/20 text-miami-pink border border-miami-pink/30 font-black rounded-xl text-center text-[10px] uppercase tracking-widest hover:bg-miami-pink/30 transition-all"
                                    >
                                        🖨 Download Checkerboard PDF
                                    </a>
                                </div>
                            </InstructionCard>

                            {/* Session Controls */}
                            {!lensSession ? (
                                <div className="flex flex-col gap-2">
                                    <ActionButton 
                                        onClick={startLensSession} 
                                        disabled={isLensLoading}
                                        variant="global"
                                        className="w-full py-4 text-sm"
                                    >
                                        {isLensLoading ? 'STARTING...' : 'START CALIBRATION SESSION'}
                                    </ActionButton>
                                    {healthStatus?.lens_calibrated && (
                                        <button
                                            onClick={resetLensCalibration}
                                            disabled={isLensLoading}
                                            className="w-full py-2 bg-red-500/10 text-red-400 border border-red-500/20 font-bold rounded-xl text-[11px] uppercase tracking-widest hover:bg-red-500/20 transition-all disabled:opacity-30"
                                        >
                                            Reset &amp; Recalibrate
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <div className="flex flex-col gap-4">
                                    {/* Progress */}
                                    <div className="bg-black/40 border border-gray-800 rounded-2xl p-4 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-black text-gray-400 uppercase tracking-widest">
                                                Captures: {lensSession.captures_done} / {lensSession.total_target}
                                            </span>
                                            <span className={`text-[10px] font-bold uppercase ${
                                                lensSession.can_finish ? 'text-emerald-400' : 'text-amber-400'
                                            }`}>
                                                {lensSession.can_finish ? '✓ Ready to finish' : `${Math.max(0, lensSession.total_target - lensSession.captures_done)} more needed`}
                                            </span>
                                        </div>

                                        {/* Progress Bar */}
                                        <div className="h-2 bg-black/60 rounded-full overflow-hidden">
                                            <div 
                                                className="h-full bg-gradient-to-r from-miami-cyan to-miami-purple rounded-full transition-all duration-500"
                                                style={{ width: `${Math.min(100, (lensSession.captures_done / lensSession.total_target) * 100)}%` }}
                                            />
                                        </div>

                                        {/* Zone Grid */}
                                        <div className="grid grid-cols-3 gap-1">
                                            {['top-left', 'top-center', 'top-right', 'center-left', 'center', 'center-right', 'bottom-left', 'bottom-center', 'bottom-right'].map(zone => (
                                                <div key={zone} className={`h-8 rounded flex items-center justify-center text-[8px] font-bold uppercase tracking-tight transition-all ${
                                                    lensSession.zones_covered.includes(zone)
                                                        ? 'bg-miami-cyan/20 text-miami-cyan border border-miami-cyan/30'
                                                        : 'bg-black/40 text-gray-600 border border-gray-800'
                                                }`}>
                                                    {lensSession.zones_covered.includes(zone) ? '✓' : zone.replace('-', '\n')}
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Instruction */}
                                    {lensSession.instruction && (
                                        <div className="bg-miami-cyan/5 border border-miami-cyan/20 rounded-2xl p-3">
                                            <p className="text-xs text-miami-cyan font-medium leading-relaxed">
                                                {lensSession.instruction}
                                            </p>
                                        </div>
                                    )}

                                    {/* Last capture result */}
                                    {lensSession.message && (
                                        <div className={`text-[10px] font-bold px-3 py-2 rounded-xl ${
                                            lensSession.success === false 
                                                ? 'bg-red-500/10 text-red-400 border border-red-500/20' 
                                                : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                        }`}>
                                            {lensSession.message}
                                        </div>
                                    )}

                                    {/* Live Stream + Zone Grid Overlay */}
                                    <div className="relative bg-black rounded-2xl overflow-hidden border border-gray-800">

                                        {/* Live MJPEG stream — always shown as the base layer */}
                                        <img
                                            src={streamUrl}
                                            alt="Live Camera"
                                            className="w-full h-auto block"
                                            onError={() => setIsStreaming(false)}
                                        />

                                        {/* Capture preview flash — shown for 2s after each capture */}
                                        {showPreviewFlash && (
                                            <img
                                                key={lensPreviewKey}
                                                src={lensService.getLensPreviewUrl()}
                                                alt="Capture Preview"
                                                className="absolute inset-0 w-full h-full object-cover animate-pulse"
                                                onError={(e) => (e.currentTarget.style.display = 'none')}
                                            />
                                        )}

                                        {/* 3×3 zone grid overlay */}
                                        {!showPreviewFlash && (
                                            <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none">
                                                {(['top-left','top-center','top-right','center-left','center','center-right','bottom-left','bottom-center','bottom-right']).map(zone => {
                                                    const covered = lensSession.zones_covered.includes(zone);
                                                    return (
                                                        <div key={zone} className={`border border-white/20 flex items-center justify-center transition-all ${
                                                            covered
                                                                ? 'bg-emerald-500/25'
                                                                : 'bg-black/10'
                                                        }`}>
                                                            {covered
                                                                ? <span className="text-emerald-400 text-lg font-black drop-shadow">✓</span>
                                                                : <span className="text-white/30 text-[9px] font-bold uppercase tracking-tighter text-center leading-tight px-1">{zone.replace('-', ' ')}</span>
                                                            }
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        {/* Flash badge */}
                                        {showPreviewFlash && (
                                            <div className="absolute top-2 left-2 bg-emerald-500/90 text-black text-[10px] font-black uppercase px-2 py-1 rounded-lg">
                                                Captured ✓
                                            </div>
                                        )}

                                        {/* Loading overlay */}
                                        {isLensLoading && (
                                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                                <span className="text-miami-cyan font-black text-sm uppercase tracking-widest animate-pulse">Detecting...</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="flex gap-3">
                                        <ActionButton 
                                            onClick={captureLensFrame}
                                            disabled={isLensLoading || lensSession.captures_done >= lensSession.max_captures}
                                            variant="normal"
                                            className="flex-1 py-4 text-sm"
                                        >
                                            {isLensLoading ? 'CAPTURING...' : '📸 CAPTURE'}
                                        </ActionButton>
                                        <ActionButton 
                                            onClick={finishLensCalibration}
                                            disabled={isLensLoading || !lensSession.can_finish}
                                            variant="global"
                                            className="flex-1 py-4 text-sm"
                                        >
                                            {isLensLoading ? 'COMPUTING...' : '✓ FINISH'}
                                        </ActionButton>
                                    </div>
                                </div>
                            )}

                            {/* Result */}
                            {lensResult && (
                                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 space-y-2">
                                    <h4 className="text-sm font-black text-emerald-400 uppercase">Calibration Complete</h4>
                                    <div className="grid grid-cols-3 gap-3 text-center">
                                        <div>
                                            <div className="text-[9px] text-gray-500 uppercase">Model</div>
                                            <div className="text-xs font-mono text-white">{lensResult.model}</div>
                                        </div>
                                        <div>
                                            <div className="text-[9px] text-gray-500 uppercase">RMS Error</div>
                                            <div className="text-xs font-mono text-white">{lensResult.rms_error.toFixed(4)}px</div>
                                        </div>
                                        <div>
                                            <div className="text-[9px] text-gray-500 uppercase">Images</div>
                                            <div className="text-xs font-mono text-white">{lensResult.captures_used}</div>
                                        </div>
                                    </div>
                                    <p className="text-[10px] text-amber-400 font-bold mt-2">
                                        ⚠ Now re-run AprilTag calibration (Mapping tab) — undistortion changes pixel positions.
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── TAGS TAB ── */}
                    {activeTab === 'tags' && (
                        <div className="flex flex-col gap-4">
                            <InstructionCard title="AprilTag Printing">
                                Generate and print AprilTags for machine calibration. Stick these to your workspace surface and use the Mapping tab to align the camera coordinate system.
                            </InstructionCard>

                            <SectionCard 
                                title="AprilTag Generator"
                                action={
                                    <SegmentedControl 
                                        options={[
                                            { value: 'single', label: 'Single' },
                                            { value: 'batch', label: 'Full Set' }
                                        ]}
                                        value={isBatch ? 'batch' : 'single'}
                                        onChange={(v) => setIsBatch(v === 'batch')}
                                    />
                                }
                            >
                                <div className="grid grid-cols-4 gap-3 items-end">
                                    <div className={isBatch ? 'opacity-30 pointer-events-none' : ''}>
                                        <label className="text-[9px] text-gray-500 uppercase font-bold block mb-1">Tag ID (0-3)</label>
                                        <NumericInput value={tagId} onChange={v => setTagId(Math.min(3, Math.max(0, v)))} min={0} max={3} className="w-full bg-black border border-gray-700 rounded-lg p-2.5 text-xs font-mono" />
                                    </div>
                                    <div>
                                        <label className="text-[9px] text-gray-500 uppercase font-bold block mb-1">Size (mm)</label>
                                        <NumericInput value={tagSize} onChange={setTagSize} min={10} className="w-full bg-black border border-gray-700 rounded-lg p-2.5 text-xs font-mono" />
                                    </div>
                                    <div>
                                        <label className="text-[9px] text-gray-500 uppercase font-bold block mb-1">Guide Dist (mm)</label>
                                        <NumericInput value={guideDistanceMm} onChange={setGuideDistanceMm} min={0} className="w-full bg-black border border-gray-700 rounded-lg p-2.5 text-xs font-mono" />
                                    </div>
                                    <div>
                                        <label className="text-[9px] text-gray-500 uppercase font-bold block mb-1">Paper Size</label>
                                        <select 
                                            value={paperFormat} 
                                            onChange={e => setPaperFormat(e.target.value as 'letter' | 'a4')}
                                            className="w-full bg-black border border-gray-700 rounded-lg p-2.5 text-xs font-mono text-white focus:border-miami-cyan outline-none"
                                        >
                                            <option value="letter">Letter</option>
                                            <option value="a4">A4</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="mt-6">
                                    <ActionButton
                                        variant="global"
                                        className="w-full py-4"
                                        onClick={() => {
                                            const url = isBatch 
                                                ? `${lensApiUrl}/api/apriltag/batch?start_id=0&count=4&size_mm=${tagSize}&dpi=${tagDpi}&paper_width_in=${paperFormat === 'letter' ? 8.5 : 8.27}&paper_height_in=${paperFormat === 'letter' ? 11.0 : 11.69}${guideDistanceMm > 0 ? `&guide_distance_mm=${guideDistanceMm}` : ''}`
                                                : `${lensApiUrl}/api/apriltag/generate/${tagId}?size_mm=${tagSize}&dpi=${tagDpi}&paper_width_in=${paperFormat === 'letter' ? 8.5 : 8.27}&paper_height_in=${paperFormat === 'letter' ? 11.0 : 11.69}${guideDistanceMm > 0 ? `&guide_distance_mm=${guideDistanceMm}` : ''}`;
                                            window.open(url, '_blank', 'noopener,noreferrer');
                                        }}
                                    >
                                        🖨 DOWNLOAD {isBatch ? 'FULL SET' : 'SINGLE TAG'} PDF
                                    </ActionButton>
                                </div>
                            </SectionCard>
                        </div>
                    )}
                </div>
            </div>
        </View>
    );
};

