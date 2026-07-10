// src/ui/HapticFeedback.js
// Haptic feedback service — wraps navigator.vibrate with named patterns.

export class HapticFeedback {
    constructor(enabled = true) {
        this.enabled = enabled && 'vibrate' in navigator;
        this.patterns = {
            light: [10],
            medium: [20],
            heavy: [30],
            double: [20, 50, 20],
            success: [10, 50, 10, 50, 10],
            warning: [50, 100, 50],
            error: [100, 50, 100, 50, 100]
        };
    }

    trigger(pattern = 'light') {
        if (!this.enabled) return;

        const vibrationPattern = this.patterns[pattern] || this.patterns.light;
        navigator.vibrate(vibrationPattern);
    }

    custom(pattern) {
        if (!this.enabled) return;
        navigator.vibrate(pattern);
    }

    disable() {
        this.enabled = false;
    }

    enable() {
        this.enabled = 'vibrate' in navigator;
    }
}
