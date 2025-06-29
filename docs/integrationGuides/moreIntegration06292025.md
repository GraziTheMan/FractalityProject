# Integration Instructions for Merged Main.js

## Overview

The merged `main.js` integrates the CLI bridge functionality while preserving your existing radial menu system and state management. Here's what's been added:

## New Features Added

1. **CLI Sync Status** - Shows connection status with the Python CLI
2. **Desktop Dock Controls** - Export/Import buttons and search in the dock
3. **Bridge Integration** - Automatic loading of CLI data when available
4. **Search Functionality** - Search nodes from CLI database
5. **Auto-sync** - Optional real-time synchronization with CLI

## What's Preserved

- ✅ Your RadialMenu component and all menu items
- ✅ AppState management system  
- ✅ Mirror toggle functionality
- ✅ Original UI structure

## Integration Steps

### 1. Update Your File Structure

Add the bridge module to your imports:
```
src/
├── bridge/
│   └── NodeBridge.js        # Add this file
├── components/              # Your existing components
│   ├── radialMenu.js
│   └── mirrorToggle.js
└── main.js                  # Replace with merged version
```

### 2. Update Your HTML

Make sure your HTML has the required elements:
```html
<!-- State container for sync status -->
<div class="state-container">
  <div id="state-indicator">State: Balanced</div>
  <!-- CLI sync status will be added here -->
</div>

<!-- Desktop dock for CLI controls -->
<div id="desktop-dock">Desktop Dock Placeholder</div>

<!-- Canvas for Fractality visualization (when in bubble view) -->
<canvas id="fractality-canvas"></canvas>
```

### 3. Add CSS Styles

Add the provided CSS to your `styles/main.css` file. The styles are designed to complement your existing dark theme.

### 4. How It Works

#### CLI Data Loading
- When the bubble view is activated, the system checks for CLI data
- If `?cli-export=filename.json` is in the URL, it loads that data
- Otherwise, it loads default test data

#### View Integration
```javascript
// Your existing view system is preserved
AppState.setView('bubble')  // Triggers Fractality engine initialization
AppState.setView('mindmap') // Your other views work normally
```

#### Search Integration
- Search box in desktop dock searches CLI nodes
- Clicking results navigates to the node (in bubble view)
- Works across all views

## Usage Examples

### Loading CLI Data
```bash
# In CLI, export your mindmap
python fractality_cli.py export --output my-mind.json

# Load in frontend
http://localhost:8000?cli-export=my-mind.json
```

### Auto-Sync Mode
```bash
# Enable auto-sync in URL
http://localhost:8000?cli-export=my-mind.json&auto-sync=true
```

### Manual Import/Export
- Use the desktop dock buttons to import/export
- Export creates a JSON file for the CLI
- Import loads a CLI-generated JSON file

## Key Behaviors

1. **Lazy Loading** - Fractality engine only initializes when bubble view is selected
2. **State Preservation** - Your AppState system manages all views
3. **Non-Intrusive** - CLI features don't interfere with other views
4. **Graceful Fallback** - If CLI data fails to load, uses test data

## Customization Options

### Change Default View for Search Results
```javascript
// In displaySearchResults function
AppState.setView('bubble');  // Change to your preferred view
```

### Modify Sync Interval
```javascript
nodeBridge.enableAutoSync(exportPath, 5000);  // 5 seconds
```

### Add CLI Status to Other Views
The sync status and search functionality work across all views, not just bubble view.

## Troubleshooting

- **CLI data not loading**: Check browser console for errors, ensure JSON file is accessible
- **Search not working**: Make sure nodes are loaded (check sync status)
- **Auto-sync not updating**: Verify file path and that Python CLI is updating the file

## Next Steps

1. Test the integration with a small mindmap
2. Adjust styles to match your exact theme
3. Consider adding CLI controls to specific views
4. Extend search to filter by node type/tags