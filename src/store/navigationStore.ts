import { create } from 'zustand';

interface NavigationState {
    activeModuleId: string | null;
    navigateTo:     (id: string) => void;
    navigateHome:   () => void;
}

/**
 * App-wide navigation store. Lets any component (e.g. StudioModule)
 * navigate to any other module without prop drilling.
 */
export const useNavigationStore = create<NavigationState>((set) => ({
    activeModuleId: null,
    navigateTo:   (id)  => set({ activeModuleId: id }),
    navigateHome: ()    => set({ activeModuleId: null }),
}));
