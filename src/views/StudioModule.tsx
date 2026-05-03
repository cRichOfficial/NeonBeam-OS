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
import { lensService } from '../services/lensService';
import type { DetectionResult } from '../types/lens';

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
    const lensApiUrl  = useAppSettingsStore(s => s.settings.lensApiUrl);
    const maxSpindleS = useAppSettingsStore(s => s.settings.maxSpindleS) || 1000;  // mirrors $30
    const { presets } = usePresetsStore();

    const { svgPaths, operations, selectedPathIds, 
            posX, posY, scalePct, rotation,
            setSvgPaths, togglePathSelect, addOperation, addFromSelection,
            updateOperation, updateParams, removeOperation,
            moveOp, removePathFromOp, clearAll: clearOps,
            setDesign, setPlacement } = useJobOperationsStore();

    // ── File / design state ──
    const [fileKind, setFileKind]   = useState<FileKind | null>(null);
    const [fileName, setFileName]   = useState('');
    const [ditherMethod, setDitherMethod] = useState<DitherMethod>('floyd-steinberg');
    const [dpi, setDpi]             = useState(() => svgDpi);
    const [selectedPreset, setSelectedPreset] = useState('');

    // ── Operation Wizard State ──
    const [wizardOpen, setWizardOpen] = useState(false);
    const [wizardStep, setWizardStep] = useState(1);
    const [editingOpId, setEditingOpId] = useState<string | null>(null);
    const [draftOp, setDraftOp] = useState<Partial<JobOperation>>({});
    
    // ── Design Wizard State ──
    const [designWizardOpen, setDesignWizardOpen] = useState(false);
    const [designWizardMode, setDesignWizardMode] = useState<'select' | 'saved' | 'new'>('select');
    const [savedImages, setSavedImages] = useState<{filename: string, url: string}[]>([]);
    const [saveToEngraver, setSaveToEngraver] = useState(false);

    // Upload state
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);

    const isMmPerSec = feedUnits === 'mm/s';
    const sPct = (s: number) => `${Math.round((s / maxSpindleS) * 100)}%`;

    // Convert opRate (mm/min — the GCode native unit) ↔ display unit
    const toDisplay      = (mmPerMin: number) => isMmPerSec ? +(mmPerMin / 60).toFixed(2) : mmPerMin;
    const toMmPerMin     = (val: number)      => isMmPerSec ? Math.round(val * 60)        : val;
    const displayRateUnit = isMmPerSec ? 'mm/s' : 'mm/min';


    // ── Tabs & GCode state ──
    const [activeTab,   setActiveTab]   = useState<StudioTab>('design');
    const [gcodeText,   setGcodeText]   = useState('');
    const [gcodeView,   setGcodeView]   = useState<GCodeView>('preview');
    const [gcodoMoves,  setGCodeMoves]  = useState<PreviewMove[]>([]);
    const [isGenerating,setIsGenerating]= useState(false);

    // ── Viewport State (Zoom & Pan) ──
    const [viewZoom,    setViewZoom]    = useState(1);
    // viewOffsetX initialized to 0 — corrected to center on first render via useEffect
    const [viewOffsetX, setViewOffsetX] = useState(0);
    const [viewOffsetY, setViewOffsetY] = useState(0);
    const viewInitialized = useRef(false);
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

    // ── Place with Lens Overlay ──
    const [showLensOverlay,    setShowLensOverlay]    = useState(false);
    const [lensDetections,     setLensDetections]     = useState<DetectionResult[]>([]);
    const [selectedDetId,      setSelectedDetId]      = useState<string | null>(null);
    const [lensAlignCenter,    setLensAlignCenter]    = useState(true);
    const [lensAutoSize,       setLensAutoSize]       = useState(true);
    const [lensMargin,         setLensMargin]         = useState(5);   // mm
    const [lensRotOffset,      setLensRotOffset]      = useState(0);   // extra °
    const [lensRotStep,        setLensRotStep]        = useState(90);  // rotation increment
    const [lensIsDetecting,    setLensIsDetecting]    = useState(false);
    const [lensZoom,           setLensZoom]           = useState(1);
    const [lensOffX,           setLensOffX]           = useState(0);   // canvas px
    const [lensOffY,           setLensOffY]           = useState(0);   // canvas px
    const lensCanvasRef = useRef<HTMLCanvasElement>(null);

    // ── Refs ──
    const canvasRef    = useRef<HTMLCanvasElement>(null);
    // Uniform scale: 1 mm maps to the same number of pixels on both axes
    const baseSc = Math.min(DW / mmW, DH / mmH);
    const scX    = baseSc * viewZoom;
    const scY    = baseSc * viewZoom;
    // Actual pixel dimensions of the plot area (may be larger than DW×DH when zoomed)
    const plotW  = scX * mmW;
    const plotH  = scY * mmH;
    // Horizontal centering offset: center the plot in the available drawable area
    const centerOffsetX = (DW - baseSc * mmW) / 2;

    const bumpRender = useCallback(() => setRenderTick(t => t + 1), []);

    const resetView = useCallback(() => {
        setViewZoom(1); setViewOffsetX(centerOffsetX); setViewOffsetY(0);
        bumpRender();
    }, [bumpRender, centerOffsetX]);

    // Center the grid on first render
    useEffect(() => {
        if (!viewInitialized.current) {
            viewInitialized.current = true;
            setViewOffsetX(centerOffsetX);
        }
    }, [centerOffsetX]);

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

    // ── Place with Lens: helpers ──

    /**
     * Compute base physical size of the loaded design at 100% scale (mm).
     * physSize() bakes in the current scalePct, so we divide it back out.
     */
    const baseMmSize = (): { w: number; h: number } => {
        const { w, h } = physSize();
        const pct = scalePct || 100;
        return { w: w / (pct / 100), h: h / (pct / 100) };
    };

    /**
     * Pure function: given a detection and the current overlay toggles,
     * return the new placement values to commit or preview.
     */
    const calcLensPlacement = useCallback((
        d: DetectionResult,
        baseW: number,
        baseH: number,
        alignCenter: boolean,
        autoSize: boolean,
        marginMm: number,
        rotOffset: number,
    ): { posX: number; posY: number; scalePct: number; rotation: number } => {
        const [bx = 0, by = 0, bw = 10, bh = 10] = d.box ?? [0, 0, 10, 10];
        const cx = d.center_x ?? (bx + bw / 2);
        const cy = d.center_y ?? (by + bh / 2);
        const detRot = d.angle_deg ?? 0;

        // Compute true oriented workpiece dimensions from corners when available.
        // The axis-aligned bbox (bw × bh) inflates dimensions for rotated objects.
        let wpW = bw, wpH = bh;
        if (d.corners && d.corners.length >= 4) {
            const c = d.corners;
            // Edge lengths of the oriented bounding box
            const edge0 = Math.hypot(c[1].x - c[0].x, c[1].y - c[0].y);
            const edge1 = Math.hypot(c[2].x - c[1].x, c[2].y - c[1].y);
            // Longer edge = width, shorter = height (conventional)
            wpW = Math.max(edge0, edge1);
            wpH = Math.min(edge0, edge1);
        }

        let newScale = scalePct;
        let newW = baseW * (newScale / 100);
        let newH = baseH * (newScale / 100);

        if (autoSize && baseW > 0 && baseH > 0) {
            const targetW = Math.max(1, wpW - 2 * marginMm);
            const targetH = Math.max(1, wpH - 2 * marginMm);
            // Uniform scale — fit within both dimensions, preserving aspect ratio
            newScale = Math.min((targetW / baseW) * 100, (targetH / baseH) * 100);
            newW = baseW * (newScale / 100);
            newH = baseH * (newScale / 100);
        }

        let newPosX = posX, newPosY = posY;
        if (alignCenter) {
            newPosX = cx - newW / 2;
            newPosY = cy - newH / 2;
        }

        return {
            posX: newPosX,
            posY: newPosY,
            scalePct: newScale,
            rotation: detRot + rotOffset,
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [posX, posY, scalePct]);

    /** Fetch detections from the Lens API and populate the overlay list. */
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

    /** Open the overlay and auto-detect immediately. */
    const openLensOverlay = useCallback(() => {
        setSelectedDetId(null);
        setLensDetections([]);
        setLensRotOffset(0);
        setLensZoom(1);
        setLensOffX(0);
        setLensOffY(0);
        setShowLensOverlay(true);
        // small delay so overlay renders before the async call
        setTimeout(runLensDetect, 80);
    }, [runLensDetect]);

    /** Handle tap on the overlay canvas — select nearest detected object, zoom to fit. */
    const handleLensCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = lensCanvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const scaleRatio = canvas.width / rect.width;
        const rawCx = (e.clientX - rect.left) * scaleRatio;
        const rawCy = (e.clientY - rect.top)  * scaleRatio;

        // Reverse the current zoom/pan transform to get logical canvas coords
        const logCx = (rawCx - lensOffX) / lensZoom;
        const logCy = (rawCy - lensOffY) / lensZoom;

        const lBaseSc = Math.min((CW - ML) / mmW, (CH - MB) / mmH);
        const lPlotW  = lBaseSc * mmW;
        const lPlotH  = lBaseSc * mmH;
        const lML     = ML + (DW - lPlotW) / 2;

        const mmX = (logCx - lML) / lBaseSc;
        const mmY = (lPlotH - logCy) / lBaseSc;

        const THRESH = 30; // mm — generous for finger taps
        let best: string | null = null;
        let bestDist = THRESH;

        for (const d of lensDetections) {
            if (d.box) {
                const [bx, by, bw, bh] = d.box;
                const dcx = bx + bw / 2, dcy = by + bh / 2;
                if (mmX >= bx - 5 && mmX <= bx + bw + 5 && mmY >= by - 5 && mmY <= by + bh + 5) {
                    const dist = Math.hypot(mmX - dcx, mmY - dcy);
                    if (dist < bestDist) { bestDist = dist; best = d.workpiece_id; }
                }
            } else if (d.points && d.points.length > 0) {
                const dcx = d.points.reduce((a, p) => a + p.x, 0) / d.points.length;
                const dcy = d.points.reduce((a, p) => a + p.y, 0) / d.points.length;
                const dist = Math.hypot(mmX - dcx, mmY - dcy);
                if (dist < bestDist) { bestDist = dist; best = d.workpiece_id; }
            }
        }

        // Tap same → deselect + reset zoom;  Tap nothing → same;  Tap new → zoom in
        if (!best || best === selectedDetId) {
            setSelectedDetId(null);
            setLensZoom(1);
            setLensOffX(0);
            setLensOffY(0);
        } else {
            setSelectedDetId(best);
            // Compute bounding extent of the object in mm
            const d = lensDetections.find(det => det.workpiece_id === best)!;
            let objCx: number, objCy: number, objW: number, objH: number;
            if (d.points && d.points.length > 0) {
                const xs = d.points.map(p => p.x);
                const ys = d.points.map(p => p.y);
                const minX = Math.min(...xs), maxX = Math.max(...xs);
                const minY = Math.min(...ys), maxY = Math.max(...ys);
                objCx = (minX + maxX) / 2;
                objCy = (minY + maxY) / 2;
                objW  = maxX - minX;
                objH  = maxY - minY;
            } else if (d.box) {
                const [bx, by, bw, bh] = d.box;
                objCx = bx + bw / 2;
                objCy = by + bh / 2;
                objW  = bw;
                objH  = bh;
            } else return;

            const padMm = 30; // mm of visual padding around the object
            const zoomW = (CW - ML) / ((objW + padMm * 2) * lBaseSc);
            const zoomH = (CH - MB) / ((objH + padMm * 2) * lBaseSc);
            const newZoom = Math.min(zoomW, zoomH, 4); // cap at 4×

            // Object center in base (unzoomed) canvas pixel coords
            const objCxPx = lML + objCx * lBaseSc;
            const objCyPx = lPlotH - objCy * lBaseSc;

            // Offset so the object center lands at the canvas center
            setLensZoom(newZoom);
            setLensOffX(CW / 2 - objCxPx * newZoom);
            setLensOffY(CH / 2 - objCyPx * newZoom);
        }
    }, [lensDetections, selectedDetId, lensZoom, lensOffX, lensOffY, mmW, mmH]);

    /** Commit the computed placement to the store and close the overlay. */
    const applyLensPlacement = useCallback(() => {
        const sel = lensDetections.find(d => d.workpiece_id === selectedDetId);
        if (!sel) return;
        const { w: baseW, h: baseH } = baseMmSize();
        const placement = calcLensPlacement(sel, baseW, baseH, lensAlignCenter, lensAutoSize, lensMargin, lensRotOffset);
        setPlacement(placement);
        bumpRender();
        setShowLensOverlay(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lensDetections, selectedDetId, lensAlignCenter, lensAutoSize, lensMargin, lensRotOffset, calcLensPlacement, bumpRender]);

    // ── Overlay canvas: grid + detections + live ghost preview ──
    useEffect(() => {
        const canvas = lensCanvasRef.current;
        if (!canvas || !showLensOverlay) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const lBaseSc = Math.min((CW - ML) / mmW, (CH - MB) / mmH);
        const lPlotW  = lBaseSc * mmW;
        const lPlotH  = lBaseSc * mmH;
        // Center the plot area horizontally
        const lML     = ML + (DW - lPlotW) / 2;

        // 1. Background (always full canvas, before zoom transform)
        ctx.fillStyle = '#080808'; ctx.fillRect(0, 0, CW, CH);

        // Apply zoom / pan transform — everything below draws in "logical" coords
        ctx.save();
        ctx.translate(lensOffX, lensOffY);
        ctx.scale(lensZoom, lensZoom);

        ctx.fillStyle = '#111111'; ctx.fillRect(lML, 0, lPlotW, lPlotH);
        ctx.strokeStyle = 'rgba(0,240,255,0.12)'; ctx.lineWidth = 1 / lensZoom;
        ctx.strokeRect(lML, 0, lPlotW, lPlotH);

        // 2. Minor grid
        ctx.beginPath(); ctx.strokeStyle = 'rgba(0,240,255,0.03)'; ctx.lineWidth = 0.5;
        for (let x = 0; x <= mmW + 1; x += minor) { const px = lML + x * lBaseSc; ctx.moveTo(px, 0); ctx.lineTo(px, lPlotH); }
        for (let y = 0; y <= mmH + 1; y += minor) { const py = lPlotH - y * lBaseSc; ctx.moveTo(lML, py); ctx.lineTo(lML + lPlotW, py); }
        ctx.stroke();

        // 3. Major grid
        ctx.beginPath(); ctx.strokeStyle = 'rgba(0,240,255,0.09)'; ctx.lineWidth = 1;
        for (let x = 0; x <= mmW; x += major) { const px = lML + x * lBaseSc; ctx.moveTo(px, 0); ctx.lineTo(px, lPlotH); }
        for (let y = 0; y <= mmH; y += major) { const py = lPlotH - y * lBaseSc; ctx.moveTo(lML, py); ctx.lineTo(lML + lPlotW, py); }
        ctx.stroke();

        // 4. Axes
        ctx.beginPath(); ctx.strokeStyle = 'rgba(0,240,255,0.2)'; ctx.lineWidth = 2;
        ctx.moveTo(lML, 0); ctx.lineTo(lML, lPlotH);
        ctx.moveTo(lML, lPlotH); ctx.lineTo(lML + lPlotW, lPlotH);
        ctx.stroke();

        // 5. Axis labels
        ctx.font = 'bold 9px ui-monospace,monospace';
        ctx.fillStyle = 'rgba(0,200,220,0.55)';
        ctx.textBaseline = 'top'; ctx.textAlign = 'center';
        for (let x = 0; x <= mmW; x += major) {
            const px = lML + x * lBaseSc;
            if (px >= lML && px <= CW) ctx.fillText(`${x}`, px, lPlotH + 3);
        }
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        for (let y = major; y <= mmH; y += major) {
            const py = lPlotH - y * lBaseSc;
            if (py >= 0 && py <= lPlotH) ctx.fillText(`${y}`, lML - 4, py);
        }

        // 6. Origin dot
        ctx.fillStyle = '#ff007f';
        ctx.beginPath(); ctx.arc(lML, lPlotH, 3, 0, Math.PI * 2); ctx.fill();

        // 7. Detected objects
        lensDetections.forEach(d => {
            const isSel = d.workpiece_id === selectedDetId;
            ctx.strokeStyle = isSel ? '#00f0ff' : 'rgba(0,240,255,0.35)';
            ctx.lineWidth   = isSel ? 2 : 1;

            // Prefer segmentation/corners outline (shows true rotated shape)
            if (d.points && d.points.length > 0) {
                ctx.beginPath();
                ctx.moveTo(lML + d.points[0].x * lBaseSc, lPlotH - d.points[0].y * lBaseSc);
                d.points.slice(1).forEach(p => ctx.lineTo(lML + p.x * lBaseSc, lPlotH - p.y * lBaseSc));
                ctx.closePath(); ctx.stroke();
                if (isSel) {
                    ctx.fillStyle = 'rgba(0,240,255,0.06)';
                    ctx.fill();
                }
            } else if (d.box) {
                // Fallback: axis-aligned bounding box
                const [bx, by, bw, bh] = d.box;
                ctx.strokeRect(lML + bx * lBaseSc, lPlotH - (by + bh) * lBaseSc, bw * lBaseSc, bh * lBaseSc);
            }

            // Crosshair at object center when selected
            if (isSel) {
                const cx = d.center_x ?? (d.box ? d.box[0] + d.box[2] / 2 : 0);
                const cy = d.center_y ?? (d.box ? d.box[1] + d.box[3] / 2 : 0);
                const ocx = lML + cx * lBaseSc;
                const ocy = lPlotH - cy * lBaseSc;
                ctx.beginPath(); ctx.strokeStyle = 'rgba(0,240,255,0.5)'; ctx.lineWidth = 1;
                ctx.moveTo(ocx - 6, ocy); ctx.lineTo(ocx + 6, ocy);
                ctx.moveTo(ocx, ocy - 6); ctx.lineTo(ocx, ocy + 6);
                ctx.stroke();
            }

            // label
            ctx.fillStyle = isSel ? '#00f0ff' : 'rgba(0,240,255,0.5)';
            ctx.font = '8px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
            const lx = d.box ? d.box[0] : (d.points?.[0].x ?? 0);
            const ly = d.box ? d.box[1] + d.box[3] : (d.points?.[0].y ?? 0);
            ctx.fillText(d.label || d.workpiece_id, lML + lx * lBaseSc + 2, lPlotH - ly * lBaseSc - 2);
        });

        // 8. Ghost image preview
        const sel = lensDetections.find(d => d.workpiece_id === selectedDetId);
        if (sel && fileKind) {
            const { w: baseW, h: baseH } = baseMmSize();
            const placement = calcLensPlacement(sel, baseW, baseH, lensAlignCenter, lensAutoSize, lensMargin, lensRotOffset);
            const gW = baseW * (placement.scalePct / 100);
            const gH = baseH * (placement.scalePct / 100);
            // center of ghost in canvas pixels
            const gcx_mm = placement.posX + gW / 2;
            const gcy_mm = placement.posY + gH / 2;
            const gcx_px = lML + gcx_mm * lBaseSc;
            const gcy_px = lPlotH - gcy_mm * lBaseSc;
            const gWpx = gW * lBaseSc;
            const gHpx = gH * lBaseSc;

            ctx.save();
            ctx.translate(gcx_px, gcy_px);
            ctx.rotate(placement.rotation * Math.PI / 180); // positive = CCW in machine coords
            ctx.fillStyle   = 'rgba(0,240,255,0.12)';
            ctx.strokeStyle = '#00f0ff';
            ctx.lineWidth   = 1.5;
            ctx.setLineDash([4, 3]);
            ctx.fillRect(-gWpx / 2, -gHpx / 2, gWpx, gHpx);
            ctx.strokeRect(-gWpx / 2, -gHpx / 2, gWpx, gHpx);
            ctx.setLineDash([]);
            // center crosshair
            ctx.strokeStyle = 'rgba(0,240,255,0.8)'; ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(-8, 0); ctx.lineTo(8, 0);
            ctx.moveTo(0, -8); ctx.lineTo(0, 8);
            ctx.stroke();
            // rotation tick
            if (placement.rotation !== 0) {
                ctx.strokeStyle = 'rgba(255,200,0,0.8)'; ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -gHpx / 2 - 6); ctx.stroke();
                ctx.fillStyle = 'rgba(255,200,0,0.9)';
                ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
                ctx.fillText(`${placement.rotation.toFixed(0)}°`, 0, -gHpx / 2 - 8);
            }
            ctx.restore();
        }

        // Restore zoom transform
        ctx.restore();

    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lensDetections, selectedDetId, lensAlignCenter, lensAutoSize, lensMargin, lensRotOffset, showLensOverlay, lensZoom, lensOffX, lensOffY, mmW, mmH, major, minor, fileKind]);

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

            // Apply rotation around the image center
            const rotRad = rotation * Math.PI / 180;
            const imgCxPx = dxPx + dwPx / 2;
            const imgCyPx = dyPx + dhPx / 2;

            if (activeTab === 'gcode') {
                // Faint design background for context
                ctx.globalAlpha = 0.18;
                ctx.save();
                ctx.translate(imgCxPx, imgCyPx);
                ctx.rotate(rotRad);
                if (fileKind === 'bitmap' && ditheredRef.current) ctx.drawImage(ditheredRef.current, -dwPx / 2, -dhPx / 2, dwPx, dhPx);
                else ctx.drawImage(img, -dwPx / 2, -dhPx / 2, dwPx, dhPx);
                ctx.restore();
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
                // Design preview — apply rotation around image center
                ctx.save();
                ctx.translate(imgCxPx, imgCyPx);
                ctx.rotate(rotRad);

                if (fileKind === 'svg') {
                    // Dark gray artboard backing so black strokes/fills are visible
                    ctx.fillStyle = '#2a2a2a';
                    ctx.fillRect(-dwPx / 2, -dhPx / 2, dwPx, dhPx);

                    ctx.globalAlpha = 0.88;
                    ctx.drawImage(img, -dwPx / 2, -dhPx / 2, dwPx, dhPx);
                    ctx.globalAlpha = 1;
                    // Dashed artboard boundary — SVG document page extents (not a cut line)
                    const hasCut  = operations.some(o => o.opType === 'cut');
                    const hasFill = operations.some(o => o.opType === 'fill');
                    ctx.strokeStyle = hasCut ? 'rgba(255,0,127,0.5)' : hasFill ? 'rgba(112,0,255,0.5)' : 'rgba(100,100,100,0.35)';
                    ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
                    ctx.strokeRect(-dwPx / 2, -dhPx / 2, dwPx, dhPx); ctx.setLineDash([]);
                    // Label
                    ctx.font = '7px ui-monospace,monospace';
                    ctx.fillStyle = 'rgba(200,100,160,0.55)';
                    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
                    ctx.fillText('SVG artboard', -dwPx / 2 + 3, -dhPx / 2 - 2);

                } else {
                    const drawSrc = ditheredRef.current ?? img;
                    // White backing mat so transparent areas read as "no burn", not dark canvas
                    ctx.fillStyle = '#ffffff';
                    ctx.globalAlpha = 0.92;
                    ctx.fillRect(-dwPx / 2, -dhPx / 2, dwPx, dhPx);
                    ctx.globalAlpha = 0.9; ctx.imageSmoothingEnabled = false;
                    ctx.drawImage(drawSrc, -dwPx / 2, -dhPx / 2, dwPx, dhPx);
                    ctx.imageSmoothingEnabled = true; ctx.globalAlpha = 1;
                    ctx.strokeStyle = 'rgba(0,240,255,0.55)'; ctx.lineWidth = 1;
                    ctx.setLineDash([4,3]); ctx.strokeRect(-dwPx / 2, -dhPx / 2, dwPx, dhPx); ctx.setLineDash([]);
                }

                ctx.restore();
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

    }, [renderTick, mmW, mmH, scX, scY, plotW, plotH, major, minor, fileKind, posX, posY, scalePct, rotation, operations, dpi, activeTab, gcodoMoves, viewZoom, viewOffsetX, viewOffsetY]);


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
                setDesign('svg', text, file.name);
                // Parse SVG paths for the layer panel (async-safe: runs after img loads)
                const discovered = parseSvgPaths(text);
                clearOps();
                setSvgPaths(discovered);
                const blob = new Blob([text], { type: 'image/svg+xml;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const img = new Image();
                img.onload = () => { designImgRef.current = img; setFileKind('svg'); bumpRender(); };
                img.src = url;
            };
            reader.readAsText(file);
        } else {
            reader.onload = e => {
                const url = e.target?.result as string;
                setDesign('bitmap', url, file.name);
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
                    setFileKind('bitmap');
                    bumpRender();
                };
                img.src = url;
            };
            reader.readAsDataURL(file);
        }
    }, [svgDpi, bitmapDpi, bumpRender]);


    // ── Preset filter (by file type) ──
    const filteredPresets = presets.filter(p => {
        if (!fileKind) return false;
        if (fileKind === 'bitmap') return p.opType === 'Engrave' || p.opType === 'Fill';
        // SVG: show fill presets if any op is fill, else cut/score
        const hasFillOp = operations.some(o => o.opType === 'fill');
        if (hasFillOp) return p.opType === 'Fill' || p.opType === 'Engrave';
        return p.opType === 'Cut' || p.opType === 'Score';
    });


    const generateGCode = useCallback(async () => {
        if (!fileKind || !designImgRef.current) return;
        
        // Ensure we have at least one operation
        if (operations.length === 0) {
            alert('Add at least one laser operation before generating GCode.');
            return;
        }

        setIsGenerating(true);

        try {
            // Allow UI to render the overlay before starting heavy work
            await new Promise(r => setTimeout(r, 100));

            const { w: widthMm, h: heightMm } = physSize();
            
            const gcode = generateMultiOpGCode({
                svgText: svgTextRef.current || '',
                operations,
                posX,
                posY,
                widthMm,
                heightMm,
                rotation,
                rasterCanvas: ditheredRef.current || srcCanvasRef.current || undefined
            });

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
    }, [fileKind, posX, posY, scalePct, rotation, dpi, operations, ditherMethod]);

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

        setIsUploading(true);
        setUploadProgress(0);

        try {
            const res = await axios.post(`${coreApiUrl}/api/gcode/upload`, form, {
                headers: { 'Content-Type': 'multipart/form-data' },
                onUploadProgress: (progressEvent) => {
                    const percentCompleted = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 1));
                    setUploadProgress(percentCompleted);
                }
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
        } finally {
            setIsUploading(false);
            setUploadProgress(0);
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
    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0]; 
        if (f) {
            if (saveToEngraver) {
                const form = new FormData();
                form.append('file', f);
                try {
                    await axios.post('/api/images/upload', form, {
                        headers: { 'Content-Type': 'multipart/form-data' }
                    });
                } catch (err) {
                    console.error('Failed to save to engraver', err);
                }
            }
            loadFile(f); 
            setDesignWizardOpen(false);
        }
        e.target.value = '';
    };

    const openDesignWizard = () => {
        setDesignWizardMode('select');
        setDesignWizardOpen(true);
    };

    const fetchSavedImages = async () => {
        try {
            const res = await axios.get('/api/images');
            setSavedImages(res.data);
            setDesignWizardMode('saved');
        } catch (err) {
            console.error('Failed to fetch saved images', err);
            alert('Failed to reach the image server.');
        }
    };

    const loadSavedImage = async (filename: string, url: string) => {
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error('Network error');
            const blob = await res.blob();
            const file = new File([blob], filename, { type: res.headers.get('content-type') || 'image/png' });
            loadFile(file);
            setDesignWizardOpen(false);
        } catch (err) {
            console.error('Failed to load image', err);
            alert('Failed to load the image.');
        }
    };
    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault(); setIsDragOver(false); const f = e.dataTransfer.files[0]; if (f) loadFile(f);
    };
    const clearDesign = () => {
        designImgRef.current = null; srcCanvasRef.current = null; ditheredRef.current = null; svgTextRef.current = '';
        setFileKind(null); setFileName('');
        setGcodeText(''); setGCodeMoves([]); setActiveTab('design'); setSelectedPreset('');
        clearOps(); bumpRender();
    };

    const { w: physW, h: physH, units: physUnits } = physSize();

    // ── Operation Wizard Helpers ──
    const openWizard = (op?: JobOperation) => {
        if (op) {
            setEditingOpId(op.id);
            setDraftOp({ ...op });
            // For SVG, allow re-selecting paths. For Raster, go straight to settings.
            setWizardStep(op.opType === 'raster' ? 3 : 2);
        } else {
            setEditingOpId(null);
            const defaultType = fileKind === 'bitmap' ? 'raster' : 'cut';
            setDraftOp({
                opType: defaultType,
                pathIds: [],
                name: '',
                params: {
                    power: 850, minPower: 0, rate: 1500, passes: 1,
                    airAssist: false, margin: 0, lineDistance: 0.1, lineAngle: 0
                }
            });
            // If bitmap, only one type exists, so skip step 1
            setWizardStep(fileKind === 'bitmap' ? 3 : 1);
        }
        setWizardOpen(true);
    };

    const saveWizard = () => {
        if (!draftOp.opType) return;
        if (draftOp.opType !== 'raster' && (!draftOp.pathIds || draftOp.pathIds.length === 0)) {
            alert('Please select at least one path.');
            return;
        }

        const finalOp = {
            ...draftOp,
            name: draftOp.name || `${draftOp.opType.charAt(0).toUpperCase() + draftOp.opType.slice(1)} ${operations.length + 1}`
        } as JobOperation;

        if (editingOpId) {
            updateOperation(editingOpId, finalOp);
        } else {
            addOperation(finalOp);
        }
        setWizardOpen(false);
    };

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col h-full bg-black/10">
            
            {/* ── DESIGN WIZARD MODAL ── */}
            {designWizardOpen && (
                <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
                    <div className="w-full max-w-lg bg-[#0c0c14] border-t sm:border border-gray-800 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in slide-in-from-bottom duration-300">
                        {/* Header */}
                        <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between bg-black/40">
                            <h3 className="text-miami-pink font-black text-sm uppercase tracking-widest">
                                Load Design
                            </h3>
                            <button onClick={() => setDesignWizardOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-900 text-gray-500 hover:text-white transition-colors">✕</button>
                        </div>

                        {/* Step Content */}
                        <div className="flex-1 overflow-y-auto p-6 min-h-[40vh]">
                            {designWizardMode === 'select' && (
                                <div className="space-y-4">
                                    <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mb-4">Select Source</p>
                                    <div className="grid grid-cols-1 gap-3">
                                        <button 
                                            onClick={fetchSavedImages}
                                            className="p-4 rounded-2xl border-2 text-left transition-all flex items-center gap-4 bg-black/40 border-gray-800 hover:border-miami-cyan"
                                        >
                                            <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl bg-miami-cyan/20 text-miami-cyan">
                                                📂
                                            </div>
                                            <div>
                                                <span className="block font-black text-white capitalize">Start with an existing design</span>
                                                <span className="block text-[10px] text-gray-500 mt-0.5">
                                                    Load an image previously saved to the engraver
                                                </span>
                                            </div>
                                        </button>

                                        <button 
                                            onClick={() => setDesignWizardMode('new')}
                                            className="p-4 rounded-2xl border-2 text-left transition-all flex items-center gap-4 bg-black/40 border-gray-800 hover:border-miami-pink"
                                        >
                                            <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl bg-miami-pink/20 text-miami-pink">
                                                ✨
                                            </div>
                                            <div>
                                                <span className="block font-black text-white capitalize">Start with a new design</span>
                                                <span className="block text-[10px] text-gray-500 mt-0.5">
                                                    Select an image from your device
                                                </span>
                                            </div>
                                        </button>
                                    </div>
                                </div>
                            )}

                            {designWizardMode === 'saved' && (
                                <div className="space-y-4">
                                    <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mb-4">Saved Images ({savedImages.length})</p>
                                    {savedImages.length === 0 ? (
                                        <div className="text-center py-8">
                                            <p className="text-xs text-gray-500">No images saved to the engraver.</p>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 gap-2 max-h-[40vh] overflow-y-auto pr-2">
                                            {savedImages.map(img => (
                                                <button key={img.filename} 
                                                    onClick={() => loadSavedImage(img.filename, img.url)}
                                                    className="w-full flex items-center gap-3 p-3 rounded-xl border transition-all bg-black/20 border-gray-800 hover:border-miami-cyan"
                                                >
                                                    <div className="w-10 h-10 rounded-lg bg-gray-900 flex items-center justify-center overflow-hidden">
                                                        <img src={img.url} alt={img.filename} className="w-full h-full object-cover opacity-80" />
                                                    </div>
                                                    <div className="flex flex-col min-w-0 flex-1 text-left">
                                                        <span className="text-xs text-white font-bold truncate">{img.filename}</span>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {designWizardMode === 'new' && (
                                <div className="space-y-6">
                                    <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mb-4">Upload Design</p>
                                    
                                    <div className="bg-black/40 border border-gray-800 rounded-2xl p-6 text-center">
                                        <div className="text-4xl mb-4">📁</div>
                                        <p className="text-sm text-gray-400 mb-6">Select an SVG, PNG, JPG, BMP, or WebP</p>
                                        
                                        <div 
                                            className="flex items-center justify-center gap-3 mb-6 cursor-pointer"
                                            onClick={() => setSaveToEngraver(!saveToEngraver)}
                                        >
                                            <div className={`w-10 h-5 flex items-center rounded-full p-1 transition-colors ${saveToEngraver ? 'bg-miami-pink' : 'bg-gray-800'}`}>
                                                <div className={`w-3.5 h-3.5 bg-white rounded-full shadow-sm transition-transform duration-200 ${saveToEngraver ? 'translate-x-4' : 'translate-x-0'}`} />
                                            </div>
                                            <span className="text-xs text-gray-300 font-bold select-none">💾 Save copy to engraver</span>
                                        </div>

                                        <button 
                                            onClick={() => fileInputRef.current?.click()}
                                            className="px-6 py-3 bg-miami-pink text-black font-black rounded-xl shadow-[0_0_15px_rgba(255,0,127,0.3)] hover:scale-105 active:scale-95 transition-all w-full"
                                        >
                                            Choose File
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        {designWizardMode !== 'select' && (
                            <div className="p-6 border-t border-gray-800 bg-black/40 flex gap-3">
                                <button onClick={() => setDesignWizardMode('select')} className="px-6 py-4 bg-gray-900 text-white font-black rounded-2xl border border-gray-700 active:scale-95 transition-all">Back</button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── OPERATION WIZARD MODAL ── */}
            {wizardOpen && (
                <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
                    <div className="w-full max-w-lg bg-[#0c0c14] border-t sm:border border-gray-800 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in slide-in-from-bottom duration-300">
                        {/* Header */}
                        <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between bg-black/40">
                            <div>
                                <h3 className="text-miami-cyan font-black text-sm uppercase tracking-widest">
                                    {editingOpId ? 'Edit Operation' : 'New Operation'}
                                </h3>
                                <div className="flex gap-1 mt-1">
                                    {[1, 2, 3].map(s => (
                                        <div key={s} className={`h-1 w-8 rounded-full transition-colors ${wizardStep >= s ? 'bg-miami-cyan' : 'bg-gray-800'}`} />
                                    ))}
                                </div>
                            </div>
                            <button onClick={() => setWizardOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-900 text-gray-500 hover:text-white transition-colors">✕</button>
                        </div>

                        {/* Step Content */}
                        <div className="flex-1 overflow-y-auto p-6">
                            
                            {/* STEP 1: TYPE SELECTION */}
                            {wizardStep === 1 && (
                                <div className="space-y-4">
                                    <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mb-4">Select Operation Type</p>
                                    <div className="grid grid-cols-1 gap-3">
                                        {(fileKind === 'svg' ? (['cut', 'fill'] as LayerOp[]) : (['raster'] as LayerOp[])).map(type => (
                                            <button 
                                                key={type}
                                                onClick={() => { setDraftOp({ ...draftOp, opType: type }); setWizardStep(type === 'raster' ? 3 : 2); }}
                                                className={`p-4 rounded-2xl border-2 text-left transition-all flex items-center gap-4 ${
                                                    draftOp.opType === type 
                                                        ? 'bg-miami-cyan/10 border-miami-cyan shadow-[0_0_15px_rgba(0,240,255,0.1)]' 
                                                        : 'bg-black/40 border-gray-800 hover:border-gray-600'
                                                }`}
                                            >
                                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${
                                                    type === 'cut' ? 'bg-miami-pink/20 text-miami-pink' : 
                                                    type === 'fill' ? 'bg-miami-purple/20 text-miami-purple' : 
                                                    'bg-miami-cyan/20 text-miami-cyan'
                                                }`}>
                                                    {type === 'cut' ? '✂' : type === 'fill' ? '▧' : '🖼️'}
                                                </div>
                                                <div>
                                                    <span className="block font-black text-white capitalize">{type}</span>
                                                    <span className="block text-[10px] text-gray-500 mt-0.5">
                                                        {type === 'cut' ? 'Trace paths with laser' : 
                                                         type === 'fill' ? 'Fill enclosed areas with hatch' : 
                                                         'Engrave bitmap image'}
                                                    </span>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* STEP 2: SOURCE SELECTION (SVG Only) */}
                            {wizardStep === 2 && (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between mb-4">
                                        <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Select Paths ({draftOp.pathIds?.length || 0})</p>
                                        <div className="flex gap-2">
                                            <button onClick={() => setDraftOp({ ...draftOp, pathIds: svgPaths.map(p => p.id) })} className="text-[9px] text-miami-cyan font-bold uppercase">All</button>
                                            <button onClick={() => setDraftOp({ ...draftOp, pathIds: [] })} className="text-[9px] text-gray-600 font-bold uppercase">None</button>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 gap-2 max-h-[40vh] overflow-y-auto pr-2">
                                        {svgPaths.map(path => {
                                            const isSelected = draftOp.pathIds?.includes(path.id);
                                            return (
                                                <button key={path.id} 
                                                    onClick={() => {
                                                        const ids = draftOp.pathIds || [];
                                                        setDraftOp({ ...draftOp, pathIds: isSelected ? ids.filter(x => x !== path.id) : [...ids, path.id] });
                                                    }}
                                                    className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all ${
                                                        isSelected ? 'bg-miami-cyan/10 border-miami-cyan/50' : 'bg-black/20 border-gray-800'
                                                    }`}
                                                >
                                                    <div className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${isSelected ? 'bg-miami-cyan border-miami-cyan text-black' : 'border-gray-700'}`}>
                                                        {isSelected && <span className="text-[10px]">✓</span>}
                                                    </div>
                                                    <div className="flex flex-col min-w-0">
                                                        <span className="text-xs text-white font-bold truncate">{path.label}</span>
                                                        <div className="flex gap-1 mt-1">
                                                            {path.strokeColor && <div className="w-2 h-2 rounded-full" style={{ background: path.strokeColor }} />}
                                                            {path.fillColor && <div className="w-2 h-2 rounded-full border border-white/20" style={{ background: path.fillColor }} />}
                                                        </div>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* STEP 3: SETTINGS */}
                            {wizardStep === 3 && (
                                <div className="space-y-6">
                                    <div className="bg-black/40 border border-gray-800 rounded-2xl p-4 space-y-4">
                                        <div className="flex items-center justify-between">
                                            <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Laser Settings</p>
                                            <select 
                                                value={''} 
                                                onChange={e => {
                                                    const p = presets.find(x => x.id === e.target.value);
                                                    if (p && draftOp.params) {
                                                        setDraftOp({ ...draftOp, params: { ...draftOp.params, power: p.power, rate: p.rate, passes: p.passes, airAssist: p.airAssist, lineDistance: p.lineDistance } });
                                                    }
                                                }}
                                                className="bg-black border border-gray-700 rounded-lg px-2 py-1 text-[10px] text-gray-400 outline-none"
                                            >
                                                <option value="">Apply Preset…</option>
                                                {filteredPresets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                            </select>
                                        </div>

                                        {/* Power */}
                                        <div>
                                            <div className="flex justify-between mb-2">
                                                <label className="text-[10px] text-gray-400 uppercase font-bold">Power</label>
                                                <span className="text-xs font-black text-miami-pink font-mono">{sPct(draftOp.params?.power || 0)}</span>
                                            </div>
                                            <input type="range" min={0} max={maxSpindleS} value={draftOp.params?.power || 0}
                                                onChange={e => setDraftOp({ ...draftOp, params: { ...draftOp.params!, power: Number(e.target.value) } })}
                                                className="w-full accent-miami-pink" />
                                        </div>

                                        {/* Min Power for Raster */}
                                        {draftOp.opType === 'raster' && (
                                            <div>
                                                <div className="flex justify-between mb-2">
                                                    <label className="text-[10px] text-gray-400 uppercase font-bold">Min Power (Shadows)</label>
                                                    <span className="text-xs font-black text-miami-purple font-mono">{sPct(draftOp.params?.minPower || 0)}</span>
                                                </div>
                                                <input type="range" min={0} max={maxSpindleS} value={draftOp.params?.minPower || 0}
                                                    onChange={e => setDraftOp({ ...draftOp, params: { ...draftOp.params!, minPower: Number(e.target.value) } })}
                                                    className="w-full accent-miami-purple" />
                                            </div>
                                        )}

                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-[10px] text-gray-400 mb-2 uppercase font-bold">Feed ({displayRateUnit})</label>
                                                <NumericInput 
                                                    value={toDisplay(draftOp.params?.rate || 1500)}
                                                    onChange={val => setDraftOp({ ...draftOp, params: { ...draftOp.params!, rate: toMmPerMin(val) } })}
                                                    className="w-full bg-black border border-gray-700 rounded-xl p-3 text-white text-sm font-mono"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] text-gray-400 mb-2 uppercase font-bold">Passes</label>
                                                <NumericInput 
                                                    value={draftOp.params?.passes || 1}
                                                    onChange={val => setDraftOp({ ...draftOp, params: { ...draftOp.params!, passes: val } })}
                                                    className="w-full bg-black border border-gray-700 rounded-xl p-3 text-white text-sm font-mono"
                                                />
                                            </div>
                                        </div>

                                        {(draftOp.opType === 'fill' || draftOp.opType === 'raster') && (
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-[10px] text-gray-400 mb-2 uppercase font-bold">Line Dist (mm)</label>
                                                    <NumericInput 
                                                        value={draftOp.params?.lineDistance || 0.1}
                                                        onChange={val => setDraftOp({ ...draftOp, params: { ...draftOp.params!, lineDistance: val } })}
                                                        className="w-full bg-black border border-gray-700 rounded-xl p-3 text-white text-sm font-mono"
                                                    />
                                                </div>
                                                {draftOp.opType === 'raster' && (
                                                    <div>
                                                        <label className="block text-[10px] text-gray-400 mb-2 uppercase font-bold">Margin (mm)</label>
                                                        <NumericInput 
                                                            value={draftOp.params?.margin || 0}
                                                            onChange={val => setDraftOp({ ...draftOp, params: { ...draftOp.params!, margin: val } })}
                                                            className="w-full bg-black border border-gray-700 rounded-xl p-3 text-white text-sm font-mono"
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        <button 
                                            onClick={() => setDraftOp({ ...draftOp, params: { ...draftOp.params!, airAssist: !draftOp.params?.airAssist } })}
                                            className={`w-full py-3 rounded-xl text-xs font-black border transition-all ${draftOp.params?.airAssist ? 'bg-miami-cyan text-black border-miami-cyan' : 'bg-black text-gray-500 border-gray-700'}`}
                                        >
                                            {draftOp.params?.airAssist ? '💨 Air Assist ON' : '— Air Assist OFF'}
                                        </button>
                                    </div>
                                    
                                    <div>
                                        <label className="block text-[10px] text-gray-500 mb-2 uppercase font-bold tracking-widest">Op Name</label>
                                        <input 
                                            value={draftOp.name || ''}
                                            onChange={e => setDraftOp({ ...draftOp, name: e.target.value })}
                                            placeholder={`Op ${operations.length + 1}`}
                                            className="w-full bg-black border border-gray-800 rounded-xl p-3 text-white text-sm font-bold outline-none focus:border-miami-cyan transition-colors"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="p-6 border-t border-gray-800 bg-black/40 flex gap-3">
                            {wizardStep > 1 && (
                                <button onClick={() => setWizardStep(v => v - 1)} className="px-6 py-4 bg-gray-900 text-white font-black rounded-2xl border border-gray-700 active:scale-95 transition-all">Back</button>
                            )}
                            {wizardStep < 3 && draftOp.opType !== 'raster' ? (
                                <button 
                                    onClick={() => setWizardStep(v => v + 1)} 
                                    disabled={wizardStep === 2 && (!draftOp.pathIds || draftOp.pathIds.length === 0)}
                                    className="flex-1 py-4 bg-miami-cyan text-black font-black rounded-2xl shadow-[0_0_15px_rgba(0,240,255,0.2)] disabled:opacity-30 active:scale-95 transition-all"
                                >
                                    Next Step
                                </button>
                            ) : (
                                <button onClick={saveWizard} className="flex-1 py-4 bg-gradient-to-r from-miami-pink to-miami-purple text-white font-black rounded-2xl shadow-[0_0_15px_rgba(255,0,127,0.3)] active:scale-95 transition-all">
                                    {editingOpId ? 'Save Changes' : 'Add Operation'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

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
                        <button onClick={openDesignWizard}
                            className="w-full py-4 bg-miami-pink/10 border border-miami-pink/30 text-miami-pink font-black rounded-xl hover:border-miami-pink hover:bg-miami-pink/20 hover:shadow-[0_0_15px_rgba(255,0,127,0.15)] transition-all text-sm select-none active:scale-[0.98]">
                            🎨 Load Design
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

                    {/* ── JOB OPERATIONS ── */}
                    {fileKind && (
                        <div className="bg-black/40 border border-gray-800 rounded-xl p-3">
                            <div className="flex items-center justify-between mb-3">
                                <p className="text-[10px] uppercase text-gray-400 font-bold tracking-widest">Job Operations ({operations.length})</p>
                                <button 
                                    onClick={() => openWizard()}
                                    className="px-3 py-1.5 bg-miami-cyan/10 border border-miami-cyan/40 text-miami-cyan hover:bg-miami-cyan/20 rounded-lg text-[10px] font-black transition-all"
                                >
                                    + Add Operation
                                </button>
                            </div>

                            {operations.length === 0 ? (
                                <div className="text-center py-8 border-2 border-dashed border-gray-800 rounded-xl">
                                    <p className="text-xs text-gray-600 font-bold">No operations added yet</p>
                                    <button onClick={() => openWizard()} className="mt-2 text-[10px] text-miami-cyan font-black uppercase">Create First Op</button>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {operations.map((op, idx) => (
                                        <div key={op.id} className="bg-black/40 border border-gray-800 rounded-xl overflow-hidden group">
                                            <div className="flex items-center gap-3 p-3">
                                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm ${
                                                    op.opType === 'cut' ? 'bg-miami-pink/20 text-miami-pink' : 
                                                    op.opType === 'fill' ? 'bg-miami-purple/20 text-miami-purple' : 
                                                    'bg-miami-cyan/20 text-miami-cyan'
                                                }`}>
                                                    {op.opType === 'cut' ? '✂' : op.opType === 'fill' ? '▧' : '🖼️'}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] font-black text-gray-600">#{idx + 1}</span>
                                                        <span className="text-xs font-bold text-white truncate">{op.name}</span>
                                                    </div>
                                                    <p className="text-[9px] text-gray-500 font-mono mt-0.5">
                                                        {op.opType.toUpperCase()} · {op.params.power}S · {toDisplay(op.params.rate)} {displayRateUnit}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => moveOp(op.id, 'up')} disabled={idx === 0} className="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-900 text-gray-400 hover:text-white disabled:opacity-20 transition-all">↑</button>
                                                    <button onClick={() => moveOp(op.id, 'down')} disabled={idx === operations.length - 1} className="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-900 text-gray-400 hover:text-white disabled:opacity-20 transition-all">↓</button>
                                                </div>
                                                <button 
                                                    onClick={() => openWizard(op)}
                                                    className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-[10px] font-black transition-all"
                                                >
                                                    Edit
                                                </button>
                                                <button onClick={() => removeOperation(op.id)} className="w-8 h-8 flex items-center justify-center text-gray-600 hover:text-red-400 transition-colors">🗑</button>
                                            </div>
                                            {op.opType !== 'raster' && (
                                                <div className="px-3 pb-3 flex flex-wrap gap-1">
                                                    {op.pathIds.slice(0, 3).map(pid => (
                                                        <span key={pid} className="text-[8px] bg-black/40 border border-gray-800 rounded px-1.5 py-0.5 font-mono text-gray-500">{pid}</span>
                                                    ))}
                                                    {op.pathIds.length > 3 && <span className="text-[8px] text-gray-600 font-bold">+{op.pathIds.length - 3} more</span>}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Position, Scale & DPI */}
                    {fileKind && (
                        <div className="bg-black/40 border border-gray-800 rounded-xl p-3">
                            <p className="text-[10px] uppercase text-gray-400 font-bold tracking-widest mb-2.5">Position, Scale &amp; DPI</p>
                            <div className="grid grid-cols-3 gap-2 mb-3">
                                {[
                                    { label: 'X (mm)',  value: posX,     min: undefined, max: mmW, step: 1, set: (v: number) => setPlacement({ posX: v }) },
                                    { label: 'Y (mm)',  value: posY,     min: undefined, max: mmH, step: 1, set: (v: number) => setPlacement({ posY: v }) },
                                    { label: 'Scale %', value: scalePct, min: 1, max: 500, step: 5, set: (v: number) => setPlacement({ scalePct: v }) },
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
                            {/* Place with Lens — only shown when Lens module is configured */}
                            {lensApiUrl && (
                                <button
                                    id="place-with-lens-btn"
                                    onClick={openLensOverlay}
                                    className="mt-3 w-full py-3 flex items-center justify-center gap-2 bg-gradient-to-r from-miami-cyan/20 to-miami-purple/20 border border-miami-cyan/40 hover:border-miami-cyan text-miami-cyan font-black rounded-xl text-sm transition-all active:scale-[0.97] shadow-[0_0_10px_rgba(0,240,255,0.08)] hover:shadow-[0_0_18px_rgba(0,240,255,0.2)]"
                                >
                                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.2"/>
                                        <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.2"/>
                                        <line x1="8" y1="1" x2="8" y2="3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                                        <line x1="8" y1="12.5" x2="8" y2="15" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                                        <line x1="1" y1="8" x2="3.5" y2="8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                                        <line x1="12.5" y1="8" x2="15" y2="8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                                    </svg>
                                    Place with Lens
                                </button>
                            )}
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
                            {isUploading ? (
                                <div className="py-3 bg-black border border-miami-cyan text-miami-cyan font-black rounded-xl text-sm transition-all text-center flex flex-col justify-center relative overflow-hidden">
                                    <div className="absolute left-0 top-0 bottom-0 bg-miami-cyan/20 transition-all" style={{ width: `${uploadProgress}%` }} />
                                    <span className="relative z-10 flex justify-center items-center gap-2">
                                        <div className="w-3 h-3 rounded-full border-2 border-miami-cyan border-t-transparent animate-spin" />
                                        {uploadProgress}%
                                    </span>
                                </div>
                            ) : (
                                <button onClick={sendToMachine}
                                    className="py-3 bg-gradient-to-r from-miami-cyan to-miami-purple text-black font-black rounded-xl text-sm shadow-[0_0_12px_rgba(0,240,255,0.2)] hover:shadow-[0_0_20px_rgba(0,240,255,0.4)] transition-all">
                                    📡 Send to Machine
                                </button>
                            )}
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

            {/* ── PLACE WITH LENS OVERLAY ── */}
            {showLensOverlay && (
                <div className="fixed inset-0 z-[200] flex flex-col bg-[#070712] overflow-hidden">

                    {/* ── Header ── */}
                    <div className="flex-shrink-0 h-14 flex items-center gap-3 px-4 bg-black/80 border-b border-gray-800 backdrop-blur-xl">
                        <button
                            id="lens-overlay-close-btn"
                            onClick={() => setShowLensOverlay(false)}
                            className="flex items-center justify-center w-10 h-10 rounded-xl bg-white/5 border border-gray-700 text-gray-300 active:scale-95 transition-all"
                        >
                            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M11 4L6 9L11 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </button>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-black text-miami-cyan tracking-tight">Place with Lens</p>
                            <p className="text-[10px] text-gray-500 font-mono">
                                {lensDetections.length > 0
                                    ? `${lensDetections.length} object${lensDetections.length !== 1 ? 's' : ''} detected — tap to select`
                                    : 'Tap ↻ to detect objects'}
                            </p>
                        </div>
                        <button
                            id="lens-overlay-refresh-btn"
                            onClick={runLensDetect}
                            disabled={lensIsDetecting}
                            className="flex items-center justify-center w-10 h-10 rounded-xl bg-miami-cyan/10 border border-miami-cyan/30 text-miami-cyan disabled:opacity-40 active:scale-95 transition-all"
                        >
                            {lensIsDetecting
                                ? <div className="w-4 h-4 rounded-full border-2 border-miami-cyan border-t-transparent animate-spin"/>
                                : <span className="text-lg leading-none">↻</span>}
                        </button>
                    </div>

                    {/* ── Scrollable body ── */}
                    <div className="flex-1 overflow-y-auto overscroll-contain">

                        {/* Canvas */}
                        <div className="flex-shrink-0 bg-black/60 px-2 pt-2 pb-1">
                            <canvas
                                ref={lensCanvasRef}
                                id="lens-overlay-canvas"
                                width={CW}
                                height={CH}
                                className="w-full rounded-xl cursor-crosshair touch-manipulation"
                                onClick={handleLensCanvasClick}
                            />
                            {lensIsDetecting && lensDetections.length === 0 && (
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                    <span className="text-miami-cyan text-xs font-black animate-pulse uppercase tracking-widest">Detecting…</span>
                                </div>
                            )}
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
                        <div className="px-4 pb-4 space-y-3">

                            {/* Align Center toggle */}
                            <div className="flex flex-col gap-1.5">
                                <span className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Align Center</span>
                                <div className="flex bg-black/60 p-1 rounded-xl border border-gray-800 gap-1">
                                    <button
                                        id="lens-align-on-btn"
                                        onClick={() => setLensAlignCenter(true)}
                                        className={`flex-1 py-3 rounded-lg text-sm font-black transition-all ${
                                            lensAlignCenter
                                                ? 'bg-miami-cyan text-black shadow-[0_0_10px_rgba(0,240,255,0.25)]'
                                                : 'text-gray-500'
                                        }`}
                                    >ON</button>
                                    <button
                                        id="lens-align-off-btn"
                                        onClick={() => setLensAlignCenter(false)}
                                        className={`flex-1 py-3 rounded-lg text-sm font-black transition-all ${
                                            !lensAlignCenter
                                                ? 'bg-gray-700 text-white'
                                                : 'text-gray-500'
                                        }`}
                                    >OFF</button>
                                </div>
                            </div>

                            {/* Auto-Size toggle */}
                            <div className="flex flex-col gap-1.5">
                                <span className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Auto-Size to Object</span>
                                <div className="flex bg-black/60 p-1 rounded-xl border border-gray-800 gap-1">
                                    <button
                                        id="lens-autosize-on-btn"
                                        onClick={() => setLensAutoSize(true)}
                                        className={`flex-1 py-3 rounded-lg text-sm font-black transition-all ${
                                            lensAutoSize
                                                ? 'bg-miami-cyan text-black shadow-[0_0_10px_rgba(0,240,255,0.25)]'
                                                : 'text-gray-500'
                                        }`}
                                    >ON</button>
                                    <button
                                        id="lens-autosize-off-btn"
                                        onClick={() => setLensAutoSize(false)}
                                        className={`flex-1 py-3 rounded-lg text-sm font-black transition-all ${
                                            !lensAutoSize
                                                ? 'bg-gray-700 text-white'
                                                : 'text-gray-500'
                                        }`}
                                    >OFF</button>
                                </div>
                            </div>

                            {/* Margin */}
                            <div className={`flex items-center gap-3 transition-opacity ${lensAutoSize ? 'opacity-100' : 'opacity-30 pointer-events-none'}`}>
                                <span className="text-[10px] text-gray-500 uppercase font-bold tracking-widest flex-shrink-0">Margin</span>
                                <NumericInput
                                    id="lens-margin-input"
                                    value={lensMargin}
                                    onChange={v => setLensMargin(Math.max(0, v))}
                                    min={0}
                                    className="flex-1 bg-black border border-gray-700 focus:border-miami-cyan rounded-xl p-3 text-white text-sm font-mono outline-none transition-colors"
                                />
                                <span className="text-[11px] text-gray-500 font-bold flex-shrink-0">mm</span>
                            </div>

                            {/* Rotation */}
                            <div className="flex flex-col gap-1.5">
                                <span className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Rotation</span>
                                {/* Step picker */}
                                <div className="flex bg-black/60 p-1 rounded-xl border border-gray-800 gap-1">
                                    {[0.1, 1, 10, 90].map(step => (
                                        <button
                                            key={step}
                                            onClick={() => setLensRotStep(step)}
                                            className={`flex-1 py-2 rounded-lg text-[11px] font-black transition-all ${
                                                lensRotStep === step
                                                    ? 'bg-miami-cyan text-black shadow-[0_0_8px_rgba(0,240,255,0.2)]'
                                                    : 'text-gray-500'
                                            }`}
                                        >{step}°</button>
                                    ))}
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        id="lens-rotate-minus-btn"
                                        onClick={() => setLensRotOffset(r => +(r - lensRotStep).toFixed(2))}
                                        className="flex-1 py-3 bg-black/60 border border-gray-700 rounded-xl text-white font-black text-base active:scale-95 transition-all"
                                    >−{lensRotStep}°</button>
                                    <div className="flex flex-col items-center min-w-[70px]">
                                        <span className="text-miami-cyan font-black text-lg font-mono leading-none">
                                            {(() => {
                                                const sel = lensDetections.find(d => d.workpiece_id === selectedDetId);
                                                const base = sel?.angle_deg ?? 0;
                                                const total = ((base + lensRotOffset) % 360 + 360) % 360;
                                                return `${lensRotStep < 1 ? total.toFixed(1) : total.toFixed(0)}°`;
                                            })()}
                                        </span>
                                        <span className="text-[9px] text-gray-600 font-bold mt-0.5">total</span>
                                    </div>
                                    <button
                                        id="lens-rotate-plus-btn"
                                        onClick={() => setLensRotOffset(r => +(r + lensRotStep).toFixed(2))}
                                        className="flex-1 py-3 bg-black/60 border border-gray-700 rounded-xl text-white font-black text-base active:scale-95 transition-all"
                                    >+{lensRotStep}°</button>
                                </div>
                                {lensRotOffset !== 0 && (
                                    <button
                                        onClick={() => setLensRotOffset(0)}
                                        className="text-[10px] text-gray-600 hover:text-gray-400 font-bold text-center"
                                    >↺ Reset rotation offset</button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* ── Sticky Apply Button ── */}
                    <div className="flex-shrink-0 p-4 bg-black/80 border-t border-gray-800 backdrop-blur-xl">
                        <button
                            id="lens-apply-btn"
                            onClick={applyLensPlacement}
                            disabled={!selectedDetId}
                            className="w-full h-14 bg-gradient-to-r from-miami-cyan to-miami-purple text-black font-black rounded-2xl text-base tracking-wide shadow-[0_0_20px_rgba(0,240,255,0.2)] disabled:opacity-30 disabled:cursor-not-allowed active:scale-[0.98] transition-all"
                        >
                            {selectedDetId ? '✓  Apply Placement' : 'Select an object first'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
