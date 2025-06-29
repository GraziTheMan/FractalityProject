import { DashboardPanel } from './DashboardPanel.js';

export function initDashboard(rootId = 'dashboard') {
  return new DashboardPanel(rootId);
}
