import React from 'react';
import { View } from '../components/layout/View';

export const DemoModule: React.FC = () => {
    return (
        <View title="UI Demo Sandbox" subtitle="Clean environment for component testing" showHomeButton>
            <div className="flex flex-col items-center justify-center h-[60vh] text-gray-500 gap-4">
                <div className="text-4xl">🏗️</div>
                <div className="text-sm font-bold uppercase tracking-widest opacity-50">Sandbox Cleared</div>
                <p className="text-[10px] max-w-[200px] text-center leading-relaxed">
                    The UI Demo has been reset. Use this module to test new components in isolation.
                </p>
            </div>
        </View>
    );
};
