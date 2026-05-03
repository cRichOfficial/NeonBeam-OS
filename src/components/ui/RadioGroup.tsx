import React from 'react';

export interface RadioOption {
    value: string | number;
    label: string | number;
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
    const getColorClasses = (isSelected: boolean) => {
        if (!isSelected) {
            return 'bg-black/60 text-gray-500 border-gray-700 hover:border-gray-400 hover:text-gray-300';
        }
        
        switch (accentColor) {
            case 'pink':
                return 'bg-miami-pink text-black border-miami-pink';
            case 'orange':
                return 'bg-neon-orange text-black border-neon-orange';
            case 'green':
                return 'bg-neon-green text-black border-neon-green';
            case 'cyan':
            default:
                return 'bg-miami-cyan text-black border-miami-cyan';
        }
    };

    return (
        <div className={`flex gap-1.5 ${className}`}>
            {options.map((opt) => (
                <button 
                    key={String(opt.value)} 
                    onClick={() => onChange(opt.value)}
                    className={`flex-1 py-1.5 rounded-lg text-[10px] font-black border transition-all ${getColorClasses(value === opt.value)}`}
                >
                    {opt.label}
                </button>
            ))}
        </div>
    );
};
