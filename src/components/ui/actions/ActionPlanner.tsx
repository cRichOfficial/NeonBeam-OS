import React from 'react';
import { ToggleSwitch } from '../ToggleSwitch';
import { InstructionCard } from '../InstructionCard';
import type { BaseAction } from './types';

export interface ActionPlannerProps {
    title?: string;
    rows: number;
    cols: number;
    actions: BaseAction[];
    onSelectCell: (index: number) => void;
    enableOverflow: boolean;
    onToggleOverflow: (enabled: boolean) => void;
    className?: string;
}

export const ActionPlanner: React.FC<ActionPlannerProps> = ({
    title,
    rows,
    cols,
    actions,
    onSelectCell,
    enableOverflow,
    onToggleOverflow,
    className = ''
}) => {
    const totalCells = rows * cols;
    const overflowActive = enableOverflow && actions.length > totalCells;
    
    const visibleCells = totalCells;
    
    const renderCell = (index: number) => {
        const isOverflowCell = enableOverflow && index === visibleCells - 1;
        
        if (isOverflowCell && actions.length >= totalCells) {
            const overflowCount = actions.length - totalCells + 1;
            return (
                <div key={`cell-${index}`} className="flex flex-col items-center justify-center p-2 rounded-xl bg-gray-800/50 border-2 border-dashed border-gray-600 text-gray-400 aspect-square">
                    <span className="text-sm font-bold">+{overflowCount}</span>
                    <span className="text-[10px] uppercase tracking-widest mt-1">More</span>
                </div>
            );
        }

        const action = actions[index];
        if (action) {
            const getThemeClasses = (theme?: string) => {
                switch(theme) {
                    case 'neon-green': return 'border-neon-green bg-neon-green/10 text-neon-green';
                    case 'miami-pink': return 'border-miami-pink/60 bg-miami-pink/10 text-miami-pink/80';
                    case 'neon-orange': return 'border-neon-orange bg-neon-orange/10 text-neon-orange';
                    case 'miami-cyan':
                    default: return 'border-miami-cyan bg-miami-cyan/10 text-miami-cyan';
                }
            };
            
            return (
                <div 
                    key={`cell-${index}`} 
                    onClick={() => onSelectCell(index)}
                    className={`flex flex-col items-center justify-center p-2 rounded-xl border border-dashed cursor-pointer transition-colors aspect-square text-center hover:opacity-80 ${getThemeClasses(action.theme)}`}
                >
                    <span className="text-xs font-bold leading-tight line-clamp-3">{action.title}</span>
                </div>
            );
        }
        
        // Empty Cell
        return (
            <div 
                key={`cell-${index}`} 
                onClick={() => onSelectCell(index)}
                className="flex flex-col items-center justify-center p-2 rounded-xl bg-miami-cyan/5 border-2 border-dashed border-miami-cyan/30 text-miami-cyan cursor-pointer hover:bg-miami-cyan/10 transition-colors aspect-square"
            >
                <span className="text-2xl font-light leading-none">+</span>
            </div>
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
            <div className="mb-4">
                <InstructionCard title="Action Planner">
                    Tap an empty cell to assign an action to the layout. Configure grid overflow below.
                </InstructionCard>
            </div>
            
            <div className="mb-4">
                <ToggleSwitch
                    checked={enableOverflow}
                    onChange={onToggleOverflow}
                    label="Enable Overflow Dropdown"
                />
            </div>

            <div 
                className="grid gap-2" 
                style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
            >
                {Array.from({ length: visibleCells }).map((_, i) => renderCell(i))}
            </div>
        </div>
    );
};
