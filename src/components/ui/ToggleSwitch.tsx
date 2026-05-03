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
        <label className={`flex items-center justify-between cursor-pointer group bg-black/30 px-3 py-3 rounded-lg border border-gray-800 hover:border-miami-cyan/50 transition-colors ${className}`}>
            <div className="text-left">
                {label && <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">{label}</span>}
                {description && <span className="block text-xs text-white mt-1">{description}</span>}
            </div>
            <div className="relative flex items-center ml-4 flex-shrink-0" onClick={(e) => { e.preventDefault(); onChange(!checked); }}>
                <div className={`w-11 h-6 rounded-full transition-colors ${checked ? 'bg-miami-cyan' : 'bg-gray-700'}`} />
                <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
            </div>
        </label>
    );
};
