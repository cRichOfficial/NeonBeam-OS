import re

def fix_material_presets():
    with open('src/views/MaterialPresetsModule.tsx', 'r', encoding='utf-8') as f:
        content = f.read()

    # Add toDisplay and toMmPerMin
    if "const toDisplay =" not in content:
        helper_code = """    const toDisplay = (mmMin: number) => feedUnits === 'mm/s' ? Number((mmMin / 60).toFixed(1)) : mmMin;
    const toMmPerMin = (disp: number) => feedUnits === 'mm/s' ? disp * 60 : disp;

"""
        # insert after const { feedUnits }
        idx = content.find('const { feedUnits } = settings;')
        idx = content.find('\n', idx) + 1
        content = content[:idx] + helper_code + content[idx:]

    # Fix rate: val -> toMmPerMin(val)
    content = content.replace(
        "onChange={val => setDraftPreset({ ...draftPreset, rate: val })}",
        "onChange={val => setDraftPreset({ ...draftPreset, rate: toMmPerMin(val) })}"
    )
    
    # Fix value={draftPreset.rate || 0} -> toDisplay
    content = content.replace(
        "value={draftPreset.rate || 0}",
        "value={toDisplay(draftPreset.rate || 0)}"
    )

    # Fix default rate from feedUnits ? 30 : 1800 to just 1800 (since it stores in mm/min)
    content = content.replace(
        "rate: feedUnits === 'mm/s' ? 30 : 1800",
        "rate: 1800"
    )
    
    # Fix display text in subtitle
    content = content.replace(
        "${p.rate} ${feedUnits}",
        "${toDisplay(p.rate)} ${feedUnits}"
    )

    with open('src/views/MaterialPresetsModule.tsx', 'w', encoding='utf-8') as f:
        f.write(content)

def fix_workspace_grid():
    with open('src/components/workspace/WorkspaceGrid.tsx', 'r', encoding='utf-8') as f:
        content = f.read()

    old_effect = """        if (externalOffsetX === undefined && externalOffsetY === undefined) {
            const plotW = baseScale * machineWidthMm;
            const plotH = baseScale * machineHeightMm;
            const centeredX = (DW - plotW) / 2;
            // Canvas origin sits at y = DH + offsetY.
            // To frame the bed (0..plotH), we want the center of the bed
            // at the center of the drawable area: offsetY - plotH/2 = -DH/2
            // => offsetY = plotH/2 - DH/2 = (plotH - DH) / 2
            const centeredY = (plotH - DH) / 2;
            setInternalOffsetX(centeredX);
            setInternalOffsetY(centeredY);
        }"""
        
    new_effect = """        if (externalOffsetX === undefined && externalOffsetY === undefined) {
            setInternalOffsetX(0);
            setInternalOffsetY(0);
        }"""
        
    content = content.replace(old_effect, new_effect)
    with open('src/components/workspace/WorkspaceGrid.tsx', 'w', encoding='utf-8') as f:
        f.write(content)

def fix_studio_module():
    with open('src/views/StudioModule.tsx', 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Add fileInputRef
    if 'type="file"' not in content:
        view_start = content.find('<View title="Design Studio"')
        file_input = """<input type="file" ref={fileInputRef} className="hidden" accept=".svg,.png,.jpg,.jpeg,.bmp,.webp" onChange={handleFileChange} />
            """
        view_idx = content.find('>', view_start) + 1
        content = content[:view_idx] + "\n            " + file_input + content[view_idx:]

    # 2. Fix SVG rendering
    old_render = """                                    if (fileKind === 'bitmap') {
                                        ctx.globalAlpha = 0.8;
                                        ctx.drawImage(designImgRef.current, 0, 0, pw, ph);
                                    } else {
                                        ctx.fillStyle = 'rgba(255,0,127,0.2)';
                                        ctx.strokeStyle = '#ff007f';
                                        ctx.fillRect(0, 0, pw, ph);
                                        ctx.strokeRect(0, 0, pw, ph);
                                    }"""
    new_render = """                                    ctx.globalAlpha = fileKind === 'bitmap' ? 0.8 : 0.9;
                                    ctx.drawImage(designImgRef.current, 0, 0, pw, ph);
                                    
                                    if (fileKind === 'svg') {
                                        ctx.strokeStyle = '#ff007f';
                                        ctx.strokeRect(0, 0, pw, ph);
                                    }"""
    content = content.replace(old_render, new_render)

    # 3. Fix DPI Radios
    old_dpi = """                                        {commonDpis.map(val => (
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
                                        </button>"""
                                        
    new_dpi = """                                        <RadioGroup
                                            options={[
                                                ...(isSvg ? [72, 96, 150, 300] : [72, 96, 150, 300, 600]).map(v => ({ value: v, label: v })),
                                                { value: 'custom', label: 'Custom' }
                                            ]}
                                            value={showCustomDpi ? 'custom' : dpi}
                                            onChange={(val) => {
                                                if (val === 'custom') {
                                                    setShowCustomDpi(true);
                                                } else {
                                                    setShowCustomDpi(false);
                                                    setDpi(val as number);
                                                    bumpRender();
                                                }
                                            }}
                                            accentColor="cyan"
                                        />"""
    content = content.replace(old_dpi, new_dpi)
    
    with open('src/views/StudioModule.tsx', 'w', encoding='utf-8') as f:
        f.write(content)

fix_material_presets()
fix_workspace_grid()
fix_studio_module()
