import React, { ReactNode } from 'react';

export interface ItemContainerProps {
    title?: string;
    maxHeight?: string | number;
    children: ReactNode;
    className?: string;
}

export const ItemContainer: React.FC<ItemContainerProps> = ({ 
    title, 
    maxHeight, 
    children, 
    className = '' 
}) => {
    return (
        <div className={`bg-black/40 border border-gray-800 rounded-xl p-4 flex flex-col ${className}`}>
            {title && (
                <div className="flex items-center justify-between mb-3 flex-shrink-0">
                    <h3 className="text-[10px] uppercase text-white font-bold tracking-widest text-left">
                        {title}
                    </h3>
                </div>
            )}
            <div 
                className="overflow-y-auto space-y-2 flex-1 pr-1" 
                style={{ maxHeight }}
            >
                {children}
            </div>
        </div>
    );
};
