import React, { ReactNode, useState, useEffect, ReactElement } from 'react';

export interface ItemContainerProps {
    title?: string;
    maxHeight?: string | number;
    enableMultiSelect?: boolean;
    selectedIds?: string[];
    defaultSelectedIds?: string[];
    onSelectionChange?: (ids: string[]) => void;
    children: ReactNode;
    className?: string;
}

export const ItemContainer: React.FC<ItemContainerProps> = ({ 
    title, 
    maxHeight, 
    enableMultiSelect = false,
    selectedIds: controlledSelectedIds,
    defaultSelectedIds = [],
    onSelectionChange,
    children, 
    className = '' 
}) => {
    // Uncontrolled state fallback
    const [internalSelectedIds, setInternalSelectedIds] = useState<string[]>(defaultSelectedIds);
    
    const isControlled = controlledSelectedIds !== undefined;
    const selectedIds = isControlled ? controlledSelectedIds : internalSelectedIds;

    const toggleSelection = (id: string) => {
        if (!enableMultiSelect) return;
        
        const newSelection = selectedIds.includes(id)
            ? selectedIds.filter(selectedId => selectedId !== id)
            : [...selectedIds, id];
            
        if (!isControlled) {
            setInternalSelectedIds(newSelection);
        }
        
        if (onSelectionChange) {
            onSelectionChange(newSelection);
        }
    };

    // Intercept children to pass selected and onSelect props if multi-select is enabled
    const renderChildren = () => {
        if (!enableMultiSelect) return children;

        return React.Children.map(children, child => {
            if (React.isValidElement(child)) {
                // We assume the child accepts 'id', 'selected', and 'onSelect' props.
                // It's up to the user to pass an 'id' prop to the child for this to work.
                const childId = child.props.id || child.key as string;
                if (childId != null) {
                    return React.cloneElement(child as ReactElement<any>, {
                        selected: selectedIds.includes(childId),
                        onSelect: () => {
                            toggleSelection(childId);
                            // Also call the child's original onSelect/onClick if it exists
                            if (child.props.onSelect) child.props.onSelect();
                            else if (child.props.onClick) child.props.onClick();
                        }
                    });
                }
            }
            return child;
        });
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
                className="overflow-y-auto space-y-2 flex-1 pr-1" 
                style={{ maxHeight }}
            >
                {renderChildren()}
            </div>
        </div>
    );
};
