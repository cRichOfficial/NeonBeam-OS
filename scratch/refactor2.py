import re

with open('src/views/StudioModule.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add designWizardStep and designSource state
content = content.replace(
    "const [designWizardOpen, setDesignWizardOpen] = useState(false);\n    const [designWizardMode, setDesignWizardMode] = useState<'select' | 'saved' | 'new' | 'manage' | 'placement'>('select');",
    "const [designWizardOpen, setDesignWizardOpen] = useState(false);\n    const [designWizardStep, setDesignWizardStep] = useState(1);\n    const [designSource, setDesignSource] = useState<'existing' | 'new'>('existing');"
)

# 2. Update openDesignWizard
content = content.replace(
    "const openDesignWizard = () => {\n        setDesignWizardMode(fileKind ? 'manage' : 'select');\n        setDesignWizardOpen(true);\n    };",
    "const openDesignWizard = () => {\n        setDesignWizardStep(fileKind ? 3 : 1);\n        setDesignWizardOpen(true);\n    };"
)

# 3. Fix loadSavedImage
content = content.replace(
    "loadFile(file);\n            setDesignWizardMode('placement');",
    "loadFile(file);\n            setDesignWizardStep(3);"
)

# 4. Fix handleFileChange
content = content.replace(
    "loadFile(f); \n            setDesignWizardMode('placement');",
    "loadFile(f); \n            setDesignWizardStep(3);"
)

# 5. Fix fetchSavedImages
content = content.replace(
    "setSavedImages(res.data);\n            setDesignWizardMode('saved');",
    "setSavedImages(res.data);"
)

# 6. Replace main layout
old_layout_start = """    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col h-full bg-black/10">"""
        
new_layout_start = """    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <View title="Design Studio" subtitle={`⊕ BL origin · ${mmW}×${mmH} mm`} showHomeButton>"""

content = content.replace(old_layout_start, new_layout_start)

# 7. Replace the end
content = content.replace(
    "                </div>\n            )}\n        </div>\n    );\n};",
    "                </div>\n            )}\n        </View>\n    );\n};"
)

with open('src/views/StudioModule.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
