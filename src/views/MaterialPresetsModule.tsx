import React, { useState, useRef } from 'react';
import { usePresetsStore } from '../store/presetsStore';
import type { MaterialPreset } from '../store/presetsStore';
import { useAppSettingsStore } from '../store/appSettingsStore';
import { NumericInput } from '../components/NumericInput';

const defaultNewForm: Partial<MaterialPreset> = {
    name: 'New Custom Profile',
    material: 'Acrylic',
    opType: 'Cut',
    power: 1000,
    rate: 600,
    lineDistance: 0.1,
    lineAngle: 0,
    margin: 0,
    passes: 1,
    airAssist: true
};

export const MaterialPresetsModule: React.FC = () => {
    const { presets, addPreset, updatePreset, deletePreset, importPresets } = usePresetsStore();
    const feedUnits = useAppSettingsStore(state => state.settings.feedUnits);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [editingId, setEditingId] = useState<string | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [formState, setFormState] = useState<Partial<MaterialPreset>>(defaultNewForm);

    const handleExport = () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(presets, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "neonbeam_presets.json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    };

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const json = JSON.parse(event.target?.result as string);
                if (Array.isArray(json)) {
                    importPresets(json);
                    alert("Import successful! Merged " + json.length + " presets.");
                }
            } catch(e) {
                alert("Invalid JSON file");
            }
        };
        reader.readAsText(file);
    };

    const startEdit = (p: MaterialPreset) => {
        if (isCreating) setIsCreating(false);
        setEditingId(p.id);
        setFormState(p);
    };

    const startCreate = () => {
        if (editingId) setEditingId(null);
        setFormState(defaultNewForm);
        setIsCreating(true);
    };

    const cancelAction = () => {
        setEditingId(null);
        setIsCreating(false);
    };

    const handleSaveEdit = () => {
        if (editingId) {
            updatePreset(editingId, formState);
            setEditingId(null);
            setFormState(defaultNewForm);
        }
    };

    const handleSaveCreate = () => {
        addPreset({
            ...(formState as MaterialPreset),
            id: Date.now().toString()
        });
        setIsCreating(false);
        setFormState(defaultNewForm);
    };

    const renderFormFields = (isEdit: boolean) => (
        <>
            <input type="text" placeholder="Profile Name" value={formState.name} onChange={e => setFormState({...formState, name: e.target.value})} className={`w-full bg-black/80 border focus:border-gray-400 rounded-lg p-3 text-sm text-white mb-4 outline-none transition-colors ${isEdit ? 'border-miami-cyan/40' : 'border-miami-purple/40'}`} />
            
            <div className="grid grid-cols-2 gap-x-4 gap-y-4 mb-5">
                <div>
                    <label className="block text-[10px] uppercase text-gray-300 mb-1">Material</label>
                    <input type="text" value={formState.material} onChange={e => setFormState({...formState, material: e.target.value})} className="w-full bg-black/80 border border-gray-700 focus:border-gray-500 rounded-lg p-2 text-sm text-white outline-none" />
                </div>
                <div>
                    <label className="block text-[10px] uppercase text-gray-300 mb-1">Operation Type</label>
                    <select value={formState.opType} onChange={e => setFormState({...formState, opType: e.target.value as any})} className="w-full bg-black/80 border border-gray-700 focus:border-gray-500 rounded-lg p-2 text-sm text-white outline-none">
                        <option>Cut</option><option>Engrave</option><option>Fill</option><option>Score</option>
                    </select>
                </div>
                
                <div>
                    <label className="block text-[10px] uppercase text-miami-pink mb-1">Laser Power (S)</label>
                    <NumericInput value={formState.power || 0} onChange={val => setFormState({...formState, power: val})} min={0} className="w-full bg-black/80 border border-gray-700 focus:border-miami-pink rounded-lg p-2 text-sm text-white outline-none font-mono" />
                </div>
                <div>
                    <label className="block text-[10px] uppercase text-miami-cyan mb-1">Rate ({feedUnits})</label>
                    <NumericInput value={formState.rate || 0} onChange={val => setFormState({...formState, rate: val})} min={0} className="w-full bg-black/80 border border-gray-700 focus:border-miami-cyan rounded-lg p-2 text-sm text-white outline-none font-mono" />
                </div>

                <div>
                    <label className="block text-[10px] uppercase text-gray-300 mb-1">Line Dist (mm)</label>
                    <NumericInput value={formState.lineDistance || 0} onChange={val => setFormState({...formState, lineDistance: val})} min={0} className="w-full bg-black/80 border border-gray-700 focus:border-gray-500 rounded-lg p-2 text-sm text-white outline-none font-mono" />
                </div>
                <div>
                    <label className="block text-[10px] uppercase text-gray-300 mb-1">Fill Angle (°)</label>
                    <NumericInput value={formState.lineAngle || 0} onChange={val => setFormState({...formState, lineAngle: val})} className="w-full bg-black/80 border border-gray-700 focus:border-gray-500 rounded-lg p-2 text-sm text-white outline-none font-mono" />
                </div>

                <div>
                    <label className="block text-[10px] uppercase text-gray-300 mb-1">Margin (mm)</label>
                    <NumericInput value={formState.margin || 0} onChange={val => setFormState({...formState, margin: val})} min={0} className="w-full bg-black/80 border border-gray-700 focus:border-gray-500 rounded-lg p-2 text-sm text-white outline-none font-mono" />
                </div>
                <div>
                    <label className="block text-[10px] uppercase text-gray-300 mb-1">Total Passes</label>
                    <NumericInput value={formState.passes || 1} onChange={val => setFormState({...formState, passes: val})} min={1} className="w-full bg-black/80 border border-gray-700 focus:border-gray-500 rounded-lg p-2 text-sm text-white outline-none font-mono" />
                </div>
            </div>

            <label className="flex items-center gap-3 cursor-pointer group bg-black/30 p-3 rounded-lg border border-gray-800 hover:border-gray-700 transition-colors">
                <div className="relative flex items-center">
                    <input type="checkbox" checked={formState.airAssist} onChange={e => setFormState({...formState, airAssist: e.target.checked})} className="sr-only peer" />
                    <div className={`w-11 h-6 rounded-full peer transition-all ${formState.airAssist ? (isEdit ? 'bg-miami-cyan' : 'bg-miami-purple') : 'bg-gray-700'}`}></div>
                    <div className="absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-all peer-checked:translate-x-5"></div>
                </div>
                <span className="text-xs font-bold text-gray-300 uppercase tracking-wider group-hover:text-white transition-colors">Air Assist (M8)</span>
            </label>
        </>
    );

    return (
        <div className="p-4 animate-in fade-in zoom-in duration-300 pb-12">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-miami-pink tracking-tight">Material Presets</h2>
                <div className="flex gap-2">
                    <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleFileChange} />
                    <button onClick={handleImportClick} className="px-3 py-1.5 bg-black border border-gray-700 text-gray-300 text-xs font-bold rounded-lg hover:border-gray-500 transition-colors">Import</button>
                    <button onClick={handleExport} className="px-3 py-1.5 bg-miami-cyan/10 text-miami-cyan text-xs font-bold border border-miami-cyan/50 rounded-lg hover:bg-miami-cyan/20 transition-colors">Export .json</button>
                </div>
            </div>

            {/* Create New Block */}
            {!isCreating && (
                <button 
                    onClick={startCreate}
                    disabled={editingId !== null}
                    className={`w-full py-4 mb-6 text-sm font-black tracking-widest uppercase rounded-xl transition-all border ${
                        editingId 
                        ? 'bg-gray-900 border-gray-800 text-gray-600 cursor-not-allowed' 
                        : 'bg-black/40 border-miami-purple/30 text-miami-purple hover:bg-miami-purple/10 hover:border-miami-purple'
                    }`}
                >
                    + New Material Profile
                </button>
            )}

            {isCreating && (
                <div className="bg-gradient-to-br from-black/80 to-black/60 border border-miami-purple/50 rounded-2xl p-5 shadow-[0_0_30px_rgba(255,0,127,0.1)] mb-6 animate-in fade-in slide-in-from-top-4">
                    <div className="flex justify-between items-center mb-5">
                        <h3 className="text-sm font-bold uppercase tracking-widest text-miami-purple">Create New Profile</h3>
                    </div>
                    {renderFormFields(false)}
                    <div className="flex gap-3 mt-6">
                        <button onClick={cancelAction} className="flex-1 py-3 bg-gray-800 border border-gray-700 text-white font-bold uppercase rounded-xl hover:bg-gray-700 transition">Cancel</button>
                        <button onClick={handleSaveCreate} className="flex-1 py-3 bg-gradient-to-r from-miami-purple to-miami-pink text-white font-bold uppercase rounded-xl hover:shadow-[0_0_15px_rgba(255,0,127,0.4)] transition">Save New Profile</button>
                    </div>
                </div>
            )}

            {/* Presets List */}
            <div className="space-y-4 pb-8">
                {presets.map(p => (
                    <div 
                        key={p.id} 
                        className={`bg-black/40 border transition-all ${
                            editingId === p.id 
                            ? 'border-miami-cyan shadow-[0_0_15px_rgba(0,240,255,0.2)] rounded-2xl p-5' 
                            : 'border-gray-800 overflow-hidden hover:border-gray-600 rounded-xl cursor-pointer group'
                        }`}
                        onClick={() => { if (!editingId && !isCreating) startEdit(p); }}
                    >
                        {editingId === p.id ? (
                            <div className="animate-in fade-in">
                                <div className="flex justify-between items-center mb-5">
                                    <h3 className="text-sm font-bold uppercase tracking-widest text-miami-cyan">Edit Profile</h3>
                                </div>
                                {renderFormFields(true)}
                                <div className="flex gap-3 mt-6">
                                    <button onClick={cancelAction} className="flex-1 py-3 bg-gray-800 border border-gray-700 text-white font-bold uppercase rounded-xl hover:bg-gray-700 transition">Cancel Edit</button>
                                    <button onClick={handleSaveEdit} className="flex-1 py-3 bg-miami-cyan text-black font-bold uppercase rounded-xl hover:shadow-[0_0_15px_rgba(0,240,255,0.4)] transition">Save Changes</button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex justify-between items-center w-full p-4 h-full">
                                <div>
                                    <h3 className="font-bold text-white flex items-center gap-2">
                                        {p.name}
                                        <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider ${
                                            p.opType === 'Cut' ? 'bg-miami-pink/20 text-miami-pink' :
                                            p.opType === 'Engrave' ? 'bg-miami-purple/20 text-miami-purple' :
                                            p.opType === 'Fill' ? 'bg-blue-500/20 text-blue-400' :
                                            'bg-miami-cyan/20 text-miami-cyan'
                                        }`}>{p.opType}</span>
                                    </h3>
                                    <p className="text-[11px] text-gray-400 mt-1.5 flex items-center gap-2">
                                        <span>{p.material}</span>
                                        <span className="w-1 h-1 rounded-full bg-gray-700"></span>
                                        <span className="text-miami-pink font-mono">{p.power}S</span>
                                        <span className="w-1 h-1 rounded-full bg-gray-700"></span>
                                        <span className="text-miami-cyan font-mono">{p.rate} {feedUnits}</span>
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className={`text-miami-cyan hover:bg-miami-cyan/20 w-8 h-8 rounded-full flex items-center justify-center transition-all bg-black/60 shadow-lg border border-gray-700 ${editingId || isCreating ? 'opacity-0 cursor-not-allowed' : 'opacity-0 group-hover:opacity-100'}`}>
                                        <span className="text-sm">✎</span>
                                    </div>
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); if (!editingId && !isCreating) deletePreset(p.id); }} 
                                        className={`text-red-500 hover:bg-red-500/20 w-8 h-8 rounded-full flex items-center justify-center transition-all bg-black/60 shadow-lg border border-gray-700 ${editingId || isCreating ? 'opacity-0 cursor-not-allowed' : 'opacity-0 group-hover:opacity-100'}`}
                                    >
                                        <span className="text-sm">✕</span>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
                {presets.length === 0 && <p className="text-center text-gray-600 text-sm py-4">No material presets configured.</p>}
            </div>
        </div>
    );
};
