import { MenuController } from './ui/MenuController.js';

const controller = new MenuController({
    handedness: 'right',
    menuRoot: document.getElementById('menu-root'),
    reverseToggle: document.getElementById('reverse-toggle'),
    categories: [
        {
            id: 'bubble_view',
            icon: '🌐',
            label: 'Bubble View',
            subnodes: [
                { id: 'resonance_map', label: 'Resonance' },
                { id: 'gravity_map', label: 'Gravity' }
            ]
        },
        {
            id: 'editor',
            icon: '🧠',
            label: 'Node Editor',
            subnodes: [
                { id: 'ai_drawer', label: 'AI Drawer' },
                { id: 'human_form', label: 'Manual Entry' }
            ]
        },
        {
            id: 'resonance_feed',
            icon: '📣',
            label: 'Resonance Feed',
            subnodes: [
                { id: 'personal_updates', label: 'Your Stream' },
                { id: 'global_feed', label: 'Global Feed' },
                { id: 'filtered_feed', label: 'By Resonance Tags' }
            ]
        }
    ]
});