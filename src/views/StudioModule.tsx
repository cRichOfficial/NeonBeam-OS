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
import { View } from '../components/layout/View';
import { SectionCard } from '../components/layout/SectionCard';
import { InstructionCard } from '../components/ui/InstructionCard';
import { TabControl } from '../components/ui/TabControl';
import { WorkspaceGrid } from '../components/workspace/WorkspaceGrid';
import { ItemContainer } from '../components/ui/ItemContainer';
import { ItemBadge } from '../components/ui/ItemBadge';
import { ActionButton } from '../components/ui/ActionButton';
import { Wizard, WizardStep } from '../components/ui/Wizard';
import { RadioGroup } from '../components/ui/RadioGroup';
import { ToggleSwitch } from '../components/ui/ToggleSwitch';
import { PlaceWithLensModal } from '../components/studio/PlaceWithLensModal';

const _COMM_API_FALLBACK = '';

// ── Types ──────────────────────────────────────────────────────────────────────
type FileKind     = 'svg' | 'bitmap';
type DitherMethod = 'threshold' | 'floyd-steinberg' | 'atkinson' | 'bayer';
type StudioTab    = 'design' | 'gcode';

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
    const [designWizardStep, setDesignWizardStep] = useState(1);
    const [designSource, setDesignSource] = useState<'existing' | 'new'>('existing');
    const [savedImages, setSavedImages] = useState<{filename: string, url: string}[]>([]);
    const [saveToEngraver, setSaveToEngraver] = useState(false);
    const [showCustomDpi, setShowCustomDpi] = useState(false);

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
    const [showRawGCode,setShowRawGCode]= useState(false);
    const [gcodeMoves,  setGCodeMoves]  = useState<PreviewMove[]>([]);
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

    // ── Place with Lens ──
    const [showLensModal, setShowLensModal] = useState(false);

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
                if (gcodeMoves.length > 0) {
                    let prev = gcodeMoves[0];
                    for (let i = 1; i < gcodeMoves.length; i++) {
                        const m = gcodeMoves[i];
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

    }, [renderTick, mmW, mmH, scX, scY, plotW, plotH, major, minor, fileKind, posX, posY, scalePct, rotation, operations, dpi, activeTab, gcodeMoves, viewZoom, viewOffsetX, viewOffsetY]);


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
        setShowCustomDpi(false);

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
            setShowRawGCode(false);
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
            setDesignWizardStep(3);
        }
        e.target.value = '';
    };

    const openDesignWizard = () => {
        setDesignWizardStep(fileKind ? 3 : 1);
        setDesignWizardOpen(true);
    };

    const fetchSavedImages = async () => {
        try {
            const res = await axios.get('/api/images');
            setSavedImages(res.data);
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
            setDesignWizardStep(3);
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
            // Step 0 is the new Manage Operation step
            setWizardStep(1);
        } else {
            setEditingOpId(null);
            const defaultType = fileKind === 'bitmap' ? 'raster' : 'cut';
            setDraftOp({
                opType: defaultType,
                pathIds: [],
                name: '',
                params: { ...useJobOperationsStore.getState().lastParams }
            });
            setWizardStep(1);
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
        
        // Save these params as the last used
        useJobOperationsStore.getState().setLastParams(finalOp.params);
        
        setWizardOpen(false);
    };

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <View title="Design Studio" subtitle={`⊕ BL origin · ${mmW}×${mmH} mm`} showHomeButton>
            <input type="file" ref={fileInputRef} className="hidden" accept=".svg,.png,.jpg,.jpeg,.bmp,.webp" onChange={handleFileChange} />
            
            
            {/* ── DESIGN WIZARD ── */}
            <Wizard
                isOpen={designWizardOpen}
                onClose={() => setDesignWizardOpen(false)}
                title="Load Design"
                currentStep={designWizardStep}
                totalSteps={3}
                onNext={() => {
                    if (designWizardStep === 1) {
                        if (designSource === 'existing') {
                            fetchSavedImages();
                        }
                        setDesignWizardStep(2);
                    } else if (designWizardStep === 2) {
                        setDesignWizardStep(3);
                    }
                }}
                onBack={() => setDesignWizardStep(s => s - 1)}
                onSave={() => setDesignWizardOpen(false)}
                saveText="Done"
                nextDisabled={designWizardStep === 2 && !fileKind}
            >
                {designWizardStep === 1 && (
                    <WizardStep title="Select Source" instructions="Choose where to load your design from.">
                        <RadioGroup
                            options={[
                                { value: 'existing', label: 'Start with an existing design' },
                                { value: 'new', label: 'Start with a new design' }
                            ]}
                            value={designSource}
                            onChange={(v) => setDesignSource(v as 'existing' | 'new')}
                        />
                    </WizardStep>
                )}

                {designWizardStep === 2 && (
                    <WizardStep title={designSource === 'existing' ? "Saved Images" : "Upload Design"} instructions={designSource === 'existing' ? "Select an image previously saved to the engraver." : "Select an SVG, PNG, JPG, BMP, or WebP from your device."}>
                        {designSource === 'existing' ? (
                            <div className="space-y-4">
                                {savedImages.length === 0 ? (
                                    <div className="text-center py-8 border-2 border-dashed border-gray-800 rounded-xl">
                                        <p className="text-xs text-gray-500 font-bold">No images saved to the engraver.</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 gap-2 max-h-[40vh] overflow-y-auto pr-2">
                                        {savedImages.map(img => (
                                            <button key={img.filename} 
                                                onClick={() => {
                                                    loadSavedImage(img.filename, img.url);
                                                    setDesignWizardStep(3);
                                                }}
                                                className="w-full flex items-center gap-3 p-3 rounded-xl border transition-all bg-black/40 border-gray-800 hover:border-miami-cyan"
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
                        ) : (
                            <div className="space-y-6">
                                <div className="bg-black/40 border border-gray-800 rounded-2xl p-6 text-center">
                                    <div className="text-4xl mb-4">📁</div>
                                    <p className="text-sm text-gray-400 mb-6 font-bold">Select an SVG, PNG, JPG, BMP, or WebP</p>
                                    
                                    <div className="flex justify-center mb-6">
                                        <ToggleSwitch
                                            label="Save copy to engraver"
                                            checked={saveToEngraver}
                                            onChange={(checked) => setSaveToEngraver(checked)}
                                        />
                                    </div>

                                    <ActionButton variant="primary" onClick={() => fileInputRef.current?.click()} className="w-full">
                                        Choose File
                                    </ActionButton>
                                </div>
                            </div>
                        )}
                    </WizardStep>
                )}

                {designWizardStep === 3 && (() => {
                    const isSvg = fileKind === 'svg';
                    const defaultAppDpi = isSvg ? svgDpi : bitmapDpi;
                    const commonDpis = isSvg ? [72, 90, 96] : [254, 318, 508];
                    if (!commonDpis.includes(defaultAppDpi)) commonDpis.push(defaultAppDpi);
                    commonDpis.sort((a,b) => a-b);

                    return (
                        <WizardStep title="Placement & DPI" instructions="Configure the size, position, and resolution of your design.">
                            <div className="bg-black/40 border border-gray-800 rounded-2xl p-6">
                                <div className="grid grid-cols-2 gap-4 mb-6">
                                    <div>
                                        <label className="block text-[10px] text-gray-400 mb-2 uppercase font-bold">X (mm)</label>
                                        <NumericInput 
                                            value={posX}
                                            onChange={val => { setPlacement({ posX: val }); bumpRender(); }}
                                            className="w-full bg-black border border-gray-700 focus:border-miami-cyan rounded-xl p-3 text-white text-sm font-mono outline-none transition-colors"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] text-gray-400 mb-2 uppercase font-bold">Y (mm)</label>
                                        <NumericInput 
                                            value={posY}
                                            onChange={val => { setPlacement({ posY: val }); bumpRender(); }}
                                            className="w-full bg-black border border-gray-700 focus:border-miami-cyan rounded-xl p-3 text-white text-sm font-mono outline-none transition-colors"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] text-gray-400 mb-2 uppercase font-bold">Scale %</label>
                                        <NumericInput 
                                            value={scalePct}
                                            onChange={val => { setPlacement({ scalePct: val }); bumpRender(); }}
                                            min={1} max={5000}
                                            className="w-full bg-black border border-gray-700 focus:border-miami-cyan rounded-xl p-3 text-white text-sm font-mono outline-none transition-colors"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] text-gray-400 mb-2 uppercase font-bold">Rotation (°)</label>
                                        <NumericInput 
                                            value={rotation}
                                            onChange={val => { setPlacement({ rotation: val }); bumpRender(); }}
                                            className="w-full bg-black border border-gray-700 focus:border-miami-cyan rounded-xl p-3 text-white text-sm font-mono outline-none transition-colors"
                                        />
                                    </div>
                                </div>

                                <div className="mb-6">
                                    <ActionButton variant="secondary" onClick={() => setShowLensModal(true)} className="w-full flex items-center justify-center gap-2">
                                        <span>📷</span> Place with Lens
                                    </ActionButton>
                                </div>
                                <div className="mb-6">
                                    <label className="block text-[10px] text-gray-400 mb-2 uppercase font-bold">
                                        {isSvg ? 'SVG DPI' : 'Bitmap DPI'}
                                    </label>
                                    <div className="flex flex-wrap gap-2 mb-3">
                                        <RadioGroup
                                            options={[
                                                ...(isSvg ? [72, 96, 150, 300] : [72, 96, 150, 300, 600]).map(v => ({ value: v, label: v })),
                                                { value: 'custom', label: 'Custom' }
                                            ]}
                                            value={showCustomDpi ? 'custom' : dpi}
                                            onChange={(val) => {
                                                if (val === 'custom') {
                                                    setShowCustomDpi(true);
                                                } else {
                                                    setShowCustomDpi(false);
                                                    setDpi(val as number);
                                                    bumpRender();
                                                }
                                            }}
                                            accentColor="cyan"
                                        />
                                    </div>
                                    {showCustomDpi && (
                                        <NumericInput 
                                            value={dpi}
                                            onChange={val => { setDpi(val); bumpRender(); }}
                                            min={10} max={2000}
                                            className="w-full bg-black border border-gray-700 focus:border-miami-cyan rounded-xl p-3 text-white text-sm font-mono outline-none transition-colors"
                                        />
                                    )}
                                </div>
                            </div>
                        </WizardStep>
                    );
                })()}
            </Wizard>
            
            {/* ── OPERATION WIZARD ── */}
            <Wizard
                isOpen={wizardOpen}
                onClose={() => setWizardOpen(false)}
                title={editingOpId ? 'Edit Operation' : 'New Operation'}
                currentStep={wizardStep}
                totalSteps={fileKind === 'bitmap' ? 2 : 3}
                onNext={() => {
                    setWizardStep(s => s + 1);
                }}
                onBack={() => setWizardStep(s => s - 1)}
                onSave={saveWizard}
                saveText={editingOpId ? 'Save Changes' : 'Add Operation'}
                nextDisabled={
                    (wizardStep === 1 && !draftOp.name) ||
                    (wizardStep === 3 && draftOp.pathIds?.length === 0)
                }
            >
                {/* Step 1: Operation Settings */}
                {wizardStep === 1 && (
                    <WizardStep title="Operation Type" instructions="Name your operation and select the operation type.">
                        <div className="space-y-6">
                            <div>
                                <label className="block text-[10px] text-gray-500 mb-2 uppercase font-bold tracking-widest">Operation Name</label>
                                <input 
                                    value={draftOp.name || ''}
                                    onChange={e => setDraftOp({ ...draftOp, name: e.target.value })}
                                    placeholder={`Op ${operations.length + 1}`}
                                    className="w-full bg-black border border-gray-800 rounded-xl p-3 text-white text-sm font-bold outline-none focus:border-miami-cyan transition-colors"
                                />
                            </div>
                            
                            <div>
                                <label className="block text-[10px] text-gray-500 mb-2 uppercase font-bold tracking-widest">Type</label>
                                <RadioGroup
                                    options={fileKind === 'svg' ? [
                                        { value: 'cut', label: 'Cut (Trace paths)' },
                                        { value: 'fill', label: 'Fill (Hatch enclosed areas)' }
                                    ] : [
                                        { value: 'raster', label: 'Raster (Engrave image)' }
                                    ]}
                                    value={draftOp.opType || (fileKind === 'svg' ? 'cut' : 'raster')}
                                    onChange={(v) => setDraftOp({ ...draftOp, opType: v as LayerOp })}
                                />
                            </div>
                        </div>
                    </WizardStep>
                )}

                {/* Step 2: Laser Settings */}
                {wizardStep === 2 && (
                    <WizardStep title="Laser Settings" instructions="Configure power, speed, and other laser parameters.">
                        <div className="bg-black/40 border border-gray-800 rounded-2xl p-4 space-y-4">
                            <div className="flex items-center justify-between">
                                <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Preset</p>
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
                                <label className="block text-[10px] text-gray-400 mb-2 uppercase font-bold">Power (%)</label>
                                <NumericInput 
                                    min={0} max={100}
                                    value={Math.round(((draftOp.params?.power || 0) / maxSpindleS) * 100)}
                                    onChange={val => setDraftOp({ ...draftOp, params: { ...draftOp.params!, power: Math.round((val / 100) * maxSpindleS) } })}
                                    className="w-full bg-black border border-gray-700 focus:border-miami-pink rounded-xl p-3 text-white text-sm font-mono transition-colors"
                                />
                            </div>

                            {/* Min Power for Raster */}
                            {draftOp.opType === 'raster' && (
                                <div>
                                    <label className="block text-[10px] text-gray-400 mb-2 uppercase font-bold">Min Power (%) (Shadows)</label>
                                    <NumericInput 
                                        min={0} max={100}
                                        value={Math.round(((draftOp.params?.minPower || 0) / maxSpindleS) * 100)}
                                        onChange={val => setDraftOp({ ...draftOp, params: { ...draftOp.params!, minPower: Math.round((val / 100) * maxSpindleS) } })}
                                        className="w-full bg-black border border-gray-700 focus:border-miami-purple rounded-xl p-3 text-white text-sm font-mono transition-colors"
                                    />
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

                            <div className="flex justify-center mt-2">
                                <ToggleSwitch
                                    label="Air Assist"
                                    checked={!!draftOp.params?.airAssist}
                                    onChange={(checked) => setDraftOp({ ...draftOp, params: { ...draftOp.params!, airAssist: checked } })}
                                />
                            </div>
                        </div>
                    </WizardStep>
                )}

                {/* Step 3: Assignment (SVG Only) */}
                {wizardStep === 3 && fileKind === 'svg' && (
                    <WizardStep title="Assignment" instructions="Select the paths you want to apply this operation to.">
                        <div className="space-y-4">
                            <div className="flex items-center justify-between mb-4">
                                <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Paths ({draftOp.pathIds?.length || 0})</p>
                                <div className="flex gap-2">
                                    <button onClick={() => setDraftOp({ ...draftOp, pathIds: svgPaths.map(p => p.id) })} className="text-[9px] text-miami-cyan font-bold uppercase">All</button>
                                    <button onClick={() => setDraftOp({ ...draftOp, pathIds: [] })} className="text-[9px] text-gray-600 font-bold uppercase">None</button>
                                </div>
                            </div>
                            
                            <div className="max-h-[40vh] overflow-y-auto">
                                <ItemContainer>
                                    {svgPaths.map(path => {
                                        const isSelected = draftOp.pathIds?.includes(path.id);
                                        return (
                                            <ItemBadge
                                                key={path.id}
                                                title={path.label}
                                                icon={
                                                    <div className="flex gap-1 items-center justify-center h-full">
                                                        {path.strokeColor && <div className="w-2 h-2 rounded-full" style={{ background: path.strokeColor }} />}
                                                        {path.fillColor && <div className="w-2 h-2 rounded-full border border-white/20" style={{ background: path.fillColor }} />}
                                                        {!path.strokeColor && !path.fillColor && <span className="text-xs">📐</span>}
                                                    </div>
                                                }
                                                onClick={() => {
                                                    const ids = draftOp.pathIds || [];
                                                    setDraftOp({ ...draftOp, pathIds: isSelected ? ids.filter(x => x !== path.id) : [...ids, path.id] });
                                                }}
                                                selected={isSelected}
                                                multiSelect={true}
                                            />
                                        );
                                    })}
                                </ItemContainer>
                            </div>
                        </div>
                    </WizardStep>
                )}
            </Wizard>
            
            {/* ── Header + Tab Bar ── */}
            <div className="p-4 space-y-4">
                <TabControl
                    tabs={[
                        { id: 'design', label: 'Design' },
                        { id: 'gcode', label: 'GCode Preview', disabled: !gcodeText }
                    ]}
                    activeTab={activeTab}
                    onChange={(id) => setActiveTab(id as StudioTab)}
                />
            </div>
            
            {/* ── DESIGN TAB ── */}
            {activeTab === 'design' && (
                <div className="space-y-6">
                    <SectionCard title="Workspace View">
                        <div ref={containerRef} className="w-full">
                        <WorkspaceGrid 
                            width={Math.max(10, gridWidth - 20)} 
                            height={CH}
                            machineWidthMm={mmW} 
                            machineHeightMm={mmH}
                            majorSpacingMm={major} 
                            minorSpacingMm={minor}
                            enablePanZoom={true}
                            renderOverlay={(ctx, t) => {
                                if (designImgRef.current && fileKind) {
                                    ctx.save();
                                    const dim = physSize();
                                    const px = posX * t.baseScale;
                                    const py = -posY * t.baseScale;
                                    const pw = dim.w * t.baseScale;
                                    const ph = dim.h * t.baseScale;
                                    ctx.translate(px, py - ph);
                                    if (rotation) {
                                        ctx.translate(pw/2, ph/2);
                                        ctx.rotate(rotation * Math.PI / 180);
                                        ctx.translate(-pw/2, -ph/2);
                                    }
                                    if (fileKind === 'bitmap') {
                                        ctx.fillStyle = '#ffffff';
                                        ctx.fillRect(0, 0, pw, ph);
                                    }
                                    ctx.globalAlpha = fileKind === 'bitmap' ? 0.8 : 0.9;
                                    ctx.drawImage(designImgRef.current, 0, 0, pw, ph);
                                    
                                    if (fileKind === 'svg') {
                                        ctx.strokeStyle = '#ff007f';
                                        ctx.strokeRect(0, 0, pw, ph);
                                    }
                                    ctx.restore();
                                }
                            }}
                        />
                        <div className="mt-4">
                            {!fileKind ? (
                                <ActionButton variant="primary" onClick={openDesignWizard} className="w-full">
                                    Load Design
                                </ActionButton>
                            ) : (
                                <ItemContainer>
                                    <ItemBadge 
                                        title={fileName} 
                                        subtitle={`${fileKind.toUpperCase()} · ${Math.round(physSize().w)}×${Math.round(physSize().h)} mm`}
                                        icon={<span>{fileKind === 'svg' ? '📐' : '🖼️'}</span>}
                                        onEdit={openDesignWizard}
                                        onDelete={clearDesign}
                                    />
                                </ItemContainer>
                            )}
                        </div>
                        </div>
                    </SectionCard>

                    <SectionCard title="Job Operations">
                        {fileKind && (
                            <div className="mb-4">
                                <ActionButton variant="secondary" onClick={() => openWizard()} className="w-full">
                                    + Add Operation
                                </ActionButton>
                            </div>
                        )}
                        {operations.length === 0 && fileKind ? (
                            <div className="text-center py-8 border-2 border-dashed border-gray-800 rounded-xl">
                                <p className="text-xs text-gray-600 font-bold">No operations added yet</p>
                            </div>
                        ) : operations.length > 0 && (
                            <ItemContainer>
                                {operations.map((op, idx) => (
                                    <ItemBadge 
                                        key={op.id}
                                        title={op.name || `Op ${idx + 1}`}
                                        subtitle={`${op.opType.toUpperCase()} · ${Math.round((op.params.power / 1000) * 100)}% Power · ${toDisplay(op.params.rate)} ${displayRateUnit}`}
                                        icon={<span>{op.opType === 'raster' ? '🖼️' : '✂️'}</span>}
                                        onEdit={() => openWizard(op)}
                                        onDelete={() => removeOperation(op.id)}
                                    />
                                ))}
                            </ItemContainer>
                        )}
                    </SectionCard>

                    {fileKind && (
                        <div className="pb-10">
                            <ActionButton variant="global" onClick={generateGCode} disabled={isGenerating}>
                                {isGenerating ? 'Generating...' : 'Generate GCode'}
                            </ActionButton>
                        </div>
                    )}
                </div>
            )}
            
            {/* ── GCODE TAB ── */}
            {activeTab === 'gcode' && gcodeText && (
                <div className="flex-1 overflow-y-auto px-3 space-y-3 pb-10">

                    {/* Toolpath Preview */}
                    <SectionCard title="Toolpath Preview">
                        <div className="w-full">
                            <WorkspaceGrid 
                                width={Math.max(10, gridWidth - 20)} 
                                height={Math.max(10, CH * 0.6)}
                                machineWidthMm={mmW} 
                                machineHeightMm={mmH}
                                majorSpacingMm={major} 
                                minorSpacingMm={minor}
                                enablePanZoom={true}
                                renderOverlay={(ctx, t) => {
                                    if (!gcodeMoves || gcodeMoves.length === 0) return;
                                    ctx.save();
                                    
                                    // 1. Draw Rapids
                                    ctx.beginPath();
                                    let px = 0, py = 0;
                                    for (const m of gcodeMoves) {
                                        if (m.rapid) {
                                            ctx.moveTo(px * t.baseScale, -py * t.baseScale);
                                            ctx.lineTo(m.x * t.baseScale, -m.y * t.baseScale);
                                        }
                                        px = m.x; py = m.y;
                                    }
                                    ctx.strokeStyle = '#00ff00';
                                    ctx.lineWidth = 1 / t.zoom;
                                    ctx.stroke();

                                    // 2. Draw Fills/Rasters
                                    ctx.beginPath();
                                    px = 0; py = 0;
                                    for (const m of gcodeMoves) {
                                        if (m.burn && (m.opType === 'fill' || m.opType === 'raster')) {
                                            ctx.moveTo(px * t.baseScale, -py * t.baseScale);
                                            ctx.lineTo(m.x * t.baseScale, -m.y * t.baseScale);
                                        }
                                        px = m.x; py = m.y;
                                    }
                                    ctx.strokeStyle = 'rgba(255,0,127,0.5)';
                                    ctx.lineWidth = 1 / t.zoom;
                                    ctx.stroke();

                                    // 3. Draw Cuts (on top)
                                    ctx.beginPath();
                                    px = 0; py = 0;
                                    for (const m of gcodeMoves) {
                                        if (m.burn && (!m.opType || m.opType === 'cut')) {
                                            ctx.moveTo(px * t.baseScale, -py * t.baseScale);
                                            ctx.lineTo(m.x * t.baseScale, -m.y * t.baseScale);
                                        }
                                        px = m.x; py = m.y;
                                    }
                                    ctx.strokeStyle = '#ff007f';
                                    ctx.lineWidth = 1.5 / t.zoom;
                                    ctx.stroke();

                                    ctx.restore();
                                }}
                            />
                        </div>
                    </SectionCard>

                    <div className="px-2">
                        <ToggleSwitch 
                            label="Show Raw GCode" 
                            checked={showRawGCode} 
                            onChange={setShowRawGCode} 
                        />
                    </div>

                    {/* Raw GCode text */}
                    {showRawGCode && (
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
                                <ActionButton variant="global" onClick={sendToMachine}>
                                    Send to Machine
                                </ActionButton>
                            )}
                        </div>
                    )}

                    {/* Machine-side streaming progress (polled; persists if user leaves tab) */}
                    {jobStatus && (
                        <div className="bg-black/60 border border-gray-800 rounded-xl p-3 space-y-2">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-black text-miami-cyan">
                                        {jobStatus.is_streaming ? '⚙ Machine Running…' : '✅ Upload Complete'}
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
                            {jobStatus.is_streaming && (
                                <button onClick={cancelJob}
                                    className="w-full py-2 bg-red-900/40 border border-red-800 hover:bg-red-800/60 text-red-400 font-black rounded-xl text-xs transition-all">
                                    ⛔ Cancel Job (sends soft-reset to machine)
                                </button>
                            )}
                        </div>
                    )}


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

            {/* ── PLACE WITH LENS MODAL ── */}
            <PlaceWithLensModal
                isOpen={showLensModal}
                onClose={() => setShowLensModal(false)}
                fileKind={fileKind}
                imgSrc={designImgRef.current?.src || undefined}
                svgXml={fileKind === 'svg' ? svgTextRef.current : undefined}
                baseW={baseMmSize().w}
                baseH={baseMmSize().h}
                initialPosX={posX}
                initialPosY={posY}
                initialScalePct={scalePct}
                onApply={(newX, newY, newScale, newRot) => {
                    setPlacement({ posX: newX, posY: newY, scalePct: newScale, rotation: newRot });
                    setShowLensModal(false);
                    bumpRender();
                }}
            />
        </View>
    );
};
