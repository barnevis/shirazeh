/**
 * @file Manages the lifecycle and events for all plugins.
 */

/**
 * Injects a CSS file into the document's <head>.
 * This is a helper function exported for use by plugins.
 * @param {string} path - The path to the CSS file from the project root.
 */
export function injectCSS(path) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.type = 'text/css';
    link.href = path;
    document.head.appendChild(link);
    console.info(`Plugin injected CSS: ${path}`);
}

export class PluginManager {
    /**
     * @param {App} appInstance - The main application instance.
     */
    constructor(appInstance) {
        this.app = appInstance;
        this.plugins = [];
    }

    /**
     * Dynamically loads plugins specified in the configuration.
     * @param {string[]} pluginPaths - An array of paths to plugin files.
     */
    async loadPlugins(pluginPaths = []) {
        if (!pluginPaths || !Array.isArray(pluginPaths)) {
            return;
        }

        await Promise.all(pluginPaths.map(async (pluginPath) => {
            try {
                const resolvedPath = this.app.resolvePath(pluginPath);
                const moduleUrl = new URL(resolvedPath, window.location.href).href;
                const pluginModule = await import(moduleUrl);

                if (pluginModule.default && typeof pluginModule.default === 'function') {
                    const PluginClass = pluginModule.default;
                    const pluginInstance = new PluginClass();

                    // Call onInit lifecycle hook if it exists
                    if (typeof pluginInstance.onInit === 'function') {
                        pluginInstance.onInit(this.app);
                    }

                    this.plugins.push(pluginInstance);
                    console.info(`Plugin loaded successfully: ${pluginPath}`);
                } else {
                    console.error(`Failed to load plugin: ${pluginPath}. It does not have a default export class.`);
                }
            } catch (error) {
                console.error(`Failed to load plugin: ${pluginPath}`, error);
            }
        }));
    }

    /**
     * Notifies all loaded plugins of a specific event.
     * @param {string} eventName - The name of the event (e.g., 'onPageLoad'). This should match a method name on the plugin class.
     * @param {*} data - The data to pass to the event handler.
     */
    notify(eventName, data) {
        for (const plugin of this.plugins) {
            if (typeof plugin[eventName] === 'function') {
                try {
                    plugin[eventName](data);
                } catch (error) {
                    console.error(`Error in plugin during ${eventName} event:`, { plugin, error });
                }
            }
        }
    }
}