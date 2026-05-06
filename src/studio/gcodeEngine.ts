// NeonBeam OS — GCode Engine
// Generates grblHAL-compatible GCode from SVG vector paths and dithered raster bitmaps.

// ── Shared types ──────────────────────────────────────────────────────────────

export interface OpParams {
    power:        number;   // 0–1000  (Grbl S max value — used as-is for vector; upper bound for raster)
    minPower:     number;   // 0–1000  (Grbl S min value for raster — lower bound mapped to lightest pixel)
    rate:         number;   // mm/min  feed rate
    passes:       number;   // repeat count
    airAssist:    boolean;  // M8 / M9 relay
    margin:       number;   // mm overscan added to each scan line (raster)
    lineDistance: number;   // mm between scan lines (raster / hatch fill)
    lineAngle:    number;   // degrees — scan direction (raster / hatch fill)
}

// ── SVG GCode ─────────────────────────────────────────────────────────────────

export interface SvgGCodeOptions {
    svgText:  string;
    posX:     number;   // mm, design bottom-left in machine coords
    posY:     number;
    widthMm:  number;   // physical output width in mm
    heightMm: number;   // physical output height in mm
    op:       'cut' | 'cut-outside' | 'cut-inside' | 'fill';
    params:   OpParams;
}

interface Pt { x: number; y: number }

/** Mount SVG to DOM and sample each geometry element's path using browser APIs. */
function extractSvgPaths(
    svgText: string,
    widthMm: number, heightMm: number,
    posX: number, posY: number
): Pt[][] {
    const wrap = document.createElement('div');
    Object.assign(wrap.style, {
        position: 'fixed', left: '-99999px', top: '0',
        width: '800px', height: '600px', overflow: 'hidden', opacity: '0',
        pointerEvents: 'none',
    });
    wrap.innerHTML = svgText;
    document.body.appendChild(wrap);

    const result: Pt[][] = [];
    try {
        const svgEl = wrap.querySelector('svg') as SVGSVGElement | null;
        if (!svgEl) return result;

        // Determine coordinate space from viewBox or width/height attributes
        const vb    = svgEl.viewBox.baseVal;
        const vbW   = vb.width  > 0 ? vb.width  : (parseFloat(svgEl.getAttribute('width')  || '0') || 400);
        const vbH   = vb.height > 0 ? vb.height : (parseFloat(svgEl.getAttribute('height') || '0') || 400);

        // SVG origin is top-left (Y down); machine origin is bottom-left (Y up)
        const toMm = (sx: number, sy: number): Pt => ({
            x: posX + (sx / vbW) * widthMm,
            y: posY + heightMm - (sy / vbH) * heightMm,
        });

        const elems = svgEl.querySelectorAll('path,rect,circle,ellipse,line,polyline,polygon');
        for (const el of elems) {
            if (!(el instanceof SVGGeometryElement)) continue;
            try {
                const len = el.getTotalLength();
                if (len <= 0) continue;
                // ~1 sample per 0.25 mm equivalent for smooth curves
                const steps = Math.max(16, Math.ceil(len / 0.25));
                const stepSize = len / steps;
                let currentStroke: Pt[] = [];

                for (let i = 0; i <= steps; i++) {
                    const p = el.getPointAtLength((i / steps) * len);
                    const mmPt = toMm(p.x, p.y);

                    if (currentStroke.length > 0) {
                        const prevMm = currentStroke[currentStroke.length - 1];
                        const dist = Math.hypot(mmPt.x - prevMm.x, mmPt.y - prevMm.y);
                        
                        // Scale expected step to mm
                        const expectedStepMm = stepSize * (widthMm / vbW);

                        if (dist > expectedStepMm + 0.1) {
                            if (currentStroke.length >= 2) result.push(currentStroke);
                            currentStroke = [];
                        }
                    }

                    if (currentStroke.length > 0) {
                        const last = currentStroke[currentStroke.length - 1];
                        if (Math.hypot(mmPt.x - last.x, mmPt.y - last.y) < 0.05) continue;
                    }
                    currentStroke.push(mmPt);
                }
                if (currentStroke.length >= 2) result.push(currentStroke);
            } catch { /* skip unsupported elements */ }
        }
    } finally {
        document.body.removeChild(wrap);
    }
    return result;
}

export function generateSvgGCode(opts: SvgGCodeOptions): string {
    const { posX, posY, widthMm, heightMm, op, params } = opts;
    const out: string[] = [
        '; NeonBeam OS — Vector GCode',
        `; Op: ${op}  Power: ${params.power}S  Feed: ${params.rate} mm/min  Passes: ${params.passes}`,
        `; Origin: X${posX} Y${posY}  Size: ${widthMm.toFixed(2)}×${heightMm.toFixed(2)} mm`,
        'G21 ; metric',
        'G90 ; absolute',
    ];
    if (params.airAssist) out.push('M8 ; air assist on');

    const paths = extractSvgPaths(opts.svgText, widthMm, heightMm, posX, posY);
    if (paths.length === 0) {
        out.push('; WARNING: no geometry found in SVG');
        out.push('M5'); return out.join('\n');
    }

    if (op === 'fill') {
        // Boustrophedon hatch fill across bounding box
        out.push('M4 ; dynamic laser mode'); out.push(`F${params.rate}`);
        for (let pass = 0; pass < params.passes; pass++) {
            if (params.passes > 1) out.push(`; --- Pass ${pass + 1} / ${params.passes} ---`);
            const nLines = Math.ceil(heightMm / params.lineDistance);
            for (let li = 0; li <= nLines; li++) {
                const y    = posY + heightMm - li * params.lineDistance;
                const ltr  = li % 2 === 0;
                const x1   = ltr ? posX : posX + widthMm;
                const x2   = ltr ? posX + widthMm : posX;
                out.push(`G0 X${x1.toFixed(3)} Y${y.toFixed(3)} S0`);
                out.push(`G1 X${x2.toFixed(3)} S${params.power}`);
            }
            out.push('G1 S0');
        }
    } else {
        // Vector cut (on-path / inside / outside)
        out.push('M4 ; dynamic laser'); out.push(`F${params.rate}`);
        for (let pass = 0; pass < params.passes; pass++) {
            if (params.passes > 1) out.push(`; --- Pass ${pass + 1} / ${params.passes} ---`);
            for (const path of paths) {
                if (path.length < 2) continue;
                out.push(`G0 X${path[0].x.toFixed(3)} Y${path[0].y.toFixed(3)}`);
                out.push(`G1 X${path[1].x.toFixed(3)} Y${path[1].y.toFixed(3)} S${params.power}`);
                for (let i = 2; i < path.length; i++) {
                    out.push(`G1 X${path[i].x.toFixed(3)} Y${path[i].y.toFixed(3)}`);
                }
            }
        }
    }

    out.push(''); out.push('G0 X0.000 Y0.000');
    if (params.airAssist) out.push('M9 ; air assist off');
    out.push('M5');
    return out.join('\n');
}

// ── Raster GCode ──────────────────────────────────────────────────────────────

export interface RasterGCodeOptions {
    ditheredCanvas: HTMLCanvasElement;
    posX: number; posY: number;
    widthMm: number; heightMm: number;
    ditherMethod: string;
    params: OpParams;
    rotation?: number; // degrees, rotation around design center
}

export function generateRasterGCode(opts: RasterGCodeOptions): string {
    const { ditheredCanvas, posX, posY, widthMm, heightMm, ditherMethod, params, rotation: rotDeg = 0 } = opts;
    const ctx    = ditheredCanvas.getContext('2d')!;
    const w      = ditheredCanvas.width;
    const h      = ditheredCanvas.height;
    const { data } = ctx.getImageData(0, 0, w, h);

    // Rotation transform around design center
    const rotRad = -rotDeg * Math.PI / 180;
    const cosR = Math.cos(rotRad), sinR = Math.sin(rotRad);
    const cxMm = posX + widthMm / 2, cyMm = posY + heightMm / 2;
    const rotatePt = (x: number, y: number): { x: number; y: number } => {
        if (rotDeg === 0) return { x, y };
        const dx = x - cxMm, dy = y - cyMm;
        return { x: cxMm + dx * cosR - dy * sinR, y: cyMm + dx * sinR + dy * cosR };
    };

    // pixelS: maps pixel luminance (0=black…255=white) to an S value.
    // - Black pixels (lum 0)   → params.power    (max burn)
    // - White pixels (lum 255) → 0               (no burn)
    // - Mid-tones              → interpolated between params.minPower and params.power
    // This gives analogue grayscale shading when minPower > 0.
    const pixelLum = (px: number, row: number) => data[(row * w + px) * 4];   // R channel of greyscale
    const pixelS   = (px: number, row: number): number => {
        const lum = pixelLum(px, row);
        if (lum >= 128) return 0;   // light pixel — no burn
        // Map lum 127→0 (dark to black) → params.minPower…params.power
        const t = 1 - lum / 127;   // 0 at lum=127, 1 at lum=0
        return Math.round(params.minPower + t * (params.power - params.minPower));
    };
    const isDark   = (px: number, row: number) => pixelLum(px, row) < 128;
    const xToMm   = (px: number) => posX + (px / Math.max(w - 1, 1)) * widthMm;
    const nLines  = Math.ceil(heightMm / params.lineDistance);
    const marginPx = Math.round((params.margin / Math.max(widthMm, 0.001)) * w);

    const out: string[] = [
        '; NeonBeam OS — Raster GCode',
        `; Dither: ${ditherMethod}  Line spacing: ${params.lineDistance} mm`,
        `; Power: ${params.minPower}–${params.power}S  Feed: ${params.rate} mm/min  Passes: ${params.passes}`,
        `; Origin: X${posX} Y${posY}  Size: ${widthMm.toFixed(2)}×${heightMm.toFixed(2)} mm`,
        'G21', 'G90',
    ];
    if (params.airAssist) out.push('M8');
    out.push('M4 ; dynamic laser mode');
    out.push(`F${params.rate}`);
    out.push('');

    for (let pass = 0; pass < params.passes; pass++) {
        if (params.passes > 1) out.push(`; === Pass ${pass + 1} / ${params.passes} ===`);

        for (let li = 0; li < nLines; li++) {
            // Machine Y: scan top-down (Y decreasing in machine coords)
            const yMm    = posY + heightMm - li * params.lineDistance;
            const pixRow = Math.min(h - 1, Math.floor((li / nLines) * h));
            const ltr    = li % 2 === 0;   // boustrophedon alternation

            // Collect burn segments
            const segs: { a: number; b: number }[] = [];
            let burning = false, startPx = 0;
            const pxSeq = ltr
                ? Array.from({ length: w }, (_, i) => i)
                : Array.from({ length: w }, (_, i) => w - 1 - i);

            for (const px of pxSeq) {
                const dark = isDark(px, pixRow);
                if (dark  && !burning) { startPx = px; burning = true; }
                if (!dark &&  burning) { segs.push({ a: startPx, b: px - (ltr ? 1 : -1) }); burning = false; }
            }
            if (burning) segs.push({ a: startPx, b: pxSeq[pxSeq.length - 1] });
            if (segs.length === 0) continue;

            // Rapid to line start (with overscan margin)
            const approachX = ltr
                ? xToMm(Math.max(0, segs[0].a - marginPx))
                : xToMm(Math.min(w - 1, segs[0].a + marginPx));

            const approachPt = rotatePt(approachX, yMm);
            out.push(`G0 X${approachPt.x.toFixed(3)} Y${approachPt.y.toFixed(3)}`);
            for (const seg of segs) {
                const segA = rotatePt(xToMm(seg.a), yMm);
                out.push(`G1 X${segA.x.toFixed(3)} Y${segA.y.toFixed(3)} S0`);
                const segB = rotatePt(xToMm(seg.b), yMm);
                out.push(`G1 X${segB.x.toFixed(3)} Y${segB.y.toFixed(3)} S${pixelS(seg.b, pixRow)}`);
            }
            out.push('G1 S0');
        }
    }

    out.push(''); out.push('G0 X0.000 Y0.000');
    if (params.airAssist) out.push('M9');
    out.push('M5');
    return out.join('\n');
}

// ── GCode Preview Parser ───────────────────────────────────────────────────────
// Parses generated GCode into drawable segments for the canvas toolpath overlay.

export interface PreviewMove {
    x: number; y: number;
    burn:  boolean;          // true = laser firing (G1 with S > 0)
    rapid: boolean;          // true = G0 rapid move
    opType?: 'cut' | 'fill' | 'raster'; // detected from ; Op N / M : name [cut/fill/raster] header
}

export function parseGCodeForPreview(text: string): PreviewMove[] {
    const moves: PreviewMove[] = [];
    let cx = 0, cy = 0, laserOn = false;
    let currentOpType: 'cut' | 'fill' | 'raster' | undefined;

    for (const raw of text.split('\n')) {
        const trimmed = raw.trim();

        // Detect op-type from our multi-op headers:  ; Op N / M : name [cut]  or  [fill]
        const opHeader = trimmed.match(/;\s*Op\s+\d+\s*\/\s*\d+\s*:.*\[(cut|fill|raster)\]/i);
        if (opHeader) {
            currentOpType = opHeader[1].toLowerCase() as 'cut' | 'fill' | 'raster';
        }

        const line = trimmed.replace(/;.*$/, '').trim().toUpperCase();
        if (!line) continue;

        const isG0 = /^G0\b/.test(line);
        const isG1 = /^G1\b/.test(line);
        if (!isG0 && !isG1) {
            if (/M5\b/.test(line)) laserOn = false;
            continue;
        }

        const xm = line.match(/X(-?[\d.]+)/);
        const ym = line.match(/Y(-?[\d.]+)/);
        const sm = line.match(/S([\d.]+)/);

        if (sm) laserOn = parseFloat(sm[1]) > 0;

        const nx = xm ? parseFloat(xm[1]) : cx;
        const ny = ym ? parseFloat(ym[1]) : cy;

        moves.push({ x: nx, y: ny, burn: laserOn && isG1, rapid: isG0, opType: currentOpType });
        cx = nx; cy = ny;
    }
    return moves;
}
