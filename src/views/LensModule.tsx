import React, { useState, useEffect, useCallback } from 'react';
import { lensService } from '../services/lensService';
import { useAppSettingsStore } from '../store/appSettingsStore';
import { useJobOperationsStore } from '../store/jobOperationsStore';
import { NumericInput } from '../components/NumericInput';
import type { CalibrationPoint, LensHealthResponse } from '../types/lens';
import { WorkspaceGrid } from '../components/workspace/WorkspaceGrid';
import { View } from '../components/layout/View';
import { InstructionCard } from '../components/ui/InstructionCard';
import { SectionCard } from '../components/layout/SectionCard';
import { ActionButton } from '../components/ui/ActionButton';
import { TextInput } from '../components/ui/TextInput';

// Canvas dimensions
const CH = 300;

export const LensModule: React.FC = () => {
    // ── Store Selectors ──
    const mmW = useAppSettingsStore(s => s.settings.machineWidth);
    const mmH = useAppSettingsStore(s => s.settings.machineHeight);
    const lensApiUrl = useAppSettingsStore(s => s.settings.lensApiUrl);
    const major = useAppSettingsStore(s => s.settings.majorSpacing) || 50;
    const minor = useAppSettingsStore(s => s.settings.minorSpacing) || 10;
    
    // Removed unused jobOperations destructuring

    // ── Calibration State ──
    const [calibrationPoints, setCalibrationPoints] = useState<CalibrationPoint[]>([]);
    const [isCalibrating, setIsCalibrating] = useState(false);
    const [tagSize] = useState(50); // Default tag size for UI drawing

    // ── Health State ──
    const [healthStatus, setHealthStatus] = useState<LensHealthResponse | null>(null);

    // ── Camera Settings State ──
    const [cameraIso, setCameraIso] = useState(0);
    const [cameraExposureTime, setCameraExposureTime] = useState(0);
    const [cameraMountingHeightMm, setCameraMountingHeightMm] = useState(0);
    const [isSavingSettings, setIsSavingSettings] = useState(false);



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
        } catch (err: any) {
            console.error('Calibration failed', err);
            const msg = err?.response?.data?.detail 
                ? JSON.stringify(err.response.data.detail) 
                : err?.message || 'Unknown error';
            alert(`Calibration failed: ${msg}`);
        } finally {
            setIsCalibrating(false);
        }
    };

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

    const fetchCameraSettings = useCallback(async () => {
        try {
            const settings = await lensService.getCameraSettings();
            if (settings) {
                setCameraIso(settings.iso || 0);
                setCameraExposureTime(settings.exposure_time || 0);
                setCameraMountingHeightMm(settings.camera_mounting_height_mm || 0);
            }
        } catch (err) {
            console.error('Failed to fetch camera settings', err);
        }
    }, []);

    useEffect(() => {
        fetchHealthStatus();
        fetchCalibrationTags();
        fetchCameraSettings();
    }, [lensApiUrl, fetchCalibrationTags, fetchCameraSettings]);

    const saveCameraSettings = async () => {
        setIsSavingSettings(true);
        try {
            await lensService.updateCameraSettings({
                iso: cameraIso,
                exposure_time: cameraExposureTime,
                camera_mounting_height_mm: cameraMountingHeightMm
            });
            alert('Settings saved successfully!');
        } catch (err) {
            console.error('Failed to save settings', err);
            alert('Failed to save settings.');
        } finally {
            setIsSavingSettings(false);
        }
    };



    const addCalibrationPoint = (id: string, x: number, y: number, sizeMm?: number) => {
        setCalibrationPoints(prev => {
            const existing = prev.find(p => p.id === id);
            if (existing) {
                return prev.map(p => p.id === id 
                    ? { ...p, position_x_mm: x, position_y_mm: y, size_mm: sizeMm ?? p.size_mm ?? tagSize } 
                    : p
                );
            }
            return [...prev, { id, position_x_mm: x, position_y_mm: y, size_mm: sizeMm ?? tagSize }];
        });
    };



    return (
        <View title="Lens Calibration" subtitle="Vision Calibration & Tuning" showHomeButton>
            <div className="flex flex-col gap-4 p-4">
                
                {/* Calibration Status Banner (always visible) */}
                {healthStatus && (() => {
                    const cameraOk = healthStatus.camera_detected;
                    const mockMode = healthStatus.mock_mode;
                    const allGood = cameraOk && !mockMode;
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
                                        cameraOk ? 'text-emerald-400' : 'text-amber-400'
                                    }`}>
                                        Camera {cameraOk ? 'Detected' : 'Missing'}
                                    </span>
                                </div>
                                <div className="w-px h-3 bg-gray-700" />
                                <div className="flex items-center gap-1.5">
                                    <span className={`text-[10px] font-black uppercase ${
                                        !mockMode ? 'text-emerald-400' : 'text-amber-400'
                                    }`}>
                                        {mockMode ? 'Mock Mode' : 'Live Mode'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    );
                })()}

                <div className="flex flex-col gap-4">

                    {/* ── CAMERA SETTINGS SECTION ── */}
                    <SectionCard title="Camera Settings">
                        <div className="grid grid-cols-3 gap-3 mb-4">
                            <div>
                                <label className="block text-[10px] text-gray-400 mb-1 uppercase font-bold">ISO</label>
                                <NumericInput 
                                    value={cameraIso} 
                                    onChange={setCameraIso} 
                                    min={0}
                                    className="w-full bg-black border border-gray-800 rounded-lg p-2.5 text-xs font-mono focus:border-miami-cyan outline-none text-white transition-colors"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] text-gray-400 mb-1 uppercase font-bold">Exposure (ms)</label>
                                <NumericInput 
                                    value={cameraExposureTime} 
                                    onChange={setCameraExposureTime} 
                                    min={0}
                                    className="w-full bg-black border border-gray-800 rounded-lg p-2.5 text-xs font-mono focus:border-miami-cyan outline-none text-white transition-colors"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] text-gray-400 mb-1 uppercase font-bold">Mount Height (mm)</label>
                                <NumericInput 
                                    value={cameraMountingHeightMm} 
                                    onChange={setCameraMountingHeightMm} 
                                    min={0}
                                    className="w-full bg-black border border-gray-800 rounded-lg p-2.5 text-xs font-mono focus:border-miami-cyan outline-none text-white transition-colors"
                                />
                            </div>
                        </div>

                        <ActionButton 
                            onClick={saveCameraSettings} 
                            disabled={isSavingSettings}
                            variant="normal"
                            className="w-full py-3"
                        >
                            {isSavingSettings ? 'SAVING...' : 'SAVE SETTINGS'}
                        </ActionButton>
                    </SectionCard>

                    {/* ── MAPPING TAB (AprilTag Homography) ── */}
                    <SectionCard title="AprilTag Placement">
                        <div className="flex flex-col gap-4">
                            <InstructionCard title="Machine Calibration">
                                Place AprilTags on your machine bed and enter their center coordinates (mm) to map the camera view to your workspace.
                            </InstructionCard>

                            <WorkspaceGrid
                                width={600}
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
                                            let min_x = p.position_x_mm - size / 2;
                                            let min_y = p.position_y_mm - size / 2;

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

                                            // Draw the center point
                                            const centerPx = p.position_x_mm * t.baseScale;
                                            const centerPy = -p.position_y_mm * t.baseScale;
                                            ctx.fillStyle = '#00f0ff';
                                            ctx.beginPath(); ctx.arc(centerPx, centerPy, 4 / t.zoom, 0, Math.PI * 2); ctx.fill();
                                            ctx.strokeStyle = 'white'; ctx.lineWidth = 1 / t.zoom; ctx.stroke();
                                            
                                            ctx.save();
                                            ctx.font = `${9 / t.zoom}px sans-serif`; ctx.fillStyle = 'white';
                                            ctx.fillText(`ID:${p.id}`, centerPx + (6 / t.zoom), centerPy - (6 / t.zoom));
                                            ctx.restore();
                                        });
                                    }
                                }}
                            />

                            <div className="grid grid-cols-2 gap-3 pb-4">
                                {['0', '1', '2', '3'].map(i => {
                                    const p = calibrationPoints.find(cp => cp.id === i);
                                    
                                    return (
                                        <div key={i} className="flex flex-col gap-3 bg-black/60 p-3 rounded-2xl border border-gray-800 relative overflow-hidden">
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="text-[10px] font-black text-gray-500 uppercase">Tag ID</span>
                                                <span className="text-sm font-black text-miami-cyan">{i}</span>
                                            </div>

                                            {/* Coordinate + Size Inputs */}
                                            <div className="flex flex-col gap-3 mt-2">
                                                <TextInput 
                                                    label="Center X (mm)"
                                                    inputMode="decimal"
                                                    value={p?.position_x_mm ?? 0} 
                                                    onChange={e => addCalibrationPoint(i, parseFloat(e.target.value) || 0, p?.position_y_mm ?? 0, p?.size_mm ?? tagSize)} 
                                                />
                                                <TextInput 
                                                    label="Center Y (mm)"
                                                    inputMode="decimal"
                                                    value={p?.position_y_mm ?? 0} 
                                                    onChange={e => addCalibrationPoint(i, p?.position_x_mm ?? 0, parseFloat(e.target.value) || 0, p?.size_mm ?? tagSize)} 
                                                />
                                                <TextInput 
                                                    label="Size (mm)"
                                                    inputMode="decimal"
                                                    value={p?.size_mm ?? tagSize} 
                                                    onChange={e => addCalibrationPoint(i, p?.position_x_mm ?? 0, p?.position_y_mm ?? 0, parseFloat(e.target.value) || 0)}
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
                                variant="normal"
                                className="w-full py-4"
                            >
                                {isCalibrating ? 'SUBMITTING...' : 'UPDATE CALIBRATION'}
                            </ActionButton>
                        </div>
                    </SectionCard>
                </div>
            </div>
        </View>
    );
};

