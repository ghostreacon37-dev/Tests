/**
 * config.js
 * Configuration and profile management for testbot
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PROFILES_DIR = path.join(process.cwd(), 'profiles');
const LOGS_DIR = path.join(process.cwd(), 'logs');

// Ensure directories exist
if (!fs.existsSync(PROFILES_DIR)) fs.mkdirSync(PROFILES_DIR, { recursive: true });
if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });

// Configuration object
const config = {
  targetURL: process.env.TARGET_URL || 'https://example.com',
  profilesDir: PROFILES_DIR,
  logsDir: LOGS_DIR,
  
  // Concurrency and volume
  maxConcurrent: 3,
  sessionsPerDay: 50, // Starting volume for week 1
  rampUpWeeklyPercent: 10,
  maxSessionsPerDay: 200,
  
  // Timing (seconds)
  sessionDurationRange: { min: 30, max: 240 }, // 30s - 4min
  betweenSessionDelay: { min: 45, max: 300 }, // 45s - 5min
  referrerDwell: { min: 2, max: 6 },
  homepageDwell: { min: 8, max: 25 },
  internalPageDwell: { min: 15, max: 60 },
  
  // Engagement
  internalLinksPerSession: { min: 1, max: 4 },
  bounceRate: 0.10, // 10% bounce
  useSiteSearchChance: 0.30,
  scrollToBottomChance: 0.15,
  
  // Ad settings
  adClickDailyMaxPercent: 0.04, // 4%
  adClickSessionProbability: 0.03, // 3%
  adClickDelayPages: 2, // After viewing 2+ pages
  adClickMinScroll: 0.60, // 60% scroll on at least one page
  adViewabilityMinTime: 2000, // 2s in viewport
  
  // Referrer weights
  referrers: [
    { type: 'google', weight: 40, url: 'https://www.google.com/search?q={{query}}', queries: ['news', 'blog', 'technology', 'how to', 'review', 'tutorial'] },
    { type: 'facebook', weight: 20, urls: ['https://m.facebook.com/', 'https://l.facebook.com/l.php?u='] },
    { type: 'twitter', weight: 15, urls: ['https://t.co/'] },
    { type: 'reddit', weight: 10, urls: ['https://www.reddit.com/r/technology/comments/abc123/', 'https://www.reddit.com/r/news/comments/def456/'] },
    { type: 'direct', weight: 10, url: null },
    { type: 'bing', weight: 3, url: 'https://www.bing.com/search?q=news' },
    { type: 'yahoo', weight: 1, url: 'https://search.yahoo.com/search?p=blog' },
    { type: 'duckduckgo', weight: 1, url: 'https://duckduckgo.com/?q=technology' }
  ],
  
  // Browser args
  launchArgs: [
    '--disable-blink-features=AutomationControlled',
    '--no-first-run',
    '--disable-default-apps',
    '--disable-infobars',
    '--disable-dev-shm-usage',
    '--disable-background-timer-throttling',
    '--disable-webrtc-multiple-routes',
    '--enforce-webrtc-ip-permission-check',
    '--disable-extensions-except=',
    '--disable-component-extensions-with-background-pages',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-web-security',
    '--disable-features=IsolateOrigins,site-per-process'
  ],
  
  // Ad selectors
  adSelectors: [
    'iframe[src*="doubleclick"]',
    'iframe[src*="googlesyndication"]',
    'iframe[src*="adnxs"]',
    'iframe[src*="amazon-adsystem"]',
    'div[id*="google_ads"]',
    'ins.adsbygoogle',
    'div[class*="ad-slot"]',
    'div[data-ad]',
    'iframe[id*="google_ads_iframe"]',
    '.advertisement',
    '[id*="adunit"]'
  ],
  
  adSizes: [
    { width: 300, height: 250 },
    { width: 728, height: 90 },
    { width: 160, height: 600 },
    { width: 320, height: 50 },
    { width: 970, height: 250 },
    { width: 336, height: 280 }
  ],
  
  // Viewport ranges
  viewports: [
    { width: 1280, height: 720 },
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
    { width: 1536, height: 864 },
    { width: 1600, height: 900 },
    { width: 1680, height: 1050 },
    { width: 1920, height: 1080 }
  ],
  
  locales: ['en-US', 'en-GB', 'en-CA', 'en-AU'],
  timezones: ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Europe/London', 'Europe/Berlin'],
  platforms: ['Win32', 'MacIntel', 'Linux x86_64'],
  
  // Hardware ranges
  hardwareConcurrency: { min: 4, max: 16 },
  deviceMemory: { min: 4, max: 16 },
  
  // CLI overrides (populated at runtime)
  headless: false,
  debug: false,
  dryRun: false,
  maxSessions: null
};

// Profile generation
function generateProfiles(count = 30) {
  const profiles = [];
  
  for (let i = 0; i < count; i++) {
    const profileId = `profile_${String(i).padStart(3, '0')}`;
    const profilePath = path.join(PROFILES_DIR, profileId);
    const configPath = path.join(profilePath, 'config.json');
    
    if (!fs.existsSync(profilePath)) {
      fs.mkdirSync(profilePath, { recursive: true });
    }
    
    if (!fs.existsSync(configPath)) {
      const vp = config.viewports[Math.floor(Math.random() * config.viewports.length)];
      const platform = config.platforms[Math.floor(Math.random() * config.platforms.length)];
      const locale = config.locales[Math.floor(Math.random() * config.locales.length)];
      const timezone = config.timezones[Math.floor(Math.random() * config.timezones.length)];
      
      const profileConfig = {
        id: profileId,
        path: profilePath,
        viewport: vp,
        platform,
        locale,
        timezone,
        hardwareConcurrency: Math.floor(Math.random() * (config.hardwareConcurrency.max - config.hardwareConcurrency.min + 1)) + config.hardwareConcurrency.min,
        deviceMemory: Math.floor(Math.random() * (config.deviceMemory.max - config.deviceMemory.min + 1)) + config.deviceMemory.min,
        webglVendor: platform === 'MacIntel' ? 'Apple Inc.' : 'Google Inc. (NVIDIA)',
        webglRenderer: platform === 'MacIntel' ? 'Apple M1' : 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 Direct3D11 vs_5_0 ps_5_0, D3D11)',
        seed: crypto.randomBytes(16).toString('hex'),
        created: new Date().toISOString()
      };
      
      fs.writeFileSync(configPath, JSON.stringify(profileConfig, null, 2));
      profiles.push(profileConfig);
    } else {
      profiles.push(JSON.parse(fs.readFileSync(configPath, 'utf8')));
    }
  }
  
  return profiles;
}

function getWeightedReferrer() {
  const totalWeight = config.referrers.reduce((sum, r) => sum + r.weight, 0);
  let random = Math.random() * totalWeight;
  
  for (const ref of config.referrers) {
    random -= ref.weight;
    if (random <= 0) {
      if (ref.type === 'direct') return null;
      
      let url = ref.url;
      if (ref.type === 'google' && ref.queries) {
        const query = ref.queries[Math.floor(Math.random() * ref.queries.length)];
        url = url.replace('{{query}}', encodeURIComponent(query + ' ' + config.targetURL.split('/')[2]));
      }
      
      if (ref.urls && !url) {
        url = ref.urls[Math.floor(Math.random() * ref.urls.length)];
      }
      
      return { type: ref.type, url };
    }
  }
  
  return null;
}

function parseCLIArgs() {
  const args = process.argv.slice(2);
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--headless') config.headless = true;
    else if (arg === '--debug') config.debug = true;
    else if (arg === '--dry-run') config.dryRun = true;
    else if (arg.startsWith('--sessions=')) config.maxSessions = parseInt(arg.split('=')[1]);
    else if (arg.startsWith('--target=')) config.targetURL = arg.split('=')[1];
    else if (arg === '--help' || arg === '-h') {
      console.log(`
Usage: node testbot.js [options]

Options:
  --headless              Run browser in headless mode
  --debug                 Enable verbose debug logging
  --dry-run               Simulate actions without clicking ads
  --sessions=N            Limit to N sessions total
  --target=URL            Override target URL
  --help                  Show this help
      `);
      process.exit(0);
    }
  }
  
  return config;
}

module.exports = {
  ...config,
  generateProfiles,
  getWeightedReferrer,
  parseCLIArgs,
  PROFILES_DIR,
  LOGS_DIR
};
