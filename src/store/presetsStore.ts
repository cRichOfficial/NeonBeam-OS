import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface MaterialPreset {
    id: string;
    name: string;
    material: string; // e.g., "Birch Wood", "Slate"
    opType: 'Cut' | 'Engrave' | 'Fill' | 'Score';
    power: number; // 0-1000
    rate: number; // Feed rate in mm/min — ALWAYS mm/min regardless of display units preference (converted by UI layer)
    lineDistance: number; // mm
    lineAngle: number; // degrees
    margin: number; // mm
    passes: number;
    airAssist: boolean;
}

interface PresetsStore {
    presets: MaterialPreset[];
    addPreset: (preset: MaterialPreset) => void;
    updatePreset: (id: string, preset: Partial<MaterialPreset>) => void;
    deletePreset: (id: string) => void;
    importPresets: (presets: MaterialPreset[]) => void;
}

const defaultPresets: MaterialPreset[] = [
    {
        id: '1', name: '3mm Birch Cut', material: 'Birch Wood', opType: 'Cut',
        power: 850, rate: 300, lineDistance: 0, lineAngle: 0, margin: 0, passes: 3, airAssist: true
    },
    {
        id: '2', name: 'Slate Coaster', material: 'Slate', opType: 'Fill',
        power: 350, rate: 2500, lineDistance: 0.1, lineAngle: 45, margin: 2, passes: 1, airAssist: false
    }
];

export const usePresetsStore = create<PresetsStore>()(
    persist(
        (set) => ({
            presets: defaultPresets,
            addPreset: (preset) => set((state) => ({ presets: [...state.presets, preset] })),
            updatePreset: (id, updated) => set((state) => ({
                presets: state.presets.map(p => p.id === id ? { ...p, ...updated } : p)
            })),
            deletePreset: (id) => set((state) => ({
                presets: state.presets.filter(p => p.id !== id)
            })),
            importPresets: (newPresets) => set((state) => ({
                // Merge without duplicates via ID
                presets: [...state.presets, ...newPresets.filter(np => !state.presets.some(sp => sp.id === np.id))]
            }))
        }),
        {
            name: 'neonbeam-materials'
        }
    )
);
