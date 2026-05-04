import React, { useState, useCallback, useRef } from 'react';
import { View } from '../components/layout/View';
import { WorkspaceGrid } from '../components/workspace/WorkspaceGrid';
import type { WorkspaceTransform } from '../components/workspace/WorkspaceGrid';
import { ItemContainer } from '../components/ui/ItemContainer';
import { ItemBadge } from '../components/ui/ItemBadge';

// ── Constants ──────────────────────────────────────────────────────────────────
const GRID_W = 310;
const GRID_H = 270;
const MACHINE_W = 400;
const MACHINE_H = 400;
const MAJOR = 50;
const MINOR = 10;

// Must mirror WorkspaceGrid internals
const ML = 32;
const MB = 20;
const DW = GRID_W - ML;
const DH = GRID_H - MB;
const BASE_SCALE = Math.min(DW / MACHINE_W, DH / MACHINE_H);

// ── Workpiece type ─────────────────────────────────────────────────────────────
interface Workpiece {
    id: string;
    label: string;
    x: number; y: number; // mm origin
    w: number; h: number; // mm size
}

const TEST_PIECES: Workpiece[] = [
    { id: 'wp-a', label: 'Piece A', x: 50,  y: 50,  w: 80, h: 60 },
    { id: 'wp-b', label: 'Piece B', x: 200, y: 120, w: 60, h: 80 },
    { id: 'wp-c', label: 'Piece C', x: 120, y: 250, w: 50, h: 50 },
];

// ── Transform math ─────────────────────────────────────────────────────────────
function calcDefaultTransform() {
    const plotW = BASE_SCALE * MACHINE_W;
    const plotH = BASE_SCALE * MACHINE_H;
    return {
        zoom: 1,
        offsetX: (DW - plotW) / 2,
        // offsetY = (plotH - DH)/2 places the bed center at the drawable-area center.
        // Canvas origin y = DH + offsetY; bed top at DH + offsetY - plotH.
        offsetY: (plotH - DH) / 2,
    };
}

// Returns zoom/offset that frames the workpiece with padding
function calcFitTransform(piece: Workpiece, padding = 0.55) {
    const zoom = Math.min(
        (DW * padding) / (piece.w * BASE_SCALE),
        (DH * padding) / (piece.h * BASE_SCALE)
    );
    const cx = piece.x + piece.w / 2;
    const cy = piece.y + piece.h / 2;
    // We want the workpiece center to land at the drawable-area center.
    // In context coords (after ctx.translate(ML,DH)), the draw center is (DW/2, -DH/2).
    // Point y in context = offsetY - cy*BASE_SCALE*zoom = -DH/2
    // => offsetY = cy*BASE_SCALE*zoom - DH/2
    return {
        zoom,
        offsetX: DW / 2 - cx * BASE_SCALE * zoom,
        offsetY: cy * BASE_SCALE * zoom - DH / 2,
    };
}

// ── Overlay renderer ───────────────────────────────────────────────────────────
function drawWorkpieces(
    ctx: CanvasRenderingContext2D,
    t: WorkspaceTransform,
    pieces: Workpiece[],
    selectedId: string | null
) {
    for (const piece of pieces) {
        const px = piece.x * t.baseScale;
        const py = -piece.y * t.baseScale;
        const pw = piece.w * t.baseScale;
        const ph = piece.h * t.baseScale;
        const sel = piece.id === selectedId;

        ctx.fillStyle   = sel ? 'rgba(255,0,127,0.25)' : 'rgba(0,240,255,0.12)';
        ctx.strokeStyle = sel ? '#ff007f' : '#00f0ff';
        ctx.lineWidth   = (sel ? 2.5 : 1.5) / t.zoom;
        ctx.setLineDash([]);
        ctx.fillRect(px, py - ph, pw, ph);
        ctx.strokeRect(px, py - ph, pw, ph);

        if (sel) {
            ctx.shadowColor = '#ff007f';
            ctx.shadowBlur  = 12 / t.zoom;
            ctx.strokeRect(px, py - ph, pw, ph);
            ctx.shadowBlur  = 0;
        }

        ctx.save();
        ctx.font          = `bold ${11 / t.zoom}px ui-monospace,monospace`;
        ctx.fillStyle     = sel ? '#ff007f' : '#00f0ff';
        ctx.textBaseline  = 'bottom';
        ctx.textAlign     = 'left';
        ctx.fillText(`${piece.label} (${piece.x},${piece.y})`, px + 3 / t.zoom, py - ph - 3 / t.zoom);
        ctx.restore();
    }
}

function hitTest(mmX: number, mmY: number): Workpiece | null {
    for (let i = TEST_PIECES.length - 1; i >= 0; i--) {
        const p = TEST_PIECES[i];
        if (mmX >= p.x && mmX <= p.x + p.w && mmY >= p.y && mmY <= p.y + p.h) return p;
    }
    return null;
}

// ── Animation helper ───────────────────────────────────────────────────────────
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

// ── Tabs ───────────────────────────────────────────────────────────────────────
const TABS = [
    { id: 'pan-zoom-on',  label: 'Pan/Zoom ON'    },
    { id: 'pan-zoom-off', label: 'Pan/Zoom OFF'   },
    { id: 'selection',    label: 'Selection'       },
    { id: 'click',        label: 'Click Handler'   },
    { id: 'zoom-to-obj',  label: 'Zoom to Object' },
    { id: 'multi-select', label: 'Multi-Select'   },
];

// ── Component ──────────────────────────────────────────────────────────────────
export const DemoModule: React.FC = () => {
    const [activeTab,  setActiveTab]  = useState('pan-zoom-on');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [clickLog,   setClickLog]   = useState<{ x: number; y: number; label: string | null }[]>([]);
    
    // Multi-select demo state
    const [selectedBadges, setSelectedBadges] = useState<string[]>(['badge-2']);

    // Controlled transform for Zoom-to-Object tab
    const def = calcDefaultTransform();
    const [ctrlZoom,    setCtrlZoom]    = useState(def.zoom);
    const [ctrlOffsetX, setCtrlOffsetX] = useState(def.offsetX);
    const [ctrlOffsetY, setCtrlOffsetY] = useState(def.offsetY);
    const animRef = useRef<number | null>(null);

    const handleTabChange = (id: string) => {
        setActiveTab(id);
        setSelectedId(null);
        setClickLog([]);
        if (id === 'zoom-to-obj') {
            const d = calcDefaultTransform();
            setCtrlZoom(d.zoom); setCtrlOffsetX(d.offsetX); setCtrlOffsetY(d.offsetY);
        }
    };

    // Smooth camera animation
    const animateTo = useCallback((
        fromZ: number, fromX: number, fromY: number,
        toZ:   number, toX:   number, toY:   number
    ) => {
        if (animRef.current) cancelAnimationFrame(animRef.current);
        const start    = performance.now();
        const duration = 420;
        const step = (now: number) => {
            const raw  = Math.min((now - start) / duration, 1);
            const ease = 1 - Math.pow(1 - raw, 3); // cubic ease-out
            setCtrlZoom   (lerp(fromZ, toZ, ease));
            setCtrlOffsetX(lerp(fromX, toX, ease));
            setCtrlOffsetY(lerp(fromY, toY, ease));
            if (raw < 1) animRef.current = requestAnimationFrame(step);
        };
        animRef.current = requestAnimationFrame(step);
    }, []);

    const flyTo = useCallback((piece: Workpiece) => {
        setSelectedId(piece.id);
        const target = calcFitTransform(piece);
        setCtrlZoom(prev => {
            setCtrlOffsetX(prevX => {
                setCtrlOffsetY(prevY => {
                    animateTo(prev, prevX, prevY, target.zoom, target.offsetX, target.offsetY);
                    return prevY;
                });
                return prevX;
            });
            return prev;
        });
    }, [animateTo]);

    // Simpler fly wrapper that captures current values via a ref
    const currentTransform = useRef({ zoom: def.zoom, offsetX: def.offsetX, offsetY: def.offsetY });
    currentTransform.current = { zoom: ctrlZoom, offsetX: ctrlOffsetX, offsetY: ctrlOffsetY };

    const flyToPiece = useCallback((piece: Workpiece) => {
        setSelectedId(piece.id);
        const { zoom: fZ, offsetX: fX, offsetY: fY } = currentTransform.current;
        const target = calcFitTransform(piece);
        animateTo(fZ, fX, fY, target.zoom, target.offsetX, target.offsetY);
    }, [animateTo]);

    const handleZoomToClick = useCallback((mmX: number, mmY: number) => {
        const hit = hitTest(mmX, mmY);
        if (!hit) return;
        flyToPiece(hit);
    }, [flyToPiece]);

    const handleZoomTransformChange = useCallback((z: number, ox: number, oy: number) => {
        setCtrlZoom(z); setCtrlOffsetX(ox); setCtrlOffsetY(oy);
    }, []);

    const resetZoomView = useCallback(() => {
        setSelectedId(null);
        const d = calcDefaultTransform();
        const { zoom: fZ, offsetX: fX, offsetY: fY } = currentTransform.current;
        animateTo(fZ, fX, fY, d.zoom, d.offsetX, d.offsetY);
    }, [animateTo]);

    const handleClickMm = useCallback((mmX: number, mmY: number) => {
        const hit = hitTest(mmX, mmY);
        setClickLog(prev => [
            { x: Math.round(mmX), y: Math.round(mmY), label: hit?.label ?? null },
            ...prev
        ].slice(0, 8));
        setSelectedId(hit?.id ?? null);
    }, []);

    return (
        <View title="UI Component Demo" subtitle="WorkspaceGrid Sandbox" showHomeButton>
            <div className="p-4 space-y-4 overflow-auto">

                {/* ── Tab Bar ── */}
                <div className="flex gap-2 flex-wrap">
                    {TABS.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => handleTabChange(tab.id)}
                            className={`px-3 py-1.5 text-xs font-black uppercase tracking-widest rounded-lg border transition-all ${
                                activeTab === tab.id
                                    ? 'border-miami-cyan text-miami-cyan bg-miami-cyan/10 shadow-[0_0_10px_rgba(0,240,255,0.2)]'
                                    : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* ── Pan/Zoom ON ── */}
                {activeTab === 'pan-zoom-on' && (
                    <div className="space-y-2">
                        <p className="text-xs text-gray-400">Scroll to zoom · Click &amp; drag to pan · Touch pinch supported</p>
                        <WorkspaceGrid width={GRID_W} height={GRID_H}
                            machineWidthMm={MACHINE_W} machineHeightMm={MACHINE_H}
                            majorSpacingMm={MAJOR} minorSpacingMm={MINOR} enablePanZoom
                            renderOverlay={(ctx, t) => drawWorkpieces(ctx, t, TEST_PIECES, null)} />
                    </div>
                )}

                {/* ── Pan/Zoom OFF ── */}
                {activeTab === 'pan-zoom-off' && (
                    <div className="space-y-2">
                        <p className="text-xs text-gray-400">Pan and zoom are disabled. View is locked to the default position.</p>
                        <WorkspaceGrid width={GRID_W} height={GRID_H}
                            machineWidthMm={MACHINE_W} machineHeightMm={MACHINE_H}
                            majorSpacingMm={MAJOR} minorSpacingMm={MINOR} enablePanZoom={false}
                            renderOverlay={(ctx, t) => drawWorkpieces(ctx, t, TEST_PIECES, null)} />
                    </div>
                )}

                {/* ── Selection ── */}
                {activeTab === 'selection' && (
                    <div className="space-y-2">
                        <p className="text-xs text-gray-400">Click a workpiece to select it. Selected piece highlights in miami-pink.</p>
                        <WorkspaceGrid width={GRID_W} height={GRID_H}
                            machineWidthMm={MACHINE_W} machineHeightMm={MACHINE_H}
                            majorSpacingMm={MAJOR} minorSpacingMm={MINOR} enablePanZoom
                            onClickMm={(mmX, mmY) => setSelectedId(hitTest(mmX, mmY)?.id ?? null)}
                            renderOverlay={(ctx, t) => drawWorkpieces(ctx, t, TEST_PIECES, selectedId)} />
                        <div className={`px-3 py-2 rounded-lg border text-xs font-mono transition-all ${
                            selectedId
                                ? 'border-miami-pink/50 bg-miami-pink/10 text-miami-pink'
                                : 'border-gray-800 bg-black/30 text-gray-500'
                        }`}>
                            {selectedId
                                ? `✓ Selected: ${TEST_PIECES.find(p => p.id === selectedId)?.label}`
                                : 'No selection — click a workpiece'}
                        </div>
                    </div>
                )}

                {/* ── Click Handler ── */}
                {activeTab === 'click' && (
                    <div className="space-y-2">
                        <p className="text-xs text-gray-400">Click anywhere to see the physical mm coordinate. Hitting a piece also selects it.</p>
                        <WorkspaceGrid width={GRID_W} height={GRID_H}
                            machineWidthMm={MACHINE_W} machineHeightMm={MACHINE_H}
                            majorSpacingMm={MAJOR} minorSpacingMm={MINOR} enablePanZoom
                            onClickMm={handleClickMm}
                            renderOverlay={(ctx, t) => drawWorkpieces(ctx, t, TEST_PIECES, selectedId)} />
                        <div className="border border-gray-800 rounded-lg bg-black/40 divide-y divide-gray-800/60 overflow-hidden">
                            {clickLog.length === 0
                                ? <p className="px-3 py-2 text-xs text-gray-600 font-mono">Click the grid to see events…</p>
                                : clickLog.map((entry, i) => (
                                    <div key={i} className="px-3 py-1.5 flex items-center gap-3 text-xs font-mono">
                                        <span className="text-gray-500">→</span>
                                        <span className="text-miami-cyan">({entry.x} mm, {entry.y} mm)</span>
                                        {entry.label
                                            ? <span className="text-miami-pink">hit: {entry.label}</span>
                                            : <span className="text-gray-600">no hit</span>}
                                    </div>
                                ))
                            }
                        </div>
                    </div>
                )}

                {/* ── Zoom to Object ── */}
                {activeTab === 'zoom-to-obj' && (
                    <div className="space-y-2">
                        <p className="text-xs text-gray-400">
                            Click a workpiece or use the buttons below to smoothly animate the camera to frame it.
                            You can still pan/zoom manually between clicks.
                        </p>
                        <WorkspaceGrid width={GRID_W} height={GRID_H}
                            machineWidthMm={MACHINE_W} machineHeightMm={MACHINE_H}
                            majorSpacingMm={MAJOR} minorSpacingMm={MINOR}
                            enablePanZoom
                            zoom={ctrlZoom} offsetX={ctrlOffsetX} offsetY={ctrlOffsetY}
                            onTransformChange={handleZoomTransformChange}
                            onClickMm={handleZoomToClick}
                            renderOverlay={(ctx, t) => drawWorkpieces(ctx, t, TEST_PIECES, selectedId)} />

                        {/* Controls */}
                        <div className="flex items-center gap-2 flex-wrap">
                            <button
                                onClick={resetZoomView}
                                className="px-3 py-1.5 text-xs font-black uppercase tracking-widest rounded-lg border border-gray-700 text-gray-400 hover:border-miami-cyan hover:text-miami-cyan transition-all"
                            >
                                ↺ Reset
                            </button>
                            {TEST_PIECES.map(p => (
                                <button
                                    key={p.id}
                                    onClick={() => flyToPiece(p)}
                                    className={`px-3 py-1.5 text-xs font-black uppercase tracking-widest rounded-lg border transition-all ${
                                        selectedId === p.id
                                            ? 'border-miami-pink text-miami-pink bg-miami-pink/10 shadow-[0_0_10px_rgba(255,0,127,0.2)]'
                                            : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200'
                                    }`}
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>

                        {selectedId && (
                            <div className="px-3 py-2 rounded-lg border border-miami-pink/40 bg-miami-pink/10 text-miami-pink text-xs font-mono">
                                ✓ Zoomed to: {TEST_PIECES.find(p => p.id === selectedId)?.label}
                                &nbsp;·&nbsp;zoom {ctrlZoom.toFixed(2)}×
                            </div>
                        )}
                    </div>
                )}

                {/* ── Multi-Select Demo ── */}
                {activeTab === 'multi-select' && (
                    <div className="space-y-4">
                        <p className="text-xs text-gray-400">
                            Demonstrates `ItemContainer` managing multi-selection of `ItemBadge`s. 
                            Click badges to toggle selection.
                        </p>
                        
                        <ItemContainer 
                            title="Path Selection" 
                            enableMultiSelect 
                            selectedIds={selectedBadges}
                            onSelectionChange={setSelectedBadges}
                            maxHeight="200px"
                        >
                            <ItemBadge id="badge-1" title="Outer Profile" subtitle="Cut Path" />
                            <ItemBadge id="badge-2" title="Inner Holes" subtitle="Cut Path" />
                            <ItemBadge id="badge-3" title="Logo Engraving" subtitle="Fill Path" />
                            <ItemBadge id="badge-4" title="Serial Number" subtitle="Raster Path" />
                        </ItemContainer>

                        <div className="px-3 py-2 rounded-lg border border-gray-700 bg-black/40 text-xs font-mono">
                            <span className="text-gray-500">Selected IDs: </span>
                            {selectedBadges.length === 0 
                                ? <span className="text-gray-600">none</span>
                                : <span className="text-miami-cyan">{selectedBadges.join(', ')}</span>}
                        </div>
                    </div>
                )}

            </div>
        </View>
    );
};
