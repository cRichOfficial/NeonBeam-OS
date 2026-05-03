import React, { ReactNode } from 'react';

export interface CameraStreamProps {
    title?: string;
    streamUrl?: string;
    fallback?: ReactNode;
    className?: string;
}

export const CameraStream: React.FC<CameraStreamProps> = ({ 
    title, 
    streamUrl, 
    fallback, 
    className = '' 
}) => {
    return (
        <div className={`flex flex-col h-full bg-black/40 border border-gray-800 rounded-xl overflow-hidden ${className}`}>
            {title && (
                <div className="px-4 py-3 border-b border-gray-800 bg-black/60">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest text-left">
                        {title}
                    </h3>
                </div>
            )}
            
            <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
                {streamUrl ? (
                    <img 
                        src={streamUrl} 
                        alt="Camera Stream" 
                        className="w-full h-full object-contain"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-600 text-sm">
                        {fallback || "No Camera Feed Available"}
                    </div>
                )}
            </div>
        </div>
    );
};
