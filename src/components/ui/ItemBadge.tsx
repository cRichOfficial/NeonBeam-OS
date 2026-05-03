import React, { ReactNode } from 'react';
import { ActionButton } from './ActionButton';

export interface ItemBadgeProps {
    title: ReactNode;
    subtitle?: ReactNode;
    icon?: ReactNode;
    onEdit?: () => void;
    onDelete?: () => void;
    onClick?: () => void;
    className?: string;
}

export const ItemBadge: React.FC<ItemBadgeProps> = ({ 
    title, 
    subtitle, 
    icon, 
    onEdit,
    onDelete,
    onClick,
    className = '' 
}) => {
    return (
        <div className={`flex items-center gap-3 w-full ${className}`}>
            <div 
                className={`flex-1 min-w-0 bg-black/60 border border-gray-800 hover:border-gray-600 rounded-xl px-3 py-2 flex items-center gap-2 transition-all ${onClick ? 'cursor-pointer' : ''}`}
                onClick={onClick}
            >
                {icon && (
                    <div className="flex-shrink-0 flex items-center justify-center">
                        {icon}
                    </div>
                )}
                
                <div className="flex-1 min-w-0 text-left">
                    <span className="text-xs font-bold text-white truncate flex items-center gap-2">{title}</span>
                    {subtitle && (
                        <div className="text-[10px] text-gray-400 mt-0.5 truncate flex items-center gap-2">
                            {subtitle}
                        </div>
                    )}
                </div>
            </div>

            {(onEdit || onDelete) && (
                <div className="flex-shrink-0 flex items-center gap-2">
                    {onEdit && (
                        <ActionButton variant="edit" onClick={(e) => { e.stopPropagation(); onEdit(); }}>
                            Edit
                        </ActionButton>
                    )}
                    {onDelete && (
                        <ActionButton variant="remove" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
                            Delete
                        </ActionButton>
                    )}
                </div>
            )}
        </div>
    );
};
