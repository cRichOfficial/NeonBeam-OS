import React from 'react';

export type GrblState = 'Idle' | 'Run' | 'Hold' | 'Jog' | 'Alarm' | 'Door' | 'Check' | 'Home' | 'Sleep' | 'Offline';

export interface MPos {
    x: number;
    y: number;
    z: number;
}

export interface MachineTelemetry {
    state: GrblState;
    mpos: MPos;
    wpos: MPos;
    feedRate: number;
    spindleSpeed: number;
}

export interface AppModule {
    id: string;
    title: string;
    icon: React.ReactNode; 
    component: React.FC;
    isCore: boolean;
}

export const __DUMMY__ = true;
