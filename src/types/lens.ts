export interface CalibrationPoint {
    id: number;
    physical_x: number;
    physical_y: number;
    size_mm?: number;
    anchor?: string;
}

export interface CalibrationRequest {
    tags: CalibrationPoint[];
}

export interface DetectionResult {
    workpiece_id: string;
    label?: string;
    confidence?: number;
    box?: [number, number, number, number]; // [x, y, w, h] in normalized or image coords
    points?: Array<{ x: number, y: number }>;
}

export interface TransformRequest {
    workpiece_id: string;
    design_width_mm?: number;
    design_height_mm?: number;
    dpi?: number;
    padding_mm?: number;
    design_file?: Blob | string; // File or Base64
}

export interface TransformResponse {
    success: boolean;
    message?: string;
    translation?: { x: number, y: number };
    rotation?: number; // degrees or radians
    scale?: number;
    transformed_design_url?: string;
}

// ── Lens Calibration Types ──

export interface LensHealthResponse {
    status: string;
    service: string;
    detector: string;
    camera_active: boolean;
    lens_calibrated: boolean;
    homography_calibrated: boolean;
}

export interface LensSessionStatus {
    session_id?: string;
    captures_done: number;
    total_target: number;
    max_captures: number;
    zones_covered: string[];
    zones_remaining: string[];
    can_finish: boolean;
    preview_url?: string;
    success?: boolean;
    zone_hit?: string;
    message?: string;
    instruction?: string;
    error?: string;
    // Status-only fields (no active session)
    status?: string;
    lens_model?: string;
}

export interface LensCalibrationResult {
    status: string;
    model: string;
    rms_error: number;
    camera_matrix: number[][];
    dist_coeffs: number[];
    captures_used: number;
    zones_covered: string[];
    note: string;
}
