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
