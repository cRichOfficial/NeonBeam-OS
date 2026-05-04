import re

with open('src/views/StudioModule.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update openWizard to go to Step 1 instead of Step 0, and remove the bitmap shortcut to Step 3 because Step 1 is naming
content = content.replace(
    "setWizardStep(0);",
    "setWizardStep(1);"
)
content = content.replace(
    "// If bitmap, only one type exists, so skip step 1\n            setWizardStep(fileKind === 'bitmap' ? 3 : 1);",
    "setWizardStep(1);"
)

# 2. Replace the Operation Wizard Modal
start_idx = content.find('{/* ── OPERATION WIZARD MODAL ── */}')
end_idx = content.find('{/* ── Header + Tab Bar ── */}')

old_wizard = content[start_idx:end_idx]

new_wizard = """{/* ── OPERATION WIZARD ── */}
            <Wizard
                isOpen={wizardOpen}
                onClose={() => setWizardOpen(false)}
                title={editingOpId ? 'Edit Operation' : 'New Operation'}
                currentStep={wizardStep}
                totalSteps={fileKind === 'bitmap' ? 2 : 3}
                onNext={() => {
                    setWizardStep(s => s + 1);
                }}
                onBack={() => setWizardStep(s => s - 1)}
                onSave={saveWizard}
                saveText={editingOpId ? 'Save Changes' : 'Add Operation'}
                nextDisabled={
                    (wizardStep === 1 && !draftOp.name) ||
                    (wizardStep === 3 && draftOp.pathIds?.length === 0)
                }
            >
                {/* Step 1: Operation Settings */}
                {wizardStep === 1 && (
                    <WizardStep title="Operation Type" instructions="Name your operation and select the operation type.">
                        <div className="space-y-6">
                            <div>
                                <label className="block text-[10px] text-gray-500 mb-2 uppercase font-bold tracking-widest">Operation Name</label>
                                <input 
                                    value={draftOp.name || ''}
                                    onChange={e => setDraftOp({ ...draftOp, name: e.target.value })}
                                    placeholder={`Op ${operations.length + 1}`}
                                    className="w-full bg-black border border-gray-800 rounded-xl p-3 text-white text-sm font-bold outline-none focus:border-miami-cyan transition-colors"
                                />
                            </div>
                            
                            <div>
                                <label className="block text-[10px] text-gray-500 mb-2 uppercase font-bold tracking-widest">Type</label>
                                <RadioGroup
                                    options={fileKind === 'svg' ? [
                                        { value: 'cut', label: 'Cut (Trace paths)' },
                                        { value: 'fill', label: 'Fill (Hatch enclosed areas)' }
                                    ] : [
                                        { value: 'raster', label: 'Raster (Engrave image)' }
                                    ]}
                                    value={draftOp.opType || (fileKind === 'svg' ? 'cut' : 'raster')}
                                    onChange={(v) => setDraftOp({ ...draftOp, opType: v as LayerOp })}
                                />
                            </div>
                        </div>
                    </WizardStep>
                )}

                {/* Step 2: Laser Settings */}
                {wizardStep === 2 && (
                    <WizardStep title="Laser Settings" instructions="Configure power, speed, and other laser parameters.">
                        <div className="bg-black/40 border border-gray-800 rounded-2xl p-4 space-y-4">
                            <div className="flex items-center justify-between">
                                <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Preset</p>
                                <select 
                                    value={''} 
                                    onChange={e => {
                                        const p = presets.find(x => x.id === e.target.value);
                                        if (p && draftOp.params) {
                                            setDraftOp({ ...draftOp, params: { ...draftOp.params, power: p.power, rate: p.rate, passes: p.passes, airAssist: p.airAssist, lineDistance: p.lineDistance } });
                                        }
                                    }}
                                    className="bg-black border border-gray-700 rounded-lg px-2 py-1 text-[10px] text-gray-400 outline-none"
                                >
                                    <option value="">Apply Preset…</option>
                                    {filteredPresets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                            </div>

                            {/* Power */}
                            <div>
                                <div className="flex justify-between mb-2">
                                    <label className="text-[10px] text-gray-400 uppercase font-bold">Power</label>
                                    <span className="text-xs font-black text-miami-pink font-mono">{sPct(draftOp.params?.power || 0)}</span>
                                </div>
                                <input type="range" min={0} max={maxSpindleS} value={draftOp.params?.power || 0}
                                    onChange={e => setDraftOp({ ...draftOp, params: { ...draftOp.params!, power: Number(e.target.value) } })}
                                    className="w-full accent-miami-pink" />
                            </div>

                            {/* Min Power for Raster */}
                            {draftOp.opType === 'raster' && (
                                <div>
                                    <div className="flex justify-between mb-2">
                                        <label className="text-[10px] text-gray-400 uppercase font-bold">Min Power (Shadows)</label>
                                        <span className="text-xs font-black text-miami-purple font-mono">{sPct(draftOp.params?.minPower || 0)}</span>
                                    </div>
                                    <input type="range" min={0} max={maxSpindleS} value={draftOp.params?.minPower || 0}
                                        onChange={e => setDraftOp({ ...draftOp, params: { ...draftOp.params!, minPower: Number(e.target.value) } })}
                                        className="w-full accent-miami-purple" />
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] text-gray-400 mb-2 uppercase font-bold">Feed ({displayRateUnit})</label>
                                    <NumericInput 
                                        value={toDisplay(draftOp.params?.rate || 1500)}
                                        onChange={val => setDraftOp({ ...draftOp, params: { ...draftOp.params!, rate: toMmPerMin(val) } })}
                                        className="w-full bg-black border border-gray-700 rounded-xl p-3 text-white text-sm font-mono"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] text-gray-400 mb-2 uppercase font-bold">Passes</label>
                                    <NumericInput 
                                        value={draftOp.params?.passes || 1}
                                        onChange={val => setDraftOp({ ...draftOp, params: { ...draftOp.params!, passes: val } })}
                                        className="w-full bg-black border border-gray-700 rounded-xl p-3 text-white text-sm font-mono"
                                    />
                                </div>
                            </div>

                            {(draftOp.opType === 'fill' || draftOp.opType === 'raster') && (
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[10px] text-gray-400 mb-2 uppercase font-bold">Line Dist (mm)</label>
                                        <NumericInput 
                                            value={draftOp.params?.lineDistance || 0.1}
                                            onChange={val => setDraftOp({ ...draftOp, params: { ...draftOp.params!, lineDistance: val } })}
                                            className="w-full bg-black border border-gray-700 rounded-xl p-3 text-white text-sm font-mono"
                                        />
                                    </div>
                                    {draftOp.opType === 'raster' && (
                                        <div>
                                            <label className="block text-[10px] text-gray-400 mb-2 uppercase font-bold">Margin (mm)</label>
                                            <NumericInput 
                                                value={draftOp.params?.margin || 0}
                                                onChange={val => setDraftOp({ ...draftOp, params: { ...draftOp.params!, margin: val } })}
                                                className="w-full bg-black border border-gray-700 rounded-xl p-3 text-white text-sm font-mono"
                                            />
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="flex justify-center mt-2">
                                <ToggleSwitch
                                    label="Air Assist"
                                    checked={!!draftOp.params?.airAssist}
                                    onChange={(checked) => setDraftOp({ ...draftOp, params: { ...draftOp.params!, airAssist: checked } })}
                                />
                            </div>
                        </div>
                    </WizardStep>
                )}

                {/* Step 3: Assignment (SVG Only) */}
                {wizardStep === 3 && fileKind === 'svg' && (
                    <WizardStep title="Assignment" instructions="Select the paths you want to apply this operation to.">
                        <div className="space-y-4">
                            <div className="flex items-center justify-between mb-4">
                                <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Paths ({draftOp.pathIds?.length || 0})</p>
                                <div className="flex gap-2">
                                    <button onClick={() => setDraftOp({ ...draftOp, pathIds: svgPaths.map(p => p.id) })} className="text-[9px] text-miami-cyan font-bold uppercase">All</button>
                                    <button onClick={() => setDraftOp({ ...draftOp, pathIds: [] })} className="text-[9px] text-gray-600 font-bold uppercase">None</button>
                                </div>
                            </div>
                            
                            <div className="max-h-[40vh] overflow-y-auto">
                                <ItemContainer>
                                    {svgPaths.map(path => {
                                        const isSelected = draftOp.pathIds?.includes(path.id);
                                        return (
                                            <ItemBadge
                                                key={path.id}
                                                title={path.label}
                                                icon={
                                                    <div className="flex gap-1 items-center justify-center h-full">
                                                        {path.strokeColor && <div className="w-2 h-2 rounded-full" style={{ background: path.strokeColor }} />}
                                                        {path.fillColor && <div className="w-2 h-2 rounded-full border border-white/20" style={{ background: path.fillColor }} />}
                                                        {!path.strokeColor && !path.fillColor && <span className="text-xs">📐</span>}
                                                    </div>
                                                }
                                                onClick={() => {
                                                    const ids = draftOp.pathIds || [];
                                                    setDraftOp({ ...draftOp, pathIds: isSelected ? ids.filter(x => x !== path.id) : [...ids, path.id] });
                                                }}
                                                selected={isSelected}
                                                multiSelect={true}
                                            />
                                        );
                                    })}
                                </ItemContainer>
                            </div>
                        </div>
                    </WizardStep>
                )}
            </Wizard>
            
            """

content = content.replace(old_wizard, new_wizard)

with open('src/views/StudioModule.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
