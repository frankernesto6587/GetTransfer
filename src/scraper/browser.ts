import { chromium, type LaunchOptions } from 'playwright';

/**
 * Launch Chromium with system executable if CHROMIUM_PATH is set.
 * Useful when Playwright CDN is geo-blocked (e.g. Cuba).
 */
export function launchBrowser(options: LaunchOptions = {}) {
  const executablePath = process.env.CHROMIUM_PATH || undefined;
  return chromium.launch({ ...options, executablePath });
}
