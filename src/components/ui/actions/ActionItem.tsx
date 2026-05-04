import React from 'react';
import { ActionButton } from '../ActionButton';
import type { BaseAction } from './types';

export interface ActionItemProps {
    action: BaseAction;
    onEdit?: (action: BaseAction) => void;
    onDelete?: (action: BaseAction) => void;
    onClick?: (action: BaseAction) => void;
    className?: string;
}

export const ActionItem: React.FC<ActionItemProps> = ({
    action,
    onEdit,
    onDelete,
    onClick,
    className = ''
}) => {
    return (
        <div className={`flex items-center gap-3 w-full ${className}`}>
            <div 
                className={`flex-1 min-w-0 bg-black/60 border border-gray-800 hover:border-gray-600 rounded-xl px-3 py-2 flex items-center gap-2 transition-all ${onClick ? 'cursor-pointer' : ''}`}
                onClick={() => onClick?.(action)}
            >
                <div className="flex-1 min-w-0 text-left">
                    <span className="text-xs font-bold text-white truncate block">{action.title}</span>
                    {action.subtitle && (
                        <span className="text-[10px] text-gray-400 mt-0.5 truncate block">{action.subtitle}</span>
                    )}
                </div>
            </div>

            {(onEdit || onDelete) && (
                <div className="flex-shrink-0 flex items-center gap-2">
                    {onEdit && (
                        <ActionButton variant="edit" onClick={(e) => { e.stopPropagation(); onEdit(action); }}>
                            Edit
                        </ActionButton>
                    )}
                    {onDelete && (
                        <ActionButton variant="remove" onClick={(e) => { e.stopPropagation(); onDelete(action); }}>
                            Delete
                        </ActionButton>
                    )}
                </div>
            )}
        </div>
    );
};
