import React from 'react';

export interface ToggleSwitchProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label?: string;
    description?: string;
    className?: string;
}

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
    checked,
    onChange,
    label,
    description,
    className = ''
}) => {
    return (
        <div className={`w-full ${className}`}>
            {(label || description) && (
                <div className="mb-2 text-left">
                    {label && <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">{label}</span>}
                    {description && <span className="block text-[10px] text-gray-500 mt-1">{description}</span>}
                </div>
            )}
            
            <div 
                className={`relative flex items-center w-full h-[46px] rounded-lg cursor-pointer border border-miami-cyan/50 p-1 transition-colors ${checked ? 'bg-miami-cyan/20' : 'bg-miami-cyan/5'}`}
                onClick={(e) => { e.preventDefault(); onChange(!checked); }}
            >
                {/* Sliding Thumb */}
                <div className={`absolute top-1 bottom-1 w-[calc(50%-4px)] rounded flex items-center justify-center font-black text-xs tracking-widest transition-all duration-300 shadow-md ${
                    checked 
                        ? 'left-[calc(50%+2px)] bg-miami-cyan text-black border border-miami-cyan' 
                        : 'left-1 bg-miami-cyan/20 text-miami-cyan border border-miami-cyan/50'
                }`}>
                    {checked ? 'ON' : 'OFF'}
                </div>
            </div>
        </div>
    );
};
