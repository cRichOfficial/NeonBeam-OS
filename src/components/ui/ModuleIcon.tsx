import React, { ReactNode } from 'react';

export interface ModuleIconProps {
    label: string;
    icon: ReactNode;
    onClick?: () => void;
    className?: string;
}

export const ModuleIcon: React.FC<ModuleIconProps> = ({ 
    label, 
    icon, 
    onClick, 
    className = '' 
}) => {
    return (
        <button 
            onClick={onClick}
            className={`flex flex-col items-center justify-center p-4 bg-black border border-miami-cyan text-miami-cyan rounded-2xl transition-all hover:bg-miami-cyan/10 hover:shadow-[0_0_15px_rgba(0,240,255,0.2)] active:scale-95 ${className}`}
        >
            <div className="text-3xl mb-2">
                {icon}
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest text-center">
                {label}
            </span>
        </button>
    );
};
