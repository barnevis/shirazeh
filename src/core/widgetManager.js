/**
 * @file Manages the registration and placement of UI widgets into predefined slots.
 */
export class WidgetManager {
    /**
     * @param {App} app - The main application instance.
     */
    constructor(app) {
        this.app = app;
        this.config = app.config.widgets || {};
        this.widgets = new Map();
        this.isMobile = false;

        if (!this.config.enabled) return;

        this._checkMobileState();
        window.addEventListener('resize', () => this._checkMobileState());
    }

    /**
     * Registers a new widget with the system.
     * @param {object} widget - The widget object to register.
     * @param {string} widget.id - A unique identifier for the widget.
     * @param {HTMLElement} widget.element - The DOM element of the widget.
     */
    register(widget) {
        if (!this.config.enabled || !widget || !widget.id) return;

        // Get placement config from config.js
        const placement = this.config.slots[widget.id] || {};
        const finalWidget = {
            ...widget,
            desktopSlot: placement.desktop || 'fallback-right-stack',
            mobilePolicy: placement.mobile || 'hide', // show, hide, menu, dock
        };
        this.widgets.set(widget.id, finalWidget);
    }

    /**
     * Renders all registered widgets into their designated slots.
     */
    renderAll() {
        if (!this.config.enabled) return;
        this._placeWidgets();
    }

    /**
     * Places each widget into its correct slot based on device type (desktop/mobile).
     * @private
     */
    _placeWidgets() {
        this.widgets.forEach(widget => {
            let targetSlotId;

            if (this.isMobile) {
                switch (widget.mobilePolicy) {
                    case 'show':
                        targetSlotId = widget.desktopSlot;
                        break;
                    case 'menu':
                        targetSlotId = 'navbar-mobile-actions';
                        break;
                    case 'dock':
                        // If mobile policy is 'dock', it stays in its desktop slot.
                        targetSlotId = widget.desktopSlot;
                        break;
                    case 'hide':
                    default:
                        targetSlotId = null; // Will be hidden
                        break;
                }
            } else {
                targetSlotId = widget.desktopSlot;
            }

            const targetSlot = targetSlotId ? document.getElementById(`widget-slot-${targetSlotId}`) : null;

            if (targetSlot) {
                // This handles re-placement on resize.
                targetSlot.appendChild(widget.element);
            } else {
                // If target slot doesn't exist or is null, detach the element.
                if (widget.element.parentElement) {
                    widget.element.parentElement.removeChild(widget.element);
                }
            }
        });
    }

    /**
     * Checks if the viewport is in a mobile state and re-places widgets if the state changes.
     * @private
     */
    _checkMobileState() {
        if (!this.config.enabled) return;
        
        const mobileBreakpoint = parseInt(this.app.config.navbar?.mobile?.breakpoint || '768px', 10);
        const newIsMobile = window.innerWidth <= mobileBreakpoint;
        
        if (newIsMobile !== this.isMobile) {
            this.isMobile = newIsMobile;
            this._placeWidgets();
        }
    }
}