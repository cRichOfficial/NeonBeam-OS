import React, { ReactNode } from 'react';
import { ActionButton } from './ActionButton';

export interface ItemBadgeProps {
    id?: string;
    title: string;
    subtitle?: string;
    icon?: ReactNode;
    selected?: boolean;
    onEdit?: () => void;
    onDelete?: () => void;
    onClick?: () => void;
    onSelect?: () => void;
    className?: string;
}

export const ItemBadge: React.FC<ItemBadgeProps> = ({ 
    title, 
    subtitle, 
    icon, 
    selected = false,
    onEdit,
    onDelete,
    onClick,
    onSelect,
    className = '' 
}) => {
    // When selected is true, apply miami-cyan styles (or another distinctive color). The user asked for "different border color" and "all selected items should have the same border color". Let's use miami-cyan to match the container, or maybe miami-pink. Let's use miami-pink.
    const containerClasses = selected
        ? 'bg-miami-pink/10 border-miami-pink shadow-[0_0_8px_rgba(255,0,127,0.2)]'
        : 'bg-black/60 border-gray-800 hover:border-gray-600';

    return (
        <div className={`flex items-center gap-3 w-full ${className}`}>
            <div 
                className={`flex-1 min-w-0 border rounded-xl px-3 py-2 flex items-center gap-2 transition-all ${(onClick || onSelect) ? 'cursor-pointer' : ''} ${containerClasses}`}
                onClick={onSelect ? onSelect : onClick}
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
