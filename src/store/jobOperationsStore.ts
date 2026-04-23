// NeonBeam OS — Job Operations Store
// In-memory only (no persist middleware): state survives module navigation but
// is lost on a full browser reload. clearAll() is called when a new file is loaded.

import { create } from 'zustand';
import type { SvgPathInfo, JobOperation, LayerOp } from '../studio/svgLayerEngine';
import type { OpParams } from '../studio/gcodeEngine';

// Re-export for convenience so UI only needs to import from this store
export type { SvgPathInfo, JobOperation, LayerOp };

const DEFAULT_PARAMS: OpParams = {
    power:        850,
    minPower:     0,
    rate:         1500,    // mm/min
    passes:       1,
    airAssist:    false,
    margin:       0,
    lineDistance: 0.1,
    lineAngle:    0,
};

interface JobOperationsState {
    /** All geometry elements discovered in the loaded SVG */
    svgPaths:       SvgPathInfo[];
    /** User-constructed operations, in addition order = GCode order */
    operations:     JobOperation[];
    /** Currently checked paths in the path panel (multi-select) */
    selectedPathIds: string[];

    // ── Mutators ──
    setSvgPaths:      (paths: SvgPathInfo[]) => void;
    setSelectedPaths: (ids: string[]) => void;
    togglePathSelect: (id: string) => void;

    addOperation:     (op: Omit<JobOperation, 'id'>) => void;
    /** Creates an operation from the currently selected path ids */
    addFromSelection: (opType: LayerOp, name: string, params?: Partial<OpParams>) => void;
    updateOperation:  (id: string, patch: Partial<Omit<JobOperation, 'id'>>) => void;
    updateParams:     (id: string, patch: Partial<OpParams>) => void;
    removeOperation:  (id: string) => void;
    moveOp:           (id: string, dir: 'up' | 'down') => void;

    /** Removes a single path from a specific operation */
    removePathFromOp: (opId: string, pathId: string) => void;

    /** Called when a new file is loaded — clears paths and operations */
    clearAll: () => void;
}

function uid(): string {
    return Math.random().toString(36).slice(2, 10);
}

export const useJobOperationsStore = create<JobOperationsState>((set, get) => ({
    svgPaths:        [],
    operations:      [],
    selectedPathIds: [],

    setSvgPaths: (paths) => set({ svgPaths: paths, selectedPathIds: [] }),

    setSelectedPaths: (ids) => set({ selectedPathIds: ids }),

    togglePathSelect: (id) => set(s => ({
        selectedPathIds: s.selectedPathIds.includes(id)
            ? s.selectedPathIds.filter(x => x !== id)
            : [...s.selectedPathIds, id],
    })),

    addOperation: (op) => set(s => ({
        operations: [...s.operations, { ...op, id: uid() }],
    })),

    addFromSelection: (opType, name, paramsPatch) => {
        const { selectedPathIds, operations } = get();
        if (selectedPathIds.length === 0) return;
        const params: OpParams = { ...DEFAULT_PARAMS, ...paramsPatch };
        const newOp: JobOperation = {
            id:      uid(),
            name:    name || `${opType === 'fill' ? 'Fill' : 'Cut'} ${operations.length + 1}`,
            opType,
            pathIds: [...selectedPathIds],
            params,
        };
        set(s => ({
            operations:      [...s.operations, newOp],
            selectedPathIds: [],   // clear selection after adding
        }));
    },

    updateOperation: (id, patch) => set(s => ({
        operations: s.operations.map(op => op.id === id ? { ...op, ...patch } : op),
    })),

    updateParams: (id, patch) => set(s => ({
        operations: s.operations.map(op =>
            op.id === id ? { ...op, params: { ...op.params, ...patch } } : op
        ),
    })),

    removeOperation: (id) => set(s => ({
        operations: s.operations.filter(op => op.id !== id),
    })),

    moveOp: (id, dir) => set(s => {
        const idx = s.operations.findIndex(op => op.id === id);
        if (idx < 0) return s;
        const ops  = [...s.operations];
        const swap = dir === 'up' ? idx - 1 : idx + 1;
        if (swap < 0 || swap >= ops.length) return s;
        [ops[idx], ops[swap]] = [ops[swap], ops[idx]];
        return { operations: ops };
    }),

    removePathFromOp: (opId, pathId) => set(s => ({
        operations: s.operations.map(op =>
            op.id === opId
                ? { ...op, pathIds: op.pathIds.filter(p => p !== pathId) }
                : op
        ).filter(op => op.pathIds.length > 0),   // auto-remove empty ops
    })),

    clearAll: () => set({ svgPaths: [], operations: [], selectedPathIds: [] }),
}));
