import React, { useState, useRef } from 'react';
import { usePresetsStore } from '../store/presetsStore';
import type { MaterialPreset } from '../store/presetsStore';
import { useAppSettingsStore } from '../store/appSettingsStore';
import { NumericInput } from '../components/NumericInput';
import { View } from '../components/layout/View';
import { ActionButton } from '../components/ui/ActionButton';
import { ToggleSwitch } from '../components/ui/ToggleSwitch';
import { RadioGroup } from '../components/ui/RadioGroup';
import { InstructionCard } from '../components/ui/InstructionCard';
import { Wizard, WizardStep } from '../components/ui/Wizard';
import { ItemContainer } from '../components/ui/ItemContainer';
import { ItemBadge } from '../components/ui/ItemBadge';

const defaultNewForm: Partial<MaterialPreset> = {
    name: 'New Custom Profile',
    material: 'Acrylic',
    opType: 'Cut',
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

    const [transferWizardOpen, setTransferWizardOpen] = useState(false);
    const [transferWizardStep, setTransferWizardStep] = useState(1);
    const [transferMode, setTransferMode] = useState<'import' | 'export'>('import');

    const handleExport = () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(presets, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "neonbeam_presets.json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
        setTransferWizardOpen(false);
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
                    setTransferWizardOpen(false);
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
            setDraftPreset({
                ...defaultNewForm,
                power: 100,
                rate: feedUnits === 'mm/s' ? 30 : 1800
            });
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
        <View title="Material Presets" subtitle="Manage cutting and engraving profiles" showHomeButton>
            <div className="p-4 pb-12 relative">
            {/* Material Wizard Modal */}
            <Wizard
                isOpen={wizardOpen}
                onClose={() => setWizardOpen(false)}
                title={editingId ? 'Edit Material Profile' : 'New Material Profile'}
                currentStep={wizardStep}
                totalSteps={3}
                onNext={() => setWizardStep(v => v + 1)}
                onBack={() => setWizardStep(v => v - 1)}
                onSave={saveWizard}
                nextDisabled={wizardStep === 1 && (!draftPreset.name || !draftPreset.material)}
                saveText={editingId ? 'Save Profile' : 'Create Profile'}
            >
                {wizardStep === 1 && (
                    <WizardStep title="Step 1: Identity" instructions="Give your material a name and category.">
                        <div>
                            <label className="block text-[10px] text-gray-500 mb-2 uppercase font-bold tracking-widest">Profile Name</label>
                            <input 
                                autoFocus
                                value={draftPreset.name || ''}
                                onChange={e => setDraftPreset({ ...draftPreset, name: e.target.value })}
                                placeholder="e.g. 3mm Birch High Detail"
                                className="w-full bg-miami-cyan/10 border border-miami-cyan/50 focus:border-miami-cyan rounded-lg p-3 text-white text-sm font-mono outline-none transition-colors"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] text-gray-500 mb-2 uppercase font-bold tracking-widest">Material Category</label>
                            <input 
                                value={draftPreset.material || ''}
                                onChange={e => setDraftPreset({ ...draftPreset, material: e.target.value })}
                                placeholder="e.g. Birch Wood"
                                className="w-full bg-miami-cyan/10 border border-miami-cyan/50 focus:border-miami-cyan rounded-lg p-3 text-white text-sm font-mono outline-none transition-colors"
                            />
                        </div>
                    </WizardStep>
                )}

                {wizardStep === 2 && (
                    <WizardStep title="Step 2: Core Parameters" instructions="Set the basic burning parameters.">
                        
                        <div className="mb-6">
                            <RadioGroup
                                options={[
                                    { value: 'Cut', label: 'Cut' },
                                    { value: 'Fill', label: 'Fill' },
                                    { value: 'Engrave', label: 'Engrave' }
                                ]}
                                value={draftPreset.opType || 'Cut'}
                                onChange={val => setDraftPreset({ ...draftPreset, opType: val as any })}
                                accentColor="cyan"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[10px] text-gray-500 mb-2 uppercase font-bold tracking-widest">Power (0-100%)</label>
                                <NumericInput 
                                    min={0} max={100}
                                    value={draftPreset.power || 0}
                                    onChange={val => setDraftPreset({ ...draftPreset, power: val })}
                                    className="w-full bg-miami-cyan/10 border border-miami-cyan/50 focus:border-miami-cyan rounded-lg p-3 text-white text-sm font-mono outline-none transition-colors"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] text-gray-500 mb-2 uppercase font-bold tracking-widest">Rate ({feedUnits})</label>
                                <NumericInput 
                                    value={draftPreset.rate || 0}
                                    onChange={val => setDraftPreset({ ...draftPreset, rate: val })}
                                    className="w-full bg-miami-cyan/10 border border-miami-cyan/50 focus:border-miami-cyan rounded-lg p-3 text-white text-sm font-mono outline-none transition-colors"
                                />
                            </div>
                        </div>
                    </WizardStep>
                )}

                {wizardStep === 3 && (
                    <WizardStep title="Step 3: Refinement" instructions="Final adjustments and secondary controls.">

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[10px] text-gray-500 mb-2 uppercase font-bold tracking-widest">Passes</label>
                                <NumericInput 
                                    value={draftPreset.passes || 1}
                                    onChange={val => setDraftPreset({ ...draftPreset, passes: val })}
                                    className="w-full bg-miami-cyan/10 border border-miami-cyan/50 focus:border-miami-cyan rounded-lg p-3 text-white text-sm font-mono outline-none transition-colors"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] text-gray-500 mb-2 uppercase font-bold tracking-widest">Air Assist</label>
                                <ToggleSwitch
                                    checked={draftPreset.airAssist || false}
                                    onChange={checked => setDraftPreset({ ...draftPreset, airAssist: checked })}
                                />
                            </div>
                        </div>

                        {(draftPreset.opType === 'Fill' || draftPreset.opType === 'Engrave') && (
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] text-gray-500 mb-2 uppercase font-bold tracking-widest">Line Dist (mm)</label>
                                    <NumericInput 
                                        value={draftPreset.lineDistance || 0.1}
                                        onChange={val => setDraftPreset({ ...draftPreset, lineDistance: val })}
                                        className="w-full bg-miami-cyan/10 border border-miami-cyan/50 focus:border-miami-cyan rounded-lg p-3 text-white text-sm font-mono outline-none transition-colors"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] text-gray-500 mb-2 uppercase font-bold tracking-widest">Angle (°)</label>
                                    <NumericInput 
                                        value={draftPreset.lineAngle || 0}
                                        onChange={val => setDraftPreset({ ...draftPreset, lineAngle: val })}
                                        className="w-full bg-miami-cyan/10 border border-miami-cyan/50 focus:border-miami-cyan rounded-lg p-3 text-white text-sm font-mono outline-none transition-colors"
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
                                    className="w-full bg-miami-cyan/10 border border-miami-cyan/50 focus:border-miami-cyan rounded-lg p-3 text-white text-sm font-mono outline-none transition-colors"
                                />
                            </div>
                        )}
                    </WizardStep>
                )}
            </Wizard>

            {/* Transfer Wizard */}
            <Wizard 
                isOpen={transferWizardOpen}
                onClose={() => setTransferWizardOpen(false)}
                title="Profile Transfer"
                currentStep={transferWizardStep}
                totalSteps={2}
                onNext={() => setTransferWizardStep(2)}
                onBack={() => setTransferWizardStep(1)}
                onSave={() => setTransferWizardOpen(false)}
                isSaveDisabled={false}
                saveText="Done"
            >
                {transferWizardStep === 1 && (
                    <WizardStep title="Step 1: Transfer Mode" instructions="Select whether you want to import or export material profiles.">
                        <RadioGroup
                            options={[
                                { value: 'import', label: 'Import Profiles' },
                                { value: 'export', label: 'Export Profiles' }
                            ]}
                            value={transferMode}
                            onChange={(val) => setTransferMode(val as 'import' | 'export')}
                            accentColor="cyan"
                        />
                    </WizardStep>
                )}
                {transferWizardStep === 2 && transferMode === 'import' && (
                    <WizardStep title="Step 2: Import" instructions="Select a .json file containing NeonBeam material profiles to merge into your library.">
                        <ActionButton variant="normal" onClick={handleImportClick} className="w-full">
                            Select File to Import
                        </ActionButton>
                    </WizardStep>
                )}
                {transferWizardStep === 2 && transferMode === 'export' && (
                    <WizardStep title="Step 2: Export" instructions="Download your entire material profile library as a .json file.">
                        <ActionButton variant="normal" onClick={handleExport} className="w-full">
                            Download .json Backup
                        </ActionButton>
                    </WizardStep>
                )}
            </Wizard>

            <div className="flex justify-end mb-6 gap-2">
                <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleFileChange} />
                <ActionButton 
                    variant="normal" 
                    onClick={() => {
                        setTransferWizardStep(1);
                        setTransferWizardOpen(true);
                    }}
                >
                    Import/Export
                </ActionButton>
            </div>

            {/* Create New Block */}
            <div className="mb-6">
                <ActionButton 
                    variant="add" 
                    onClick={() => openWizard()}
                    className="w-full"
                >
                    + New Material Profile
                </ActionButton>
            </div>

            {/* Presets List */}
            <ItemContainer title="Material Profiles">
                {presets.map(p => (
                    <ItemBadge
                        key={p.id}
                        title={p.name}
                        subtitle={`${p.opType} • ${p.material} • ${p.power}% • ${p.rate} ${feedUnits}`}
                        onClick={() => openWizard(p)}
                        onEdit={() => openWizard(p)}
                        onDelete={() => deletePreset(p.id)}
                    />
                ))}
                {presets.length === 0 && <p className="text-center text-gray-600 text-sm py-4">No material presets configured.</p>}
            </ItemContainer>
            </div>
        </View>
    );
};
