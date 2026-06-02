// =============================================
//  config.js — client-side DISPLAY config only
// =============================================
//  SECURITY: never put API keys here — this file is served to the browser.
//  All secrets (Congress.gov / GovInfo keys) live in .env, used only by the
//  Node scripts in scripts/. The browser makes no authenticated API calls.

const CONFIG = {
  // How many bills to show per load
  BILLS_PER_PAGE: 20,

  // Which Congress session to pull from
  CONGRESS_SESSION: 119,
};
