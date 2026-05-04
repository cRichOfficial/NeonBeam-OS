import React, { useRef, useEffect, useCallback, useState } from 'react';

export interface WorkspaceTransform {
    zoom: number;
    offsetX: number;
    offsetY: number;
    baseScale: number;
    plotW: number;
    plotH: number;
    marginLeft: number;
    marginBottom: number;
}

export interface WorkspaceGridProps {
    width?: number;
    height?: number;
    machineWidthMm: number;
    machineHeightMm: number;
    majorSpacingMm?: number;
    minorSpacingMm?: number;
    
    // Background Image
    backgroundImageUrl?: string;

    // Interaction
    enablePanZoom?: boolean;
    zoom?: number;
    minZoom?: number;
    maxZoom?: number;
    offsetX?: number;
    offsetY?: number;
    onTransformChange?: (zoom: number, offsetX: number, offsetY: number) => void;
    onClickMm?: (mmX: number, mmY: number, e: React.MouseEvent) => void;
    
    // Render hooks
    renderOverlay?: (ctx: CanvasRenderingContext2D, transform: WorkspaceTransform) => void;
    
    children?: (transform: WorkspaceTransform) => React.ReactNode;
    
    className?: string;
}

export const WorkspaceGrid: React.FC<WorkspaceGridProps> = ({
    width = 480,
    height = 300,
    machineWidthMm,
    machineHeightMm,
    majorSpacingMm = 50,
    minorSpacingMm = 10,
    backgroundImageUrl,
    enablePanZoom = true,
    zoom: externalZoom,
    offsetX: externalOffsetX,
    offsetY: externalOffsetY,
    onTransformChange,
    onClickMm,
    renderOverlay,
    children,
    className = '',
    minZoom = 0.2,
    maxZoom = 10
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Default margin layout from the previous canvas setup
    const ML = 32;
    const MB = 20;
    const DW = width - ML;
    const DH = height - MB;

    // Internal state for pan/zoom if not fully controlled
    const [internalZoom, setInternalZoom] = useState(1);
    const [internalOffsetX, setInternalOffsetX] = useState(0);
    const [internalOffsetY, setInternalOffsetY] = useState(0);

    const zoom = externalZoom !== undefined ? externalZoom : internalZoom;
    const offsetX = externalOffsetX !== undefined ? externalOffsetX : internalOffsetX;
    const offsetY = externalOffsetY !== undefined ? externalOffsetY : internalOffsetY;

    // Setup coordinate math
    const baseScale = Math.min(DW / machineWidthMm, DH / machineHeightMm);

    // Set initial offset on mount so the machine bed is centered/visible
    useEffect(() => {
        if (externalOffsetX === undefined && externalOffsetY === undefined) {
            const plotW = baseScale * machineWidthMm;
            const plotH = baseScale * machineHeightMm;
            const centeredX = (DW - plotW) / 2;
            // Canvas origin sits at y = DH + offsetY.
            // To frame the bed (0..plotH), we want the center of the bed
            // at the center of the drawable area: offsetY - plotH/2 = -DH/2
            // => offsetY = plotH/2 - DH/2 = (plotH - DH) / 2
            const centeredY = (plotH - DH) / 2;
            setInternalOffsetX(centeredX);
            setInternalOffsetY(centeredY);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // run once on mount

    const updateTransform = useCallback((newZ: number, newX: number, newY: number) => {
        if (onTransformChange) onTransformChange(newZ, newX, newY);
        setInternalZoom(newZ);
        setInternalOffsetX(newX);
        setInternalOffsetY(newY);
    }, [onTransformChange]);

    // Derived transform object to pass to callbacks
    const transform: WorkspaceTransform = {
        zoom,
        offsetX,
        offsetY,
        baseScale,
        plotW: baseScale * zoom * machineWidthMm,
        plotH: baseScale * zoom * machineHeightMm,
        marginLeft: ML,
        marginBottom: MB
    };

    // Pan / Zoom handlers
    const isPanning = useRef(false);
    const lastPoint = useRef<{x: number, y: number} | null>(null);
    const pointers = useRef<Map<number, {x: number, y: number}>>(new Map());
    const lastPinchDist = useRef<number | null>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !enablePanZoom) return;

        const handleWheel = (e: WheelEvent) => {
            e.preventDefault();
            const rect = canvas.getBoundingClientRect();
            // Mouse coords relative to the visual origin (ML, DH)
            const px = e.clientX - rect.left - ML;
            const py = e.clientY - rect.top - DH;

            let newZoom = zoom - (e.deltaY > 0 ? 0.1 : -0.1);
            if (newZoom < minZoom) newZoom = minZoom;
            if (newZoom > maxZoom) newZoom = maxZoom;

            const scaleRatio = newZoom / zoom;
            const newOffX = px - (px - offsetX) * scaleRatio;
            const newOffY = py - (py - offsetY) * scaleRatio;

            updateTransform(newZoom, newOffX, newOffY);
        };

        const handlePointerDown = (e: PointerEvent) => {
            pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (pointers.current.size === 1) {
                isPanning.current = true;
                lastPoint.current = { x: e.clientX, y: e.clientY };
            } else if (pointers.current.size === 2) {
                isPanning.current = false;
                const pts = Array.from(pointers.current.values());
                lastPinchDist.current = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
            }
        };

        const handlePointerMove = (e: PointerEvent) => {
            if (!pointers.current.has(e.pointerId)) return;
            pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

            if (pointers.current.size === 1 && isPanning.current && lastPoint.current) {
                const dx = e.clientX - lastPoint.current.x;
                const dy = e.clientY - lastPoint.current.y;
                updateTransform(zoom, offsetX + dx, offsetY + dy);
                lastPoint.current = { x: e.clientX, y: e.clientY };
            } else if (pointers.current.size === 2 && lastPinchDist.current !== null) {
                const pts = Array.from(pointers.current.values());
                const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
                const delta = dist - lastPinchDist.current;
                
                let newZoom = zoom + delta * 0.01;
                if (newZoom < minZoom) newZoom = minZoom;
                if (newZoom > maxZoom) newZoom = maxZoom;

                const rect = canvas.getBoundingClientRect();
                const cx = (pts[0].x + pts[1].x) / 2 - rect.left - ML;
                const cy = (pts[0].y + pts[1].y) / 2 - rect.top - DH;
                
                const scaleRatio = newZoom / zoom;
                const newOffX = cx - (cx - offsetX) * scaleRatio;
                const newOffY = cy - (cy - offsetY) * scaleRatio;

                updateTransform(newZoom, newOffX, newOffY);
                lastPinchDist.current = dist;
            }
        };

        const handlePointerUp = (e: PointerEvent) => {
            pointers.current.delete(e.pointerId);
            if (pointers.current.size < 2) lastPinchDist.current = null;
            if (pointers.current.size === 0) isPanning.current = false;
        };

        canvas.addEventListener('wheel', handleWheel, { passive: false });
        canvas.addEventListener('pointerdown', handlePointerDown);
        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);
        window.addEventListener('pointercancel', handlePointerUp);

        return () => {
            canvas.removeEventListener('wheel', handleWheel);
            canvas.removeEventListener('pointerdown', handlePointerDown);
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
            window.removeEventListener('pointercancel', handlePointerUp);
        };
    }, [enablePanZoom, zoom, offsetX, offsetY, updateTransform, ML]);

    const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!onClickMm || isPanning.current) return;
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        
        const px = e.clientX - rect.left - ML;
        const py = e.clientY - rect.top - DH;

        // Invert zoom/pan translation
        const logicalX = (px - offsetX) / zoom;
        const logicalY = (py - offsetY) / zoom;

        // Convert logical canvas px to mm (Y is inverted)
        const mmX = logicalX / baseScale;
        const mmY = -logicalY / baseScale;

        if (mmX >= 0 && mmX <= machineWidthMm && mmY >= 0 && mmY <= machineHeightMm) {
            onClickMm(mmX, mmY, e);
        }
    };

    // Render loop
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        const scaledWidth = width * dpr;
        const scaledHeight = height * dpr;

        // 1. Clear Canvas (CRITICAL to prevent ghosting/trailing on pan/zoom)
        // Must clear the true physical buffer size
        ctx.clearRect(0, 0, scaledWidth, scaledHeight);

        // Apply high-DPI scaling so CSS pixels map to physical screen pixels exactly
        ctx.save();
        ctx.scale(dpr, dpr);

        const lPlotW = baseScale * machineWidthMm;
        const lPlotH = baseScale * machineHeightMm;

        // Shift context origin to the bottom-left of the drawable area
        ctx.save();
        ctx.translate(ML, DH);

        // Apply pan & zoom
        ctx.save();
        ctx.translate(offsetX, offsetY);
        ctx.scale(zoom, zoom);

        // Plot background (draws UP from origin)
        if (!backgroundImageUrl) {
            ctx.fillStyle = 'rgba(0, 240, 255, 0.05)'; 
            ctx.fillRect(0, -lPlotH, lPlotW, lPlotH);
        }
        
        ctx.strokeStyle = 'rgba(0,240,255,0.12)'; ctx.lineWidth = 1 / zoom;
        ctx.strokeRect(0, -lPlotH, lPlotW, lPlotH);

        // Calculate visible physical bounds in the transformed coordinate space
        // The canvas is pre-translated by (ML, DH).
        // So the visible pixel area is from X: -ML to DW, and Y: -DH to MB (where MB is bottom margin, usually roughly 50).
        // Let's just use a generous height bound to be safe.
        const MB = 50; 
        const vMinX = (-ML - offsetX) / zoom;
        const vMaxX = (DW - offsetX) / zoom;
        const vMinY = (-DH - offsetY) / zoom; // visual top (negative Y is UP)
        const vMaxY = (MB - offsetY) / zoom; // visual bottom

        const startX_mm = Math.floor((vMinX / baseScale) / minorSpacingMm) * minorSpacingMm;
        const endX_mm = Math.ceil((vMaxX / baseScale) / minorSpacingMm) * minorSpacingMm;
        
        // Remember Y is inverted
        const startY_mm = Math.floor((-vMaxY / baseScale) / minorSpacingMm) * minorSpacingMm;
        const endY_mm = Math.ceil((-vMinY / baseScale) / minorSpacingMm) * minorSpacingMm;

        // Close the scaled context temporarily to draw grid lines in perfect screen-space pixels
        ctx.restore(); 

        ctx.save();

        // Clip to the drawable area (prevent grid lines from rendering over margin labels)
        ctx.beginPath();
        ctx.rect(0, -DH, DW, DH);
        ctx.clip();

        ctx.translate(offsetX, offsetY);

        // We can still use the full screen bounds for drawing lines, 
        // the clip will prevent them from rendering in the margins.
        const vMinX_screen = -ML - offsetX;
        const vMaxX_screen = width - offsetX;
        const vMinY_screen = -DH - offsetY;
        const vMaxY_screen = height - offsetY;

        // Helper to snap to exact absolute screen pixels to completely eliminate anti-aliasing blur
        const getPx = (x_mm: number) => Math.floor(ML + offsetX + x_mm * baseScale * zoom) + 0.5 - ML - offsetX;
        const getPy = (y_mm: number) => Math.floor(DH + offsetY - y_mm * baseScale * zoom) + 0.5 - DH - offsetY;

        // Minor grid (dashed) - only render if zoomed in sufficiently
        if (zoom >= 0.5) {
            ctx.beginPath(); 
            ctx.strokeStyle = 'rgba(0, 240, 255, 0.3)'; 
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            for (let x = startX_mm; x <= endX_mm; x += minorSpacingMm) { 
                if (x % majorSpacingMm === 0) continue; // Skip major line positions
                const px = getPx(x);
                ctx.moveTo(px, vMinY_screen); ctx.lineTo(px, vMaxY_screen); 
            }
            for (let y = startY_mm; y <= endY_mm; y += minorSpacingMm) { 
                if (y % majorSpacingMm === 0) continue; // Skip major line positions
                const py = getPy(y);
                ctx.moveTo(vMinX_screen, py); ctx.lineTo(vMaxX_screen, py); 
            }
            ctx.stroke();
        }

        // Major grid (solid)
        ctx.beginPath(); 
        ctx.strokeStyle = '#00f0ff'; 
        ctx.lineWidth = 1; // Actually 1px looks much cleaner and sharper for major lines too!
        ctx.setLineDash([]);
        for (let x = startX_mm; x <= endX_mm; x += minorSpacingMm) { 
            if (x % majorSpacingMm !== 0) continue;
            const px = getPx(x);
            ctx.moveTo(px, vMinY_screen); ctx.lineTo(px, vMaxY_screen); 
        }
        for (let y = startY_mm; y <= endY_mm; y += minorSpacingMm) { 
            if (y % majorSpacingMm !== 0) continue;
            const py = getPy(y);
            ctx.moveTo(vMinX_screen, py); ctx.lineTo(vMaxX_screen, py); 
        }
        ctx.stroke();

        // Origin axes (X=0 and Y=0)
        ctx.beginPath();
        ctx.strokeStyle = '#ff007f'; // miami-pink
        ctx.lineWidth = 3;
        const px0 = 0.5; // Origin is 0, snapped to 0.5
        ctx.moveTo(px0, vMinY_screen); ctx.lineTo(px0, vMaxY_screen); // Y-axis
        ctx.moveTo(vMinX_screen, px0); ctx.lineTo(vMaxX_screen, px0); // X-axis
        ctx.stroke();

        ctx.restore(); // Undo screen-space pan

        // Re-apply full pan/zoom context for overlays
        ctx.save();
        ctx.translate(offsetX, offsetY);
        ctx.scale(zoom, zoom);

        // Custom Overlays (e.g. GCode, Tag mapping)
        if (renderOverlay) {
            ctx.save();
            // Pass a modified transform to the overlay that provides the new y-math
            renderOverlay(ctx, { ...transform, plotH: lPlotH });
            ctx.restore();
        }

        ctx.restore(); // Undo pan/zoom

        // Axes & Labels (relative to origin)
        // Clear background for labels if camera stream is active so they are readable
        if (backgroundImageUrl) {
            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            ctx.fillRect(-ML, -DH, ML, DH); // Y-axis block
            ctx.fillRect(-ML, 0, width, MB); // X-axis block
        }

        // Margin lines (Fixed relative to the viewport)
        ctx.beginPath(); ctx.strokeStyle = 'rgba(0,240,255,0.4)'; ctx.lineWidth = 1;
        ctx.moveTo(0, -DH); ctx.lineTo(0, MB);
        ctx.moveTo(-ML, 0); ctx.lineTo(width, 0);
        ctx.stroke();

        // Origin Dot
        ctx.fillStyle = '#ff007f';
        ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();

        // Labels
        ctx.font = 'bold 12px ui-monospace,monospace';
        ctx.fillStyle = '#00f0ff';
        
        // X Labels
        ctx.textBaseline = 'top'; ctx.textAlign = 'center';
        
        // Recalculate label bounds to cover entire visible area
        const vMinX_px = -ML - offsetX;
        const vMaxX_px = (width - ML) - offsetX;
        const startXLabel = Math.floor((vMinX_px / zoom / baseScale) / majorSpacingMm) * majorSpacingMm;
        const endXLabel = Math.ceil((vMaxX_px / zoom / baseScale) / majorSpacingMm) * majorSpacingMm;

        for (let x = startXLabel; x <= endXLabel; x += majorSpacingMm) {
            const px = offsetX + (x * baseScale * zoom);
            // Skip labels that fall within the left-margin zone (Y-axis label column)
            // or outside the right edge
            if (px < 2 || px > width - ML) continue;
            ctx.fillText(`${x}`, px, 4);
        }

        // Y Labels
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        const vMinY_px = -DH - offsetY; // Visual top edge
        const vMaxY_px = (height - DH) - offsetY; // Visual bottom edge
        const startYLabel = Math.floor((-vMaxY_px / zoom / baseScale) / majorSpacingMm) * majorSpacingMm;
        const endYLabel = Math.ceil((-vMinY_px / zoom / baseScale) / majorSpacingMm) * majorSpacingMm;

        for (let y = startYLabel; y <= endYLabel; y += majorSpacingMm) {
            if (y === 0) continue; // Don't draw 0 over the origin dot
            const py = offsetY - (y * baseScale * zoom);
            if (py >= -DH && py <= height - DH) {
                ctx.fillText(`${y}`, -8, py);
            }
        }

        ctx.restore(); // Undo Origin shift
        ctx.restore(); // Undo High-DPI scale

    }, [
        width, height, machineWidthMm, machineHeightMm,
        majorSpacingMm, minorSpacingMm, zoom, offsetX, offsetY,
        baseScale, renderOverlay, transform, ML, MB, backgroundImageUrl
    ]);

    return (
        <div 
            className={`inline-block bg-miami-cyan/5 border border-miami-cyan shadow-[0_0_15px_rgba(0,240,255,0.2)] rounded-2xl p-2 ${className}`}
        >
            {backgroundImageUrl && (
                <img 
                    src={backgroundImageUrl} 
                    alt="" 
                    className="absolute inset-0 object-cover opacity-80 pointer-events-none"
                    style={{ left: ML + 8, top: 8, width: DW, height: DH }} // Approximate stream position
                    onError={(e) => (e.currentTarget.style.display = 'none')}
                />
            )}
            
            <canvas 
                ref={canvasRef} 
                width={width * (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1)} 
                height={height * (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1)} 
                onClick={handleCanvasClick}
                className="relative z-10 block cursor-crosshair rounded-lg"
                style={{ width: `${width}px`, height: `${height}px`, touchAction: 'none' }}
            />
            
            {/* Overlay HTML container */}
            {children && (
                <div 
                    className="absolute z-20 pointer-events-none"
                    style={{ left: ML + 8, top: 8, width: DW, height: DH }} // 8px padding from parent p-2
                >
                    {children(transform)}
                </div>
            )}
        </div>
    );
};
