import React, { ReactNode } from 'react';

export interface ActionListProps {
    title?: string;
    maxHeight?: string | number;
    children: ReactNode;
    className?: string;
}

export const ActionList: React.FC<ActionListProps> = ({ title, maxHeight, children, className = '' }) => {
    return (
        <div className={`bg-miami-cyan/5 border border-miami-cyan/30 rounded-xl p-4 flex flex-col ${className}`}>
            {title && (
                <div className="flex items-center justify-between mb-3 flex-shrink-0">
                    <h3 className="text-[10px] uppercase text-white font-bold tracking-widest text-left">
                        {title}
                    </h3>
                </div>
            )}
            <div className="overflow-y-auto space-y-2 flex-1 pr-1" style={{ maxHeight }}>
                {children}
            </div>
        </div>
    );
};
