import { MobileHUD } from './MobileHUD.js';

export function initMobileHUD(rootId = 'hud') {
  return new MobileHUD(rootId);
}
