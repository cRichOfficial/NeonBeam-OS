export interface CalibrationPoint {
    id: string;
    position_x_mm: number;
    position_y_mm: number;
    size_mm: number;
}

export interface CalibrationRequest {
    points: CalibrationPoint[];
}

export interface DetectionResult {
    workpiece_id: string;
    label?: string;
    confidence?: number;
    box?: [number, number, number, number]; // [x, y, w, h] in mm workspace coords (axis-aligned)
    points?: Array<{ x: number, y: number }>;  // segmentation outline or corners
    corners?: Array<{ x: number, y: number }>; // 4 corners of the oriented bounding box
    center_x?: number;  // mm — object centroid X (if provided by API)
    center_y?: number;  // mm — object centroid Y (if provided by API)
    angle_deg?: number; // degrees — object orientation (if provided by API)
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
    camera_detected: boolean;
    mock_mode: boolean;
}



export interface CameraSettings {
    iso: number;
    exposure_time: number;
    camera_mounting_height_mm: number;
}
