import React, { useState } from 'react';
import type { BaseAction } from './types';

export interface ActionGridProps {
    title?: string;
    rows: number;
    cols: number;
    actions: BaseAction[];
    enableOverflow: boolean;
    onExecute: (action: BaseAction) => void;
    className?: string;
}

export const ActionGrid: React.FC<ActionGridProps> = ({
    title,
    rows,
    cols,
    actions,
    enableOverflow,
    onExecute,
    className = ''
}) => {
    const totalCells = rows * cols;
    const [dropdownOpen, setDropdownOpen] = useState(false);
    
    const visibleCells = totalCells;
    const isOverflowing = enableOverflow && actions.length >= totalCells;
    
    const getThemeClasses = (theme?: string) => {
        switch(theme) {
            case 'neon-green': return 'border-neon-green bg-neon-green/20 text-neon-green hover:bg-neon-green hover:text-black';
            case 'miami-pink': return 'border-miami-pink/60 bg-miami-pink/20 text-miami-pink/90 hover:bg-miami-pink/80 hover:text-white';
            case 'neon-orange': return 'border-neon-orange bg-neon-orange/20 text-neon-orange hover:bg-neon-orange hover:text-black';
            case 'miami-cyan':
            default: return 'border-miami-cyan bg-miami-cyan/20 text-miami-cyan hover:bg-miami-cyan hover:text-black';
        }
    };

    const renderCell = (index: number) => {
        const isOverflowCell = isOverflowing && index === visibleCells - 1;
        
        if (isOverflowCell) {
            return (
                <div key={`cell-${index}`} className="relative aspect-square">
                    <button 
                        onClick={() => setDropdownOpen(!dropdownOpen)}
                        className="w-full h-full flex flex-col items-center justify-center p-2 rounded-xl bg-gray-800 border border-gray-600 text-gray-300 hover:bg-gray-700 transition-colors shadow-[0_4px_10px_rgba(0,0,0,0.5)]"
                    >
                        <span className="text-2xl leading-none font-bold">⋮</span>
                        <span className="text-[10px] uppercase tracking-widest mt-1">More</span>
                    </button>
                    {dropdownOpen && (
                        <div className="absolute bottom-full right-0 mb-2 w-48 bg-black/95 border border-gray-700 rounded-xl shadow-2xl p-2 flex flex-col gap-1 z-50 overflow-y-auto max-h-64">
                            {actions.slice(visibleCells - 1).filter(Boolean).map(act => (
                                <button 
                                    key={act.id}
                                    onClick={() => { if(!act.disabled) { setDropdownOpen(false); onExecute(act); } }}
                                    disabled={act.disabled}
                                    className={`text-left px-3 py-3 rounded-lg text-xs font-bold transition-colors border ${act.disabled ? 'opacity-50 cursor-not-allowed bg-black/20 border-gray-800 text-gray-700' : getThemeClasses(act.theme)}`}
                                >
                                    <div className="flex flex-col">
                                        <span>{act.title}</span>
                                        {act.subtitle && <span className="text-[8px] opacity-70 mt-0.5">{act.subtitle}</span>}
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            );
        }

        const action = actions[index];
        if (action) {
            return (
                <button 
                    key={`cell-${index}`} 
                    onClick={() => { if(!action.disabled) onExecute(action); }}
                    disabled={action.disabled}
                    className={`flex flex-col items-center justify-center p-2 rounded-xl border transition-all active:scale-95 shadow-[0_4px_10px_rgba(0,0,0,0.5)] aspect-square text-center ${action.disabled ? 'opacity-50 cursor-not-allowed bg-black/20 border-gray-800 text-gray-700' : getThemeClasses(action.theme)}`}
                >
                    <span className="text-xs font-bold leading-tight line-clamp-3">{action.title}</span>
                    {action.subtitle && (
                        <span className={`text-[8px] leading-tight block w-full mt-0.5 ${action.disabled ? 'text-gray-600' : 'text-current opacity-80'}`}>{action.subtitle}</span>
                    )}
                </button>
            );
        }
        
        // Empty Cell at runtime
        return (
            <div key={`cell-${index}`} className="aspect-square opacity-0"></div>
        );
    };

    return (
        <div className={`bg-miami-cyan/5 border border-miami-cyan/30 rounded-xl p-4 flex flex-col ${className}`}>
            {title && (
                <div className="flex items-center justify-between mb-3 flex-shrink-0">
                    <h3 className="text-[10px] uppercase text-miami-cyan font-bold tracking-widest text-left">
                        {title}
                    </h3>
                </div>
            )}
            <div 
                className="grid gap-3" 
                style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
            >
                {Array.from({ length: visibleCells }).map((_, i) => renderCell(i))}
            </div>
            
            {dropdownOpen && (
                <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)}></div>
            )}
        </div>
    );
};
