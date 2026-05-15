import React, { ReactNode } from 'react';
import { ActionButton } from './ActionButton';
import { InstructionCard } from './InstructionCard';

export interface WizardStepProps {
    title: string;
    instructions: ReactNode;
    children: ReactNode;
}

export const WizardStep: React.FC<WizardStepProps> = ({ title, instructions, children }) => {
    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <InstructionCard title={title} className="mb-6">
                {instructions}
            </InstructionCard>
            {children}
        </div>
    );
};

export interface WizardProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    currentStep: number;
    totalSteps: number;
    onNext: () => void;
    onBack: () => void;
    onSave: () => void;
    nextDisabled?: boolean;
    saveDisabled?: boolean;
    saveText?: string;
    children: ReactNode;
}

export const Wizard: React.FC<WizardProps> = ({
    isOpen,
    onClose,
    title,
    currentStep,
    totalSteps,
    onNext,
    onBack,
    onSave,
    nextDisabled = false,
    saveDisabled = false,
    saveText = 'Save',
    children
}) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200 font-[inherit]">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />
            
            <div className="relative w-full max-w-md bg-gray-900 border-t sm:border border-gray-800 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-10 duration-300 flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="p-6 border-b border-gray-800 flex items-center justify-between bg-black/20 flex-shrink-0">
                    <div>
                        <h3 className="text-lg font-black text-white">{title}</h3>
                        <div className="flex gap-1 mt-2">
                            {Array.from({ length: totalSteps }).map((_, i) => (
                                <div key={i} className={`h-1 rounded-full transition-all ${currentStep === i + 1 ? 'w-8 bg-miami-cyan' : 'w-4 bg-gray-800'}`} />
                            ))}
                        </div>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-800 text-gray-400 hover:text-white transition-all">✕</button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto flex-1">
                    {children}
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-gray-800 bg-black/40 flex justify-between gap-3 flex-shrink-0">
                    {currentStep > 1 ? (
                        <ActionButton variant="normal" className="w-[30%]" onClick={onBack}>
                            Back
                        </ActionButton>
                    ) : <div className="w-[30%]"></div>}
                    
                    {currentStep < totalSteps ? (
                        <ActionButton 
                            variant="normal" 
                            onClick={onNext} 
                            disabled={nextDisabled}
                            className="w-[30%]"
                        >
                            Next Step
                        </ActionButton>
                    ) : (
                        <ActionButton variant="normal" onClick={onSave} disabled={saveDisabled} className="w-[30%]">
                            {saveText}
                        </ActionButton>
                    )}
                </div>
            </div>
        </div>
    );
};
