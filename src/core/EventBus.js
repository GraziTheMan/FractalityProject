// src/core/EventBus.js
// Central event system — a lightweight publish/subscribe bus shared across
// UI controllers, the mobile app, and intelligence engines.

export class EventBus {
    constructor() {
        this.events = new Map();
        this.debug = false;
    }

    on(event, handler) {
        if (!this.events.has(event)) {
            this.events.set(event, new Set());
        }
        this.events.get(event).add(handler);

        // Return an unsubscribe function for convenience.
        return () => this.off(event, handler);
    }

    /**
     * Remove a handler for an event. If `handler` is omitted, every handler
     * for that event is removed (callers such as MenuController rely on this).
     */
    off(event, handler) {
        const handlers = this.events.get(event);
        if (!handlers) return;

        if (handler === undefined) {
            this.events.delete(event);
            return;
        }

        handlers.delete(handler);
        if (handlers.size === 0) {
            this.events.delete(event);
        }
    }

    emit(event, data) {
        if (this.debug) {
            console.log(`[EventBus] ${event}`, data);
        }

        const handlers = this.events.get(event);
        if (handlers) {
            handlers.forEach(handler => {
                try {
                    handler(data);
                } catch (error) {
                    console.error(`Error in event handler for ${event}:`, error);
                }
            });
        }
    }

    once(event, handler) {
        const wrappedHandler = (data) => {
            handler(data);
            this.off(event, wrappedHandler);
        };
        this.on(event, wrappedHandler);
    }

    clear() {
        this.events.clear();
    }
}
