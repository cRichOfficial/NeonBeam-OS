import React, { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAppSettingsStore } from '../store/appSettingsStore';
import { usePresetsStore } from '../store/presetsStore';
import { useJobStore } from '../store/jobStore';
import { NumericInput } from '../components/NumericInput';
import { useNavigationStore } from '../store/navigationStore';
import { generateRasterGCode, parseGCodeForPreview, type PreviewMove } from '../studio/gcodeEngine';
import { parseSvgPaths, generateMultiOpGCode } from '../studio/svgLayerEngine';
import { useJobOperationsStore } from '../store/jobOperationsStore';
import type { LayerOp } from '../store/jobOperationsStore';

const _COMM_API_FALLBACK = '';

// ── Types ──────────────────────────────────────────────────────────────────────
type FileKind     = 'svg' | 'bitmap';
type DitherMethod = 'threshold' | 'floyd-steinberg' | 'atkinson' | 'bayer';
type StudioTab    = 'design' | 'gcode';
type GCodeView    = 'preview' | 'raw';

// ── Dithering ──────────────────────────────────────────────────────────────────
function toGray(src: HTMLCanvasElement): Float32Array {
    const ctx = src.getContext('2d')!;
    const { data } = ctx.getImageData(0, 0, src.width, src.height);
    const n = src.width * src.height;
    const g = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        // Composite over white using alpha so transparent pixels = white (no burn)
        const a = data[i*4+3] / 255;
        const r = data[i*4]   * a + 255 * (1 - a);
        const gr= data[i*4+1] * a + 255 * (1 - a);
        const b = data[i*4+2] * a + 255 * (1 - a);
        g[i] = 0.299 * r + 0.587 * gr + 0.114 * b;
    }
    return g;
}
function applyDither(src: HTMLCanvasElement, method: DitherMethod): HTMLCanvasElement {
    const w = src.width, h = src.height;
    const g = toGray(src);
    const clamp = (v: number) => Math.min(255, Math.max(0, v));
    const err   = (x: number, y: number, e: number) => { if (x>=0&&x<w&&y>=0&&y<h) g[y*w+x]+=e; };
    const BAYER = [[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]];

    if (method === 'floyd-steinberg') {
        for (let y=0;y<h;y++) for (let x=0;x<w;x++) {
            const old=clamp(g[y*w+x]); const nv=old>128?255:0; g[y*w+x]=nv; const e=old-nv;
            err(x+1,y,e*7/16); err(x-1,y+1,e*3/16); err(x,y+1,e*5/16); err(x+1,y+1,e/16);
        }
    } else if (method === 'atkinson') {
        for (let y=0;y<h;y++) for (let x=0;x<w;x++) {
            const old=clamp(g[y*w+x]); const nv=old>128?255:0; g[y*w+x]=nv; const e=(old-nv)/8;
            err(x+1,y,e); err(x+2,y,e); err(x-1,y+1,e); err(x,y+1,e); err(x+1,y+1,e); err(x,y+2,e);
        }
    } else if (method === 'bayer') {
        for (let y=0;y<h;y++) for (let x=0;x<w;x++) g[y*w+x]=g[y*w+x]>(BAYER[y%4][x%4]/16)*255?255:0;
    } else {
        for (let i=0;i<g.length;i++) g[i]=g[i]>128?255:0;
    }

    const out = document.createElement('canvas'); out.width=w; out.height=h;
    const octx = out.getContext('2d')!;
    const d = octx.createImageData(w,h);
    for (let i=0;i<w*h;i++) { const v=clamp(g[i]); d.data[i*4]=d.data[i*4+1]=d.data[i*4+2]=v; d.data[i*4+3]=255; }
    octx.putImageData(d,0,0);
    return out;
}

// ── Canvas layout ──────────────────────────────────────────────────────────────
// Canvas outer dimensions & margins
const CW=480, CH=300, ML=32, MB=20;
// DW/DH = maximum drawable pixel budget (axis labels excluded)
const DW=CW-ML, DH=CH-MB;

// ── Component ──────────────────────────────────────────────────────────────────
export const StudioModule: React.FC = () => {
    // Store selectors
    const svgDpi    = useAppSettingsStore(s => s.settings.svgDpi);
    const bitmapDpi = useAppSettingsStore(s => s.settings.bitmapDpi);
    const mmW       = useAppSettingsStore(s => s.settings.machineWidth);
    const mmH       = useAppSettingsStore(s => s.settings.machineHeight);
    const major       = useAppSettingsStore(s => s.settings.majorSpacing) || 50;
    const minor       = useAppSettingsStore(s => s.settings.minorSpacing) || 10;
    const feedUnits   = useAppSettingsStore(s => s.settings.feedUnits);
    const coreApiUrl  = useAppSettingsStore(s => s.settings.coreApiUrl) || _COMM_API_FALLBACK;
    const maxSpindleS = useAppSettingsStore(s => s.settings.maxSpindleS) || 1000;  // mirrors $30
    const { presets } = usePresetsStore();

    // SVG layer / operations store
    const svgPaths        = useJobOperationsStore(s => s.svgPaths);
    const operations      = useJobOperationsStore(s => s.operations);
    const selectedPathIds = useJobOperationsStore(s => s.selectedPathIds);
    const { setSvgPaths, togglePathSelect, addFromSelection,
            updateOperation, updateParams, removeOperation,
            moveOp, removePathFromOp, clearAll: clearOps } = useJobOperationsStore();

    // ── File / design state ──
    const [fileKind, setFileKind]   = useState<FileKind | null>(null);
    const [fileName, setFileName]   = useState('');
    const [ditherMethod, setDitherMethod] = useState<DitherMethod>('floyd-steinberg');
    const [posX, setPosX]           = useState(0);
    const [posY, setPosY]           = useState(0);
    const [scalePct, setScalePct]   = useState(100);
    const [dpi, setDpi]             = useState(() => svgDpi);
    const [selectedPreset, setSelectedPreset] = useState('');
    // Per-operation UI state: which op accordion is expanded
    const [expandedOpId, setExpandedOpId] = useState<string | null>(null);
    // Pending new-op type when user clicks 'Add Operation'
    const [pendingOpType, setPendingOpType] = useState<LayerOp>('cut');

    // ── Operation parameters (always visible when file loaded) ──
    // opRate is ALWAYS stored in mm/min — the native GCode unit.
    // The UI shows/accepts values in feedUnits and converts on the way in/out.
    const [opPower,        setOpPower]        = useState(1000);
    const [opMinPower,     setOpMinPower]     = useState(0);      // raster only — lower S bound
    const [opRate,         setOpRate]         = useState(1500);   // mm/min internally

    // ── Dual range slider refs (raster power min/max) ──
    // Using a custom pointer-driven approach instead of two stacked <input type="range">
    // because the top input always captures the full track width, making the bottom
    // input's thumb unreachable.
    const dualRangeRef  = useRef<HTMLDivElement>(null);
    const dualDragging  = useRef<'min' | 'max' | null>(null);
    // Keep latest state values in refs so event handlers don't close over stale values.
    const opMinPowerRef = useRef(opMinPower);
    const opPowerRef    = useRef(opPower);
    useEffect(() => { opMinPowerRef.current = opMinPower; }, [opMinPower]);
    useEffect(() => { opPowerRef.current    = opPower;    }, [opPower]);


    // Converts a raw S value (0–maxSpindleS) to a rounded integer percentage string.
    const sPct = (s: number) => `${Math.round((s / maxSpindleS) * 100)}%`;

    const onDualDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        e.preventDefault();
        const v = Math.round(Math.max(0, Math.min(1, (e.clientX - dualRangeRef.current!.getBoundingClientRect().left) / dualRangeRef.current!.getBoundingClientRect().width)) * maxSpindleS);
        dualDragging.current = Math.abs(v - opMinPowerRef.current) <= Math.abs(v - opPowerRef.current)
            ? 'min' : 'max';
        (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    }, [maxSpindleS]);

    const onDualMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        if (!dualDragging.current || !dualRangeRef.current) return;
        const rect = dualRangeRef.current.getBoundingClientRect();
        const v = Math.round(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * maxSpindleS);
        if (dualDragging.current === 'min') {
            setOpMinPower(Math.max(0, Math.min(v, opPowerRef.current - Math.round(maxSpindleS * 0.01))));
        } else {
            setOpPower(Math.max(opMinPowerRef.current + Math.round(maxSpindleS * 0.01), Math.min(v, maxSpindleS)));
        }
    }, [maxSpindleS]);

    const onDualUp = useCallback(() => { dualDragging.current = null; }, []);

    const [opPasses,       setOpPasses]       = useState(1);
    const [opAirAssist,    setOpAirAssist]    = useState(false);
    const [opLineDistance, setOpLineDistance] = useState(0.1);
    const [opLineAngle,    setOpLineAngle]    = useState(0);
    const [opMargin,       setOpMargin]       = useState(0);

    // Normalise feedUnits: guard against undefined / unexpected values from old
    // localStorage state.  If it is not exactly 'mm/s', treat as 'mm/min'.
    // This closes the silent-failure mode: label says 'mm/s', store returns
    // undefined → comparison fails → no ×60 → F80 in GCode → machine hits
    // 80 mm/min ≈ 1.3 mm/s instead of the intended 80 mm/s (4800 mm/min).
    const isMmPerSec = feedUnits === 'mm/s';

    // Convert opRate (mm/min — the GCode native unit) ↔ display unit
    const toDisplay      = (mmPerMin: number) => isMmPerSec ? +(mmPerMin / 60).toFixed(2) : mmPerMin;
    const toMmPerMin     = (val: number)      => isMmPerSec ? Math.round(val * 60)        : val;
    const displayRate     = toDisplay(opRate);
    const setDisplayRate  = (val: number)     => setOpRate(toMmPerMin(val));
    const displayRateUnit = isMmPerSec ? 'mm/s' : 'mm/min';


    // ── Tabs & GCode state ──
    const [activeTab,   setActiveTab]   = useState<StudioTab>('design');
    const [gcodeText,   setGcodeText]   = useState('');
    const [gcodeView,   setGcodeView]   = useState<GCodeView>('preview');
    const [gcodoMoves,  setGCodeMoves]  = useState<PreviewMove[]>([]);
    const [isGenerating,setIsGenerating]= useState(false);

    // ── Viewport State (Zoom & Pan) ──
    const [viewZoom,    setViewZoom]    = useState(1);
    const [viewOffsetX, setViewOffsetX] = useState(0);
    const [viewOffsetY, setViewOffsetY] = useState(0);
    const lastPinchDist = useRef<number | null>(null);
    const pointers      = useRef<Map<number, {x: number, y: number}>>(new Map());
    const isPanning     = useRef(false);
    const lastPoint     = useRef<{x: number, y: number} | null>(null);

    // Job status — shared store so DashboardModule can read it
    const jobStatus    = useJobStore(s => s.jobStatus);
    const setJobStatus = useJobStore(s => s.setJobStatus);
    const navigateTo   = useNavigationStore(s => s.navigateTo);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // ── UI ──
    const [isDragOver,  setIsDragOver]  = useState(false);
    const [renderTick,  setRenderTick]  = useState(0);

    // ── Refs ──
    const canvasRef    = useRef<HTMLCanvasElement>(null);
    // Uniform scale: 1 mm maps to the same number of pixels on both axes
    const baseSc = Math.min(DW / mmW, DH / mmH);
    const scX    = baseSc * viewZoom;
    const scY    = baseSc * viewZoom;
    // Actual pixel dimensions of the plot area (may be larger than DW×DH when zoomed)
    const plotW  = scX * mmW;
    const plotH  = scY * mmH;

    const bumpRender = useCallback(() => setRenderTick(t => t + 1), []);

    const resetView = useCallback(() => {
        setViewZoom(1); setViewOffsetX(0); setViewOffsetY(0);
        bumpRender();
    }, [bumpRender]);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const designImgRef = useRef<HTMLImageElement | null>(null);
    const srcCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const ditheredRef  = useRef<HTMLCanvasElement | null>(null);
    const svgTextRef   = useRef<string>('');        // raw SVG XML

    // ── Physical size helper ──
    // For SVGs: parse viewBox directly from raw XML (DOMParser) so the coordinate
    // space passed to the GCode engine is in SVG user-units, not browser render pixels.
    // For bitmaps: use img.naturalWidth/Height as before.
    // Returns { w, h } in mm and `units` = 'doc' (explicit CSS units detected) | 'dpi'
    const physSize = (): { w: number; h: number; units: 'doc' | 'dpi' } => {
        const img = designImgRef.current;
        if (!img) return { w: 0, h: 0, units: 'dpi' };
        if (fileKind === 'svg' && svgTextRef.current) {
            const doc   = new DOMParser().parseFromString(svgTextRef.current, 'image/svg+xml');
            const svgEl = doc.querySelector('svg');
            if (!svgEl) return { w: 0, h: 0, units: 'dpi' };

            // Parse a CSS length attribute → mm, or null if not resolvable
            const parseCss = (attr: string): number | null => {
                const s = (attr || '').trim().toLowerCase();
                if (!s) return null;
                if (s.endsWith('mm'))  return parseFloat(s);
                if (s.endsWith('cm'))  return parseFloat(s) * 10;
                if (s.endsWith('in'))  return parseFloat(s) * 25.4;
                if (s.endsWith('pt'))  return parseFloat(s) * (25.4 / 72);
                if (s.endsWith('pc'))  return parseFloat(s) * (25.4 / 6);
                if (s.endsWith('px'))  return parseFloat(s) * (25.4 / dpi);
                const n = parseFloat(s);
                return isNaN(n) ? null : n * (25.4 / dpi); // unitless = treated as px
            };

            const wMm = parseCss(svgEl.getAttribute('width')  || '');
            const hMm = parseCss(svgEl.getAttribute('height') || '');

            // If both attrs have explicit CSS units, use them directly (DPI irrelevant for these)
            const wAttr = (svgEl.getAttribute('width')  || '').trim().toLowerCase();
            const hAttr = (svgEl.getAttribute('height') || '').trim().toLowerCase();
            const hasDocUnits = /[a-z]/.test(wAttr) && /[a-z]/.test(hAttr)
                                && !wAttr.endsWith('px') && !hAttr.endsWith('px');
            if (wMm && hMm && wMm > 0 && hMm > 0) {
                return { w: wMm * (scalePct / 100), h: hMm * (scalePct / 100),
                         units: hasDocUnits ? 'doc' : 'dpi' };
            }

            // Fallback: viewBox raw values treated as px at current DPI
            const vb  = svgEl.viewBox?.baseVal;
            const vbW = (vb && vb.width  > 0 ? vb.width  : parseFloat(svgEl.getAttribute('width')  || '0')) || 400;
            const vbH = (vb && vb.height > 0 ? vb.height : parseFloat(svgEl.getAttribute('height') || '0')) || 400;
            return { w: vbW * (25.4 / dpi) * (scalePct / 100),
                     h: vbH * (25.4 / dpi) * (scalePct / 100), units: 'dpi' };
        }
        const mmPerPx = 25.4 / dpi;
        return {
            w: img.naturalWidth  * mmPerPx * (scalePct / 100),
            h: img.naturalHeight * mmPerPx * (scalePct / 100),
            units: 'dpi',
        };
    };


    // ── Dithering effect ──
    useEffect(() => {
        if (fileKind === 'bitmap' && srcCanvasRef.current) {
            ditheredRef.current = applyDither(srcCanvasRef.current, ditherMethod);
            bumpRender();
        }
    }, [ditherMethod, fileKind, bumpRender]);

    // ── Canvas draw ──
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // 1. Background (Fixed)
        ctx.fillStyle = '#080808'; ctx.fillRect(0, 0, CW, CH);

        // 2. Viewport Transform
        ctx.save();
        ctx.translate(viewOffsetX, viewOffsetY);

        // Bed background & border
        ctx.fillStyle = '#111111'; ctx.fillRect(ML, 0, plotW, plotH);
        ctx.strokeStyle = 'rgba(112,0,255,0.18)'; ctx.lineWidth = 1 / viewZoom;
        ctx.strokeRect(ML, 0, plotW, plotH);

        // 3. Grid (Infinite/Extended)
        const gMinX = -2000, gMaxX = 2000, gMinY = -2000, gMaxY = 2000;

        // Minor grid
        ctx.beginPath(); ctx.strokeStyle = 'rgba(0,240,255,0.04)'; ctx.lineWidth = 0.5 / viewZoom;
        for (let x = Math.floor(gMinX/minor)*minor; x <= gMaxX; x += minor) { const px = ML + x * scX; ctx.moveTo(px, -2000); ctx.lineTo(px, 2000); }
        for (let y = Math.floor(gMinY/minor)*minor; y <= gMaxY; y += minor) { const py = plotH - y * scY; ctx.moveTo(-2000, py); ctx.lineTo(2000, py); }
        ctx.stroke();

        // Major grid
        ctx.beginPath(); ctx.strokeStyle = 'rgba(0,240,255,0.11)'; ctx.lineWidth = 1 / viewZoom;
        for (let x = Math.floor(gMinX/major)*major; x <= gMaxX; x += major) { const px = ML + x * scX; ctx.moveTo(px, -2000); ctx.lineTo(px, 2000); }
        for (let y = Math.floor(gMinY/major)*major; y <= gMaxY; y += major) { const py = plotH - y * scY; ctx.moveTo(-2000, py); ctx.lineTo(2000, py); }
        ctx.stroke();

        // 4. Origin Highlight (Thick X=0, Y=0 lines)
        ctx.beginPath(); ctx.strokeStyle = 'rgba(0,240,255,0.25)'; ctx.lineWidth = 2.5 / viewZoom;
        ctx.moveTo(ML, -2000); ctx.lineTo(ML, 2000); // X=0
        ctx.moveTo(-2000, plotH); ctx.lineTo(2000, plotH); // Y=0
        ctx.stroke();

        const img = designImgRef.current;
        if (img && fileKind) {
            // SVG: use viewBox-based physSize() so canvas matches GCode coordinates
            const { w: dWmm, h: dHmm } = physSize();
            const dxPx  = ML + posX * scX;
            const dyPx  = plotH - (posY + dHmm) * scY;
            const dwPx  = dWmm * scX;
            const dhPx  = dHmm * scY;

            if (activeTab === 'gcode') {
                // Faint design background for context
                ctx.globalAlpha = 0.18;
                if (fileKind === 'bitmap' && ditheredRef.current) ctx.drawImage(ditheredRef.current, dxPx, dyPx, dwPx, dhPx);
                else ctx.drawImage(img, dxPx, dyPx, dwPx, dhPx);
                ctx.globalAlpha = 1;

                // GCode toolpath overlay — cut=pink, fill=purple, bitmap=cyan, rapid=gray
                if (gcodoMoves.length > 0) {
                    let prev = gcodoMoves[0];
                    for (let i = 1; i < gcodoMoves.length; i++) {
                        const m = gcodoMoves[i];
                        const x1 = ML + prev.x * scX, y1 = plotH - prev.y * scY;
                        const x2 = ML + m.x    * scX, y2 = plotH - m.y    * scY;
                        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
                        if (m.burn) {
                            if (fileKind === 'svg') {
                                ctx.strokeStyle = m.opType === 'fill'
                                    ? 'rgba(112,0,255,0.85)'
                                    : 'rgba(255,0,127,0.85)';
                            } else {
                                ctx.strokeStyle = 'rgba(0,240,255,0.7)';
                            }
                            ctx.lineWidth = 1.5; ctx.setLineDash([]);
                        } else if (m.rapid) {
                            ctx.strokeStyle = 'rgba(90,90,90,0.45)';
                            ctx.lineWidth = 0.5; ctx.setLineDash([2, 4]);
                        } else {
                            ctx.strokeStyle = 'rgba(60,60,100,0.35)';
                            ctx.lineWidth = 0.5; ctx.setLineDash([1, 3]);
                        }
                        ctx.stroke(); ctx.setLineDash([]);
                        prev = m;
                    }
                }

                // ── Canvas legend (top-right) ──
                const legend = fileKind === 'svg'
                    ? [
                        { colour: 'rgba(255,0,127,0.9)',  label: 'Cut burn'  },
                        { colour: 'rgba(112,0,255,0.9)',  label: 'Fill burn' },
                        { colour: 'rgba(90,90,90,0.65)',  label: 'Rapid'     },
                      ]
                    : [
                        { colour: 'rgba(0,240,255,0.85)', label: 'Engrave'   },
                        { colour: 'rgba(90,90,90,0.65)',  label: 'Rapid'     },
                      ];
                ctx.font = 'bold 8px ui-monospace,monospace';
                ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
                legend.forEach((item, i) => {
                    const ly = 10 + i * 14;
                    ctx.fillStyle = item.colour;
                    ctx.fillRect(CW - 68, ly - 3, 16, 6);
                    ctx.fillStyle = 'rgba(180,200,210,0.8)';
                    ctx.fillText(item.label, CW - 6, ly);
                });
            } else {
                // Design preview
                if (fileKind === 'svg') {
                    // Dark gray artboard backing so black strokes/fills are visible
                    ctx.fillStyle = '#2a2a2a';
                    ctx.fillRect(dxPx, dyPx, dwPx, dhPx);

                    ctx.globalAlpha = 0.88;
                    ctx.drawImage(img, dxPx, dyPx, dwPx, dhPx);
                    ctx.globalAlpha = 1;
                    // Dashed artboard boundary — SVG document page extents (not a cut line)
                    const hasCut  = operations.some(o => o.opType === 'cut');
                    const hasFill = operations.some(o => o.opType === 'fill');
                    ctx.strokeStyle = hasCut ? 'rgba(255,0,127,0.5)' : hasFill ? 'rgba(112,0,255,0.5)' : 'rgba(100,100,100,0.35)';
                    ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
                    ctx.strokeRect(dxPx, dyPx, dwPx, dhPx); ctx.setLineDash([]);
                    // Label
                    ctx.font = '7px ui-monospace,monospace';
                    ctx.fillStyle = 'rgba(200,100,160,0.55)';
                    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
                    ctx.fillText('SVG artboard', dxPx + 3, dyPx - 2);

                } else {
                    const drawSrc = ditheredRef.current ?? img;
                    // White backing mat so transparent areas read as "no burn", not dark canvas
                    ctx.fillStyle = '#ffffff';
                    ctx.globalAlpha = 0.92;
                    ctx.fillRect(dxPx, dyPx, dwPx, dhPx);
                    ctx.globalAlpha = 0.9; ctx.imageSmoothingEnabled = false;
                    ctx.drawImage(drawSrc, dxPx, dyPx, dwPx, dhPx);
                    ctx.imageSmoothingEnabled = true; ctx.globalAlpha = 1;
                    ctx.strokeStyle = 'rgba(0,240,255,0.55)'; ctx.lineWidth = 1;
                    ctx.setLineDash([4,3]); ctx.strokeRect(dxPx, dyPx, dwPx, dhPx); ctx.setLineDash([]);
                }
            }
        }

        ctx.restore(); // End of viewport transform

        // ── Axis labels (Docked to margins) ──
        const fontSize = Math.max(10, Math.min(20, 10 + (viewZoom - 1) * 3));
        ctx.font = `bold ${fontSize}px ui-monospace, monospace`;
        ctx.fillStyle = 'rgba(0,200,220,0.65)';

        // X Labels (Bottom-docked, move horizontally)
        ctx.textBaseline = 'bottom'; ctx.textAlign = 'center';
        const minX = Math.floor((-viewOffsetX - ML) / scX / major) * major;
        const maxX = Math.ceil((CW - viewOffsetX - ML) / scX / major) * major;
        for (let x = minX; x <= maxX; x += major) {
            const px = ML + viewOffsetX + x * scX;
            if (px >= ML && px <= CW) ctx.fillText(`${x}`, px, CH - 1);
        }

        // Y Labels (Left-docked, move vertically)
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        const y_low  = (plotH + viewOffsetY - (CH - MB)) / scY;
        const y_high = (plotH + viewOffsetY) / scY;
        const minY = Math.floor(Math.min(y_low, y_high) / major) * major;
        const maxY = Math.ceil(Math.max(y_low, y_high) / major) * major;

        for (let y = minY; y <= maxY; y += major) {
            if (y === 0) continue;
            const py = (plotH + viewOffsetY) - y * scY;
            if (py >= 0 && py <= CH - MB) ctx.fillText(`${y}`, ML - 4, py);
        }

        ctx.fillStyle = 'rgba(100,150,160,0.45)'; ctx.font = 'bold 9px sans-serif';
        ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillText('mm', ML - 2, 2);

        // ── Origin marker (Moves with bed) ──
        ctx.save();
        ctx.translate(viewOffsetX, viewOffsetY);
        ctx.fillStyle = '#ff007f'; ctx.beginPath(); ctx.arc(ML, plotH, 4, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(255,0,127,0.4)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(ML, plotH - 8); ctx.lineTo(ML, plotH); ctx.moveTo(ML, plotH); ctx.lineTo(ML + 8, plotH); ctx.stroke();
        ctx.restore();

    }, [renderTick, mmW, mmH, scX, scY, plotW, plotH, major, minor, fileKind, posX, posY, scalePct, operations, dpi, activeTab, gcodoMoves, viewZoom, viewOffsetX, viewOffsetY]);


    // ── Interaction Handlers ──
    const handleWheel = useCallback((e: React.WheelEvent) => {
        if (!canvasRef.current) return;

        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = Math.min(20, Math.max(0.5, viewZoom * delta));

        // Zoom around viewport center
        const mx = CW / 2;
        const my = CH / 2;

        const dx = (mx - viewOffsetX - ML) / viewZoom;
        const dy = (my - viewOffsetY) / viewZoom;
        
        const newOffsetX = mx - ML - dx * newZoom;
        const newOffsetY = my - dy * newZoom;

        setViewZoom(newZoom);
        setViewOffsetX(newOffsetX);
        setViewOffsetY(newOffsetY);
        bumpRender();
    }, [viewZoom, viewOffsetX, viewOffsetY, bumpRender]);

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        
        // Track pointer for multi-touch
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

        isPanning.current = true;
        lastPoint.current = { x: e.clientX, y: e.clientY };
        canvasRef.current?.setPointerCapture(e.pointerId);
    }, []);

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (pointers.current.size === 2) {
            // Pinch-to-zoom
            const pts = Array.from(pointers.current.values());
            const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
            
            if (lastPinchDist.current !== null && lastPinchDist.current > 0) {
                const delta = dist / lastPinchDist.current;
                const newZoom = Math.min(20, Math.max(0.5, viewZoom * delta));
                
                // Zoom around viewport center
                const mx = CW / 2;
                const my = CH / 2;

                const dx = (mx - viewOffsetX - ML) / viewZoom;
                const dy = (my - viewOffsetY) / viewZoom;
                
                setViewZoom(newZoom);
                setViewOffsetX(mx - ML - dx * newZoom);
                setViewOffsetY(my - dy * newZoom);
                bumpRender();
            }
            lastPinchDist.current = dist;
            return;
        }

        if (isPanning.current && lastPoint.current && pointers.current.size === 1) {
            const dx = e.clientX - lastPoint.current.x;
            const dy = e.clientY - lastPoint.current.y;
            
            setViewOffsetX(v => v + dx);
            setViewOffsetY(v => v + dy);
            lastPoint.current = { x: e.clientX, y: e.clientY };
            bumpRender();
        }
    }, [viewZoom, viewOffsetX, viewOffsetY, bumpRender]);

    const handlePointerUp = useCallback((e: React.PointerEvent) => {
        pointers.current.delete(e.pointerId);
        if (pointers.current.size === 0) {
            isPanning.current = false;
            lastPoint.current = null;
        }
        lastPinchDist.current = null;
    }, []);


    // ── File loading ──
    const loadFile = useCallback((file: File) => {
        const name = file.name.toLowerCase();
        const isSvg    = name.endsWith('.svg');
        const isBitmap = /\.(png|jpg|jpeg|bmp|webp|gif)$/.test(name);
        if (!isSvg && !isBitmap) { alert('Unsupported format. Use SVG, PNG, JPG, BMP, or WebP.'); return; }

        setFileName(file.name);
        setActiveTab('design');
        setGcodeText(''); setGCodeMoves([]);
        designImgRef.current = null; srcCanvasRef.current = null; ditheredRef.current = null; svgTextRef.current = '';
        setDpi(isSvg ? svgDpi : bitmapDpi);

        const reader = new FileReader();
        if (isSvg) {
            reader.onload = e => {
                const text = e.target?.result as string;
                svgTextRef.current = text;
                // Parse SVG paths for the layer panel (async-safe: runs after img loads)
                const discovered = parseSvgPaths(text);
                clearOps();
                setSvgPaths(discovered);
                const blob = new Blob([text], { type: 'image/svg+xml;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const img = new Image();
                img.onload = () => { designImgRef.current = img; setFileKind('svg'); setPosX(0); setPosY(0); setScalePct(100); bumpRender(); };
                img.src = url;
            };
            reader.readAsText(file);
        } else {
            reader.onload = e => {
                const url = e.target?.result as string;
                const img = new Image();
                img.onload = () => {
                    designImgRef.current = img;
                    const MAX = 800, aspect = img.naturalWidth / img.naturalHeight;
                    const sw = aspect >= 1 ? MAX : Math.round(MAX * aspect);
                    const sh = aspect >= 1 ? Math.round(MAX / aspect) : MAX;
                    const sc = document.createElement('canvas'); sc.width = sw; sc.height = sh;
                    const sctx = sc.getContext('2d')!;
                    // Fill white first so transparent areas = white (no-burn), not black
                    sctx.fillStyle = '#ffffff';
                    sctx.fillRect(0, 0, sw, sh);
                    sctx.drawImage(img, 0, 0, sw, sh);
                    srcCanvasRef.current = sc;
                    setFileKind('bitmap'); setPosX(0); setPosY(0); setScalePct(100);
                    bumpRender();
                };
                img.src = url;
            };
            reader.readAsDataURL(file);
        }
    }, [svgDpi, bitmapDpi, bumpRender]);

    // ── Apply preset (pre-fills op params; doesn't hide them) ──
    // Presets store rate in mm/min; setOpRate stores mm/min. No conversion needed here.
    const applyPreset = useCallback((presetId: string) => {
        setSelectedPreset(presetId);
        const p = presets.find(x => x.id === presetId);
        if (!p) return;
        setOpPower(p.power); setOpMinPower(0); setOpRate(p.rate); setOpPasses(p.passes);
        setOpAirAssist(p.airAssist); setOpLineDistance(p.lineDistance);
        setOpLineAngle(p.lineAngle); setOpMargin(p.margin);
    }, [presets]);

    // ── Preset filter (by file type) ──
    const filteredPresets = presets.filter(p => {
        if (!fileKind) return false;
        if (fileKind === 'bitmap') return p.opType === 'Engrave' || p.opType === 'Fill';
        // SVG: show fill presets if any op is fill, else cut/score
        const hasFillOp = operations.some(o => o.opType === 'fill');
        if (hasFillOp) return p.opType === 'Fill' || p.opType === 'Engrave';
        return p.opType === 'Cut' || p.opType === 'Score';
    });

    // ── Show line distance/angle for fill op or bitmap ──
    const showLineParams = fileKind === 'bitmap' || operations.some(o => o.opType === 'fill');

    // ── GCode generation ──
    const generateGCode = useCallback(async () => {
        if (!fileKind || !designImgRef.current) return;
        setIsGenerating(true);

        try {
            // Allow UI to render the overlay before starting heavy work
            await new Promise(r => setTimeout(r, 100));

            const { w: widthMm, h: heightMm } = physSize();
            let gcode = '';

            if (fileKind === 'svg' && svgTextRef.current) {
                if (operations.length === 0) {
                    alert('Add at least one laser operation in the SVG Paths panel before generating GCode.');
                    return;
                }
                gcode = generateMultiOpGCode({ svgText: svgTextRef.current, operations, posX, posY, widthMm, heightMm });
            } else if (fileKind === 'bitmap' && (ditheredRef.current || srcCanvasRef.current)) {
                const canvas = ditheredRef.current ?? srcCanvasRef.current!;
                const params = {
                    power: opPower, minPower: opMinPower, rate: opRate, passes: opPasses, airAssist: opAirAssist,
                    margin: opMargin, lineDistance: opLineDistance, lineAngle: opLineAngle,
                };
                gcode = generateRasterGCode({ ditheredCanvas: canvas, posX, posY, widthMm, heightMm, ditherMethod, params });
            }

            if (!gcode) return;

            setGcodeText(gcode);
            setGCodeMoves(parseGCodeForPreview(gcode));
            setActiveTab('gcode');
            setGcodeView('preview');
        } catch (err) {
            console.error('GCode Generation Error:', err);
            alert('An error occurred while generating GCode. Check the console for details.');
        } finally {
            setIsGenerating(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fileKind, posX, posY, scalePct, dpi, operations, ditherMethod, opPower, opRate, opPasses, opAirAssist, opMargin, opLineDistance, opLineAngle]);

    // ── Save GCode ──
    const saveGCode = useCallback(() => {
        const blob = new Blob([gcodeText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `${fileName.replace(/\.[^.]+$/, '') || 'neonbeam'}.nc`;
        document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    }, [gcodeText, fileName]);

    // ── Upload GCode file to backend (single request; backend owns streaming) ──
    const sendToMachine = useCallback(async () => {
        if (!gcodeText) return;
        const blob = new Blob([gcodeText], { type: 'text/plain' });
        const jobFileName = `${fileName.replace(/\.[^.]+$/, '') || 'neonbeam'}.nc`;
        const file = new File([blob], jobFileName, { type: 'text/plain' });
        const form = new FormData();
        form.append('file', file);

        try {
            const res = await axios.post(`${coreApiUrl}/api/gcode/upload`, form, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            const status = res.data.status;
            if (status === 'queued' || status === 'streaming_started') {
                // Seed the job status immediately so the Dashboard card appears
                setJobStatus({
                    is_streaming: status === 'streaming_started',
                    is_queued:    status === 'queued',
                    job_name:     res.data.job_name ?? jobFileName,
                    total_lines:  res.data.total_lines ?? 0,
                    lines_sent:   0,
                });
                startPolling();
                // Navigate to Machine Control so operator can press Cycle Start
                navigateTo('dashboard');
            } else {
                alert(`Upload failed: ${res.data.message ?? 'Unknown error'}`);
            }
        } catch {
            alert('Could not reach NeonBeam Core. Is the hardware bridge running?');
        }
    }, [coreApiUrl, gcodeText, fileName, navigateTo, setJobStatus]);

    const startPolling = useCallback(() => {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = setInterval(async () => {
            try {
                const res = await axios.get(`${coreApiUrl}/api/gcode/status`);
                const d = res.data;
                const active = d.is_streaming || d.is_queued;
                setJobStatus(
                    active || d.job_name
                        ? {
                            is_streaming: d.is_streaming,
                            is_queued:    d.is_queued ?? false,
                            job_name:     d.job_name,
                            total_lines:  d.total_lines,
                            lines_sent:   d.lines_sent,
                          }
                        : null
                );
                if (!active && !d.job_name) {
                    clearInterval(pollRef.current!);
                    pollRef.current = null;
                }
            } catch { /* backend may be momentarily busy */ }
        }, 1500);
    }, [coreApiUrl, setJobStatus]);

    const cancelJob = useCallback(async () => {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        try { await axios.post(`${coreApiUrl}/api/gcode/cancel`); } catch { /* ignore */ }
        setJobStatus(null);
    }, [coreApiUrl, setJobStatus]);

    // Clean up poll on unmount
    useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

    // ── File event handlers ──
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0]; if (f) loadFile(f); e.target.value = '';
    };
    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault(); setIsDragOver(false); const f = e.dataTransfer.files[0]; if (f) loadFile(f);
    };
    const clearDesign = () => {
        designImgRef.current = null; srcCanvasRef.current = null; ditheredRef.current = null; svgTextRef.current = '';
        setFileKind(null); setFileName(''); setPosX(0); setPosY(0); setScalePct(100);
        setGcodeText(''); setGCodeMoves([]); setActiveTab('design'); setSelectedPreset('');
        clearOps(); bumpRender();
    };

    const { w: physW, h: physH, units: physUnits } = physSize();

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col h-full bg-black/10">

            {/* ── Header + Tab Bar ── */}
            <div className="px-4 pt-3 pb-2 flex-shrink-0">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                        <div>
                            <h2 className="text-xl font-black text-miami-pink tracking-tight">Design Studio</h2>
                            <p className="text-[10px] text-gray-500 font-mono mt-0.5">⊕ BL origin · {mmW}×{mmH} mm</p>
                        </div>
                        {(viewZoom !== 1 || viewOffsetX !== 0 || viewOffsetY !== 0) && (
                            <button onClick={resetView} className="px-2 py-1 rounded bg-miami-pink/10 border border-miami-pink/30 text-[9px] font-black text-miami-pink hover:bg-miami-pink/20 transition-all uppercase tracking-tighter">
                                ↺ Reset View
                            </button>
                        )}
                    </div>
                    {fileKind && (
                        <button onClick={clearDesign} className="text-[10px] text-gray-600 hover:text-red-400 border border-gray-800 hover:border-red-900 rounded-lg px-2.5 py-1.5 font-bold transition-colors">
                            ✕ Clear
                        </button>
                    )}
                </div>

                {/* Tabs */}
                <div className="flex gap-1 bg-black/40 rounded-xl p-1 border border-gray-800">
                    {(['design', 'gcode'] as StudioTab[]).map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            disabled={tab === 'gcode' && !gcodeText}
                            className={`flex-1 py-1.5 rounded-lg text-xs font-black transition-all capitalize ${
                                activeTab === tab
                                    ? tab === 'gcode'
                                        ? 'bg-miami-cyan text-black'
                                        : 'bg-miami-pink text-black'
                                    : 'text-gray-500 hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed'
                            }`}
                        >
                            {tab === 'gcode' ? `⚡ GCode${gcodeText ? ' ✓' : ''}` : '🎨 Design'}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Canvas ── */}
            <div className="flex-shrink-0 px-3 pb-2">
                <div
                    className={`rounded-xl overflow-hidden border transition-all ${isDragOver ? 'border-miami-pink shadow-[0_0_20px_rgba(255,0,127,0.25)]' : 'border-gray-900'}`}
                    onDrop={handleDrop}
                    onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
                    onDragLeave={() => setIsDragOver(false)}
                >
                    <canvas 
                        ref={canvasRef} 
                        width={CW} 
                        height={CH} 
                        className="w-full block cursor-crosshair touch-none"
                        onWheel={handleWheel}
                        onPointerDown={handlePointerDown}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        onPointerCancel={handlePointerUp}
                        onPointerLeave={handlePointerUp}
                    />
                </div>
            </div>

            <input ref={fileInputRef} type="file" accept=".svg,.png,.jpg,.jpeg,.bmp,.webp,.gif" className="hidden" onChange={handleFileChange} />

            {/* ── DESIGN TAB ── */}
            {activeTab === 'design' && (
                <div className="flex-1 overflow-y-auto px-3 space-y-3 pb-10">

                    {/* Import / file badge */}
                    {!fileKind ? (
                        <button onClick={() => fileInputRef.current?.click()}
                            className="w-full py-4 bg-black/50 border-2 border-dashed border-miami-pink/40 text-miami-pink/80 hover:border-miami-pink hover:text-miami-pink hover:bg-miami-pink/5 font-bold rounded-xl transition-all text-sm select-none">
                            📁 Import SVG or Bitmap — or Drag &amp; Drop
                        </button>
                    ) : (
                        <div className="flex gap-2 items-center">
                            <div className="flex-1 min-w-0 bg-black/60 border border-gray-800 rounded-xl px-3 py-2 flex items-center gap-2">
                                <span>{fileKind === 'svg' ? '📐' : '🖼️'}</span>
                                <span className="text-xs text-gray-300 truncate font-mono">{fileName}</span>
                                <span className={`ml-auto flex-shrink-0 text-[9px] px-2 py-0.5 rounded font-black uppercase ${fileKind === 'svg' ? 'bg-miami-pink/20 text-miami-pink' : 'bg-miami-cyan/20 text-miami-cyan'}`}>
                                    {fileKind.toUpperCase()}
                                </span>
                            </div>
                            <button onClick={() => fileInputRef.current?.click()} className="flex-shrink-0 px-3 py-2 bg-black border border-gray-700 rounded-xl text-xs text-gray-400 hover:text-white hover:border-gray-500 transition-colors font-bold">
                                Replace
                            </button>
                        </div>
                    )}

                    {/* ── SVG PATHS & JOB OPERATIONS (only for SVG files) ── */}
                    {fileKind === 'svg' && (
                        <>
                        {/* Panel A: Detected SVG Paths */}
                        <div className="bg-black/40 border border-gray-800 rounded-xl p-3">
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-[10px] uppercase text-gray-400 font-bold tracking-widest">SVG Paths ({svgPaths.length})</p>
                                {selectedPathIds.length > 0 && (
                                    <span className="text-[9px] text-miami-cyan font-bold">{selectedPathIds.length} selected</span>
                                )}
                            </div>

                            {svgPaths.length === 0 ? (
                                <p className="text-xs text-gray-600 text-center py-2">No geometry elements detected</p>
                            ) : (
                                <div className="space-y-1 max-h-40 overflow-y-auto">
                                    {svgPaths.map(path => {
                                        const isSelected = selectedPathIds.includes(path.id);
                                        const assignedOp = operations.find(o => o.pathIds.includes(path.id));
                                        return (
                                            <button key={path.id} onClick={() => togglePathSelect(path.id)}
                                                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg border text-left transition-all ${
                                                    isSelected
                                                        ? 'bg-miami-cyan/10 border-miami-cyan/50'
                                                        : 'bg-black/40 border-gray-800 hover:border-gray-600'
                                                }`}>
                                                <span className={`w-3.5 h-3.5 rounded flex-shrink-0 border ${
                                                    isSelected ? 'bg-miami-cyan border-miami-cyan' : 'bg-transparent border-gray-600'
                                                }`} />
                                                {/* Stroke swatch */}
                                                {path.strokeColor
                                                    ? <span className="w-3 h-3 rounded-sm flex-shrink-0 border border-white/20" style={{ background: path.strokeColor }} title={`stroke: ${path.strokeColor}`} />
                                                    : <span className="w-3 h-3 rounded-sm flex-shrink-0 border border-gray-700" title="no stroke" />}
                                                {/* Fill swatch */}
                                                {path.fillColor
                                                    ? <span className="w-3 h-3 rounded flex-shrink-0 border border-white/20" style={{ background: path.fillColor }} title={`fill: ${path.fillColor}`} />
                                                    : <span className="w-3 h-3 rounded flex-shrink-0 border border-gray-700" title="no fill" />}
                                                <span className="flex-1 text-[10px] font-mono text-gray-300 truncate">{path.label}</span>
                                                {assignedOp
                                                    ? <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-miami-pink/20 text-miami-pink flex-shrink-0">{assignedOp.opType.toUpperCase()}</span>
                                                    : <span className="text-[8px] text-gray-700 flex-shrink-0">UNASSIGNED</span>}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Add operation from selection */}
                            {svgPaths.length > 0 && (
                                <div className="mt-2 pt-2 border-t border-gray-800">
                                    <div className="flex gap-1.5">
                                        <div className="flex gap-1">
                                            {(['cut','fill'] as LayerOp[]).map(op => (
                                                <button key={op} onClick={() => setPendingOpType(op)}
                                                    className={`px-2.5 py-1.5 rounded-lg text-[10px] font-black border transition-all ${
                                                        pendingOpType === op
                                                            ? op === 'cut'
                                                                ? 'bg-miami-pink text-black border-miami-pink'
                                                                : 'bg-miami-purple text-white border-miami-purple'
                                                            : 'bg-black/60 text-gray-500 border-gray-700 hover:border-gray-500'
                                                    }`}>
                                                    {op === 'cut' ? '✂ Cut' : '▧ Fill'}
                                                </button>
                                            ))}
                                        </div>
                                        <button
                                            onClick={() => addFromSelection(pendingOpType, '')}
                                            disabled={selectedPathIds.length === 0}
                                            className="flex-1 py-1.5 rounded-lg text-[10px] font-black border transition-all
                                                bg-miami-cyan/10 border-miami-cyan/40 text-miami-cyan
                                                hover:bg-miami-cyan/20 hover:border-miami-cyan
                                                disabled:opacity-30 disabled:cursor-not-allowed"
                                        >
                                            + Add {selectedPathIds.length > 0 ? `(${selectedPathIds.length})` : ''} as {pendingOpType}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Panel B: Job Operations */}
                        {operations.length > 0 && (
                            <div className="bg-black/40 border border-gray-800 rounded-xl p-3">
                                <p className="text-[10px] uppercase text-gray-400 font-bold tracking-widest mb-2">Job Operations ({operations.length})</p>
                                <div className="space-y-2">
                                    {operations.map((op, idx) => (
                                        <div key={op.id} className="border border-gray-700 rounded-xl overflow-hidden">
                                            {/* Op header */}
                                            <div className={`flex items-center gap-2 px-2.5 py-2 ${
                                                op.opType === 'cut' ? 'bg-miami-pink/10' : 'bg-miami-purple/10'
                                            }`}>
                                                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${
                                                    op.opType === 'cut' ? 'bg-miami-pink/30 text-miami-pink' : 'bg-miami-purple/30 text-miami-purple'
                                                }`}>{idx + 1}</span>
                                                <input
                                                    value={op.name || `${op.opType === 'cut' ? 'Cut' : 'Fill'} ${idx + 1}`}
                                                    onChange={e => updateOperation(op.id, { name: e.target.value })}
                                                    placeholder={`${op.opType === 'cut' ? 'Cut' : 'Fill'} ${idx + 1}`}
                                                    className="flex-1 bg-transparent text-xs font-bold text-white outline-none min-w-0"
                                                />
                                                <button onClick={() => moveOp(op.id, 'up')}   disabled={idx === 0}                        className="text-gray-600 hover:text-gray-300 disabled:opacity-20 text-sm">↑</button>
                                                <button onClick={() => moveOp(op.id, 'down')} disabled={idx === operations.length - 1}   className="text-gray-600 hover:text-gray-300 disabled:opacity-20 text-sm">↓</button>
                                                <button onClick={() => setExpandedOpId(expandedOpId === op.id ? null : op.id)} className="text-gray-500 hover:text-gray-200 text-xs font-bold">
                                                    {expandedOpId === op.id ? '▲' : '▼'}
                                                </button>
                                                <button onClick={() => removeOperation(op.id)} className="text-gray-700 hover:text-red-400 text-xs font-bold">🗑</button>
                                            </div>

                                            {/* Assigned paths chips */}
                                            <div className="px-2.5 py-1.5 flex flex-wrap gap-1">
                                                {op.pathIds.map(pid => (
                                                    <span key={pid} className="flex items-center gap-1 text-[9px] bg-black/60 border border-gray-700 rounded px-1.5 py-0.5 font-mono text-gray-400">
                                                        {pid}
                                                        <button onClick={() => removePathFromOp(op.id, pid)} className="text-gray-700 hover:text-red-400">×</button>
                                                    </span>
                                                ))}
                                            </div>

                                            {/* Expanded params */}
                                            {expandedOpId === op.id && (
                                                <div className="px-2.5 pb-2.5 space-y-2 border-t border-gray-800 pt-2">
                                                    {/* Preset picker */}
                                                    <div className="flex items-center gap-2">
                                                        <label className="text-[9px] text-gray-500 font-bold uppercase flex-shrink-0">Preset</label>
                                                        <select value={''} onChange={e => {
                                                            const p = presets.find(x => x.id === e.target.value);
                                                            if (p) updateParams(op.id, { power: p.power, rate: p.rate, passes: p.passes, airAssist: p.airAssist, lineDistance: p.lineDistance });
                                                        }} className="flex-1 bg-black border border-gray-700 text-xs text-gray-300 rounded-lg px-2 py-1 outline-none">
                                                            <option value="">— Apply preset —</option>
                                                            {presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                                        </select>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <div>
                                                            <label className="block text-[9px] text-gray-500 mb-1 uppercase font-bold">Power (0–1000 S)</label>
                                                            <NumericInput value={op.params.power}
                                                                onChange={val => updateParams(op.id, { power: val })}
                                                                min={0}
                                                                className="w-full bg-black border border-gray-700 focus:border-miami-cyan rounded-lg p-1.5 text-white text-sm font-mono outline-none" />
                                                        </div>
                                                        <div>
                                                            <label className="block text-[9px] text-gray-500 mb-1 uppercase font-bold">Feed ({feedUnits})</label>
                                                            <NumericInput
                                                                value={feedUnits === 'mm/s' ? +(op.params.rate / 60).toFixed(2) : op.params.rate}
                                                                onChange={val => updateParams(op.id, { rate: feedUnits === 'mm/s' ? Math.round(val * 60) : val })}
                                                                min={0}
                                                                className="w-full bg-black border border-gray-700 focus:border-miami-cyan rounded-lg p-1.5 text-white text-sm font-mono outline-none" />
                                                        </div>
                                                        <div>
                                                            <label className="block text-[9px] text-gray-500 mb-1 uppercase font-bold">Passes</label>
                                                            <NumericInput value={op.params.passes}
                                                                onChange={val => updateParams(op.id, { passes: val })}
                                                                min={1}
                                                                className="w-full bg-black border border-gray-700 focus:border-miami-cyan rounded-lg p-1.5 text-white text-sm font-mono outline-none" />
                                                        </div>
                                                        {op.opType === 'fill' && (
                                                            <div>
                                                                <label className="block text-[9px] text-gray-500 mb-1 uppercase font-bold">Line Dist (mm)</label>
                                                                <NumericInput value={op.params.lineDistance}
                                                                    onChange={val => updateParams(op.id, { lineDistance: val })}
                                                                    min={0.01}
                                                                    className="w-full bg-black border border-gray-700 focus:border-miami-cyan rounded-lg p-1.5 text-white text-sm font-mono outline-none" />
                                                            </div>
                                                        )}
                                                    </div>
                                                    <button onClick={() => updateParams(op.id, { airAssist: !op.params.airAssist })}
                                                        className={`w-full py-1.5 rounded-lg text-[10px] font-black border transition-all ${
                                                            op.params.airAssist ? 'bg-miami-cyan text-black border-miami-cyan' : 'bg-black text-gray-500 border-gray-700 hover:border-gray-500'
                                                        }`}>
                                                        {op.params.airAssist ? '💨 Air Assist On' : '— Air Assist Off'}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        </>
                    )}

                    {/* Bitmap dithering selector */}
                    {fileKind === 'bitmap' && (
                        <div className="bg-black/40 border border-gray-800 rounded-xl p-3">
                            <p className="text-[10px] uppercase text-gray-400 font-bold tracking-widest mb-2.5">Raster Dithering</p>
                            <div className="grid grid-cols-2 gap-2">
                                {([
                                    { key: 'threshold',       label: 'Threshold',       desc: 'Hard binary cutoff'    },
                                    { key: 'floyd-steinberg', label: 'Floyd-Steinberg', desc: 'Error diffusion'       },
                                    { key: 'atkinson',        label: 'Atkinson',        desc: 'Mac classic diffusion' },
                                    { key: 'bayer',           label: 'Bayer 4×4',       desc: 'Ordered pattern'       },
                                ] as { key: DitherMethod; label: string; desc: string }[]).map(({ key, label, desc }) => (
                                    <button key={key} onClick={() => setDitherMethod(key)}
                                        className={`py-2.5 px-3 rounded-xl text-left transition-all border ${ditherMethod === key ? 'bg-miami-cyan text-black border-miami-cyan shadow-[0_0_10px_rgba(0,240,255,0.3)]' : 'bg-black/60 text-gray-400 border-gray-700 hover:border-miami-cyan/40 hover:text-gray-200'}`}>
                                        <span className="block text-xs font-black">{label}</span>
                                        <span className={`block text-[9px] mt-0.5 ${ditherMethod === key ? 'text-black/60' : 'text-gray-600'}`}>{desc}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ── OPERATION PARAMETERS (always visible when file loaded) ── */}
                    {fileKind && (
                        <div className="bg-black/40 border border-gray-800 rounded-xl p-3 space-y-3">
                            <div className="flex items-center justify-between">
                                <p className="text-[10px] uppercase text-gray-400 font-bold tracking-widest">Laser Parameters</p>
                                {/* Quick preset fill */}
                                {filteredPresets.length > 0 && (
                                    <select value={selectedPreset} onChange={e => applyPreset(e.target.value)}
                                        className="bg-black border border-gray-700 rounded-lg px-2 py-1 text-[10px] text-gray-400 outline-none focus:border-miami-pink transition-colors max-w-[140px]">
                                        <option value="">Apply preset…</option>
                                        {filteredPresets.map(p => (
                                            <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                    </select>
                                )}
                            </div>

                            {/* Power slider row — dual-range for bitmap (min/max S), single for vector */}
                            {fileKind === 'bitmap' ? (
                                <div>
                                    <div className="flex justify-between mb-1">
                                        <label className="text-[9px] text-gray-400 uppercase font-bold">Laser Power</label>
                                        <span className="text-[9px] font-mono font-black">
                                            <span className="text-miami-purple">{sPct(opMinPower)}</span>
                                            <span className="text-gray-600"> – </span>
                                            <span className="text-miami-pink">{sPct(opPower)}</span>
                                        </span>
                                    </div>
                                    {/*
                                     * Custom dual-range slider.
                                     * Two stacked <input type="range"> cannot work reliably: the top input
                                     * always captures pointer events across its full track width, intercepting
                                     * drags meant for the lower input's thumb.
                                     * Fix: a single <div> with pointer-capture handles all interactions.
                                     * Thumbs are custom CSS dots; no native inputs are used.
                                     */}
                                    <div
                                        ref={dualRangeRef}
                                        className="relative h-6 flex items-center cursor-pointer select-none touch-none"
                                        onPointerDown={onDualDown}
                                        onPointerMove={onDualMove}
                                        onPointerUp={onDualUp}
                                        onPointerCancel={onDualUp}
                                    >
                                        {/* Background track */}
                                        <div className="absolute inset-x-0 h-1 rounded-full bg-gray-800 pointer-events-none" />
                                        {/* Active fill between min and max thumb */}
                                        <div
                                            className="absolute h-1 rounded-full bg-gradient-to-r from-miami-purple to-miami-pink pointer-events-none"
                                            style={{
                                                left:  `${(opMinPower / maxSpindleS) * 100}%`,
                                                right: `${100 - (opPower  / maxSpindleS) * 100}%`,
                                            }}
                                        />
                                        {/* Min thumb (purple) */}
                                        <div
                                            className="absolute w-4 h-4 rounded-full border-2 border-[#0a0a0a] bg-miami-purple pointer-events-none transition-shadow"
                                            style={{
                                                left: `calc(${(opMinPower / maxSpindleS) * 100}% - 8px)`,
                                                boxShadow: '0 0 8px rgba(112,0,255,0.6)',
                                            }}
                                        />
                                        {/* Max thumb (pink) */}
                                        <div
                                            className="absolute w-4 h-4 rounded-full border-2 border-[#0a0a0a] bg-miami-pink pointer-events-none transition-shadow"
                                            style={{
                                                left: `calc(${(opPower / maxSpindleS) * 100}% - 8px)`,
                                                boxShadow: '0 0 8px rgba(255,0,127,0.5)',
                                            }}
                                        />
                                    </div>
                                    <p className="text-[9px] text-gray-700 mt-0.5">Min (shadows) → Max (blacks) · 0 = white areas off</p>
                                </div>
                            ) : (
                                <div>
                                    <div className="flex justify-between mb-1">
                                        <label className="text-[9px] text-gray-400 uppercase font-bold">Laser Power</label>
                                        <span className="text-[9px] text-miami-pink font-mono font-black">{sPct(opPower)}</span>
                                    </div>
                                    <input type="range" min={0} max={maxSpindleS} value={opPower}
                                        onChange={e => setOpPower(Number(e.target.value))}
                                        className="w-full accent-miami-pink" />
                                </div>
                            )}

                            {/* Rate / Passes */}
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="block text-[9px] text-gray-400 mb-1 uppercase font-bold">
                                        Feed Rate ({displayRateUnit})
                                    </label>
                                    <NumericInput
                                        value={displayRate}
                                        onChange={val => setDisplayRate(val)}
                                        min={0}
                                        className="w-full bg-black border border-gray-700 focus:border-miami-cyan rounded-lg p-2 text-white text-sm font-mono outline-none transition-colors"
                                    />
                                    {feedUnits === 'mm/s' && (
                                        <p className="text-[9px] text-gray-600 mt-0.5 font-mono">
                                            = {opRate} mm/min in GCode
                                        </p>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-[9px] text-gray-400 mb-1 uppercase font-bold">Passes</label>
                                    <NumericInput value={opPasses} onChange={val => setOpPasses(val)} min={1}
                                        className="w-full bg-black border border-gray-700 focus:border-miami-cyan rounded-lg p-2 text-white text-sm font-mono outline-none transition-colors" />
                                </div>
                            </div>

                            {/* Line distance + angle — only for fill / raster */}
                            {showLineParams && (
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="block text-[9px] text-gray-400 mb-1 uppercase font-bold">Line Dist (mm)</label>
                                        <NumericInput value={opLineDistance} onChange={val => setOpLineDistance(val)} min={0.01}
                                            className="w-full bg-black border border-gray-700 focus:border-miami-cyan rounded-lg p-2 text-white text-sm font-mono outline-none transition-colors" />
                                    </div>
                                    <div>
                                        <label className="block text-[9px] text-gray-400 mb-1 uppercase font-bold">Scan Angle (°)</label>
                                        <NumericInput value={opLineAngle} onChange={val => setOpLineAngle(val)}
                                            className="w-full bg-black border border-gray-700 focus:border-miami-cyan rounded-lg p-2 text-white text-sm font-mono outline-none transition-colors" />
                                    </div>
                                </div>
                            )}

                            {/* Margin + Air Assist */}
                            <div className="grid grid-cols-2 gap-2 items-start">
                                <div>
                                    <label className="block text-[9px] text-gray-400 mb-1 uppercase font-bold">Overscan Margin (mm)</label>
                                    <NumericInput value={opMargin} onChange={val => setOpMargin(val)} min={0}
                                        className="w-full bg-black border border-gray-700 focus:border-miami-cyan rounded-lg p-2 text-white text-sm font-mono outline-none transition-colors" />
                                </div>
                                <div>
                                    <label className="block text-[9px] text-gray-400 mb-2 uppercase font-bold">Air Assist</label>
                                    <button onClick={() => setOpAirAssist(v => !v)}
                                        className={`w-full py-2 rounded-xl text-xs font-black border transition-all ${opAirAssist ? 'bg-miami-cyan text-black border-miami-cyan' : 'bg-black text-gray-500 border-gray-700 hover:border-gray-500'}`}>
                                        {opAirAssist ? '💨 On' : '— Off'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Position, Scale & DPI */}
                    {fileKind && (
                        <div className="bg-black/40 border border-gray-800 rounded-xl p-3">
                            <p className="text-[10px] uppercase text-gray-400 font-bold tracking-widest mb-2.5">Position, Scale &amp; DPI</p>
                            <div className="grid grid-cols-3 gap-2 mb-3">
                                {[
                                    { label: 'X (mm)',  value: posX,     min: undefined, max: mmW, step: 1, set: setPosX },
                                    { label: 'Y (mm)',  value: posY,     min: undefined, max: mmH, step: 1, set: setPosY },
                                    { label: 'Scale %', value: scalePct, min: 1, max: 500, step: 5, set: setScalePct },
                                ].map(({ label, value, min, set }) => (
                                    <div key={label}>
                                        <label className="block text-[9px] text-gray-400 mb-1 uppercase font-bold">{label}</label>
                                        <NumericInput value={value}
                                            onChange={val => { set(val); bumpRender(); }}
                                            min={min}
                                            className="w-full bg-black border border-gray-700 focus:border-miami-cyan rounded-lg p-2 text-white text-sm font-mono outline-none transition-colors" />
                                    </div>
                                ))}
                            </div>
                            <div className="border-t border-gray-800/60 pt-3">
                                <div className="flex items-center gap-2 mb-1.5">
                                    <div className="flex-1">
                                        <label className="block text-[9px] text-gray-400 mb-1 uppercase font-bold">
                                            {fileKind === 'svg' ? 'SVG DPI' : 'Bitmap DPI'}
                                        </label>
                                        <NumericInput value={dpi}
                                            onChange={val => { setDpi(val); bumpRender(); }}
                                            min={1}
                                            className="w-full bg-black border border-gray-700 focus:border-miami-pink rounded-lg p-2 text-white font-mono outline-none transition-colors" />
                                    </div>
                                    <div className="flex gap-1 mt-4 flex-shrink-0">
                                        {[72, 96, 300].map(d => (
                                            <button key={d} onClick={() => { setDpi(d); bumpRender(); }}
                                                className={`px-2.5 py-1.5 rounded-lg text-[10px] font-black border transition-all ${dpi === d ? 'bg-miami-pink text-black border-miami-pink' : 'bg-black/60 text-gray-500 border-gray-700 hover:border-gray-400 hover:text-gray-300'}`}>
                                                {d}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                {designImgRef.current && (
                                    <p className="text-[9px] text-gray-500 font-mono">
                                        {physW.toFixed(2)} mm × {physH.toFixed(2)} mm
                                        {physUnits === 'doc'
                                            ? <span style={{color:'rgba(0,220,160,0.75)'}}> · document units</span>
                                            : <> · {dpi} DPI</>}
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Generate GCode */}
                    {fileKind && (
                        <button onClick={generateGCode} disabled={isGenerating}
                            className="w-full py-4 bg-gradient-to-r from-miami-pink to-miami-purple text-white font-black rounded-xl shadow-[0_0_20px_rgba(255,0,127,0.25)] hover:shadow-[0_0_28px_rgba(255,0,127,0.5)] active:scale-[0.98] disabled:opacity-60 disabled:cursor-wait transition-all tracking-wider text-sm uppercase">
                            {isGenerating ? '⏳ Generating…' : '⚡ Generate GCode →'}
                        </button>
                    )}
                </div>
            )}

            {/* ── GCODE TAB ── */}
            {activeTab === 'gcode' && gcodeText && (
                <div className="flex-1 overflow-y-auto px-3 space-y-3 pb-10">

                    {/* Sub-tab: Preview | Raw */}
                    <div className="flex gap-1 bg-black/40 rounded-xl p-1 border border-gray-800">
                        {(['preview', 'raw'] as GCodeView[]).map(v => (
                            <button key={v} onClick={() => setGcodeView(v)}
                                className={`flex-1 py-1.5 rounded-lg text-xs font-black transition-all capitalize ${gcodeView === v ? 'bg-miami-cyan text-black' : 'text-gray-500 hover:text-gray-300'}`}>
                                {v === 'preview' ? '🗺 Toolpath Preview' : '📄 Raw GCode'}
                            </button>
                        ))}
                    </div>

                    {/* Stats bar */}
                    <div className="grid grid-cols-3 gap-2">
                        {[
                            { label: 'Lines',   value: gcodeText.split('\n').filter(Boolean).length },
                            { label: 'Burn ops',value: gcodoMoves.filter(m => m.burn).length },
                            { label: 'Rapids',  value: gcodoMoves.filter(m => m.rapid).length },
                        ].map(({ label, value }) => (
                            <div key={label} className="bg-black/50 border border-gray-800 rounded-xl p-2 text-center">
                                <span className="block text-lg font-black text-miami-cyan font-mono">{value}</span>
                                <span className="block text-[9px] text-gray-500 uppercase font-bold">{label}</span>
                            </div>
                        ))}
                    </div>

                    {/* Raw GCode text */}
                    {gcodeView === 'raw' && (
                        <div className="bg-black/80 border border-gray-800 rounded-xl overflow-hidden">
                            <pre className="text-[10px] text-gray-400 font-mono p-3 overflow-auto max-h-64 leading-relaxed whitespace-pre-wrap">
                                {gcodeText}
                            </pre>
                        </div>
                    )}

                    {/* Action buttons */}
                    {!jobStatus?.is_streaming && (
                        <div className="grid grid-cols-2 gap-2">
                            <button onClick={saveGCode}
                                className="py-3 bg-black border border-gray-700 hover:border-miami-cyan text-gray-300 hover:text-miami-cyan font-black rounded-xl text-sm transition-all">
                                💾 Save .nc
                            </button>
                            <button onClick={sendToMachine}
                                className="py-3 bg-gradient-to-r from-miami-cyan to-miami-purple text-black font-black rounded-xl text-sm shadow-[0_0_12px_rgba(0,240,255,0.2)] hover:shadow-[0_0_20px_rgba(0,240,255,0.4)] transition-all">
                                📡 Send to Machine
                            </button>
                        </div>
                    )}

                    {/* Machine-side streaming progress (polled; persists if user leaves tab) */}
                    {jobStatus && (
                        <div className="bg-black/60 border border-gray-800 rounded-xl p-3 space-y-2">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-black text-miami-cyan">
                                        {jobStatus.is_streaming ? '⚙ Machine Running…' : '✅ Job Complete'}
                                    </p>
                                    <p className="text-[10px] text-gray-500 font-mono mt-0.5 truncate max-w-[180px]">
                                        {jobStatus.job_name}
                                    </p>
                                    <p className="text-[9px] text-gray-600 font-mono mt-0.5">
                                        GCode file uploaded · backend buffering to MCU
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-lg font-black font-mono text-white">
                                        {jobStatus.lines_sent}
                                        <span className="text-xs text-gray-600"> / {jobStatus.total_lines}</span>
                                    </p>
                                    <p className="text-[9px] text-gray-600 uppercase font-bold">lines to MCU</p>
                                </div>
                            </div>

                            {/* Progress bar */}
                            <div className="bg-gray-900 rounded-full overflow-hidden h-2">
                                <div
                                    className={`h-full rounded-full transition-all duration-700 ${jobStatus.is_streaming ? 'bg-miami-cyan' : 'bg-miami-purple'}`}
                                    style={{ width: `${jobStatus.total_lines > 0 ? (jobStatus.lines_sent / jobStatus.total_lines) * 100 : 0}%` }}
                                />
                            </div>

                            {/* Cancel / dismiss */}
                            {jobStatus.is_streaming ? (
                                <button onClick={cancelJob}
                                    className="w-full py-2 bg-red-900/40 border border-red-800 hover:bg-red-800/60 text-red-400 font-black rounded-xl text-xs transition-all">
                                    ⛔ Cancel Job (sends soft-reset to machine)
                                </button>
                            ) : (
                                <button onClick={() => setJobStatus(null)}
                                    className="w-full py-2 bg-black border border-gray-800 text-gray-600 hover:text-gray-400 font-bold rounded-xl text-xs transition-all">
                                    Dismiss
                                </button>
                            )}
                        </div>
                    )}

                    {/* Back to design */}
                    <button onClick={() => setActiveTab('design')}
                        className="w-full py-2 text-xs text-gray-600 hover:text-gray-400 transition-colors font-bold">
                        ← Back to Design
                    </button>
                </div>
            )}
            {isGenerating && (
                <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="relative w-24 h-24 mb-6">
                        {/* Spinning Neon Ring */}
                        <div className="absolute inset-0 rounded-full border-4 border-miami-cyan/20 border-t-miami-cyan animate-spin shadow-[0_0_15px_rgba(0,240,255,0.4)]" />
                        {/* Pulsing Beam */}
                        <div className="absolute inset-4 rounded-full bg-miami-pink/20 animate-pulse flex items-center justify-center shadow-[0_0_30px_rgba(255,0,127,0.3)]">
                            <div className="w-1 h-12 bg-miami-pink rounded-full blur-[1px] rotate-45" />
                        </div>
                    </div>
                    <h3 className="text-miami-cyan font-black text-xl tracking-[0.2em] uppercase animate-pulse">Generating</h3>
                    <p className="text-gray-400 text-[10px] font-mono mt-2 uppercase tracking-widest text-center px-6">
                        Optimizing toolpaths &amp; power levels...
                    </p>
                </div>
            )}
        </div>
    );
};
