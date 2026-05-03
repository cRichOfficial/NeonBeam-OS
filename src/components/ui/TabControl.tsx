import React from 'react';

export interface TabItem {
    id: string;
    label: string;
    icon?: React.ReactNode;
}

export interface TabControlProps {
    tabs: TabItem[];
    activeTab: string;
    onChange: (tabId: string) => void;
    className?: string;
}

export const TabControl: React.FC<TabControlProps> = ({ tabs, activeTab, onChange, className = '' }) => {
    return (
        <div className={`flex items-stretch bg-black rounded-xl border border-gray-800 overflow-hidden ${className}`}>
            {tabs.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                    <button
                        key={tab.id}
                        onClick={() => onChange(tab.id)}
                        className={`
                            flex-1 py-2.5 px-3 text-[11px] font-black uppercase tracking-widest rounded-none transition-all flex items-center justify-center gap-2
                            ${isActive 
                                ? 'bg-miami-cyan text-black shadow-[0_0_15px_rgba(0,240,255,0.2)]' 
                                : 'text-gray-500 hover:text-white hover:bg-gray-800'}
                        `}
                    >
                        {tab.icon && <span>{tab.icon}</span>}
                        {tab.label}
                    </button>
                );
            })}
        </div>
    );
};
