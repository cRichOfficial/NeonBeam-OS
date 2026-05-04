import re

with open('src/views/StudioModule.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Replace the entire designWizardOpen block
old_wizard = content[content.find('{/* ── DESIGN WIZARD MODAL ── */}'):content.find('{/* ── OPERATION WIZARD MODAL ── */}')]
new_wizard = """{/* ── DESIGN WIZARD ── */}
            <Wizard
                isOpen={designWizardOpen}
                onClose={() => setDesignWizardOpen(false)}
                title="Load Design"
                currentStep={designWizardStep}
                totalSteps={3}
                onNext={() => {
                    if (designWizardStep === 1) {
                        if (designSource === 'existing') {
                            fetchSavedImages();
                        }
                        setDesignWizardStep(2);
                    } else if (designWizardStep === 2) {
                        setDesignWizardStep(3);
                    }
                }}
                onBack={() => setDesignWizardStep(s => s - 1)}
                onSave={() => setDesignWizardOpen(false)}
                saveText="Done"
                nextDisabled={designWizardStep === 2 && !fileKind}
            >
                {designWizardStep === 1 && (
                    <WizardStep title="Select Source" instructions="Choose where to load your design from.">
                        <RadioGroup
                            options={[
                                { value: 'existing', label: 'Start with an existing design' },
                                { value: 'new', label: 'Start with a new design' }
                            ]}
                            value={designSource}
                            onChange={(v) => setDesignSource(v as 'existing' | 'new')}
                        />
                    </WizardStep>
                )}

                {designWizardStep === 2 && (
                    <WizardStep title={designSource === 'existing' ? "Saved Images" : "Upload Design"} instructions={designSource === 'existing' ? "Select an image previously saved to the engraver." : "Select an SVG, PNG, JPG, BMP, or WebP from your device."}>
                        {designSource === 'existing' ? (
                            <div className="space-y-4">
                                {savedImages.length === 0 ? (
                                    <div className="text-center py-8 border-2 border-dashed border-gray-800 rounded-xl">
                                        <p className="text-xs text-gray-500 font-bold">No images saved to the engraver.</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 gap-2 max-h-[40vh] overflow-y-auto pr-2">
                                        {savedImages.map(img => (
                                            <button key={img.filename} 
                                                onClick={() => {
                                                    loadSavedImage(img.filename, img.url);
                                                    setDesignWizardStep(3);
                                                }}
                                                className="w-full flex items-center gap-3 p-3 rounded-xl border transition-all bg-black/40 border-gray-800 hover:border-miami-cyan"
                                            >
                                                <div className="w-10 h-10 rounded-lg bg-gray-900 flex items-center justify-center overflow-hidden">
                                                    <img src={img.url} alt={img.filename} className="w-full h-full object-cover opacity-80" />
                                                </div>
                                                <div className="flex flex-col min-w-0 flex-1 text-left">
                                                    <span className="text-xs text-white font-bold truncate">{img.filename}</span>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-6">
                                <div className="bg-black/40 border border-gray-800 rounded-2xl p-6 text-center">
                                    <div className="text-4xl mb-4">📁</div>
                                    <p className="text-sm text-gray-400 mb-6 font-bold">Select an SVG, PNG, JPG, BMP, or WebP</p>
                                    
                                    <div className="flex justify-center mb-6">
                                        <ToggleSwitch
                                            label="Save copy to engraver"
                                            checked={saveToEngraver}
                                            onChange={(checked) => setSaveToEngraver(checked)}
                                        />
                                    </div>

                                    <ActionButton variant="primary" onClick={() => fileInputRef.current?.click()} className="w-full">
                                        Choose File
                                    </ActionButton>
                                </div>
                            </div>
                        )}
                    </WizardStep>
                )}

                {designWizardStep === 3 && (() => {
                    const isSvg = fileKind === 'svg';
                    const defaultAppDpi = isSvg ? svgDpi : bitmapDpi;
                    const commonDpis = isSvg ? [72, 90, 96] : [254, 318, 508];
                    if (!commonDpis.includes(defaultAppDpi)) commonDpis.push(defaultAppDpi);
                    commonDpis.sort((a,b) => a-b);

                    return (
                        <WizardStep title="Placement & DPI" instructions="Configure the size, position, and resolution of your design.">
                            <div className="bg-black/40 border border-gray-800 rounded-2xl p-6">
                                <div className="grid grid-cols-3 gap-4 mb-6">
                                    <div>
                                        <label className="block text-[10px] text-gray-400 mb-2 uppercase font-bold">X (mm)</label>
                                        <NumericInput 
                                            value={posX}
                                            onChange={val => { setPlacement({ posX: val }); bumpRender(); }}
                                            className="w-full bg-black border border-gray-700 focus:border-miami-cyan rounded-xl p-3 text-white text-sm font-mono outline-none transition-colors"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] text-gray-400 mb-2 uppercase font-bold">Y (mm)</label>
                                        <NumericInput 
                                            value={posY}
                                            onChange={val => { setPlacement({ posY: val }); bumpRender(); }}
                                            className="w-full bg-black border border-gray-700 focus:border-miami-cyan rounded-xl p-3 text-white text-sm font-mono outline-none transition-colors"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] text-gray-400 mb-2 uppercase font-bold">Scale %</label>
                                        <NumericInput 
                                            value={scalePct}
                                            onChange={val => { setPlacement({ scalePct: val }); bumpRender(); }}
                                            min={1} max={5000}
                                            className="w-full bg-black border border-gray-700 focus:border-miami-cyan rounded-xl p-3 text-white text-sm font-mono outline-none transition-colors"
                                        />
                                    </div>
                                </div>

                                <div className="mb-6">
                                    <label className="block text-[10px] text-gray-400 mb-2 uppercase font-bold">
                                        {isSvg ? 'SVG DPI' : 'Bitmap DPI'}
                                    </label>
                                    <div className="flex flex-wrap gap-2 mb-3">
                                        {commonDpis.map(val => (
                                            <button
                                                key={val}
                                                onClick={() => { setShowCustomDpi(false); setDpi(val); bumpRender(); }}
                                                className={`px-3 py-2 rounded-xl text-xs font-bold transition-all border ${!showCustomDpi && dpi === val ? 'bg-miami-cyan/20 border-miami-cyan text-miami-cyan shadow-[0_0_10px_rgba(0,240,255,0.1)]' : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white'}`}
                                            >
                                                {val} {val === defaultAppDpi ? '(Default)' : ''}
                                            </button>
                                        ))}
                                        <button
                                            onClick={() => setShowCustomDpi(true)}
                                            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all border ${showCustomDpi ? 'bg-miami-cyan/20 border-miami-cyan text-miami-cyan shadow-[0_0_10px_rgba(0,240,255,0.1)]' : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white'}`}
                                        >
                                            Custom...
                                        </button>
                                    </div>
                                    {showCustomDpi && (
                                        <NumericInput 
                                            value={dpi}
                                            onChange={val => { setDpi(val); bumpRender(); }}
                                            min={10} max={2000}
                                            className="w-full bg-black border border-gray-700 focus:border-miami-cyan rounded-xl p-3 text-white text-sm font-mono outline-none transition-colors"
                                        />
                                    )}
                                </div>
                            </div>
                        </WizardStep>
                    );
                })()}
            </Wizard>
            
            """

content = content.replace(old_wizard, new_wizard)

# 2. Replace Header and Tabs
old_tabs = content[content.find('{/* ── Header + Tab Bar ── */}'):content.find('{/* ── Canvas ── */}')]
new_tabs = """{/* ── Header + Tab Bar ── */}
            <div className="p-4 space-y-4">
                <InstructionCard 
                    title="Design Studio" 
                    message="Import designs, configure toolpaths, and generate GCode for your laser engraver." 
                />
                
                <TabControl
                    tabs={[
                        { id: 'design', label: 'Design' },
                        { id: 'gcode', label: 'GCode Preview', disabled: !gcodeText }
                    ]}
                    activeTab={activeTab}
                    onChange={(id) => setActiveTab(id as StudioTab)}
                />
            </div>
            
            """

content = content.replace(old_tabs, new_tabs)

# 3. Replace Canvas and Design Tab
old_design = content[content.find('{/* ── Canvas ── */}'):content.find('{/* ── GCODE TAB ── */}')]
new_design = """{/* ── DESIGN TAB ── */}
            {activeTab === 'design' && (
                <div className="space-y-6">
                    <SectionCard title="Workspace View">
                        <WorkspaceGrid 
                            width={CW} 
                            height={CH}
                            machineWidthMm={mmW} 
                            machineHeightMm={mmH}
                            majorSpacingMm={major} 
                            minorSpacingMm={minor}
                            enablePanZoom={false}
                            renderOverlay={(ctx, t) => {
                                if (designImgRef.current && fileKind) {
                                    ctx.save();
                                    const dim = physSize();
                                    const px = posX * t.baseScale;
                                    const py = -posY * t.baseScale;
                                    const pw = dim.w * t.baseScale;
                                    const ph = dim.h * t.baseScale;
                                    ctx.translate(px, py - ph);
                                    if (rotation) {
                                        ctx.translate(pw/2, ph/2);
                                        ctx.rotate(rotation * Math.PI / 180);
                                        ctx.translate(-pw/2, -ph/2);
                                    }
                                    if (fileKind === 'bitmap') {
                                        ctx.globalAlpha = 0.8;
                                        ctx.drawImage(designImgRef.current, 0, 0, pw, ph);
                                    } else {
                                        ctx.fillStyle = 'rgba(255,0,127,0.2)';
                                        ctx.strokeStyle = '#ff007f';
                                        ctx.fillRect(0, 0, pw, ph);
                                        ctx.strokeRect(0, 0, pw, ph);
                                    }
                                    ctx.restore();
                                }
                            }}
                        />
                        <div className="mt-4">
                            {!fileKind ? (
                                <ActionButton variant="primary" onClick={openDesignWizard} className="w-full">
                                    Load Design
                                </ActionButton>
                            ) : (
                                <ItemContainer>
                                    <ItemBadge 
                                        title={fileName} 
                                        subtitle={`${fileKind.toUpperCase()} · ${Math.round(physSize().w)}×${Math.round(physSize().h)} mm`}
                                        icon={<span>{fileKind === 'svg' ? '📐' : '🖼️'}</span>}
                                        onEdit={openDesignWizard}
                                        onDelete={clearDesign}
                                    />
                                </ItemContainer>
                            )}
                        </div>
                    </SectionCard>

                    <SectionCard title="Job Operations">
                        {fileKind && (
                            <div className="mb-4">
                                <ActionButton variant="secondary" onClick={() => openWizard()} className="w-full">
                                    + Add Operation
                                </ActionButton>
                            </div>
                        )}
                        {operations.length === 0 && fileKind ? (
                            <div className="text-center py-8 border-2 border-dashed border-gray-800 rounded-xl">
                                <p className="text-xs text-gray-600 font-bold">No operations added yet</p>
                            </div>
                        ) : operations.length > 0 && (
                            <ItemContainer>
                                {operations.map((op, idx) => (
                                    <ItemBadge 
                                        key={op.id}
                                        title={op.name || `Op ${idx + 1}`}
                                        subtitle={`${op.opType.toUpperCase()} · ${Math.round((op.params.power / 1000) * 100)}% Power · ${toDisplay(op.params.rate)} ${displayRateUnit}`}
                                        icon={<span>{op.opType === 'raster' ? '🖼️' : '✂️'}</span>}
                                        onEdit={() => openWizard(op)}
                                        onDelete={() => removeOperation(op.id)}
                                    />
                                ))}
                            </ItemContainer>
                        )}
                    </SectionCard>

                    {fileKind && (
                        <div className="pb-10">
                            <ActionButton variant="global" onClick={generateGCode} disabled={isGenerating}>
                                {isGenerating ? 'Generating...' : 'Generate GCode'}
                            </ActionButton>
                        </div>
                    )}
                </div>
            )}
            
            """
content = content.replace(old_design, new_design)

with open('src/views/StudioModule.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

