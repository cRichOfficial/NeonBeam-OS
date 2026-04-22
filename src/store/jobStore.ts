import { create } from 'zustand';

export interface JobStatus {
    is_streaming:    boolean;
    is_queued:       boolean;   // loaded, awaiting Cycle Start
    job_name:        string;
    total_lines:     number;
    lines_sent:      number;
    feed_rate_mm_min?: number | null;   // programmed feed parsed from GCode header
}

interface JobStoreState {
    jobStatus:    JobStatus | null;
    setJobStatus: (s: JobStatus | null) => void;
}

/**
 * Shared job status store — written by StudioModule poll loop,
 * read by DashboardModule cancel button and any other consumer.
 * Lives outside both components so it survives navigation.
 */
export const useJobStore = create<JobStoreState>((set) => ({
    jobStatus:    null,
    setJobStatus: (s) => set({ jobStatus: s }),
}));
