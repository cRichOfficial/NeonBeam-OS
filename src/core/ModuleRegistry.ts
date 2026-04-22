import type { AppModule } from '../types/grbl';

class Registry {
    private modules: Map<string, AppModule> = new Map();

    register(module: AppModule) {
        if (this.modules.has(module.id)) {
            console.warn(`Module ${module.id} is already registered. Overwriting.`);
        }
        this.modules.set(module.id, module);
    }

    getModules(): AppModule[] {
        return Array.from(this.modules.values());
    }

    getModule(id: string): AppModule | undefined {
        return this.modules.get(id);
    }
}

// Singleton export
export const ModuleRegistry = new Registry();
