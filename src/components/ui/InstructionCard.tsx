import React, { ReactNode } from 'react';

export interface InstructionCardProps {
    title: string;
    children: ReactNode;
    className?: string;
}

export const InstructionCard: React.FC<InstructionCardProps> = ({
    title,
    children,
    className = ''
}) => {
    return (
        <div className={`bg-miami-cyan/5 border border-miami-cyan/30 p-4 rounded-2xl ${className}`}>
            <p className="text-xs text-miami-cyan font-bold">{title}</p>
            <div className="text-[10px] text-gray-400 mt-1 uppercase tracking-wider">
                {children}
            </div>
        </div>
    );
};
