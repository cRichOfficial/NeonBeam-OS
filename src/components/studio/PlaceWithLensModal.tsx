import React, { useState, useCallback, useEffect, useRef } from 'react';
import { WorkspaceGrid } from '../workspace/WorkspaceGrid';
import { ToggleSwitch } from '../ui/ToggleSwitch';
import { lensService } from '../../services/lensService';
import type { DetectionResult } from '../../types/lens';
import { useAppSettingsStore } from '../../store/appSettingsStore';

export interface PlaceWithLensModalProps {
    isOpen: boolean;
    onClose: () => void;
    onApply: (posX: number, posY: number, scalePct: number, rotation: number) => void;
    baseW: number;
    baseH: number;
    initialPosX?: number;
    initialPosY?: number;
    initialScalePct?: number;
    fileKind?: 'svg' | 'bitmap' | null;
}

export const PlaceWithLensModal: React.FC<PlaceWithLensModalProps> = ({
    isOpen,
    onClose,
    onApply,
    baseW,
    baseH,
    initialPosX = 0,
    initialPosY = 0,
    initialScalePct = 100,
    fileKind
}) => {
    const { settings } = useAppSettingsStore();
    const mmW = settings.machineWidth;
    const mmH = settings.machineHeight;
    const major = settings.gridMajorSpacing;
    const minor = settings.gridMinorSpacing;

    const [lensDetections, setLensDetections] = useState<DetectionResult[]>([]);
    const [selectedDetId, setSelectedDetId] = useState<string | null>(null);
    const [hoveredDetId, setHoveredDetId] = useState<string | null>(null);
    const [lensAutoSize, setLensAutoSize] = useState(true);
    const [lensMargin, setLensMargin] = useState(5);   // mm
    const [lensRotOffset, setLensRotOffset] = useState(0);   // extra °
    const [lensRotStep, setLensRotStep] = useState(90);  // rotation increment
    const [lensIsDetecting, setLensIsDetecting] = useState(false);
    
    // Controlled pan/zoom state for WorkspaceGrid
    const [zoom, setZoom] = useState(1);
    const [offsetX, setOffsetX] = useState(0);
    const [offsetY, setOffsetY] = useState(0);

    const containerRef = useRef<HTMLDivElement>(null);
    const [gridWidth, setGridWidth] = useState(600);
    const [gridHeight, setGridHeight] = useState(400);

    useEffect(() => {
        if (!containerRef.current || !isOpen) return;
        const observer = new ResizeObserver(entries => {
            const { width, height } = entries[0].contentRect;
            if (width > 0 && height > 0) {
                setGridWidth(width);
                setGridHeight(height);
            }
        });
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, [isOpen]);

    const runLensDetect = useCallback(async () => {
        setLensIsDetecting(true);
        try {
            const results = await lensService.detectObjects();
            setLensDetections(Array.isArray(results) ? results : []);
        } catch (err) {
            console.error('Lens detect failed', err);
            setLensDetections([]);
        } finally {
            setLensIsDetecting(false);
        }
    }, []);

    // Trigger detection on open
    useEffect(() => {
        if (isOpen) {
            setLensDetections([]);
            setLensRotOffset(0);
            setZoom(1);
            setOffsetX(0);
            setOffsetY(0);
            setTimeout(runLensDetect, 80);
        }
    }, [isOpen, runLensDetect]);

    const calcLensPlacement = useCallback((
        d: DetectionResult,
        bW: number,
        bH: number,
        autoSize: boolean,
        marginMm: number,
        rotOffset: number,
    ) => {
        const [bx = 0, by = 0, bw = 10, bh = 10] = d.box ?? [0, 0, 10, 10];
        const cx = d.center_x ?? (bx + bw / 2);
        const cy = d.center_y ?? (by + bh / 2);
        let wpW = bw, wpH = bh;
        let detRot = d.angle_deg ?? 0;
        if (d.corners && d.corners.length >= 2) {
            const c = d.corners;
            if (d.corners.length >= 4) {
                const edge0 = Math.hypot(c[1].x - c[0].x, c[1].y - c[0].y);
                const edge1 = Math.hypot(c[2].x - c[1].x, c[2].y - c[1].y);
                wpW = Math.max(edge0, edge1);
                wpH = Math.min(edge0, edge1);
            }
        }

        let newScale = initialScalePct;
        let newW = bW * (newScale / 100);
        let newH = bH * (newScale / 100);

        if (autoSize && bW > 0 && bH > 0) {
            const targetW = Math.max(1, wpW - 2 * marginMm);
            const targetH = Math.max(1, wpH - 2 * marginMm);
            newScale = Math.min((targetW / bW) * 100, (targetH / bH) * 100);
            newW = bW * (newScale / 100);
            newH = bH * (newScale / 100);
        }

        let newPosX = cx - newW / 2;
        let newPosY = cy - newH / 2;

        return {
            posX: newPosX,
            posY: newPosY,
            scalePct: newScale,
            rotation: detRot + rotOffset
        };
    }, [initialScalePct]);

    const findHit = useCallback((mmX: number, mmY: number): string | null => {
        // Point-in-polygon helper
        const ptInPoly = (px: number, py: number, poly: { x: number; y: number }[]) => {
            let inside = false;
            for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
                const xi = poly[i].x, yi = poly[i].y;
                const xj = poly[j].x, yj = poly[j].y;
                const intersect = ((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
                if (intersect) inside = !inside;
            }
            return inside;
        };

        for (const d of lensDetections) {
            if (d.points && d.points.length >= 3) {
                if (ptInPoly(mmX, mmY, d.points)) return d.workpiece_id;
            } else if (d.box) {
                const [bx, by, bw, bh] = d.box;
                if (mmX >= bx && mmX <= bx + bw && mmY >= by && mmY <= by + bh) return d.workpiece_id;
            }
        }

        // Second pass: generous center distance for small items
        const THRESH = 15; 
        let best: string | null = null;
        let bestDist = THRESH;

        for (const d of lensDetections) {
            const dcx = d.center_x ?? (d.box ? d.box[0] + d.box[2] / 2 : 0);
            const dcy = d.center_y ?? (d.box ? d.box[1] + d.box[3] / 2 : 0);
            const dist = Math.hypot(mmX - dcx, mmY - dcy);
            if (dist < bestDist) { bestDist = dist; best = d.workpiece_id; }
        }
        return best;
    }, [lensDetections]);

    const handleCanvasClick = useCallback((mmX: number, mmY: number) => {
        const best = findHit(mmX, mmY);

        if (!best || best === selectedDetId) {
            setSelectedDetId(null);
            setZoom(1);
            setOffsetX(0);
            setOffsetY(0);
        } else {
            setSelectedDetId(best);
            const d = lensDetections.find(det => det.workpiece_id === best)!;
            let objCx: number, objCy: number, objW: number, objH: number;
            if (d.points && d.points.length > 0) {
                objCx = d.points.reduce((a, p) => a + p.x, 0) / d.points.length;
                objCy = d.points.reduce((a, p) => a + p.y, 0) / d.points.length;
                const xs = d.points.map(p => p.x), ys = d.points.map(p => p.y);
                objW = Math.max(...xs) - Math.min(...xs);
                objH = Math.max(...ys) - Math.min(...ys);
            } else {
                const [bx, by, bw, bh] = d.box ?? [0, 0, 10, 10];
                objCx = bx + bw / 2;
                objCy = by + bh / 2;
                objW = bw; objH = bh;
            }

            const lBaseSc = Math.min((gridWidth - 32) / mmW, (gridHeight - 20) / mmH);
            const objCxPx = objCx * lBaseSc;
            const objCyPx = objCy * lBaseSc;
            const objWPx = objW * lBaseSc;
            const objHPx = objH * lBaseSc;

            const targetZoom = Math.min((gridWidth - 32) / objWPx, (gridHeight - 20) / objHPx) * 0.6;
            const newZoom = Math.max(1, Math.min(targetZoom, 10));

            setZoom(newZoom);
            // Center the object in the drawable area
            // Target sx = gridWidth/2, sy = gridHeight/2
            // offsetX = (gridWidth/2) - ML - (mmX * baseScale * zoom)
            // offsetY = (gridHeight/2) - DH + (mmY * baseScale * zoom)
            const ML = 32;
            const DH = gridHeight - 20;
            setOffsetX((gridWidth / 2) - ML - (objCx * lBaseSc * newZoom));
            setOffsetY((gridHeight / 2) - DH + (objCy * lBaseSc * newZoom));
        }
        return best;
    }, [findHit, lensDetections, selectedDetId, gridWidth, gridHeight, mmW, mmH]);

    const handleApply = () => {
        if (!selectedDetId) return;
        const sel = lensDetections.find(d => d.workpiece_id === selectedDetId);
        if (!sel) return;
        const placement = calcLensPlacement(sel, baseW, baseH, lensAutoSize, lensMargin, lensRotOffset);
        onApply(placement.posX, placement.posY, placement.scalePct, placement.rotation);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] flex flex-col bg-[#070712] overflow-hidden">
            {/* Header */}
            <div className="flex-shrink-0 h-14 flex items-center gap-3 px-4 bg-black/80 border-b border-gray-800 backdrop-blur-xl">
                <button
                    onClick={onClose}
                    className="flex items-center justify-center w-10 h-10 rounded-xl bg-white/5 border border-gray-700 text-gray-300 active:scale-95 transition-all"
                >
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M11 4L6 9L11 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-miami-cyan">Place with Lens</p>
                    <p className="text-[10px] text-gray-500 font-mono">
                        {lensDetections.length > 0
                            ? `${lensDetections.length} object${lensDetections.length !== 1 ? 's' : ''} detected — tap to select`
                            : 'Tap ↻ to detect objects'}
                    </p>
                </div>
                <button
                    onClick={runLensDetect}
                    disabled={lensIsDetecting}
                    className="flex items-center justify-center w-10 h-10 rounded-xl bg-miami-cyan/10 border border-miami-cyan/30 text-miami-cyan disabled:opacity-40 active:scale-95 transition-all"
                >
                    {lensIsDetecting
                        ? <div className="w-4 h-4 rounded-full border-2 border-miami-cyan border-t-transparent animate-spin"/>
                        : <span className="text-lg leading-none">↻</span>}
                </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto overscroll-contain flex flex-col">
                <div className="flex-1 min-h-[300px] p-2" ref={containerRef}>
                    <WorkspaceGrid
                        width={Math.max(10, gridWidth - 20)}
                        height={Math.max(10, gridHeight - 16)}
                        machineWidthMm={mmW}
                        machineHeightMm={mmH}
                        majorSpacingMm={major}
                        minorSpacingMm={minor}
                        enablePanZoom={true}
                        zoom={zoom}
                        offsetX={offsetX}
                        offsetY={offsetY}
                        onTransformChange={(z, x, y) => {
                            setZoom(z); setOffsetX(x); setOffsetY(y);
                        }}
                        onClickMm={handleCanvasClick}
                        onMouseMoveMm={(mmX, mmY) => {
                            const hit = findHit(mmX, mmY);
                            if (hit !== hoveredDetId) setHoveredDetId(hit);
                        }}
                        renderOverlay={(ctx, t) => {
                            // Detections
                            lensDetections.forEach(d => {
                                const isSel = d.workpiece_id === selectedDetId;
                                const isHover = d.workpiece_id === hoveredDetId;
                                
                                ctx.strokeStyle = isSel ? '#00f0ff' : 'rgba(0,240,255,0.4)';
                                ctx.lineWidth = isSel ? 2 / t.zoom : 1 / t.zoom;

                                // Fill: Brighter neon-cyan to stand out against the dark grid
                                if (isSel) {
                                    ctx.fillStyle = 'rgba(0,240,255,0.35)';
                                } else if (isHover) {
                                    ctx.fillStyle = 'rgba(0,240,255,0.25)';
                                } else {
                                    ctx.fillStyle = 'rgba(0,240,255,0.12)';
                                }

                                if (d.points && d.points.length > 0) {
                                    ctx.beginPath();
                                    ctx.moveTo(d.points[0].x * t.baseScale, -d.points[0].y * t.baseScale);
                                    d.points.slice(1).forEach(p => ctx.lineTo(p.x * t.baseScale, -p.y * t.baseScale));
                                    ctx.closePath(); 
                                    ctx.fill();
                                    ctx.stroke();
                                } else if (d.box) {
                                    const [bx, by, bw, bh] = d.box;
                                    ctx.fillRect(bx * t.baseScale, -(by + bh) * t.baseScale, bw * t.baseScale, bh * t.baseScale);
                                    ctx.strokeRect(bx * t.baseScale, -(by + bh) * t.baseScale, bw * t.baseScale, bh * t.baseScale);
                                }

                                // ID Label
                                const cx = d.center_x ?? (d.box ? d.box[0] + d.box[2] / 2 : 0);
                                const cy = d.center_y ?? (d.box ? d.box[1] + d.box[3] / 2 : 0);
                                const ocx = cx * t.baseScale;
                                const ocy = -cy * t.baseScale;
                                
                                ctx.font = `bold ${10 / t.zoom}px Inter, sans-serif`;
                                ctx.textAlign = 'center';
                                ctx.textBaseline = 'middle';
                                ctx.fillStyle = isSel ? '#00f0ff' : 'rgba(0,240,255,0.6)';
                                // Subtle shadow for legibility
                                ctx.shadowColor = 'black';
                                ctx.shadowBlur = 4 / t.zoom;
                                ctx.fillText(d.workpiece_id.toString().substring(0, 8), ocx, ocy);
                                ctx.shadowBlur = 0;

                                if (isSel) {
                                    const cx = d.center_x ?? (d.box ? d.box[0] + d.box[2] / 2 : 0);
                                    const cy = d.center_y ?? (d.box ? d.box[1] + d.box[3] / 2 : 0);
                                    const ocx = cx * t.baseScale;
                                    const ocy = -cy * t.baseScale;
                                    const cl = 6 / t.zoom;
                                    ctx.beginPath(); ctx.strokeStyle = 'rgba(0,240,255,0.5)';
                                    ctx.moveTo(ocx - cl, ocy); ctx.lineTo(ocx + cl, ocy);
                                    ctx.moveTo(ocx, ocy - cl); ctx.lineTo(ocx, ocy + cl);
                                    ctx.stroke();
                                }
                            });

                            // Ghost
                            const sel = lensDetections.find(d => d.workpiece_id === selectedDetId);
                            if (sel && fileKind) {
                                const placement = calcLensPlacement(sel, baseW, baseH, lensAutoSize, lensMargin, lensRotOffset);
                                const gW = baseW * (placement.scalePct / 100);
                                const gH = baseH * (placement.scalePct / 100);
                                const gWpx = gW * t.baseScale;
                                const gHpx = gH * t.baseScale;
                                const gcx_px = (placement.posX + gW / 2) * t.baseScale;
                                const gcy_px = -(placement.posY + gH / 2) * t.baseScale;

                                ctx.save();
                                ctx.translate(gcx_px, gcy_px);
                                if (placement.rotation) {
                                    ctx.rotate(placement.rotation * Math.PI / 180);
                                }
                                ctx.fillStyle = fileKind === 'bitmap' ? 'rgba(255,255,255,0.1)' : 'rgba(255,0,127,0.1)';
                                ctx.strokeStyle = fileKind === 'bitmap' ? 'rgba(255,255,255,0.5)' : '#ff007f';
                                ctx.lineWidth = 1 / t.zoom;
                                ctx.fillRect(-gWpx / 2, -gHpx / 2, gWpx, gHpx);
                                ctx.strokeRect(-gWpx / 2, -gHpx / 2, gWpx, gHpx);
                                
                                // Orientation indicator
                                ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(gWpx / 2, 0); ctx.strokeStyle = '#00f0ff'; ctx.stroke();
                                ctx.restore();
                            }
                        }}
                    />
                </div>

                {/* Selected indicator */}
                <div className="px-4 py-2 flex items-center gap-2 min-h-[40px]">
                    {selectedDetId ? (
                        <>
                            <div className="w-2 h-2 rounded-full bg-miami-cyan animate-pulse flex-shrink-0"/>
                            <span className="text-[11px] text-miami-cyan font-bold truncate">
                                {lensDetections.find(d => d.workpiece_id === selectedDetId)?.label || selectedDetId}
                            </span>
                            <span className="ml-auto text-[10px] text-gray-500 font-mono flex-shrink-0">Selected</span>
                        </>
                    ) : (
                        <span className="text-[11px] text-gray-600 font-bold">No object selected — tap one above</span>
                    )}
                </div>

                {/* Options */}
                <div className="px-4 pb-4 space-y-4">
                    <ToggleSwitch 
                        label="Auto-Size to Object"
                        checked={lensAutoSize}
                        onChange={setLensAutoSize}
                        className="w-full"
                    />

                    {lensAutoSize && (
                        <div className="flex flex-col gap-1.5">
                            <div className="flex justify-between items-center">
                                <span className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Margin (mm)</span>
                                <span className="text-xs font-mono text-white">{lensMargin} mm</span>
                            </div>
                            <input type="range" min="0" max="20" step="1" value={lensMargin} onChange={e => setLensMargin(Number(e.target.value))} className="w-full accent-miami-cyan" />
                        </div>
                    )}

                    <div className="flex flex-col gap-1.5">
                        <div className="flex justify-between items-center">
                            <span className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Extra Rotation</span>
                            <span className="text-xs font-mono text-white">{lensRotOffset}°</span>
                        </div>
                        <div className="flex gap-2">
                            <select value={lensRotStep} onChange={e => setLensRotStep(Number(e.target.value))} className="bg-black border border-gray-800 text-gray-300 text-xs rounded-xl px-2 py-3 outline-none focus:border-miami-cyan w-20">
                                <option value="90">90°</option><option value="45">45°</option><option value="15">15°</option><option value="5">5°</option><option value="1">1°</option>
                            </select>
                            <button onClick={() => setLensRotOffset((r) => r - lensRotStep)} className="flex-1 py-3 bg-gray-900 border border-gray-800 hover:border-gray-600 rounded-xl text-white font-black active:scale-95 transition-all">-</button>
                            <button onClick={() => setLensRotOffset((r) => r + lensRotStep)} className="flex-1 py-3 bg-gray-900 border border-gray-800 hover:border-gray-600 rounded-xl text-white font-black active:scale-95 transition-all">+</button>
                            <button onClick={() => setLensRotOffset(0)} className="flex-1 py-3 bg-gray-900 border border-gray-800 hover:border-red-900/50 hover:text-red-400 rounded-xl text-gray-500 font-bold active:scale-95 transition-all text-xs">Reset</button>
                        </div>
                    </div>
                </div>

                <div className="p-4 pt-0">
                    <button onClick={handleApply} disabled={!selectedDetId} className="w-full py-4 rounded-xl font-black uppercase tracking-widest text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-miami-cyan text-black shadow-[0_0_20px_rgba(0,240,255,0.3)] hover:shadow-[0_0_30px_rgba(0,240,255,0.5)] active:scale-95">
                        Apply Placement
                    </button>
                </div>
            </div>
        </div>
    );
};
