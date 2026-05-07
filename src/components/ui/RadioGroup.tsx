import React from 'react';

export interface RadioOption {
    value: string | number;
    label: string | number;
    color?: 'cyan' | 'pink' | 'orange' | 'green';
}

export interface RadioGroupProps {
    options: RadioOption[];
    value: string | number;
    onChange: (val: any) => void;
    accentColor?: 'cyan' | 'pink' | 'orange' | 'green';
    className?: string;
}

export const RadioGroup: React.FC<RadioGroupProps> = ({ 
    options, 
    value, 
    onChange, 
    accentColor = 'cyan', 
    className = '' 
}) => {
    // Map accent names to our specific classes for dynamic rendering
    const getColorClasses = (isSelected: boolean, optColor?: 'cyan' | 'pink' | 'orange' | 'green') => {
        if (!isSelected) {
            return 'bg-black/60 text-gray-500 border-gray-700 hover:border-gray-400 hover:text-gray-300';
        }
        
        switch (optColor || accentColor) {
            case 'pink':
                return 'bg-miami-pink text-black border-miami-pink shadow-[0_0_10px_rgba(255,0,127,0.3)]';
            case 'orange':
                return 'bg-neon-orange text-black border-neon-orange shadow-[0_0_10px_rgba(255,95,31,0.3)]';
            case 'green':
                return 'bg-neon-green text-black border-neon-green shadow-[0_0_10px_rgba(57,255,20,0.3)]';
            case 'cyan':
            default:
                return 'bg-miami-cyan text-black border-miami-cyan shadow-[0_0_10px_rgba(0,240,255,0.3)]';
        }
    };

    return (
        <div className={`gap-2 ${!(className.includes('grid') || className.includes('flex')) ? 'grid grid-cols-2' : ''} ${className}`}>
            {options.map((opt) => (
                <button 
                    key={String(opt.value)} 
                    onClick={() => onChange(opt.value)}
                    className={`px-0.5 py-2 rounded-lg text-[10px] whitespace-nowrap font-bold font-[inherit] border transition-all ${getColorClasses(value === opt.value, opt.color)}`}
                >
                    {opt.label}
                </button>
            ))}
        </div>
    );
};
