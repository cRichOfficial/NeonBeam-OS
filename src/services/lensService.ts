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
        return res.data;
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

    getTagUrl(tagId: number, sizeMm: number = 50, dpi: number = 300) {
        return `${this.baseUrl}/api/apriltag/generate/${tagId}?size_mm=${sizeMm}&dpi=${dpi}`;
    }

    async generateTag(tagId: number, sizeMm: number = 50, dpi: number = 300, paperWidthIn: number = 8.5, paperHeightIn: number = 11.0): Promise<Blob> {
        const res = await axios.get(`${this.baseUrl}/api/apriltag/generate/${tagId}`, {
            params: { size_mm: sizeMm, dpi, paper_width_in: paperWidthIn, paper_height_in: paperHeightIn },
            responseType: 'blob'
        });
        return res.data;
    }

    async batchGenerateTags(startId: number = 0, count: number = 4, sizeMm: number = 50, dpi: number = 300, paperWidthIn: number = 8.5, paperHeightIn: number = 11.0): Promise<Blob> {
        const res = await axios.get(`${this.baseUrl}/api/apriltag/batch`, {
            params: { start_id: startId, count, size_mm: sizeMm, dpi, paper_width_in: paperWidthIn, paper_height_in: paperHeightIn },
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

    getLensPreviewUrl() {
        return `${this.baseUrl}/api/lens/calibrate-lens/preview?t=${Date.now()}`;
    }
}

export const lensService = new LensService();
