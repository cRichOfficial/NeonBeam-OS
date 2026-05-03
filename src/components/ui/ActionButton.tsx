import React, { ButtonHTMLAttributes } from 'react';

export type ActionButtonVariant = 'normal' | 'add' | 'remove' | 'edit';

export interface ActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ActionButtonVariant;
}

export const ActionButton: React.FC<ActionButtonProps> = ({ 
    variant = 'normal', 
    className = '', 
    children, 
    ...props 
}) => {
    let variantClasses = '';
    
    switch (variant) {
        case 'add':
            variantClasses = 'border-neon-green bg-neon-green/20 text-neon-green hover:bg-neon-green hover:text-black shadow-[0_0_10px_rgba(57,255,20,0)] hover:shadow-[0_0_10px_rgba(57,255,20,0.15)]';
            break;
        case 'remove':
            variantClasses = 'border-neon-red bg-neon-red/20 text-neon-red hover:bg-neon-red hover:text-black shadow-[0_0_10px_rgba(255,7,58,0)] hover:shadow-[0_0_10px_rgba(255,7,58,0.15)]';
            break;
        case 'edit':
            variantClasses = 'border-neon-orange bg-neon-orange/20 text-neon-orange hover:bg-neon-orange hover:text-black shadow-[0_0_10px_rgba(255,95,31,0)] hover:shadow-[0_0_10px_rgba(255,95,31,0.15)]';
            break;
        case 'normal':
        default:
            variantClasses = 'border-miami-cyan bg-miami-cyan/20 text-miami-cyan hover:bg-miami-cyan hover:text-black shadow-[0_0_10px_rgba(0,240,255,0)] hover:shadow-[0_0_10px_rgba(0,240,255,0.15)]';
            break;
    }

    return (
        <button 
            className={`flex-shrink-0 px-4 py-2 border rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${variantClasses} ${className}`}
            {...props}
        >
            {children}
        </button>
    );
};
