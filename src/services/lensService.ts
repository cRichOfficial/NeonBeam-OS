import axios from 'axios';
import { useAppSettingsStore } from '../store/appSettingsStore';
import type { 
    CalibrationPoint, 
    CalibrationRequest, 
    DetectionResult, 
    TransformRequest, 
    TransformResponse,
    LensHealthResponse,
    LensSessionStatus,
    LensCalibrationResult,
} from '../types/lens';

class LensService {
    private get baseUrl() {
        return useAppSettingsStore.getState().settings.lensApiUrl;
    }

    async getHealth() {
        try {
            const res = await axios.get(`${this.baseUrl}/api/health`);
            return res.status === 200;
        } catch {
            return false;
        }
    }

    async getHealthStatus(): Promise<LensHealthResponse | null> {
        try {
            const res = await axios.get<LensHealthResponse>(`${this.baseUrl}/api/health`);
            return res.data;
        } catch {
            return null;
        }
    }

    getStreamUrl() {
        return `${this.baseUrl}/api/lens/stream`;
    }

    getFrameUrl() {
        return `${this.baseUrl}/api/lens/frame?t=${Date.now()}`;
    }

    async detectObjects(): Promise<DetectionResult[]> {
        const res = await axios.get(`${this.baseUrl}/api/lens/detect`);
        const raw = res.data;

        // The API returns { status, workpieces: [...] } with backend-specific
        // field names.  Normalize into our DetectionResult interface.
        const items: any[] = Array.isArray(raw)
            ? raw                        // legacy: plain array
            : Array.isArray(raw?.workpieces)
                ? raw.workpieces         // current: { workpieces: [...] }
                : [];

        return items.map((wp: any): DetectionResult => {
            // box_mm = [xmin, ymin, xmax, ymax] → box = [x, y, w, h]
            let box: [number, number, number, number] | undefined;
            let centerX: number | undefined;
            let centerY: number | undefined;
            if (Array.isArray(wp.box_mm) && wp.box_mm.length >= 4) {
                const [xmin, ymin, xmax, ymax] = wp.box_mm;
                box = [xmin, ymin, xmax - xmin, ymax - ymin];
                centerX = (xmin + xmax) / 2;
                centerY = (ymin + ymax) / 2;
            }

            // corners_mm / segmentation_mm are [[x,y], ...] → {x, y}[]
            const mapPts = (arr: any): Array<{ x: number; y: number }> | undefined => {
                if (!Array.isArray(arr) || arr.length === 0) return undefined;
                return arr.map((p: any) =>
                    Array.isArray(p) ? { x: p[0], y: p[1] } : p
                );
            };

            // Prefer segmentation for shape fidelity, fall back to corners
            const points = mapPts(wp.segmentation_mm) ?? mapPts(wp.corners_mm);
            // Also keep corners separately for oriented width/height calculation
            const corners = mapPts(wp.corners_mm);

            return {
                workpiece_id: wp.id ?? wp.workpiece_id ?? 'unknown',
                label:        wp.class ?? wp.label,
                confidence:   wp.confidence,
                box,
                points,
                corners,
                center_x:     centerX,
                center_y:     centerY,
                angle_deg:    wp.angle_deg,
            };
        });
    }

    async calibrate(tags: CalibrationPoint[]) {
        const payload: CalibrationRequest = { tags };
        const res = await axios.post(`${this.baseUrl}/api/lens/calibrate`, payload);
        return res.data;
    }

    async calculateTransform(params: TransformRequest): Promise<TransformResponse> {
        const formData = new FormData();
        formData.append('workpiece_id', params.workpiece_id);
        
        if (params.design_width_mm) formData.append('design_width_mm', params.design_width_mm.toString());
        if (params.design_height_mm) formData.append('design_height_mm', params.design_height_mm.toString());
        if (params.dpi) formData.append('dpi', params.dpi.toString());
        if (params.padding_mm) formData.append('padding_mm', params.padding_mm.toString());
        
        if (params.design_file) {
            if (params.design_file instanceof Blob) {
                formData.append('design_file', params.design_file);
            } else {
                formData.append('design_file', params.design_file);
            }
        }

        const res = await axios.post(`${this.baseUrl}/api/lens/transform`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
        return res.data;
    }

    getTagUrl(tagId: number, sizeMm: number = 50, dpi: number = 300, guideDistanceMm?: number) {
        let url = `${this.baseUrl}/api/apriltag/generate/${tagId}?size_mm=${sizeMm}&dpi=${dpi}`;
        if (guideDistanceMm !== undefined && guideDistanceMm > 0) {
            url += `&guide_distance_mm=${guideDistanceMm}`;
        }
        return url;
    }

    async generateTag(tagId: number, sizeMm: number = 50, dpi: number = 300, paperWidthIn: number = 8.5, paperHeightIn: number = 11.0, guideDistanceMm?: number): Promise<Blob> {
        const params: any = { size_mm: sizeMm, dpi, paper_width_in: paperWidthIn, paper_height_in: paperHeightIn };
        if (guideDistanceMm !== undefined && guideDistanceMm > 0) params.guide_distance_mm = guideDistanceMm;
        const res = await axios.get(`${this.baseUrl}/api/apriltag/generate/${tagId}`, {
            params,
            responseType: 'blob'
        });
        return res.data;
    }

    async batchGenerateTags(startId: number = 0, count: number = 4, sizeMm: number = 50, dpi: number = 300, paperWidthIn: number = 8.5, paperHeightIn: number = 11.0, guideDistanceMm?: number): Promise<Blob> {
        const params: any = { start_id: startId, count, size_mm: sizeMm, dpi, paper_width_in: paperWidthIn, paper_height_in: paperHeightIn };
        if (guideDistanceMm !== undefined && guideDistanceMm > 0) params.guide_distance_mm = guideDistanceMm;
        const res = await axios.get(`${this.baseUrl}/api/apriltag/batch`, {
            params,
            responseType: 'blob'
        });
        return res.data;
    }

    // ── Lens Distortion Calibration ──

    getCheckerboardUrl(rows: number = 9, cols: number = 6, squareMm: number = 25, dpi: number = 300) {
        return `${this.baseUrl}/api/lens/checkerboard/generate?rows=${rows}&cols=${cols}&square_mm=${squareMm}&dpi=${dpi}`;
    }

    async lensCalibrationStart(rows: number = 9, cols: number = 6, squareMm: number = 25): Promise<LensSessionStatus> {
        const res = await axios.post(`${this.baseUrl}/api/lens/calibrate-lens/start`, null, {
            params: { rows, cols, square_mm: squareMm }
        });
        return res.data;
    }

    async lensCalibrationCapture(): Promise<LensSessionStatus> {
        const res = await axios.post(`${this.baseUrl}/api/lens/calibrate-lens/capture`);
        return res.data;
    }

    async lensCalibrationFinish(): Promise<LensCalibrationResult> {
        const res = await axios.post(`${this.baseUrl}/api/lens/calibrate-lens/finish`);
        return res.data;
    }

    async lensCalibrationStatus(): Promise<LensSessionStatus> {
        const res = await axios.get(`${this.baseUrl}/api/lens/calibrate-lens/status`);
        return res.data;
    }

    async lensCalibrationReset(): Promise<{ status: string; message: string }> {
        const res = await axios.delete(`${this.baseUrl}/api/lens/calibrate-lens`);
        return res.data;
    }

    getLensPreviewUrl() {
        return `${this.baseUrl}/api/lens/calibrate-lens/preview?t=${Date.now()}`;
    }

    async getCalibrationTags(): Promise<CalibrationPoint[]> {
        const res = await axios.get(`${this.baseUrl}/api/lens/calibration/tags`);
        const rawTags = res.data?.tags ?? (Array.isArray(res.data) ? res.data : []);
        
        // Aggressively normalize backend fields to frontend fields
        return rawTags.map((t: any, index: number) => {
            const id = t.id !== undefined ? t.id : (t.tag_id !== undefined ? t.tag_id : index);
            return {
                id: Number(id),
                physical_x: t.physical_x ?? t.machine_x ?? t.x ?? t.pos_x ?? 0,
                physical_y: t.physical_y ?? t.machine_y ?? t.y ?? t.pos_y ?? 0,
                size_mm: t.size_mm ?? t.size ?? t.dimension ?? 30,
                anchor: t.anchor ?? 'center'
            };
        });
    }
}

export const lensService = new LensService();
