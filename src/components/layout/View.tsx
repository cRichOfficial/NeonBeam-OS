import React, { ReactNode } from 'react';

export interface ViewProps {
    title: string;
    subtitle?: string;
    children: ReactNode;
    className?: string;
}

export const View: React.FC<ViewProps> = ({ title, subtitle, children, className = '' }) => {
    return (
        <div className={`flex flex-col h-full bg-black/10 overflow-hidden ${className}`}>
            {/* View Header */}
            <div className="px-6 py-4 shrink-0 border-b border-gray-800 bg-black/40">
                <h1 className="text-xl font-black text-miami-cyan uppercase tracking-widest text-left">
                    {title}
                </h1>
                {subtitle && (
                    <p className="text-xs font-bold text-gray-400 mt-1 uppercase tracking-wider text-left">
                        {subtitle}
                    </p>
                )}
            </div>

            {/* View Content */}
            <div className="flex-1 overflow-y-auto pb-10">
                {children}
            </div>
        </div>
    );
};
