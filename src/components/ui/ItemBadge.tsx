import React, { ReactNode } from 'react';

export interface ItemBadgeProps {
    title: string;
    subtitle?: ReactNode;
    icon?: ReactNode;
    action?: ReactNode;
    className?: string;
}

export const ItemBadge: React.FC<ItemBadgeProps> = ({ 
    title, 
    subtitle, 
    icon, 
    action, 
    className = '' 
}) => {
    return (
        <div className={`bg-black/60 border border-miami-cyan/40 rounded-xl px-3 py-2 flex items-center gap-2 ${className}`}>
            {icon && (
                <div className="flex-shrink-0 flex items-center justify-center">
                    {icon}
                </div>
            )}
            
            <div className="flex-1 min-w-0 text-left">
                <span className="text-xs font-bold text-white truncate block">{title}</span>
                {subtitle && (
                    <div className="text-[9px] text-gray-400 mt-0.5 truncate block">
                        {subtitle}
                    </div>
                )}
            </div>

            {action && (
                <div className="flex-shrink-0 flex items-center ml-auto">
                    {action}
                </div>
            )}
        </div>
    );
};
