import React, { ReactNode } from 'react';

export interface TabPageProps {
    title: string;
    description?: ReactNode;
    children: ReactNode;
    className?: string;
}

export const TabPage: React.FC<TabPageProps> = ({ title, description, children, className = '' }) => {
    return (
        <div className={`space-y-4 ${className}`}>
            {/* Title Card */}
            <div className="bg-miami-cyan/10 border border-miami-cyan rounded-xl p-4">
                <h2 className="text-miami-cyan font-black uppercase text-sm tracking-widest text-left">
                    {title}
                </h2>
                {description && (
                    <div className="text-white text-xs mt-2 text-left">
                        {description}
                    </div>
                )}
            </div>

            {/* Tab Content */}
            <div className="space-y-4">
                {children}
            </div>
        </div>
    );
};
