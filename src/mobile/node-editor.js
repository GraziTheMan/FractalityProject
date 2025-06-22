// 🏷️ Node Editor & Tagging UI
export function showNodeEditor(node, onSave) {
  const label = prompt("Edit label", node.label || node.id || "Node");
  const tags = prompt("Edit tags (comma-separated)", (node.tags || []).join(","));

  if (label !== null) node.label = label;
  if (tags !== null) node.tags = tags.split(',').map(t => t.trim());

  onSave?.(node);
}
