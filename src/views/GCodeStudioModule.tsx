import React, { useState } from 'react';
import { useMacroStore } from '../store/macroStore';
import type { GCodeMacro } from '../store/macroStore';

export const GCodeStudioModule: React.FC = () => {
    const macros = useMacroStore(s => s.macros);
    const layout = useMacroStore(s => s.layout);
    const addMacro = useMacroStore(s => s.addMacro);
    const editMacro = useMacroStore(s => s.editMacro);
    const deleteMacro = useMacroStore(s => s.deleteMacro);
    const updateLayout = useMacroStore(s => s.updateLayout);

    // Form state
    const [isCreating, setIsCreating] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [formLabel, setFormLabel] = useState('');
    const [formGcode, setFormGcode] = useState('');
    const [isToggle, setIsToggle] = useState(false);
    const [formGcodeOff, setFormGcodeOff] = useState('');
    const [formColor, setFormColor] = useState('cyan');

    // Slot assignment modal state
    const [activeSlotIdx, setActiveSlotIdx] = useState<number | null>(null);
    const [pendingSlotIdx, setPendingSlotIdx] = useState<number | null>(null);

    const handleSave = () => {
        if (!formLabel.trim() || !formGcode.trim()) return;
        if (isToggle && !formGcodeOff.trim()) return;

        if (editId) {
            editMacro(editId, formLabel, formGcode, formColor, isToggle, formGcodeOff);
        } else {
            const newId = addMacro(formLabel, formGcode, formColor, isToggle, formGcodeOff);
            
            // Auto-generate the explicit On/Off versions if this is a new Toggle Macro
            if (isToggle) {
                addMacro(`${formLabel} On`, formGcode, formColor);
                addMacro(`${formLabel} Off`, formGcodeOff, formColor);
            }

            // Auto-assign if we came from a slot modal
            if (pendingSlotIdx !== null) {
                const newLayout = [...layout];
                newLayout[pendingSlotIdx] = newId;
                updateLayout(newLayout);
            }
        }
        closeForm();
    };

    const closeForm = () => {
        setIsCreating(false);
        setEditId(null);
        setFormLabel('');
        setFormGcode('');
        setIsToggle(false);
        setFormGcodeOff('');
        setFormColor('cyan');
        setPendingSlotIdx(null);
    };

    const openEdit = (m: GCodeMacro) => {
        if (m.isBuiltIn) return;
        setEditId(m.id);
        setFormLabel(m.label);
        setFormGcode(m.gcode);
        setFormColor(m.color || 'cyan');
        setIsToggle(m.isToggle ?? false);
        setFormGcodeOff(m.gcodeOff ?? '');
        setIsCreating(true);
    };

    const getColorClass = (c?: string) => {
        switch (c) {
            case 'pink': return 'text-miami-pink';
            case 'purple': return 'text-miami-purple';
            case 'green': return 'text-green-400';
            case 'yellow': return 'text-yellow-400';
            case 'gray': return 'text-gray-400';
            case 'cyan':
            default: return 'text-miami-cyan';
        }
    };

    const assignSlot = (macroId: string | null) => {
        if (activeSlotIdx === null) return;
        
        const newLayout = [...layout];
        
        // If the macro is already in another slot, unset that other slot to "move" it
        if (macroId !== null) {
            const existingIdx = layout.indexOf(macroId);
            if (existingIdx !== -1) {
                newLayout[existingIdx] = null;
            }
        }
        
        newLayout[activeSlotIdx] = macroId;
        updateLayout(newLayout);
        setActiveSlotIdx(null);
    };

    // Gather all custom macros for the management list
    const customMacros = macros.filter(m => !m.isBuiltIn);

    return (
        <div className="p-4 pb-20 animate-in fade-in zoom-in duration-300">
            <div className="flex items-center justify-between mb-5">
                <h2 className="text-2xl font-bold text-miami-cyan tracking-tight">Macro Studio</h2>
                {!isCreating && (
                    <button
                        onClick={() => setIsCreating(true)}
                        className="px-3 py-1.5 bg-miami-cyan/10 border border-miami-cyan/30 text-miami-cyan text-xs font-black rounded-lg hover:bg-miami-cyan/20 transition-colors"
                    >
                        + Create Macro
                    </button>
                )}
            </div>

            {/* ── Macro Form Modal ─────────────────────────────────────────── */}
            {isCreating && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200" onClick={closeForm}>
                    <div className="w-full max-w-sm bg-gray-900 border border-miami-cyan/30 rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="bg-black/40 p-4 border-b border-gray-800 flex justify-between items-center">
                            <h3 className="text-xs font-bold uppercase tracking-widest text-miami-cyan">
                                {editId ? 'Edit Custom Macro' : 'New Custom Macro'}
                            </h3>
                            <button onClick={closeForm} className="text-gray-500 hover:text-white px-2 py-1 font-black">✕</button>
                        </div>
                        
                        <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
                            <div>
                                <label className="block text-[10px] uppercase text-gray-400 mb-1">Macro Label</label>
                            <input
                                type="text"
                                value={formLabel}
                                onChange={e => setFormLabel(e.target.value)}
                                placeholder="e.g. Air Assist ON"
                                maxLength={16}
                                className="w-full bg-black/60 border border-gray-700 focus:border-miami-cyan rounded-lg p-2 text-white font-mono text-sm outline-none transition-colors"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] uppercase text-gray-400 mb-1">Color Theme</label>
                            <div className="flex gap-2">
                                {['cyan', 'pink', 'purple', 'green', 'yellow', 'gray'].map(c => (
                                    <button
                                        key={c}
                                        onClick={() => setFormColor(c)}
                                        className={`w-8 h-8 rounded-full border-2 transition-transform active:scale-90 ${formColor === c ? 'scale-110 shadow-lg' : 'opacity-50'}
                                            ${c==='cyan'?'bg-miami-cyan border-miami-cyan/50':
                                              c==='pink'?'bg-miami-pink border-miami-pink/50':
                                              c==='purple'?'bg-miami-purple border-miami-purple/50':
                                              c==='green'?'bg-green-400 border-green-400/50':
                                              c==='yellow'?'bg-yellow-400 border-yellow-400/50':
                                              'bg-gray-400 border-gray-400/50'
                                            }`}
                                    />
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className="flex items-center gap-2 text-[10px] uppercase text-gray-400 mb-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={isToggle}
                                    onChange={e => setIsToggle(e.target.checked)}
                                    className="w-3 h-3 bg-black border-gray-700 rounded text-miami-cyan focus:ring-0 focus:ring-offset-0"
                                />
                                Toggle Macro (On/Off)
                            </label>
                        </div>
                        <div>
                            <label className="block text-[10px] uppercase text-gray-400 mb-1">{isToggle ? 'ON Command(s)' : 'GCode Command(s)'}</label>
                            <textarea
                                value={formGcode}
                                onChange={e => setFormGcode(e.target.value.toUpperCase())}
                                placeholder="M8"
                                rows={3}
                                className="w-full bg-black/60 border border-gray-700 focus:border-miami-cyan rounded-lg p-2 text-white font-mono text-sm outline-none transition-colors resize-none mb-1"
                            />
                        </div>
                        {isToggle && (
                            <div>
                                <label className="block text-[10px] uppercase text-gray-400 mb-1">OFF Command(s)</label>
                                <textarea
                                    value={formGcodeOff}
                                    onChange={e => setFormGcodeOff(e.target.value.toUpperCase())}
                                    placeholder="M9"
                                    rows={3}
                                    className="w-full bg-black/60 border border-gray-700 focus:border-miami-cyan rounded-lg p-2 text-white font-mono text-sm outline-none transition-colors resize-none mb-1"
                                />
                            </div>
                        )}
                        <p className="text-[9px] text-gray-500 mt-1">Separate multiple commands with newlines.</p>
                        
                        <div className="flex gap-2 pt-2">
                            {editId && (
                                <button
                                    onClick={() => { deleteMacro(editId); closeForm(); }}
                                    className="flex-1 py-2 bg-red-900/30 border border-red-800 text-red-400 font-bold text-xs rounded-lg hover:bg-red-900/50 transition-colors"
                                >
                                    Delete
                                </button>
                            )}
                            <button
                                onClick={handleSave}
                                disabled={!formLabel.trim() || !formGcode.trim()}
                                className="flex-[2] py-2 bg-miami-cyan/20 border border-miami-cyan/50 text-miami-cyan font-bold text-xs rounded-lg hover:bg-miami-cyan/30 disabled:opacity-30 transition-colors"
                            >
                                Save Macro
                            </button>
                        </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Dashboard Layout Grid ──────────────────────────────── */}
            <div className="bg-black/40 border border-gray-800 rounded-xl p-4 shadow-lg mb-6">
                <h3 className="text-xs font-bold uppercase tracking-widest text-gray-300 mb-2">Dashboard Macro Grid</h3>
                <p className="text-[10px] text-gray-500 mb-4 font-mono">Tap any slot below to assign or reposition a macro. If you have more than 12 total macros, unassigned ones will automatically appear in a dropdown in the 12th slot on the Dashboard.</p>

                <div className="grid grid-cols-3 gap-2">
                    {layout.map((macroId, idx) => {
                        const macro = macroId ? macros.find(m => m.id === macroId) : null;
                        
                        return (
                            <button
                                key={idx}
                                onClick={() => setActiveSlotIdx(idx)}
                                className={`aspect-[2/1] text-[10px] font-black uppercase rounded-xl border flex items-center justify-center text-center px-1 transition-all active:scale-95 ${
                                    macro
                                        ? macro.isBuiltIn
                                            ? 'bg-black/60 border-gray-700 text-gray-300'
                                            : 'bg-miami-cyan/10 border-miami-cyan/30 text-miami-cyan'
                                        : 'bg-black/20 border-gray-800/50 border-dashed text-gray-600 hover:border-gray-600 hover:text-gray-500'
                                }`}
                            >
                                {macro ? macro.label : '+ Empty'}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ── Custom Macros List ─────────────────────────────── */}
            {customMacros.length > 0 && (
                <div className="bg-black/40 border border-gray-800 rounded-xl px-4 py-3 shadow-lg">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-gray-300 mb-3">Custom Macros</h3>
                    <div className="space-y-2">
                        {customMacros.map(m => {
                            const isAssigned = layout.includes(m.id);
                            const slotIndex = layout.indexOf(m.id);
                            return (
                                <div key={m.id} className="flex items-center justify-between bg-black/60 border border-gray-800 rounded-lg py-2 px-3">
                                    <div className="overflow-hidden pr-2">
                                        <div className="flex items-center gap-2 mb-0.5">
                                            <span className={`text-xs font-bold block ${getColorClass(m.color)}`}>{m.label}</span>
                                            {isAssigned && (
                                                <span className="text-[8px] font-black uppercase bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded flex-shrink-0">Slot {slotIndex + 1}</span>
                                            )}
                                        </div>
                                        {m.isToggle ? (
                                            <div className="text-[10px] font-mono text-gray-500 flex gap-2">
                                                <span className="truncate max-w-[100px]">ON: {m.gcode.replace(/\n/g, ' ↵ ')}</span>
                                                <span className="truncate max-w-[100px]">OFF: {m.gcodeOff?.replace(/\n/g, ' ↵ ')}</span>
                                            </div>
                                        ) : (
                                            <span className="text-[10px] font-mono text-gray-500 block truncate max-w-[200px]">{m.gcode.replace(/\n/g, ' ↵ ')}</span>
                                        )}
                                    </div>
                                    <button 
                                        onClick={() => openEdit(m)}
                                        className="text-[10px] text-gray-400 border border-gray-700 px-3 py-1.5 rounded-lg bg-black hover:border-miami-cyan/50 hover:text-miami-cyan hover:bg-miami-cyan/10 transition-colors flex-shrink-0"
                                    >
                                        Edit
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ── Slot Selection Modal ───────────────────────────────── */}
            {activeSlotIdx !== null && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="w-full max-w-md max-h-[80vh] flex flex-col bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="p-4 flex-shrink-0 border-b border-gray-800 flex justify-between items-center">
                            <h3 className="font-bold text-gray-200 text-sm">Assign Slot {activeSlotIdx + 1}</h3>
                            <button onClick={() => setActiveSlotIdx(null)} className="text-gray-500 font-black px-2 hover:text-white">✕</button>
                        </div>
                        
                        <div className="overflow-y-auto p-2 flex-1">
                            {/* Create New Macro option */}
                            <button 
                                onClick={() => {
                                    setPendingSlotIdx(activeSlotIdx);
                                    setIsCreating(true);
                                    setActiveSlotIdx(null);
                                }}
                                className="w-full text-left p-3 mb-1 bg-miami-cyan/10 border border-miami-cyan/30 rounded-xl hover:bg-miami-cyan/20 transition-colors flex items-center justify-center border-dashed"
                            >
                                <span className="text-miami-cyan font-black text-xs uppercase tracking-wider">+ Create New Macro</span>
                            </button>

                            {/* Option to clear slot */}
                            <button 
                                onClick={() => assignSlot(null)}
                                className="w-full text-left p-3 mb-1 bg-black/40 border border-gray-800 rounded-xl hover:bg-red-900/10 hover:border-red-900 transition-colors flex items-center justify-between mt-2"
                            >
                                <span className="text-gray-500 font-bold text-xs italic">Leave Empty</span>
                                {layout[activeSlotIdx] === null && <span className="text-xs text-green-500 font-black">✓ Selected</span>}
                            </button>

                            {macros.map(m => {
                                const isSrcSlot = layout[activeSlotIdx] === m.id;
                                const isAlreadyPlaced = layout.includes(m.id) && !isSrcSlot;
                                
                                return (
                                    <button 
                                        key={m.id}
                                        onClick={() => assignSlot(m.id)}
                                        className={`w-full text-left p-3 mb-1 border rounded-xl transition-colors flex items-center justify-between ${
                                            isSrcSlot 
                                                ? 'bg-miami-cyan/10 border-miami-cyan/30' 
                                                : 'bg-black/60 border-gray-800 hover:border-gray-600'
                                        }`}
                                    >
                                        <div>
                                            <span className={`block font-bold text-[11px] ${m.isBuiltIn ? 'text-blue-400 font-black tracking-wide' : getColorClass(m.color)}`}>{m.label}</span>
                                            {isAlreadyPlaced && <span className="block text-[9px] text-yellow-500">Will be moved from current slot</span>}
                                        </div>
                                        {isSrcSlot && <span className="text-xs text-miami-cyan font-black">✓ Selected</span>}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
