// mobile/mobile-entry.js
// Mobile entry point: boots MobileApp on DOMContentLoaded.

import { MobileApp } from '../src/mobile/MobileApp.js';

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    window.fractalityMobile = new MobileApp();
    await window.fractalityMobile.init();
    
    console.log('✨ Fractality Mobile initialized');
});
