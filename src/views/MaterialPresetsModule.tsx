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

    const [wizardOpen, setWizardOpen] = useState(false);
    const [wizardStep, setWizardStep] = useState(1);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [draftPreset, setDraftPreset] = useState<Partial<MaterialPreset>>(defaultNewForm);

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

    const openWizard = (p?: MaterialPreset) => {
        if (p) {
            setEditingId(p.id);
            setDraftPreset(p);
        } else {
            setEditingId(null);
            setDraftPreset(defaultNewForm);
        }
        setWizardStep(1);
        setWizardOpen(true);
    };

    const saveWizard = () => {
        if (editingId) {
            updatePreset(editingId, draftPreset);
        } else {
            addPreset({
                ...(draftPreset as MaterialPreset),
                id: Date.now().toString()
            });
        }
        setWizardOpen(false);
    };

    return (
        <div className="p-4 animate-in fade-in zoom-in duration-300 pb-12">
            {/* Material Wizard Modal */}
            {wizardOpen && (
                <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setWizardOpen(false)} />
                    
                    <div className="relative w-full max-w-lg bg-gray-900 border-t sm:border border-gray-800 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-10 duration-300">
                        {/* Header */}
                        <div className="p-6 border-b border-gray-800 flex items-center justify-between bg-black/20">
                            <div>
                                <h3 className="text-lg font-black text-white">{editingId ? 'Edit Material Profile' : 'New Material Profile'}</h3>
                                <div className="flex gap-1 mt-2">
                                    {[1, 2, 3].map(s => (
                                        <div key={s} className={`h-1 rounded-full transition-all ${wizardStep === s ? 'w-8 bg-miami-cyan' : 'w-4 bg-gray-800'}`} />
                                    ))}
                                </div>
                            </div>
                            <button onClick={() => setWizardOpen(false)} className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-800 text-gray-400 hover:text-white transition-all">✕</button>
                        </div>

                        {/* Content */}
                        <div className="p-6 max-h-[60vh] overflow-y-auto">
                            {wizardStep === 1 && (
                                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                                    <div className="bg-miami-cyan/5 border border-miami-cyan/20 p-4 rounded-2xl mb-6">
                                        <p className="text-xs text-miami-cyan font-bold">Step 1: Identity</p>
                                        <p className="text-[10px] text-gray-500 mt-1 uppercase tracking-wider">Give your material a name and category.</p>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] text-gray-500 mb-2 uppercase font-bold tracking-widest">Profile Name</label>
                                        <input 
                                            autoFocus
                                            value={draftPreset.name || ''}
                                            onChange={e => setDraftPreset({ ...draftPreset, name: e.target.value })}
                                            placeholder="e.g. 3mm Birch High Detail"
                                            className="w-full bg-black border border-gray-800 rounded-2xl p-4 text-white text-lg font-black outline-none focus:border-miami-cyan transition-colors"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] text-gray-500 mb-2 uppercase font-bold tracking-widest">Material Category</label>
                                        <input 
                                            value={draftPreset.material || ''}
                                            onChange={e => setDraftPreset({ ...draftPreset, material: e.target.value })}
                                            placeholder="e.g. Birch Wood"
                                            className="w-full bg-black border border-gray-800 rounded-2xl p-4 text-white font-bold outline-none focus:border-miami-cyan transition-colors"
                                        />
                                    </div>
                                </div>
                            )}

                            {wizardStep === 2 && (
                                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                                    <div className="bg-miami-purple/5 border border-miami-purple/20 p-4 rounded-2xl mb-6">
                                        <p className="text-xs text-miami-purple font-bold">Step 2: Core Parameters</p>
                                        <p className="text-[10px] text-gray-500 mt-1 uppercase tracking-wider">Set the basic burning parameters.</p>
                                    </div>
                                    
                                    <div className="grid grid-cols-2 gap-2">
                                        {['Cut', 'Fill', 'Engrave'].map(type => (
                                            <button 
                                                key={type}
                                                onClick={() => setDraftPreset({ ...draftPreset, opType: type as any })}
                                                className={`py-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 ${
                                                    draftPreset.opType === type 
                                                        ? 'bg-miami-purple/10 border-miami-purple text-miami-purple shadow-[0_0_15px_rgba(255,0,127,0.1)]' 
                                                        : 'bg-black/40 border-gray-800 text-gray-500 hover:border-gray-700'
                                                }`}
                                            >
                                                <span className="text-xl">
                                                    {type === 'Cut' ? '✂' : type === 'Fill' ? '▧' : '🖼️'}
                                                </span>
                                                <span className="text-[10px] font-black uppercase tracking-widest">{type}</span>
                                            </button>
                                        ))}
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-[10px] text-gray-500 mb-2 uppercase font-bold tracking-widest">Power (0-1000)</label>
                                            <NumericInput 
                                                value={draftPreset.power || 0}
                                                onChange={val => setDraftPreset({ ...draftPreset, power: val })}
                                                className="w-full bg-black border border-gray-800 rounded-2xl p-4 text-white text-lg font-mono outline-none focus:border-miami-pink"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] text-gray-500 mb-2 uppercase font-bold tracking-widest">Rate ({feedUnits})</label>
                                            <NumericInput 
                                                value={draftPreset.rate || 0}
                                                onChange={val => setDraftPreset({ ...draftPreset, rate: val })}
                                                className="w-full bg-black border border-gray-800 rounded-2xl p-4 text-white text-lg font-mono outline-none focus:border-miami-cyan"
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {wizardStep === 3 && (
                                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                                    <div className="bg-miami-pink/5 border border-miami-pink/20 p-4 rounded-2xl mb-6">
                                        <p className="text-xs text-miami-pink font-bold">Step 3: Refinement</p>
                                        <p className="text-[10px] text-gray-500 mt-1 uppercase tracking-wider">Final adjustments and secondary controls.</p>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-[10px] text-gray-500 mb-2 uppercase font-bold tracking-widest">Passes</label>
                                            <NumericInput 
                                                value={draftPreset.passes || 1}
                                                onChange={val => setDraftPreset({ ...draftPreset, passes: val })}
                                                className="w-full bg-black border border-gray-800 rounded-2xl p-4 text-white text-sm font-mono"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] text-gray-500 mb-2 uppercase font-bold tracking-widest">Air Assist</label>
                                            <button 
                                                onClick={() => setDraftPreset({ ...draftPreset, airAssist: !draftPreset.airAssist })}
                                                className={`w-full py-4 rounded-2xl text-[10px] font-black border transition-all ${
                                                    draftPreset.airAssist 
                                                        ? 'bg-miami-cyan text-black border-miami-cyan' 
                                                        : 'bg-black text-gray-500 border-gray-800'
                                                }`}
                                            >
                                                {draftPreset.airAssist ? '💨 ON' : '— OFF'}
                                            </button>
                                        </div>
                                    </div>

                                    {(draftPreset.opType === 'Fill' || draftPreset.opType === 'Engrave') && (
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-[10px] text-gray-500 mb-2 uppercase font-bold tracking-widest">Line Dist (mm)</label>
                                                <NumericInput 
                                                    value={draftPreset.lineDistance || 0.1}
                                                    onChange={val => setDraftPreset({ ...draftPreset, lineDistance: val })}
                                                    className="w-full bg-black border border-gray-800 rounded-2xl p-4 text-white text-sm font-mono"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] text-gray-500 mb-2 uppercase font-bold tracking-widest">Angle (°)</label>
                                                <NumericInput 
                                                    value={draftPreset.lineAngle || 0}
                                                    onChange={val => setDraftPreset({ ...draftPreset, lineAngle: val })}
                                                    className="w-full bg-black border border-gray-800 rounded-2xl p-4 text-white text-sm font-mono"
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {draftPreset.opType === 'Engrave' && (
                                        <div>
                                            <label className="block text-[10px] text-gray-500 mb-2 uppercase font-bold tracking-widest">Margin (mm)</label>
                                            <NumericInput 
                                                value={draftPreset.margin || 0}
                                                onChange={val => setDraftPreset({ ...draftPreset, margin: val })}
                                                className="w-full bg-black border border-gray-800 rounded-2xl p-4 text-white text-sm font-mono"
                                            />
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="p-6 border-t border-gray-800 bg-black/40 flex gap-3">
                            {wizardStep > 1 && (
                                <button onClick={() => setWizardStep(v => v - 1)} className="px-6 py-4 bg-gray-900 text-white font-black rounded-2xl border border-gray-700 active:scale-95 transition-all">Back</button>
                            )}
                            {wizardStep < 3 ? (
                                <button 
                                    onClick={() => setWizardStep(v => v + 1)} 
                                    disabled={wizardStep === 1 && (!draftPreset.name || !draftPreset.material)}
                                    className="flex-1 py-4 bg-miami-cyan text-black font-black rounded-2xl shadow-[0_0_15px_rgba(0,240,255,0.2)] disabled:opacity-30 active:scale-95 transition-all"
                                >
                                    Next Step
                                </button>
                            ) : (
                                <button onClick={saveWizard} className="flex-1 py-4 bg-gradient-to-r from-miami-pink to-miami-purple text-white font-black rounded-2xl shadow-[0_0_15px_rgba(255,0,127,0.3)] active:scale-95 transition-all">
                                    {editingId ? 'Save Profile' : 'Create Profile'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-miami-pink tracking-tight">Material Presets</h2>
                <div className="flex gap-2">
                    <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleFileChange} />
                    <button onClick={handleImportClick} className="px-3 py-1.5 bg-black border border-gray-700 text-gray-300 text-xs font-bold rounded-lg hover:border-gray-500 transition-colors">Import</button>
                    <button onClick={handleExport} className="px-3 py-1.5 bg-miami-cyan/10 text-miami-cyan text-xs font-bold border border-miami-cyan/50 rounded-lg hover:bg-miami-cyan/20 transition-colors">Export .json</button>
                </div>
            </div>

            {/* Create New Block */}
            <button 
                onClick={() => openWizard()}
                className="w-full py-4 mb-6 text-sm font-black tracking-widest uppercase rounded-xl transition-all border bg-black/40 border-miami-purple/30 text-miami-purple hover:bg-miami-purple/10 hover:border-miami-purple"
            >
                + New Material Profile
            </button>

            {/* Presets List */}
            <div className="space-y-4 pb-8">
                {presets.map(p => (
                    <div 
                        key={p.id} 
                        className="bg-black/40 border border-gray-800 overflow-hidden hover:border-gray-600 rounded-xl cursor-pointer group transition-all"
                        onClick={() => openWizard(p)}
                    >
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
                                <div className="text-miami-cyan hover:bg-miami-cyan/20 w-8 h-8 rounded-full flex items-center justify-center transition-all bg-black/60 shadow-lg border border-gray-700 opacity-0 group-hover:opacity-100">
                                    <span className="text-sm">✎</span>
                                </div>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); deletePreset(p.id); }} 
                                    className="text-red-500 hover:bg-red-500/20 w-8 h-8 rounded-full flex items-center justify-center transition-all bg-black/60 shadow-lg border border-gray-700 opacity-0 group-hover:opacity-100"
                                >
                                    <span className="text-sm">✕</span>
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
                {presets.length === 0 && <p className="text-center text-gray-600 text-sm py-4">No material presets configured.</p>}
            </div>
        </div>
    );
};
