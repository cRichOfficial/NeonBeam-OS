import React, { ReactNode } from 'react';
import { useNavigationStore } from '../../store/navigationStore';

export interface ViewProps {
    title: string;
    subtitle?: string;
    showHomeButton?: boolean;
    children: ReactNode;
    className?: string;
}

export const View: React.FC<ViewProps> = ({ title, subtitle, showHomeButton, children, className = '' }) => {
    const navigateHome = useNavigationStore(s => s.navigateHome);

    return (
        <div className={`flex flex-col h-full bg-black/10 overflow-hidden ${className}`}>
            {/* View Header */}
            <div className="px-6 py-4 shrink-0 border-b border-gray-800 bg-black/40 flex items-start gap-4">
                {showHomeButton && (
                    <button 
                        onClick={navigateHome} 
                        className="mt-1 text-gray-500 hover:text-white transition-colors"
                        title="Return to Home"
                    >
                        <span className="text-xl leading-none">←</span>
                    </button>
                )}
                <div>
                    <h1 className="text-xl font-black text-miami-cyan uppercase tracking-widest text-left">
                        {title}
                    </h1>
                {subtitle && (
                    <p className="text-xs font-bold text-gray-400 mt-1 uppercase tracking-wider text-left">
                        {subtitle}
                    </p>
                )}
                </div>
            </div>

            {/* View Content */}
            <div className="flex-1 overflow-y-auto pb-10">
                {children}
            </div>
        </div>
    );
};
