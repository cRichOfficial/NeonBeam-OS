// NeonBeam OS — SVG Layer Engine
// Parses SVG geometry elements by id/tag and generates multi-operation GCode
// in the exact order operations are added to the job.

import type { OpParams } from './gcodeEngine';

// ── Public types ───────────────────────────────────────────────────────────────

/** A geometry element discovered in the loaded SVG */
export interface SvgPathInfo {
    id:          string;         // element id attr, or auto-generated "tag-N"
    tag:         string;         // "path", "rect", "circle", etc.
    label:       string;         // display name: "path#myId" or "rect #2"
    strokeColor: string | null;  // normalised hex "#ff0000" or null
    fillColor:   string | null;  // normalised hex or null
    totalLength: number;         // getTotalLength() in SVG user units
}

/** Operation types — cut-inside/cut-outside removed pending Clipper.js support */
export type LayerOp = 'cut' | 'fill' | 'raster';

/** One laser operation in the job, containing one or more path references */
export interface JobOperation {
    id:      string;       // uuid
    name:    string;       // user label e.g. "Cut Outline"
    opType:  LayerOp;
    pathIds: string[];     // SvgPathInfo.id values to include
    params:  OpParams;     // per-operation laser params
}

// ── Helpers ───────────────────────────────────────────────────────────────────

interface Pt { x: number; y: number }

/** Normalise any CSS colour string to "#rrggbb" or null if transparent/none */
function normalizeColor(raw: string | null | undefined): string | null {
    if (!raw) return null;
    const s = raw.trim().toLowerCase();
    if (s === 'none' || s === 'transparent' || s === '') return null;

    // Already hex
    if (/^#[0-9a-f]{3,8}$/i.test(s)) {
        // Expand shorthand #rgb → #rrggbb
        if (s.length === 4) {
            const [, r, g, b] = s;
            return `#${r}${r}${g}${g}${b}${b}`;
        }
        return s.slice(0, 7); // drop alpha
    }

    // rgb(r, g, b) or rgba(r, g, b, a)
    const m = s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (m) {
        const hex = (n: number) => n.toString(16).padStart(2, '0');
        return `#${hex(+m[1])}${hex(+m[2])}${hex(+m[3])}`;
    }

    // Named colours — mount a temp element to let the browser resolve
    try {
        const tmp = document.createElement('div');
        tmp.style.color = s;
        document.body.appendChild(tmp);
        const computed = getComputedStyle(tmp).color;
        document.body.removeChild(tmp);
        const m2 = computed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
        if (m2) {
            const hex = (n: number) => n.toString(16).padStart(2, '0');
            return `#${hex(+m2[1])}${hex(+m2[2])}${hex(+m2[3])}`;
        }
    } catch { /* ignore */ }

    return null;
}

/** Mount svgText into a hidden off-screen div. SVG is set to vbW×vbH px so
 *  getCTM() is identity-scaled (1 screen px = 1 SVG user unit). */
function mountSvg(svgText: string): { wrap: HTMLDivElement; svgEl: SVGSVGElement; vbW: number; vbH: number } {
    const parser = new DOMParser();
    const doc    = parser.parseFromString(svgText, 'image/svg+xml');
    const svgDoc = doc.querySelector('svg') as SVGSVGElement;
    const vb     = svgDoc?.viewBox?.baseVal;
    const vbW    = (vb?.width  > 0 ? vb.width  : parseFloat(svgDoc?.getAttribute('width')  || '0')) || 400;
    const vbH    = (vb?.height > 0 ? vb.height : parseFloat(svgDoc?.getAttribute('height') || '0')) || 400;

    const wrap = document.createElement('div');
    Object.assign(wrap.style, {
        position: 'fixed', left: '-99999px', top: '0',
        width: `${vbW}px`, height: `${vbH}px`,
        overflow: 'hidden', opacity: '0', pointerEvents: 'none',
    });
    wrap.innerHTML = svgText;

    const svgEl = wrap.querySelector('svg') as SVGSVGElement;
    // Force the mounted SVG to exactly vbW×vbH so getCTM() scaling = 1
    if (svgEl) {
        svgEl.setAttribute('width',  `${vbW}px`);
        svgEl.setAttribute('height', `${vbH}px`);
    }

    document.body.appendChild(wrap);
    return { wrap, svgEl, vbW, vbH };
}

function removeSvgMount(wrap: HTMLDivElement) {
    try { document.body.removeChild(wrap); } catch { /* already gone */ }
}

// ── Path parser ───────────────────────────────────────────────────────────────

const GEOM_SEL = 'path,rect,circle,ellipse,line,polyline,polygon';

/** Parse all geometry elements from the SVG into SvgPathInfo[], in DOM order. */
export function parseSvgPaths(svgText: string): SvgPathInfo[] {
    const { wrap, svgEl } = mountSvg(svgText);
    const result: SvgPathInfo[] = [];
    try {
        if (!svgEl) return result;
        const elems = svgEl.querySelectorAll(GEOM_SEL);
        const tagCounts: Record<string, number> = {};

        elems.forEach((el, _idx) => {
            const tag      = el.tagName.toLowerCase().replace(/^svg:/, '');
            const count    = (tagCounts[tag] = (tagCounts[tag] || 0) + 1);
            const attrId   = el.getAttribute('id');
            const id       = attrId || `${tag}-${count - 1}`;
            const label    = attrId ? `${tag}#${attrId}` : `${tag} #${count}`;

            const cs       = getComputedStyle(el);
            const stroke   = normalizeColor(cs.stroke   || el.getAttribute('stroke'));
            const fill     = normalizeColor(cs.fill     || el.getAttribute('fill'));

            let totalLength = 0;
            if (el instanceof SVGGeometryElement) {
                try { totalLength = el.getTotalLength(); } catch { /* noop */ }
            }

            result.push({ id, tag, label, strokeColor: stroke, fillColor: fill, totalLength });
        });
    } finally {
        removeSvgMount(wrap);
    }
    return result;
}

// ── Multi-operation GCode generator ──────────────────────────────────────────

export interface MultiOpGCodeOptions {
    svgText:    string;
    operations: JobOperation[];
    posX:       number;   // mm, machine bottom-left
    posY:       number;
    widthMm:    number;   // physical width of the SVG at current scale
    heightMm:   number;
    rotation?:  number;   // degrees, rotation around design center
    rasterCanvas?: HTMLCanvasElement; // required for raster operations
}

/** Generate combined GCode for all operations in array order (= addition order). */
export function generateMultiOpGCode(opts: MultiOpGCodeOptions): string {
    const { svgText, operations, posX, posY, widthMm, heightMm, rotation: rotDeg = 0 } = opts;

    const { wrap, svgEl, vbW, vbH } = mountSvg(svgText);

    // Rotation transform: rotate every machine-coord point around the design center
    const rotRad = -rotDeg * Math.PI / 180;
    const cosR = Math.cos(rotRad), sinR = Math.sin(rotRad);
    const cxMm = posX + widthMm / 2, cyMm = posY + heightMm / 2;
    const rotatePt = (pt: Pt): Pt => {
        if (rotDeg === 0) return pt;
        const dx = pt.x - cxMm, dy = pt.y - cyMm;
        return { x: cxMm + dx * cosR - dy * sinR, y: cyMm + dx * sinR + dy * cosR };
    };

    // toMm: SVG user-unit coords → machine mm coords (Y-flip: SVG Y-down, machine Y-up)
    const toMm = (sx: number, sy: number): Pt => rotatePt({
        x: posX + (sx / vbW) * widthMm,
        y: posY + heightMm - (sy / vbH) * heightMm,
    });

    // Build a stable id→element map (same id logic as parseSvgPaths)
    const idMap = new Map<string, Element>();
    if (svgEl) {
        const tagCounts: Record<string, number> = {};
        svgEl.querySelectorAll(GEOM_SEL).forEach(el => {
            const tag    = el.tagName.toLowerCase().replace(/^svg:/, '');
            const count  = (tagCounts[tag] = (tagCounts[tag] || 0) + 1);
            const attrId = el.getAttribute('id');
            const id     = attrId || `${tag}-${count - 1}`;
            idMap.set(id, el);
        });
    }

    const out: string[] = [
        '; NeonBeam OS — Multi-Operation Vector GCode',
        `; Operations: ${operations.length}  Origin: X${posX} Y${posY}  Size: ${widthMm.toFixed(2)}×${heightMm.toFixed(2)} mm`,
        'G21 ; metric',
        'G90 ; absolute',
        '',
    ];

    let anyAirAssist = false;

    for (let opIdx = 0; opIdx < operations.length; opIdx++) {
        const op = operations[opIdx];
        
        // Raster operations don't use pathIds
        if (op.opType !== 'raster' && op.pathIds.length === 0) continue;

        const elements = op.opType === 'raster' 
            ? [] 
            : op.pathIds
                .map(id => idMap.get(id))
                .filter((el): el is Element => !!el && el instanceof SVGGeometryElement);

        if (op.opType !== 'raster' && elements.length === 0) continue;

        out.push(`; ${'='.repeat(60)}`);
        out.push(`; Op ${opIdx + 1} / ${operations.length} : ${op.name} [${op.opType}]`);
        if (op.opType !== 'raster') out.push(`; Paths: ${op.pathIds.join(', ')}`);
        out.push(`; Power: ${op.params.power}S  Feed: ${op.params.rate} mm/min  Passes: ${op.params.passes}`);
        if (op.opType === 'raster') out.push(`; Margin: ${op.params.margin}mm  MinPower: ${op.params.minPower}S`);
        out.push(`; ${'='.repeat(60)}`);

        if (op.params.airAssist) { out.push('M8 ; air assist on'); anyAirAssist = true; }

        if (op.opType === 'raster') {
            const canvas = opts.rasterCanvas;
            if (!canvas) {
                out.push('; WARNING: Raster operation requested but no canvas provided.');
            } else {
                const ctx = canvas.getContext('2d')!;
                const w = canvas.width, h = canvas.height;
                const { data } = ctx.getImageData(0, 0, w, h);
                const pixelLum = (px: number, row: number) => data[(row * w + px) * 4];
                const pixelS = (px: number, row: number): number => {
                    const lum = pixelLum(px, row);
                    if (lum >= 128) return 0;
                    const t = 1 - lum / 127;
                    return Math.round(op.params.minPower + t * (op.params.power - op.params.minPower));
                };
                const isDark = (px: number, row: number) => pixelLum(px, row) < 128;
                const xToMm = (px: number) => posX + (px / Math.max(w - 1, 1)) * widthMm;
                const nLines = Math.ceil(heightMm / op.params.lineDistance);
                const marginPx = Math.round((op.params.margin / Math.max(widthMm, 0.001)) * w);

                out.push('M4 ; dynamic laser mode');
                out.push(`F${op.params.rate}`);

                for (let pass = 0; pass < op.params.passes; pass++) {
                    if (op.params.passes > 1) out.push(`; Pass ${pass + 1}/${op.params.passes}`);
                    for (let li = 0; li < nLines; li++) {
                        const yMm = posY + heightMm - li * op.params.lineDistance;
                        const pixRow = Math.min(h - 1, Math.floor((li / nLines) * h));
                        const ltr = li % 2 === 0;
                        const segs: { a: number; b: number }[] = [];
                        let burning = false, startPx = 0;
                        const pxSeq = ltr ? Array.from({ length: w }, (_, i) => i) : Array.from({ length: w }, (_, i) => w - 1 - i);

                        for (const px of pxSeq) {
                            const dark = isDark(px, pixRow);
                            if (dark && !burning) { startPx = px; burning = true; }
                            if (!dark && burning) { segs.push({ a: startPx, b: px - (ltr ? 1 : -1) }); burning = false; }
                        }
                        if (burning) segs.push({ a: startPx, b: pxSeq[pxSeq.length - 1] });
                        if (segs.length === 0) continue;

                        const approachX = ltr ? xToMm(Math.max(0, segs[0].a - marginPx)) : xToMm(Math.min(w - 1, segs[0].a + marginPx));
                        const approachPt = rotatePt({ x: approachX, y: yMm });
                        out.push(`G0 X${approachPt.x.toFixed(3)} Y${approachPt.y.toFixed(3)}`);
                        for (const seg of segs) {
                            const segA = rotatePt({ x: xToMm(seg.a), y: yMm });
                            out.push(`G1 X${segA.x.toFixed(3)} Y${segA.y.toFixed(3)} S0`);
                            const segB = rotatePt({ x: xToMm(seg.b), y: yMm });
                            out.push(`G1 X${segB.x.toFixed(3)} Y${segB.y.toFixed(3)} S${pixelS(seg.b, pixRow)}`);
                        }
                        out.push('G1 S0');
                    }
                }
            }
        } else if (op.opType === 'fill') {
            // Shape-aware hatch fill using an off-screen canvas mask
            out.push('M4 ; dynamic laser mode');
            out.push(`F${op.params.rate}`);

            // 1. Find combined bounding box of all elements in SVG units (respecting transforms)
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            for (const el of elements) {
                const geom = el as SVGGeometryElement;
                const bbox = geom.getBBox();
                const ctm  = geom.getCTM();
                const corners = [
                    {x: bbox.x, y: bbox.y},
                    {x: bbox.x + bbox.width, y: bbox.y},
                    {x: bbox.x, y: bbox.y + bbox.height},
                    {x: bbox.x + bbox.width, y: bbox.y + bbox.height}
                ];
                for (const c of corners) {
                    let pt = svgEl.createSVGPoint();
                    pt.x = c.x; pt.y = c.y;
                    if (ctm) pt = pt.matrixTransform(ctm);
                    minX = Math.min(minX, pt.x); maxX = Math.max(maxX, pt.x);
                    minY = Math.min(minY, pt.y); maxY = Math.max(maxY, pt.y);
                }
            }

            if (minX !== Infinity) {
                // 2. Setup a mask canvas for the bounding box
                // Resolution: 0.05mm per pixel for high fidelity
                const resMm = 0.05;
                const mmToVb = vbW / widthMm; // 1mm = ? vb units
                
                const boxWMm = (maxX - minX) / mmToVb;
                const boxHMm = (maxY - minY) / mmToVb;
                const canvasW = Math.ceil(boxWMm / resMm);
                const canvasH = Math.ceil(boxHMm / resMm);
                
                // Safety: limit canvas size to prevent crashes on massive files
                if (canvasW > 4000 || canvasH > 4000) {
                    out.push('; WARNING: Fill operation too large, skipping.');
                } else if (canvasW > 0 && canvasH > 0) {
                    const canvas = document.createElement('canvas');
                    canvas.width = canvasW; canvas.height = canvasH;
                    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
                    ctx.fillStyle = 'white'; ctx.fillRect(0, 0, canvasW, canvasH);
                    ctx.fillStyle = 'black';

                    // Draw each element to the mask
                    for (const el of elements) {
                        const geom = el as SVGGeometryElement;
                        const svgPath = new Path2D(geom.getAttribute('d') || '');
                        const ctm = geom.getCTM();
                        
                        ctx.save();
                        // Transform from root SVG coordinates to local canvas coordinates
                        // (x - minX) / mmToVb -> mm, then / resMm -> pixels
                        ctx.scale(1 / (mmToVb * resMm), 1 / (mmToVb * resMm));
                        ctx.translate(-minX, -minY);
                        if (ctm) ctx.transform(ctm.a, ctm.b, ctm.c, ctm.d, ctm.e, ctm.f);
                        ctx.fill(svgPath);
                        ctx.restore();
                    }

                    const { data } = ctx.getImageData(0, 0, canvasW, canvasH);
                    const isDark = (px: number, py: number) => data[(py * canvasW + px) * 4] < 128;

                    // 3. Scan the mask boustrophedon
                    const stepPx = Math.max(1, Math.round(op.params.lineDistance / resMm));
                    
                    for (let pass = 0; pass < op.params.passes; pass++) {
                        if (op.params.passes > 1) out.push(`; Pass ${pass + 1}/${op.params.passes}`);
                        
                        for (let py = 0; py < canvasH; py += stepPx) {
                            const ltr = (py / stepPx) % 2 === 0;
                            const yMm = (posY + heightMm) - (minY / mmToVb) - (py * resMm);
                            
                            // Collect segments
                            const segs: { x0: number; x1: number }[] = [];
                            let startX: number | null = null;
                            
                            for (let px = 0; px < canvasW; px++) {
                                const active = isDark(px, py);
                                if (active && startX === null) startX = px;
                                if (!active && startX !== null) {
                                    segs.push({ x0: startX, x1: px - 1 });
                                    startX = null;
                                }
                            }
                            if (startX !== null) segs.push({ x0: startX, x1: canvasW - 1 });
                            
                            if (segs.length > 0) {
                                if (!ltr) segs.reverse();
                                for (const s of segs) {
                            const mX0 = (minX / mmToVb) + (s.x0 * resMm) + posX;
                                    const mX1 = (minX / mmToVb) + (s.x1 * resMm) + posX;
                                    const approach = rotatePt({ x: ltr ? mX0 : mX1, y: yMm });
                                    const exit     = rotatePt({ x: ltr ? mX1 : mX0, y: yMm });
                                    
                                    out.push(`G0 X${approach.x.toFixed(3)} Y${approach.y.toFixed(3)}`);
                                    out.push(`G1 X${exit.x.toFixed(3)} Y${exit.y.toFixed(3)} S${op.params.power}`);
                                }
                            }
                        }
                    }
                }
            }
        } else {
            // Vector cut: sample path using getPointAtLength + getCTM
            out.push('M4 ; dynamic laser mode');
            out.push(`F${op.params.rate}`);

            for (let pass = 0; pass < op.params.passes; pass++) {
                if (op.params.passes > 1) out.push(`; Pass ${pass + 1}/${op.params.passes}`);

                for (const el of elements) {
                    const geom = el as SVGGeometryElement;
                    try {
                        const len   = geom.getTotalLength();
                        if (len <= 0) continue;
                        // ~1 sample per 0.25 mm for smooth curves
                        const steps = Math.max(16, Math.ceil(len / 0.25));
                        const ctm   = geom.getCTM();

                        const stepSize = len / steps;
                        const strokes: Pt[][] = [];
                        let currentStroke: Pt[] = [];

                        for (let i = 0; i <= steps; i++) {
                            let p = geom.getPointAtLength((i / steps) * len);
                            if (ctm) p = p.matrixTransform(ctm);
                            const mmPt = toMm(p.x, p.y);

                            if (currentStroke.length > 0) {
                                const prev = currentStroke[currentStroke.length - 1];
                                const dist = Math.hypot(mmPt.x - prev.x, mmPt.y - prev.y);
                                
                                // In machine mm, the step length is approx stepSize * scale
                                const expectedStepMm = stepSize * (widthMm / vbW);
                                
                                // If distance jumped is significantly larger than the length step, 
                                // it's a move command (M) within the path.
                                if (dist > expectedStepMm + 0.1) {
                                    strokes.push(currentStroke);
                                    currentStroke = [];
                                }
                            }

                            // Skip near-duplicate points to reduce GCode bloat
                            if (currentStroke.length > 0) {
                                const prev = currentStroke[currentStroke.length - 1];
                                if (Math.hypot(mmPt.x - prev.x, mmPt.y - prev.y) < 0.05) continue;
                            }

                            currentStroke.push(mmPt);
                        }
                        if (currentStroke.length > 0) strokes.push(currentStroke);

                        // Generate GCode for each continuous stroke
                        for (const pts of strokes) {
                            if (pts.length < 2) continue;
                            // Move to start of stroke
                            out.push(`G0 X${pts[0].x.toFixed(3)} Y${pts[0].y.toFixed(3)}`);
                            // Draw stroke (laser turns on with G1 in M4 mode)
                            out.push(`G1 X${pts[1].x.toFixed(3)} Y${pts[1].y.toFixed(3)} S${op.params.power}`);
                            for (let i = 2; i < pts.length; i++) {
                                out.push(`G1 X${pts[i].x.toFixed(3)} Y${pts[i].y.toFixed(3)}`);
                            }
                        }
                    } catch { /* skip unsupported element */ }
                }
            }
        }

        if (op.params.airAssist) out.push('M9 ; air assist off');
        out.push('');
    }

    removeSvgMount(wrap);

    if (anyAirAssist) out.push('M9 ; air assist safety off');
    out.push('G0 X0.000 Y0.000');
    out.push('M5 ; laser off');
    return out.join('\n');
}
