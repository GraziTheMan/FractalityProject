// 📤 Import JSON nodes into system
export function importNodesFromJSON(jsonText) {
  try {
    const data = JSON.parse(jsonText);
    if (!Array.isArray(data)) throw new Error('Expected array of nodes');
    console.log(`[Imported ${data.length} nodes]`);
    return data;
  } catch (e) {
    console.error('Import failed:', e.message);
    return null;
  }
}
