import React, { ReactNode } from 'react';

export interface BadgeContainerProps {
    title: string;
    heightClass?: string; // e.g. 'max-h-[40vh]'
    children: ReactNode;
    className?: string;
    actionButton?: ReactNode;
}

export const BadgeContainer: React.FC<BadgeContainerProps> = ({ 
    title, 
    heightClass = '', 
    children, 
    className = '',
    actionButton
}) => {
    return (
        <div className={`bg-black/40 border border-gray-800 rounded-xl p-3 ${className}`}>
            <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] uppercase text-white font-bold tracking-widest text-left">
                    {title}
                </p>
                {actionButton && <div>{actionButton}</div>}
            </div>

            <div className={`space-y-2 overflow-y-auto pr-1 ${heightClass}`}>
                {children}
            </div>
        </div>
    );
};
