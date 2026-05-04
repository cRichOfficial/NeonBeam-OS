import React, { useState, useMemo } from 'react';
import { useMacroStore } from '../store/macroStore';
import type { GCodeMacro } from '../store/macroStore';
import { View } from '../components/layout/View';
import { ActionPlanner } from '../components/ui/actions/ActionPlanner';
import { ActionList } from '../components/ui/actions/ActionList';
import { ActionItem } from '../components/ui/actions/ActionItem';
import { ActionButton } from '../components/ui/ActionButton';
import { Wizard, WizardStep } from '../components/ui/Wizard';
import { RadioGroup } from '../components/ui/RadioGroup';
import type { BaseAction, ActionTheme } from '../components/ui/actions/types';

// Map legacy macroStore color strings to the new ActionTheme
const mapColorToTheme = (color?: string): ActionTheme => {
    switch (color) {
        case 'pink':
        case 'purple':
            return 'miami-pink';
        case 'green':
            return 'neon-green';
        case 'yellow':
            return 'neon-orange';
        case 'cyan':
        case 'gray':
        default:
            return 'miami-cyan';
    }
};

const mapThemeToColor = (theme: ActionTheme): string => {
    switch (theme) {
        case 'miami-pink': return 'pink';
        case 'neon-green': return 'green';
        case 'neon-orange': return 'yellow';
        case 'miami-cyan':
        default: return 'cyan';
    }
};

const macroToAction = (m: GCodeMacro): BaseAction => ({
    id: m.id,
    title: m.label,
    subtitle: m.isBuiltIn ? 'Built-in Macro' : 'Custom Macro',
    theme: m.isBuiltIn ? 'miami-cyan' : mapColorToTheme(m.color),
    functionToCall: 'executeMacro',
    functionArgs: { id: m.id }
});

export const GCodeStudioModule: React.FC = () => {
    const macros = useMacroStore(s => s.macros);
    const layout = useMacroStore(s => s.layout);
    const addMacro = useMacroStore(s => s.addMacro);
    const editMacro = useMacroStore(s => s.editMacro);
    const deleteMacro = useMacroStore(s => s.deleteMacro);
    const updateLayout = useMacroStore(s => s.updateLayout);

    // Wizard State
    const [wizardOpen, setWizardOpen] = useState(false);
    const [wizardStep, setWizardStep] = useState(1);
    const [editId, setEditId] = useState<string | null>(null);
    const [formLabel, setFormLabel] = useState('');
    const [formGcode, setFormGcode] = useState('');
    const [formTheme, setFormTheme] = useState<ActionTheme>('miami-cyan');

    // Slot selection modal state
    const [selectingCellIndex, setSelectingCellIndex] = useState<number | null>(null);
    // Overflow toggle state for ActionPlanner
    const [enableOverflow, setEnableOverflow] = useState(true);

    // Derived planner actions mapped strictly to the 8 slots
    const plannerActions = useMemo(() => {
        // Enforce exactly 8 elements for the grid, mapping existing ones
        const actions: (BaseAction | undefined)[] = [];
        for (let i = 0; i < 8; i++) {
            const id = layout[i];
            if (id) {
                const m = macros.find(m => m.id === id);
                actions.push(m ? macroToAction(m) : undefined);
            } else {
                actions.push(undefined);
            }
        }
        return actions as BaseAction[];
    }, [layout, macros]);

    const openWizard = (m?: GCodeMacro) => {
        if (m) {
            setEditId(m.id);
            setFormLabel(m.label);
            setFormGcode(m.gcode);
            setFormTheme(mapColorToTheme(m.color));
        } else {
            setEditId(null);
            setFormLabel('');
            setFormGcode('');
            setFormTheme('miami-cyan');
        }
        setWizardStep(1);
        setWizardOpen(true);
    };

    const saveWizard = () => {
        if (!formLabel.trim() || !formGcode.trim()) return;

        const color = mapThemeToColor(formTheme);
        if (editId) {
            // Note: We don't pass isToggle and gcodeOff anymore since we removed the feature
            editMacro(editId, formLabel, formGcode, color);
        } else {
            addMacro(formLabel, formGcode, color);
        }
        setWizardOpen(false);
    };

    const assignSlot = (macroId: string | null) => {
        if (selectingCellIndex === null) return;
        
        const newLayout = [...layout];
        
        // Unset from another slot if already placed
        if (macroId !== null) {
            const existingIdx = newLayout.indexOf(macroId);
            if (existingIdx !== -1) {
                newLayout[existingIdx] = null;
            }
        }
        
        newLayout[selectingCellIndex] = macroId;
        updateLayout(newLayout);
        setSelectingCellIndex(null);
    };

    return (
        <View title="Macro Studio" subtitle="Configure and manage custom GCode actions" showHomeButton>
            <div className="p-4 pb-20 space-y-6">
                
                {/* 1. Action Planner */}
            <ActionPlanner 
                title="GCode Layout Designer"
                rows={2}
                    cols={4}
                    actions={plannerActions}
                    onSelectCell={(idx) => setSelectingCellIndex(idx)}
                    enableOverflow={enableOverflow}
                    onToggleOverflow={setEnableOverflow}
                />

                {/* 3. Create Macro Button */}
                <ActionButton 
                    variant="add" 
                    onClick={() => openWizard()}
                    className="w-full"
                >
                    + Create New Macro
                </ActionButton>

                {/* 4. Action List */}
                <ActionList title="Available Macros">
                    {macros.length === 0 && (
                        <div className="p-4 text-center text-gray-500 text-xs">No macros available.</div>
                    )}
                    {macros.map(m => (
                        <ActionItem 
                            key={m.id}
                            action={macroToAction(m)}
                            readonly={m.isBuiltIn}
                            onEdit={() => openWizard(m)}
                            onDelete={() => deleteMacro(m.id)}
                        />
                    ))}
                </ActionList>

                {/* ── Wizard Modal ── */}
                <Wizard
                    isOpen={wizardOpen}
                    onClose={() => setWizardOpen(false)}
                    title={editId ? "Edit Custom Macro" : "New Custom Macro"}
                    currentStep={wizardStep}
                    totalSteps={2}
                    onNext={() => setWizardStep(2)}
                    onBack={() => setWizardStep(1)}
                    onSave={saveWizard}
                    nextDisabled={wizardStep === 1 && !formLabel.trim()}
                    isSaveDisabled={!formLabel.trim() || !formGcode.trim()}
                    saveText={editId ? "Save Macro" : "Create Macro"}
                >
                    {wizardStep === 1 && (
                        <WizardStep title="Step 1: Identity" instructions="Give your macro a short label and pick a color theme.">
                            <div className="mb-6">
                                <label className="block text-[10px] text-gray-500 mb-2 uppercase font-bold tracking-widest">Macro Label</label>
                                <input 
                                    autoFocus
                                    value={formLabel}
                                    onChange={e => setFormLabel(e.target.value)}
                                    placeholder="e.g. Air Assist ON"
                                    maxLength={16}
                                    className="w-full bg-miami-cyan/10 border border-miami-cyan/50 focus:border-miami-cyan rounded-lg p-3 text-white text-sm font-mono outline-none transition-colors"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] text-gray-500 mb-2 uppercase font-bold tracking-widest">Color Theme</label>
                                <RadioGroup
                                    options={[
                                        { value: 'miami-cyan', label: 'Miami Cyan', color: 'cyan' },
                                        { value: 'miami-pink', label: 'Miami Pink', color: 'pink' },
                                        { value: 'neon-green', label: 'Neon Green', color: 'green' },
                                        { value: 'neon-orange', label: 'Neon Orange', color: 'orange' }
                                    ]}
                                    value={formTheme}
                                    onChange={(val) => setFormTheme(val as ActionTheme)}
                                    accentColor="cyan"
                                />
                            </div>
                        </WizardStep>
                    )}

                    {wizardStep === 2 && (
                        <WizardStep title="Step 2: GCode Commands" instructions="Enter the raw GCode for this macro.">
                            <div>
                                <label className="block text-[10px] text-gray-500 mb-2 uppercase font-bold tracking-widest">GCode Sequence</label>
                                <textarea
                                    value={formGcode}
                                    onChange={e => setFormGcode(e.target.value.toUpperCase())}
                                    placeholder="e.g. M8"
                                    rows={5}
                                    className="w-full bg-miami-cyan/10 border border-miami-cyan/50 focus:border-miami-cyan rounded-lg p-3 text-white text-sm font-mono outline-none transition-colors resize-none"
                                />
                                <p className="text-[10px] text-gray-500 mt-2">Separate multiple commands with newlines.</p>
                            </div>
                        </WizardStep>
                    )}
                </Wizard>

                {/* ── Slot Selection Modal ── */}
                {selectingCellIndex !== null && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                        <div className="w-full max-w-md relative">
                            <button 
                                className="absolute -top-10 right-0 text-white hover:text-miami-pink font-bold"
                                onClick={() => setSelectingCellIndex(null)}
                            >
                                Close
                            </button>
                            <ActionList title={`Select Macro for Slot ${selectingCellIndex + 1}`} maxHeight={400} className="border-miami-cyan">
                                {/* Clear Slot Button */}
                                {layout[selectingCellIndex] && (
                                    <div className="mb-4">
                                        <ActionButton 
                                            variant="remove" 
                                            className="w-full"
                                            onClick={() => assignSlot(null)}
                                        >
                                            Clear Assigned Slot
                                        </ActionButton>
                                        <div className="h-px bg-gray-800 w-full mt-4"></div>
                                    </div>
                                )}
                                
                                {macros.map(m => {
                                    const act = macroToAction(m);
                                    // Add indication if already assigned
                                    const isAssigned = layout.includes(m.id);
                                    if (isAssigned) {
                                        const slotIdx = layout.indexOf(m.id);
                                        act.subtitle = `${act.subtitle} (In Slot ${slotIdx + 1})`;
                                    }
                                    return (
                                        <ActionItem 
                                            key={m.id}
                                            action={act}
                                            onClick={() => assignSlot(m.id)}
                                        />
                                    );
                                })}
                            </ActionList>
                        </div>
                    </div>
                )}

            </div>
        </View>
    );
};
