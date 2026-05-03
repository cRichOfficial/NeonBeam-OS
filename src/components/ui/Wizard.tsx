import React, { ReactNode } from 'react';

export interface WizardProps {
    title: string;
    isOpen: boolean;
    onClose: () => void;
    currentStep?: number;
    totalSteps?: number;
    children: ReactNode;
}

export const Wizard: React.FC<WizardProps> = ({ 
    title, 
    isOpen, 
    onClose, 
    currentStep, 
    totalSteps = 3, 
    children 
}) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
            <div className="w-full max-w-lg bg-[#0c0c14] border-t sm:border border-gray-800 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in slide-in-from-bottom duration-300">
                
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between bg-black/40">
                    <div>
                        <h3 className="text-miami-cyan font-black text-sm uppercase tracking-widest text-left">
                            {title}
                        </h3>
                        {currentStep !== undefined && currentStep > 0 && totalSteps > 0 && (
                            <div className="flex gap-1 mt-1">
                                {Array.from({ length: totalSteps }, (_, i) => i + 1).map(s => (
                                    <div 
                                        key={s} 
                                        className={`h-1 w-8 rounded-full transition-colors ${currentStep >= s ? 'bg-miami-cyan' : 'bg-gray-800'}`} 
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                    <button 
                        onClick={onClose} 
                        className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-900 text-gray-500 hover:text-white transition-colors"
                    >
                        ✕
                    </button>
                </div>

                {/* Step Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {children}
                </div>
            </div>
        </div>
    );
};
