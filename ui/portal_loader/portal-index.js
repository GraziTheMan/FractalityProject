export const portalMap = {
  Mindmap: () => import('../portals/MindmapPortal.js'),
  Chat: () => import('../portals/ChatPortal.js'),
  Forums: () => import('../portals/ForumsPortal.js'),
  Assistant: () => import('../portals/AssistantPortal.js'),
  System: () => import('../portals/SystemPortal.js')
};
