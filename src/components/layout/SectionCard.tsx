import React, { ReactNode } from 'react';

export interface SectionCardProps {
    title?: string;
    action?: ReactNode;
    children: ReactNode;
    className?: string;
}

export const SectionCard: React.FC<SectionCardProps> = ({ title, action, children, className = '' }) => {
    return (
        <div className={`bg-black/40 border border-gray-800 rounded-xl p-4 ${className}`}>
            {(title || action) && (
                <div className="flex items-center justify-between mb-3">
                    {title && (
                        <h3 className="text-[10px] uppercase text-white font-bold tracking-widest text-left">
                            {title}
                        </h3>
                    )}
                    {action && (
                        <div>{action}</div>
                    )}
                </div>
            )}
            {children}
        </div>
    );
};
