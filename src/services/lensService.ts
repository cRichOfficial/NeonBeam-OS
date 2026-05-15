import axios from 'axios';
import { useAppSettingsStore } from '../store/appSettingsStore';
import type { 
    CalibrationPoint, 
    CalibrationRequest, 
    DetectionResult, 
    TransformRequest, 
    TransformResponse,
    LensHealthResponse,
    CameraSettings,
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

    async detectObjects(objectHeightMm: number = 0, thresholdOffset: number = 0, erosionIterations: number = 1): Promise<DetectionResult[]> {
        const res = await axios.get(`${this.baseUrl}/api/camera/detect/objects`, {
            params: {
                object_height_mm: objectHeightMm,
                threshold_offset: thresholdOffset,
                erosion_iterations: erosionIterations
            }
        });
        const raw = res.data;

        const items: any[] = Array.isArray(raw?.objects) ? raw.objects : [];

        return items.map((wp: any): DetectionResult => {
            let box: [number, number, number, number] | undefined;
            let centerX: number | undefined;
            let centerY: number | undefined;
            if (Array.isArray(wp.bbox_mm) && wp.bbox_mm.length >= 4) {
                const [x, y, w, h] = wp.bbox_mm;
                box = [x, y, w, h];
            }
            if (Array.isArray(wp.center_mm) && wp.center_mm.length >= 2) {
                centerX = wp.center_mm[0];
                centerY = wp.center_mm[1];
            }

            const mapPts = (arr: any): Array<{ x: number; y: number }> | undefined => {
                if (!Array.isArray(arr) || arr.length === 0) return undefined;
                return arr.map((p: any) =>
                    Array.isArray(p) ? { x: p[0], y: p[1] } : p
                );
            };

            const points = mapPts(wp.contour_mm);
            const corners = mapPts(wp.corners_mm);

            return {
                workpiece_id: String(wp.id ?? 'unknown'),
                box,
                points,
                corners,
                center_x:     centerX,
                center_y:     centerY,
                angle_deg:    wp.rotation_deg,
            };
        });
    }

    async calibrate(points: CalibrationPoint[]) {
        const payload: CalibrationRequest = { points };
        const res = await axios.post(`${this.baseUrl}/api/camera/calibrate/apriltags`, payload);
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

    // ── Camera Settings ──

    async getCameraSettings(): Promise<CameraSettings> {
        const res = await axios.get(`${this.baseUrl}/api/camera/settings`);
        return res.data;
    }

    async updateCameraSettings(settings: CameraSettings): Promise<CameraSettings> {
        const res = await axios.post(`${this.baseUrl}/api/camera/settings`, settings);
        return res.data;
    }

    async getCalibrationTags(): Promise<CalibrationPoint[]> {
        const res = await axios.get(`${this.baseUrl}/api/camera/calibrate/apriltags`);
        const rawPoints = res.data?.points ?? (Array.isArray(res.data) ? res.data : []);
        
        return rawPoints.map((t: any, index: number) => {
            const id = t.id !== undefined ? String(t.id) : String(index);
            return {
                id,
                position_x_mm: t.position_x_mm ?? 0,
                position_y_mm: t.position_y_mm ?? 0,
                size_mm: t.size_mm ?? 30
            };
        });
    }
}

export const lensService = new LensService();
