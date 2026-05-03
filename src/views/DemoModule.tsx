import React, { useState } from 'react';
import { View } from '../components/layout/View';
import { SectionCard } from '../components/layout/SectionCard';
import { BadgeContainer } from '../components/layout/BadgeContainer';
import { TabPage } from '../components/layout/TabPage';
import { TabControl } from '../components/ui/TabControl';
import { ActionButton } from '../components/ui/ActionButton';
import { TextInput } from '../components/ui/TextInput';
import { ItemBadge } from '../components/ui/ItemBadge';
import { ModuleIcon } from '../components/ui/ModuleIcon';
import { Wizard } from '../components/ui/Wizard';
import { WizardStep } from '../components/ui/WizardStep';
import { CameraStream } from '../components/ui/CameraStream';

export const DemoModule: React.FC = () => {
    const [activeTab, setActiveTab] = useState('buttons');
    const [isWizardOpen, setWizardOpen] = useState(false);
    const [wizardStep, setWizardStep] = useState(1);

    const tabs = [
        { id: 'buttons', label: 'Buttons & Inputs' },
        { id: 'layout', label: 'Layouts & Badges' },
        { id: 'complex', label: 'Complex UI' },
        { id: 'typography', label: 'Typography' }
    ];

    return (
        <View title="UI Component Demo" subtitle="Standardized Library Showcase">
            <div className="p-4 space-y-4">
                
                <TabControl 
                    tabs={tabs} 
                    activeTab={activeTab} 
                    onChange={setActiveTab} 
                />

                <TabPage 
                    title={tabs.find(t => t.id === activeTab)?.label || ''} 
                    description="This is the description provided by the TabPage component. It helps explain what this tab is for."
                    className={activeTab !== 'buttons' ? 'hidden' : ''}
                >
                    <SectionCard title="Action Buttons">
                        <div className="flex flex-wrap gap-4">
                            <ActionButton variant="normal">Normal Action</ActionButton>
                            <ActionButton variant="add">+ Add Item</ActionButton>
                            <ActionButton variant="remove">Remove</ActionButton>
                            <ActionButton variant="edit">Edit Details</ActionButton>
                        </div>
                    </SectionCard>
                    
                    <SectionCard title="Text Inputs">
                        <div className="space-y-4">
                            <TextInput label="Standard Input" placeholder="Type here..." />
                            <TextInput label="Disabled Input" placeholder="Disabled..." disabled />
                        </div>
                    </SectionCard>
                </TabPage>

                <TabPage 
                    title="Layouts & Badges" 
                    className={activeTab !== 'layout' ? 'hidden' : ''}
                >
                    <BadgeContainer 
                        title="Job Operations Container" 
                        heightClass="max-h-[300px]"
                        actionButton={<ActionButton variant="add">+ Add Op</ActionButton>}
                    >
                        <ItemBadge 
                            title="path#test - Cut" 
                            subtitle="CUT · 68% Power · 100 mm/s" 
                            icon={<div className="w-6 h-6 bg-[#ff007f] rounded" />}
                            action={<ActionButton variant="edit">Edit</ActionButton>}
                        />
                        <ItemBadge 
                            title="path#outline - Fill" 
                            subtitle="FILL · 40% Power · 300 mm/s" 
                            icon={<div className="w-6 h-6 bg-[#7000ff] rounded" />}
                            action={<ActionButton variant="edit">Edit</ActionButton>}
                        />
                    </BadgeContainer>

                    <SectionCard title="Module Icons (Dashboard style)">
                        <div className="grid grid-cols-2 gap-4 max-w-[300px]">
                            <ModuleIcon label="Test Module" icon="🧪" onClick={() => alert('Clicked!')} />
                            <ModuleIcon label="Another" icon="🚀" />
                        </div>
                    </SectionCard>
                </TabPage>

                <TabPage 
                    title="Complex UI" 
                    className={activeTab !== 'complex' ? 'hidden' : ''}
                >
                    <SectionCard title="Modal Wizard">
                        <ActionButton variant="normal" onClick={() => { setWizardStep(1); setWizardOpen(true); }}>
                            Open Demo Wizard
                        </ActionButton>
                    </SectionCard>

                    <SectionCard title="Camera Stream Wrapper">
                        <div className="h-[200px]">
                            <CameraStream title="Camera 1: Top View" streamUrl="" fallback="Waiting for video stream..." />
                        </div>
                    </SectionCard>
                </TabPage>

                <Wizard 
                    title="Demo Workflow Wizard" 
                    isOpen={isWizardOpen} 
                    onClose={() => setWizardOpen(false)}
                    currentStep={wizardStep}
                    totalSteps={3}
                >
                    <WizardStep title="Step 1: Introduction" stepIndex={1} currentStep={wizardStep}>
                        <p className="text-white text-sm mb-6">This is the first step of the wizard.</p>
                        <ActionButton variant="normal" className="w-full" onClick={() => setWizardStep(2)}>Next Step</ActionButton>
                    </WizardStep>
                    
                    <WizardStep title="Step 2: Configuration" stepIndex={2} currentStep={wizardStep}>
                        <TextInput label="Some config value" placeholder="Value..." className="mb-6" />
                        <div className="flex gap-2">
                            <ActionButton variant="normal" className="flex-1" onClick={() => setWizardStep(1)}>Back</ActionButton>
                            <ActionButton variant="normal" className="flex-1" onClick={() => setWizardStep(3)}>Next Step</ActionButton>
                        </div>
                    </WizardStep>

                    <WizardStep title="Step 3: Finish" stepIndex={3} currentStep={wizardStep}>
                        <p className="text-white text-sm mb-6">You are done!</p>
                        <div className="flex gap-2">
                            <ActionButton variant="normal" className="flex-1" onClick={() => setWizardStep(2)}>Back</ActionButton>
                            <ActionButton variant="add" className="flex-1" onClick={() => setWizardOpen(false)}>Complete</ActionButton>
                        </div>
                    </WizardStep>
                </Wizard>
                <TabPage 
                    title="Typography Options" 
                    className={activeTab !== 'typography' ? 'hidden' : ''}
                    description="Preview different Google Fonts against the neon themes."
                >
                    <SectionCard title="Font Previews">
                        <div className="flex flex-col gap-4">
                            <ActionButton variant="normal" style={{ fontFamily: 'Inter, sans-serif' }}>Inter (Current Default)</ActionButton>
                            <ActionButton variant="normal" style={{ fontFamily: 'Montserrat, sans-serif' }}>Montserrat</ActionButton>
                            <ActionButton variant="normal" style={{ fontFamily: 'Orbitron, sans-serif' }}>Orbitron</ActionButton>
                            <ActionButton variant="normal" style={{ fontFamily: 'Outfit, sans-serif' }}>Outfit</ActionButton>
                            <ActionButton variant="normal" style={{ fontFamily: 'Rajdhani, sans-serif' }}>Rajdhani</ActionButton>
                            <ActionButton variant="normal" style={{ fontFamily: '"Space Grotesk", sans-serif' }}>Space Grotesk</ActionButton>
                        </div>
                    </SectionCard>
                </TabPage>
                
            </div>
        </View>
    );
};
