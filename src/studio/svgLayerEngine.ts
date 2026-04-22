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
export type LayerOp = 'cut' | 'fill';

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
}

/** Generate combined GCode for all operations in array order (= addition order). */
export function generateMultiOpGCode(opts: MultiOpGCodeOptions): string {
    const { svgText, operations, posX, posY, widthMm, heightMm } = opts;

    const { wrap, svgEl, vbW, vbH } = mountSvg(svgText);

    // toMm: SVG user-unit coords → machine mm coords (Y-flip: SVG Y-down, machine Y-up)
    const toMm = (sx: number, sy: number): Pt => ({
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
        if (op.pathIds.length === 0) continue;

        const elements = op.pathIds
            .map(id => idMap.get(id))
            .filter((el): el is Element => !!el && el instanceof SVGGeometryElement);

        if (elements.length === 0) continue;

        out.push(`; ${'='.repeat(60)}`);
        out.push(`; Op ${opIdx + 1} / ${operations.length} : ${op.name} [${op.opType}]`);
        out.push(`; Paths: ${op.pathIds.join(', ')}`);
        out.push(`; Power: ${op.params.power}S  Feed: ${op.params.rate} mm/min  Passes: ${op.params.passes}`);
        out.push(`; ${'='.repeat(60)}`);

        if (op.params.airAssist) { out.push('M8 ; air assist on'); anyAirAssist = true; }

        if (op.opType === 'fill') {
            // Hatch fill: boustrophedon across each element's bounding box
            out.push('M4 ; dynamic laser mode');
            out.push(`F${op.params.rate}`);

            for (const el of elements) {
                const bbox  = (el as SVGGeometryElement).getBBox();
                const x0mm  = posX + (bbox.x              / vbW) * widthMm;
                const y1mm  = posY + heightMm - (bbox.y              / vbH) * heightMm; // top in machine coords
                const x1mm  = posX + ((bbox.x + bbox.width)  / vbW) * widthMm;
                const y0mm  = posY + heightMm - ((bbox.y + bbox.height) / vbH) * heightMm; // bottom

                const bboxH = Math.abs(y1mm - y0mm);
                const nLines = Math.max(1, Math.ceil(bboxH / op.params.lineDistance));

                for (let pass = 0; pass < op.params.passes; pass++) {
                    if (op.params.passes > 1) out.push(`; Pass ${pass + 1}/${op.params.passes}`);
                    for (let li = 0; li <= nLines; li++) {
                        const y   = y1mm - li * op.params.lineDistance;
                        const ltr = li % 2 === 0;
                        out.push(`G0 X${(ltr ? x0mm : x1mm).toFixed(3)} Y${y.toFixed(3)} S0`);
                        out.push(`G1 X${(ltr ? x1mm : x0mm).toFixed(3)} S${op.params.power}`);
                    }
                    out.push('G1 S0');
                }
            }
        } else {
            // Vector cut: sample path using getPointAtLength + getCTM
            out.push('M3 ; constant laser mode');
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

                        const pts: Pt[] = [];
                        let prev: { x: number; y: number } | null = null;
                        for (let i = 0; i <= steps; i++) {
                            let p = geom.getPointAtLength((i / steps) * len);
                            // Apply cumulative transform to get SVG-root user-unit coords
                            if (ctm) p = p.matrixTransform(ctm);
                            // Skip near-duplicate points
                            if (prev && Math.hypot(p.x - prev.x, p.y - prev.y) < 0.05) continue;
                            pts.push(toMm(p.x, p.y));
                            prev = p;
                        }

                        if (pts.length >= 2) {
                            out.push(`G0 X${pts[0].x.toFixed(3)} Y${pts[0].y.toFixed(3)} S0`);
                            out.push(`G1 S${op.params.power}`);
                            for (let i = 1; i < pts.length; i++) {
                                out.push(`G1 X${pts[i].x.toFixed(3)} Y${pts[i].y.toFixed(3)}`);
                            }
                            out.push('G1 S0');
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
