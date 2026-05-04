with open('src/views/StudioModule.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

imports = [
    "import { View } from '../components/layout/View';\n",
    "import { SectionCard } from '../components/layout/SectionCard';\n",
    "import { InstructionCard } from '../components/layout/InstructionCard';\n",
    "import { TabControl } from '../components/ui/TabControl';\n",
    "import { WorkspaceGrid } from '../components/workspace/WorkspaceGrid';\n",
    "import { ItemContainer } from '../components/ui/ItemContainer';\n",
    "import { ItemBadge } from '../components/ui/ItemBadge';\n",
    "import { ActionButton } from '../components/ui/ActionButton';\n",
    "import { Wizard, WizardStep } from '../components/ui/Wizard';\n",
    "import { RadioGroup } from '../components/ui/RadioGroup';\n",
    "import { ToggleSwitch } from '../components/ui/ToggleSwitch';\n",
]

lines = lines[:13] + imports + lines[13:]

with open('src/views/StudioModule.tsx', 'w', encoding='utf-8') as f:
    f.writelines(lines)
