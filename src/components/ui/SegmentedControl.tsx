import React from 'react';

export interface SegmentOption {
    value: string;
    label: string;
}

export interface SegmentedControlProps {
    options: SegmentOption[];
    value: string;
    onChange: (val: string) => void;
    className?: string;
}

export const SegmentedControl: React.FC<SegmentedControlProps> = ({ options, value, onChange, className = '' }) => {
    return (
        <div className={`flex bg-black rounded-lg border border-gray-700 overflow-hidden ${className}`}>
            {options.map((opt) => (
                <button
                    key={opt.value}
                    onClick={() => onChange(opt.value)}
                    className={`px-3 py-1.5 text-xs font-bold transition-colors ${
                        value === opt.value
                            ? 'bg-miami-cyan text-black'
                            : 'text-gray-500 hover:text-white'
                    }`}
                >
                    {opt.label}
                </button>
            ))}
        </div>
    );
};
