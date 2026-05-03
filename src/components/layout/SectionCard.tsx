import React, { ReactNode } from 'react';

export interface SectionCardProps {
    title?: string;
    children: ReactNode;
    className?: string;
}

export const SectionCard: React.FC<SectionCardProps> = ({ title, children, className = '' }) => {
    return (
        <div className={`bg-black/40 border border-gray-800 rounded-xl p-4 ${className}`}>
            {title && (
                <h3 className="text-[10px] uppercase text-white font-bold tracking-widest mb-3 text-left">
                    {title}
                </h3>
            )}
            {children}
        </div>
    );
};
