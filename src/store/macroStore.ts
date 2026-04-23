import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface GCodeMacro {
    id: string;
    label: string;
    gcode: string;
    isBuiltIn?: boolean;
    isToggle?: boolean;
    gcodeOff?: string;
    color?: string;
}

export const BUILT_IN_MACROS: GCodeMacro[] = [
    { id: 'builtin_h_all', label: '$H All', gcode: 'builtin_h_all', isBuiltIn: true },
    { id: 'builtin_h_x', label: '$HX', gcode: 'builtin_h_x', isBuiltIn: true },
    { id: 'builtin_h_y', label: '$HY', gcode: 'builtin_h_y', isBuiltIn: true },
    { id: 'builtin_set_x', label: 'Set X=0', gcode: 'builtin_set_x', isBuiltIn: true },
    { id: 'builtin_set_y', label: 'Set Y=0', gcode: 'builtin_set_y', isBuiltIn: true },
    { id: 'builtin_set_origin', label: 'Set Origin', gcode: 'builtin_set_origin', isBuiltIn: true }
];

const DEFAULT_LAYOUT: (string | null)[] = [
    'builtin_h_all', 'builtin_h_x', 'builtin_h_y',
    'builtin_set_x', 'builtin_set_y', 'builtin_set_origin',
    null, null, null,
    null, null, null
];

interface MacroStore {
    macros: GCodeMacro[];
    layout: (string | null)[];  // Exactly 12 slots; null = empty
    toggleStates: Record<string, boolean>; // Transient toggles

    addMacro: (label: string, gcode: string, color?: string, isToggle?: boolean, gcodeOff?: string) => string;
    editMacro: (id: string, label: string, gcode: string, color?: string, isToggle?: boolean, gcodeOff?: string) => void;
    deleteMacro: (id: string) => void;
    updateLayout: (newLayout: (string | null)[]) => void;
    flipToggle: (id: string, forceState?: boolean) => void;
}

function uid(): string {
    return Math.random().toString(36).slice(2, 9);
}

export const useMacroStore = create<MacroStore>()(
    persist(
        (set) => ({
            macros: [...BUILT_IN_MACROS],
            layout: [...DEFAULT_LAYOUT],
            toggleStates: {} as Record<string, boolean>,

            addMacro: (label, gcode, color, isToggle, gcodeOff) => {
                const id = uid();
                set((state) => {
                    const newMacro: GCodeMacro = { id, label, gcode, color, isToggle, gcodeOff };
                    return { macros: [...state.macros, newMacro] };
                });
                return id;
            },

            editMacro: (id, label, gcode, color, isToggle, gcodeOff) => set((state) => ({
                macros: state.macros.map((m) =>
                    m.id === id && !m.isBuiltIn ? { ...m, label, gcode, color, isToggle, gcodeOff } : m
                )
            })),

            deleteMacro: (id) => set((state) => {
                const newMacros = state.macros.filter((m) => m.id !== id || m.isBuiltIn);
                const newLayout = state.layout.map((item) => item === id ? null : item);
                return { macros: newMacros, layout: newLayout };
            }),

            updateLayout: (newLayout) => set({ layout: newLayout }),

            flipToggle: (id, forceState) => set((state) => ({
                toggleStates: {
                    ...state.toggleStates,
                    [id]: forceState !== undefined ? forceState : !state.toggleStates[id]
                }
            }))
        }),
        {
            name: 'neonbeam-macros',
            merge: (persistedState: any, currentState: MacroStore) => {
                // Ensure built-in macros always exist and stay up-to-date,
                // while restoring the user's custom macros and layout.
                const p = persistedState as Partial<MacroStore> | null;
                const restoredMacros = p?.macros?.filter(m => !m.isBuiltIn) || [];
                
                // Keep the 12-slot layout constraint
                let layout = p?.layout;
                if (!layout || layout.length !== 12) {
                    layout = [...DEFAULT_LAYOUT];
                }

                // Remove layout entries that no longer exist in the store (excluding builtins)
                const allValidIds = new Set([
                    ...BUILT_IN_MACROS.map(m => m.id), 
                    ...restoredMacros.map(m => m.id)
                ]);
                
                layout = layout.map(id => (id && allValidIds.has(id)) ? id : null);

                return {
                    ...currentState,
                    macros: [...BUILT_IN_MACROS, ...restoredMacros],
                    layout,
                    toggleStates: {} as Record<string, boolean> // Always transient
                };
            }
        }
    )
);
