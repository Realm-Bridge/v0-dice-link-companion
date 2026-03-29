/**
 * Video Feed Module - dice-link-companion
 * Handles video feed UI generation for the panel.
 * Currently a placeholder for future video integration features.
 */

import { REALM_BRIDGE_URL, LOGO_SQUARE_URL } from "./constants.js";
import { getCollapsedSections } from "./settings.js";

/**
 * Generate the video feed section HTML
 * Used by both GM and Player panels
 * @returns {string} HTML string for the video feed section
 */
export function generateVideoFeedSection() {
  const collapsedSections = getCollapsedSections();
  
  return `
    <!-- Video Feed Placeholder -->
    <div class="dlc-section ${collapsedSections.videoFeed ? 'collapsed' : ''}">
      <div class="dlc-section-header" data-section="videoFeed">
        <span class="dlc-collapse-btn">${collapsedSections.videoFeed ? '+' : '−'}</span>
        <h3><i class="fas fa-video"></i> Video Feed</h3>
      </div>
      <div class="dlc-section-content">
        <div class="dlc-video-feed">
          <div class="dlc-video-grid">
            <div class="dlc-video-cell"><span class="dlc-video-placeholder">Coming Soon</span></div>
            <div class="dlc-video-cell"><span class="dlc-video-placeholder">Future Feature</span></div>
            <div class="dlc-video-cell"><span class="dlc-video-placeholder">Stay Tuned</span></div>
            <div class="dlc-video-cell">
              <a href="${REALM_BRIDGE_URL}" target="_blank" class="dlc-video-logo-link" title="Visit Realm Bridge">
                <img src="${LOGO_SQUARE_URL}" alt="Realm Bridge" class="dlc-video-logo" onerror="this.parentElement.innerHTML='<span class=dlc-video-placeholder>Realm Bridge</span>'">
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}
