// =============================================
//  config.js — ADD YOUR API KEYS HERE
// =============================================
//
//  1. Get a free Congress.gov API key at:
//     https://api.congress.gov/sign-up/
//
//  2. Get your Anthropic API key at:
//     https://console.anthropic.com/
//
//  Replace the empty strings below with your keys.
//  DO NOT share this file publicly or commit it to GitHub.

const CONFIG = {
  CONGRESS_API_KEY:  "",   // e.g. "abc123xyz..."
  ANTHROPIC_API_KEY: "",   // e.g. "sk-ant-api03-..."

  // How many bills to show per load
  BILLS_PER_PAGE: 20,

  // Which Congress session to pull from (118 = current as of 2025)
  CONGRESS_SESSION: 119,
};
