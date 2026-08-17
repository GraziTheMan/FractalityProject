// src/core/EventBus.js
// Central publish/subscribe event system.

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
        
        return () => this.off(event, handler);
    }

    off(event, handler) {
        const handlers = this.events.get(event);
        if (handlers) {
            handlers.delete(handler);
            if (handlers.size === 0) {
                this.events.delete(event);
            }
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
