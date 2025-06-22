// /src/main/init.js

// === 🧠 Import core modules ===
import { CACEEngine } from '../intelligence/CACEEngine.js';
import { LayoutEngine } from '../intelligence/LayoutEngine.js';
import { FamilyViewController } from '../intelligence/FamilyViewController.js';
import { AnimationSystem } from '../visualization/AnimationSystem.js';

// === 🧩 Initialize core systems ===
const cace = new CACEEngine();
const layout = new LayoutEngine();
const viewController = new FamilyViewController();
const animation = new AnimationSystem();

// === 🧪 Sample node graph (stub until dynamic loading) ===
const nodeGraph = {
  nodes: new Map(),
  getNode: id => nodeGraph.nodes.get(id),
  getSiblings: id => [],
  getChildren: id => []
};

// Create a fake node to use as focus
const focusNode = {
  id: 'root',
  depth: 0,
  parentId: null,
  childIds: [],
  metadata: { type: 'executive' }
};
nodeGraph.nodes.set('root', focusNode);

// === 🔌 Link core systems ===
viewController.setNodeGraph(nodeGraph);
cace.analyzeGraph(nodeGraph);

// === 🔭 Get visible nodes and layout ===
const visibleNodes = viewController.getVisibleNodes('root');
const positions = layout.calculateLayout(visibleNodes, 'root');
const contextScores = cace.calculateContext(visibleNodes, 'root');

// === 🎞️ Animate! ===
animation.render(visibleNodes, positions, contextScores);

// === 📚 Developer Notes ===
// - This is your main application glue file.
// - As you evolve, you can replace stub data with dynamic JSON or markdown imports.
// - Every module should stay isolated and only communicate through simple data contracts.
// - If you add UI (e.g. menus, buttons), do it from here or a dedicated /ui controller.
