import React, { useState, useEffect, useRef, useCallback } from 'react';
import { lensService } from '../services/lensService';
import { useAppSettingsStore } from '../store/appSettingsStore';
import { useJobOperationsStore } from '../store/jobOperationsStore';
import { useNavigationStore } from '../store/navigationStore';
import { NumericInput } from '../components/NumericInput';
import type { DetectionResult, TransformResponse, CalibrationPoint, LensHealthResponse, LensSessionStatus, LensCalibrationResult } from '../types/lens';

// Canvas dimensions (similar to StudioModule)
const CW = 480, CH = 300, ML = 32, MB = 20;
const DW = CW - ML, DH = CH - MB;

type LensTab = 'optics' | 'mapping' | 'tags';
const TAB_LABELS: Record<LensTab, string> = {
    optics: 'Optics',
    mapping: 'Mapping',
    tags: 'Tags',
};

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

    // ── Canvas Refs ──
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [renderTick, setRenderTick] = useState(0);
    const bumpRender = useCallback(() => setRenderTick(t => t + 1), []);

    // Flash the capture preview for 2s after each successful capture, then revert to stream
    useEffect(() => {
        if (lensPreviewKey === 0) return;
        setShowPreviewFlash(true);
        const t = setTimeout(() => setShowPreviewFlash(false), 2000);
        return () => clearTimeout(t);
    }, [lensPreviewKey]);

    // ── Viewport Logic (Simpler than StudioModule as we don't zoom/pan here yet) ──
    const baseSc = Math.min(DW / mmW, DH / mmH);
    const scX = baseSc;
    const scY = baseSc;
    const plotW = scX * mmW;
    const plotH = scY * mmH;
    // Center the plot area horizontally
    const plotX = ML + (DW - plotW) / 2;

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

    const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Convert canvas pixels to mm
        const mmX = (x - ML) / baseSc;
        const mmY = (plotH - (y)) / baseSc;

        // handleCanvasClick placeholder for future tab-specific interactions
    };

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

    useEffect(() => { fetchHealthStatus(); }, [lensApiUrl]);

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

    // ── Drawing Logic (Enhanced Grid/Axis) ──
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // 1. Background
        ctx.fillStyle = '#080808'; ctx.fillRect(0, 0, CW, CH);

        // Bed background
        ctx.fillStyle = '#111111'; ctx.fillRect(plotX, 0, plotW, plotH);
        ctx.strokeStyle = 'rgba(0,240,255,0.1)'; ctx.lineWidth = 1;
        ctx.strokeRect(plotX, 0, plotW, plotH);

        // 2. Grid (Extended)
        const gMinX = -50, gMaxX = mmW + 50, gMinY = -50, gMaxY = mmH + 50;

        // Minor grid
        ctx.beginPath(); ctx.strokeStyle = 'rgba(0,240,255,0.03)'; ctx.lineWidth = 0.5;
        for (let x = Math.floor(gMinX/minor)*minor; x <= gMaxX; x += minor) { const px = plotX + x * scX; ctx.moveTo(px, 0); ctx.lineTo(px, plotH); }
        for (let y = Math.floor(gMinY/minor)*minor; y <= gMaxY; y += minor) { const py = plotH - y * scY; ctx.moveTo(plotX, py); ctx.lineTo(plotX + plotW, py); }
        ctx.stroke();

        // Major grid
        ctx.beginPath(); ctx.strokeStyle = 'rgba(0,240,255,0.08)'; ctx.lineWidth = 1;
        for (let x = Math.floor(gMinX/major)*major; x <= gMaxX; x += major) { const px = plotX + x * scX; ctx.moveTo(px, 0); ctx.lineTo(px, plotH); }
        for (let y = Math.floor(gMinY/major)*major; y <= gMaxY; y += major) { const py = plotH - y * scY; ctx.moveTo(plotX, py); ctx.lineTo(plotX + plotW, py); }
        ctx.stroke();

        // 3. Origin Highlight
        ctx.beginPath(); ctx.strokeStyle = 'rgba(0,240,255,0.2)'; ctx.lineWidth = 2;
        ctx.moveTo(plotX, 0); ctx.lineTo(plotX, plotH); // X=0
        ctx.moveTo(plotX, plotH); ctx.lineTo(plotX + plotW, plotH); // Y=0
        ctx.stroke();

        // 4. Axis Labels & Ticks
        ctx.font = `bold 10px ui-monospace, monospace`;
        ctx.fillStyle = 'rgba(0,200,220,0.6)';
        
        // X Labels & Ticks
        ctx.textBaseline = 'top'; ctx.textAlign = 'center';
        for (let x = 0; x <= mmW; x += major) {
            const px = plotX + x * scX;
            if (px >= plotX && px <= CW) {
                ctx.fillText(`${x}`, px, plotH + 4);
                // Ticks
                ctx.beginPath(); ctx.strokeStyle = 'rgba(0,240,255,0.3)';
                ctx.moveTo(px, plotH); ctx.lineTo(px, plotH + 3); ctx.stroke();
            }
        }
        
        // Y Labels & Ticks
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        for (let y = 0; y <= mmH; y += major) {
            const py = plotH - y * scY;
            if (py >= 0 && py <= plotH) {
                if (y !== 0) ctx.fillText(`${y}`, plotX - 6, py);
                // Ticks
                ctx.beginPath(); ctx.strokeStyle = 'rgba(0,240,255,0.3)';
                ctx.moveTo(plotX, py); ctx.lineTo(plotX - 3, py); ctx.stroke();
            }
        }

        // 5. Origin Marker
        ctx.fillStyle = '#ff007f'; ctx.beginPath(); ctx.arc(plotX, plotH, 3, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(255,0,127,0.5)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(plotX, plotH - 6); ctx.lineTo(plotX, plotH); ctx.moveTo(plotX, plotH); ctx.lineTo(plotX + 6, plotH); ctx.stroke();

        // 6. Detections (Align Tab)
        if (activeTab === 'align' && Array.isArray(detections)) {
            detections.forEach(d => {
                const isSelected = d.workpiece_id === selectedWorkpieceId;
                ctx.strokeStyle = isSelected ? '#00f0ff' : 'rgba(0,240,255,0.4)';
                ctx.lineWidth = isSelected ? 2 : 1;
                
                if (d.box) {
                    const [bx, by, bw, bh] = d.box;
                    ctx.strokeRect(plotX + bx * scX, plotH - (by + bh) * scY, bw * scX, bh * scY);
                } else if (d.points && d.points.length > 0) {
                    ctx.beginPath();
                    ctx.moveTo(plotX + d.points[0].x * scX, plotH - d.points[0].y * scY);
                    for (let i = 1; i < d.points.length; i++) {
                        ctx.lineTo(plotX + d.points[i].x * scX, plotH - d.points[i].y * scY);
                    }
                    ctx.closePath(); ctx.stroke();
                }

                ctx.fillStyle = isSelected ? '#00f0ff' : 'rgba(0,240,255,0.6)';
                ctx.font = '9px monospace';
                const lx = d.box ? d.box[0] : (d.points?.[0].x ?? 0);
                const ly = d.box ? d.box[1] + d.box[3] : (d.points?.[0].y ?? 0);
                ctx.fillText(d.label || d.workpiece_id, plotX + lx * scX + 2, plotH - ly * scY - 2);
            });
        }

        // 7. Calibration Points (Calibrate Tab)
        if (activeTab === 'mapping' && Array.isArray(calibrationPoints)) {
            calibrationPoints.forEach(p => {
                const px = plotX + p.physical_x * scX;
                const py = plotH - p.physical_y * scY;
                ctx.fillStyle = '#00f0ff';
                ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = 'white'; ctx.lineWidth = 1; ctx.stroke();
                ctx.font = 'bold 9px sans-serif'; ctx.fillStyle = 'white';
                ctx.fillText(`ID:${p.id}`, px + 6, py - 6);
            });
        }

    }, [detections, selectedWorkpieceId, mmW, mmH, scX, scY, plotW, plotH, major, minor, activeTab, calibrationPoints, renderTick]);

    return (
        <div className="flex flex-col bg-black/10 text-white p-4">
            {/* Header */}
            <div className="flex flex-col gap-3 mb-6 flex-shrink-0">
                <div>
                    <h2 className="text-3xl font-black text-miami-cyan tracking-tight leading-none mb-1">Lens Calibration</h2>
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest opacity-80">Vision Calibration & Tuning</p>
                </div>

                {/* Calibration Status Banner (always visible) */}
                {healthStatus && (() => {
                    // Mapping is only valid if optics is also done — a homography
                    // computed on distorted pixels is effectively invalid.
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

                <div className="flex bg-black/60 p-1 rounded-xl border border-gray-800 self-start">
                    {(['optics', 'mapping', 'tags'] as LensTab[]).map(tab => (
                        <button key={tab} onClick={() => setActiveTab(tab)}
                            className={`px-4 py-2 rounded-lg text-xs font-black transition-all uppercase tracking-wider ${
                                activeTab === tab 
                                    ? 'bg-miami-cyan text-black shadow-[0_0_12px_rgba(0,240,255,0.3)]' 
                                    : 'text-gray-500 hover:text-gray-300'
                            }`}>
                            {TAB_LABELS[tab]}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex flex-col gap-4">

                {/* ── MAPPING TAB (AprilTag Homography) ── */}
                {activeTab === 'mapping' && (
                    <div className="flex flex-col gap-4">
                        <div className="bg-miami-cyan/10 border border-miami-cyan/20 rounded-2xl p-4">
                            <h3 className="text-sm font-black text-miami-cyan uppercase mb-1">Machine Calibration</h3>
                            <p className="text-xs text-gray-400 leading-relaxed">
                                Place AprilTags on your machine bed and enter their physical coordinates (mm) to map the camera view to your workspace.
                            </p>
                        </div>

                        <div className="bg-black/40 rounded-2xl border border-gray-800 p-2 flex items-center justify-center shadow-inner overflow-hidden">
                            <canvas ref={canvasRef} width={CW} height={CH} className="rounded-lg max-w-full h-auto" />
                        </div>

                        <div className="bg-black/40 border border-gray-800 rounded-2xl p-4 space-y-4">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Points ({calibrationPoints.length})</span>
                                <button onClick={() => setCalibrationPoints([])} className="text-[10px] text-red-400 hover:underline">Clear All</button>
                            </div>
                            
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
                                            <div className="flex flex-col gap-2">
                                                <div className="relative">
                                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] text-gray-600 font-bold">X</span>
                                                    <NumericInput 
                                                        value={p?.physical_x ?? 0} 
                                                        onChange={v => addCalibrationPoint(i, v, p?.physical_y ?? 0, anchor, p?.size_mm ?? tagSize)} 
                                                        className="w-full bg-black border border-gray-700 focus:border-miami-cyan rounded-xl p-2 pl-6 text-xs font-mono transition-colors" 
                                                    />
                                                </div>
                                                <div className="relative">
                                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] text-gray-600 font-bold">Y</span>
                                                    <NumericInput 
                                                        value={p?.physical_y ?? 0} 
                                                        onChange={v => addCalibrationPoint(i, p?.physical_x ?? 0, v, anchor, p?.size_mm ?? tagSize)} 
                                                        className="w-full bg-black border border-gray-700 focus:border-miami-cyan rounded-xl p-2 pl-6 text-xs font-mono transition-colors" 
                                                    />
                                                </div>
                                                <div className="relative">
                                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] text-miami-cyan/70 font-bold">⬛</span>
                                                    <NumericInput 
                                                        value={p?.size_mm ?? tagSize} 
                                                        onChange={v => addCalibrationPoint(i, p?.physical_x ?? 0, p?.physical_y ?? 0, anchor, v)}
                                                        min={5}
                                                        className="w-full bg-black border border-gray-700 focus:border-miami-cyan rounded-xl p-2 pl-6 text-xs font-mono transition-colors" 
                                                    />
                                                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[8px] text-gray-600 font-bold">mm</span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Empty-bed reminder — reference frame is captured automatically */}
                            <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">
                                <span className="text-amber-400 text-base mt-0.5 shrink-0">⚠️</span>
                                <p className="text-[11px] text-amber-300 leading-relaxed">
                                    <span className="font-black">Make sure the bed is empty</span> before submitting.
                                    Calibration will automatically capture an empty-bed reference photo used for
                                    background subtraction during workpiece detection.
                                </p>
                            </div>

                            <button onClick={submitCalibration} disabled={isCalibrating || calibrationPoints.length < 4}
                                className="w-full py-3 bg-miami-cyan text-black font-black rounded-xl shadow-lg shadow-miami-cyan/20 disabled:opacity-30">
                                {isCalibrating ? 'SUBMITTING...' : 'UPDATE CALIBRATION'}
                            </button>
                        </div>
                    </div>
                )}

                {/* ── OPTICS TAB (Lens Distortion Calibration) ── */}
                {activeTab === 'optics' && (
                    <div className="flex flex-col gap-4">
                        {/* Info + Checkerboard Download */}
                        <div className="bg-black/40 border border-gray-800 rounded-2xl p-4 space-y-4">
                            <h3 className="text-sm font-black text-miami-cyan uppercase">Lens Distortion Calibration</h3>
                            <p className="text-xs text-gray-400 leading-relaxed">
                                Print a checkerboard, hold it in front of the camera at various positions and angles. 
                                The system computes your camera's intrinsic parameters to correct barrel distortion.
                            </p>
                            <div className="flex gap-3">
                                <a 
                                    href={lensService.getCheckerboardUrl()}
                                    target="_blank" rel="noopener noreferrer"
                                    className="flex-1 py-2.5 bg-miami-pink/20 text-miami-pink border border-miami-pink/30 font-black rounded-xl text-center text-[11px] uppercase tracking-widest hover:bg-miami-pink/30 transition-all"
                                >
                                    🖨 Download Checkerboard PDF
                                </a>
                            </div>
                        </div>

                        {/* Session Controls */}
                        {!lensSession ? (
                            <div className="flex flex-col gap-2">
                                <button 
                                    onClick={startLensSession} 
                                    disabled={isLensLoading}
                                    className="w-full py-3 bg-miami-cyan text-black font-black rounded-xl shadow-lg shadow-miami-cyan/20 disabled:opacity-30 text-sm uppercase tracking-widest"
                                >
                                    {isLensLoading ? 'STARTING...' : 'START CALIBRATION SESSION'}
                                </button>
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
                                    <button 
                                        onClick={captureLensFrame}
                                        disabled={isLensLoading || lensSession.captures_done >= lensSession.max_captures}
                                        className="flex-1 py-3 bg-miami-cyan text-black font-black rounded-xl shadow-lg shadow-miami-cyan/20 disabled:opacity-30 text-sm uppercase tracking-widest"
                                    >
                                        {isLensLoading ? 'CAPTURING...' : '📸 CAPTURE FRAME'}
                                    </button>
                                    <button 
                                        onClick={finishLensCalibration}
                                        disabled={isLensLoading || !lensSession.can_finish}
                                        className="flex-1 py-3 bg-emerald-500 text-black font-black rounded-xl shadow-lg shadow-emerald-500/20 disabled:opacity-30 text-sm uppercase tracking-widest"
                                    >
                                        {isLensLoading ? 'COMPUTING...' : '✓ FINISH'}
                                    </button>
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
                                    ⚠ Now re-run AprilTag calibration (Calibrate tab) — undistortion changes pixel positions.
                                </p>
                            </div>
                        )}
                    </div>
                )}

                {/* ── TAGS TAB ── */}
                {activeTab === 'tags' && (
                    <div className="flex flex-col gap-4">
                        <div className="bg-black/40 border border-gray-800 rounded-2xl p-4 space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-black text-miami-pink uppercase">AprilTag Generator</h3>
                                <div className="flex bg-black/60 p-1 rounded-lg border border-gray-700">
                                    <button onClick={() => setIsBatch(false)} className={`px-3 py-1.5 rounded text-[10px] font-bold uppercase transition-all ${!isBatch ? 'bg-miami-pink text-black' : 'text-gray-500'}`}>Single</button>
                                    <button onClick={() => setIsBatch(true)} className={`px-3 py-1.5 rounded text-[10px] font-bold uppercase transition-all ${isBatch ? 'bg-miami-pink text-black' : 'text-gray-500'}`}>Full Set</button>
                                </div>
                            </div>

                            <div className="grid grid-cols-4 gap-3">
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

                            <a 
                                href={isBatch 
                                    ? `${lensApiUrl}/api/apriltag/batch?start_id=0&count=4&size_mm=${tagSize}&dpi=${tagDpi}&paper_width_in=${paperFormat === 'letter' ? 8.5 : 8.27}&paper_height_in=${paperFormat === 'letter' ? 11.0 : 11.69}${guideDistanceMm > 0 ? `&guide_distance_mm=${guideDistanceMm}` : ''}`
                                    : `${lensApiUrl}/api/apriltag/generate/${tagId}?size_mm=${tagSize}&dpi=${tagDpi}&paper_width_in=${paperFormat === 'letter' ? 8.5 : 8.27}&paper_height_in=${paperFormat === 'letter' ? 11.0 : 11.69}${guideDistanceMm > 0 ? `&guide_distance_mm=${guideDistanceMm}` : ''}`
                                }
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-full py-3 bg-miami-pink text-black font-black rounded-xl shadow-lg shadow-miami-pink/20 text-center block uppercase tracking-widest text-[11px]"
                            >
                                🖨 DOWNLOAD {isBatch ? 'FULL SET' : 'SINGLE TAG'} PDF
                            </a>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
