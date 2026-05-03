import React, { InputHTMLAttributes } from 'react';

export interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
    label?: string;
}

export const TextInput: React.FC<TextInputProps> = ({ label, className = '', ...props }) => {
    return (
        <div className={`flex flex-col ${className}`}>
            {label && (
                <label className="block text-[10px] text-gray-400 mb-2 uppercase font-bold text-left">
                    {label}
                </label>
            )}
            <input 
                className="w-full bg-miami-cyan/10 border border-miami-cyan/50 focus:border-miami-cyan rounded-lg p-3 text-white text-sm font-mono outline-none transition-colors"
                {...props}
            />
        </div>
    );
};
