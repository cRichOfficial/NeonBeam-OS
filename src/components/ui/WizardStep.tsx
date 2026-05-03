import React, { ReactNode } from 'react';

export interface WizardStepProps {
    title: string;
    stepIndex: number;
    currentStep: number;
    children: ReactNode;
}

export const WizardStep: React.FC<WizardStepProps> = ({ 
    title, 
    stepIndex, 
    currentStep, 
    children 
}) => {
    if (stepIndex !== currentStep) return null;

    return (
        <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
            <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mb-4 text-left">
                {title}
            </p>
            {children}
        </div>
    );
};
