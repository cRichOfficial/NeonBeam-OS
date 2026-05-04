export type ActionTheme = 'miami-cyan' | 'neon-green' | 'miami-pink' | 'neon-orange';

export interface BaseAction {
    id: string;
    title: string;
    subtitle?: string;
    theme?: ActionTheme;
    functionToCall: string;
    functionArgs?: any;
}
