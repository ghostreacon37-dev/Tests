/**
 * humanbot.js
 *
 * Advanced human traffic simulator for learnblogs.online
 * - Rotates device fingerprints completely every session
 * - Navigates X.com -> clicks learnblogs.online link
 * - Simulates realistic reading with highlighting, scrolling, curiosity
 * - Variable session lengths (early leavers vs engaged readers)
 * - MULTIPLE POST CLICKS: Reads several posts per session
 * - Enhanced humanization to avoid detection
 * - AD HANDLING: Detects ad redirects, closes popup tabs, retries same post
 *
 * Usage:
 *   npm i puppeteer-extra puppeteer-extra-plugin-stealth puppeteer-extra-plugin-user-preferences puppeteer-extra-plugin-user-data-dir
 *   node humanbot.js --forever --interval=60000 --confirm-owned
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const UserPreferencesPlugin = require('puppeteer-extra-plugin-user-preferences');
const UserDataDirPlugin = require('puppeteer-extra-plugin-user-data-dir');

// Configure plugins for maximum stealth
const stealth = StealthPlugin();
stealth.enabledEvasions.delete('chrome.runtime');
stealth.enabledEvasions.delete('iframe.contentWindow');
puppeteer.use(stealth);
puppeteer.use(UserPreferencesPlugin());
puppeteer.use(UserDataDirPlugin());

const fs = require('fs');
const path = require('path');

/* ---------- Helper Functions ---------- */
function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function chance(percent) { return Math.random() < (percent / 100); }

/* ---------- Device & Fingerprint Database ---------- */
const DEVICES = [
  {
    name: 'Windows_Chrome',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    platform: 'Win32',
    vendor: 'Google Inc.',
    language: 'en-US',
    colorDepth: 24,
    deviceMemory: 8,
    hardwareConcurrency: 8
  },
  {
    name: 'Windows_Chrome_Laptop',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 },
    platform: 'Win32',
    vendor: 'Google Inc.',
    language: 'en-US',
    colorDepth: 24,
    deviceMemory: 4,
    hardwareConcurrency: 4
  },
  {
    name: 'MacBook_Pro',
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
    platform: 'MacIntel',
    vendor: 'Google Inc.',
    language: 'en-US',
    colorDepth: 30,
    deviceMemory: 8,
    hardwareConcurrency: 8
  },
  {
    name: 'MacBook_Air',
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2.1 Safari/605.1.15',
    viewport: { width: 1280, height: 800 },
    platform: 'MacIntel',
    vendor: 'Apple Computer, Inc.',
    language: 'en-US',
    colorDepth: 30,
    deviceMemory: 8,
    hardwareConcurrency: 4
  },
  {
    name: 'iPhone_14',
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    viewport: { width: 390, height: 844 },
    platform: 'iPhone',
    vendor: 'Apple Computer, Inc.',
    language: 'en-US',
    colorDepth: 32,
    deviceMemory: 6,
    hardwareConcurrency: 6,
    isMobile: true
  },
  {
    name: 'iPhone_14_Pro_Max',
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1',
    viewport: { width: 430, height: 932 },
    platform: 'iPhone',
    vendor: 'Apple Computer, Inc.',
    language: 'en-US',
    colorDepth: 32,
    deviceMemory: 8,
    hardwareConcurrency: 6,
    isMobile: true
  },
  {
    name: 'Pixel_7',
    ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    viewport: { width: 412, height: 915 },
    platform: 'Linux armv8l',
    vendor: 'Google Inc.',
    language: 'en-US',
    colorDepth: 24,
    deviceMemory: 8,
    hardwareConcurrency: 8,
    isMobile: true
  },
  {
    name: 'Galaxy_S23',
    ua: 'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    viewport: { width: 384, height: 854 },
    platform: 'Linux armv8l',
    vendor: 'Google Inc.',
    language: 'en-US',
    colorDepth: 24,
    deviceMemory: 8,
    hardwareConcurrency: 8,
    isMobile: true
  },
  {
    name: 'iPad_Pro',
    ua: 'Mozilla/5.0 (iPad; CPU OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    viewport: { width: 1024, height: 1366 },
    platform: 'iPad',
    vendor: 'Apple Computer, Inc.',
    language: 'en-US',
    colorDepth: 32,
    deviceMemory: 8,
    hardwareConcurrency: 8,
    isMobile: true
  },
  {
    name: 'Ubuntu_Desktop',
    ua: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    platform: 'Linux x86_64',
    vendor: 'Google Inc.',
    language: 'en-US',
    colorDepth: 24,
    deviceMemory: 8,
    hardwareConcurrency: 12
  }
];

const TIMEZONES = ['America/New_York', 'America/Los_Angeles', 'Europe/London', 'Europe/Berlin', 'Asia/Tokyo', 'Australia/Sydney', 'America/Chicago', 'Europe/Paris'];
const LOCALES = ['en-US', 'en-GB', 'en-CA', 'en-AU', 'en-NZ'];

/* ---------- CLI Parsing ---------- */
function parseArgs() {
  const argv = process.argv.slice(2);
  const cfg = {
    target: 'https://learnblogs.online',
    xPost: 'https://x.com/GhostReacondev/status/2024921591520641247?s=20',
    runs: 1,
    forever: false,
    interval: 60000,
    minStay: 30000,      // 30 sec (quick bounce)
    maxStay: 600000,     // 10 min (engaged reader)
    confirmOwned: false,
    headless: false,
    debug: false
  };

  for (const a of argv) {
    if (a.startsWith('--runs=')) cfg.runs = Math.max(1, parseInt(a.split('=')[1])||1);
    else if (a === '--forever') cfg.forever = true;
    else if (a.startsWith('--interval=')) cfg.interval = Math.max(5000, parseInt(a.split('=')[1])||cfg.interval);
    else if (a.startsWith('--min-stay=')) cfg.minStay = Math.max(10000, parseInt(a.split('=')[1])||cfg.minStay);
    else if (a.startsWith('--max-stay=')) cfg.maxStay = Math.max(cfg.minStay, parseInt(a.split('=')[1])||cfg.maxStay);
    else if (a === '--confirm-owned') cfg.confirmOwned = true;
    else if (a === '--headless') cfg.headless = true;
    else if (a === '--debug') cfg.debug = true;
  }

  return cfg;
}

/* ---------- Advanced Stealth Setup ---------- */
async function setupStealthPage(browser, device) {
  const page = await browser.newPage();
  
  // Set viewport and user agent
  await page.setViewport(device.viewport);
  await page.setUserAgent(device.ua);
  
  // Set timezone and locale
  const timezone = TIMEZONES[rand(0, TIMEZONES.length - 1)];
  const locale = LOCALES[rand(0, LOCALES.length - 1)];
  
  await page.emulateTimezone(timezone);
  await page.setExtraHTTPHeaders({
    'Accept-Language': `${locale},${locale.split('-')[0]};q=0.9`,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'max-age=0',
    'Sec-Ch-Ua': `"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"`,
    'Sec-Ch-Ua-Mobile': device.isMobile ? '?1' : '?0',
    'Sec-Ch-Ua-Platform': `"${device.platform.split(' ')[0]}"`,
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1'
  });

  // Inject advanced fingerprint masking
  await page.evaluateOnNewDocument((device, locale, timezone) => {
    // Override navigator properties
    Object.defineProperty(navigator, 'platform', { get: () => device.platform });
    Object.defineProperty(navigator, 'vendor', { get: () => device.vendor });
    Object.defineProperty(navigator, 'language', { get: () => locale });
    Object.defineProperty(navigator, 'languages', { get: () => [locale, 'en'] });
    Object.defineProperty(navigator, 'deviceMemory', { get: () => device.deviceMemory });
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => device.hardwareConcurrency });
    Object.defineProperty(navigator, 'maxTouchPoints', { get: () => device.isMobile ? 5 : 0 });
    
    // Screen properties
    Object.defineProperty(screen, 'colorDepth', { get: () => device.colorDepth });
    Object.defineProperty(screen, 'pixelDepth', { get: () => device.colorDepth });
    
    // Timezone
    const DateTimeFormat = Intl.DateTimeFormat;
    Intl.DateTimeFormat = function(...args) {
      return new DateTimeFormat(...args, { timeZone: timezone });
    };
    
    // WebGL fingerprint randomization
    const getParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(parameter) {
      if (parameter === 37445) return device.vendor; // UNMASKED_VENDOR_WEBGL
      if (parameter === 37446) return `ANGLE (${device.vendor}, ${device.platform} OpenGL)`; // UNMASKED_RENDERER_WEBGL
      return getParameter.call(this, parameter);
    };
    
    // Canvas noise injection
    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;
    
    // Notification permission randomization
    const originalNotification = window.Notification;
    Object.defineProperty(window, 'Notification', {
      get: () => ({
        ...originalNotification,
        permission: Math.random() > 0.5 ? 'default' : 'denied'
      })
    });
    
    // Plugins (fake realistic set)
    Object.defineProperty(navigator, 'plugins', {
      get: () => [
        { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
        { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
        { name: 'Native Client', filename: 'internal-nacl-plugin' }
      ]
    });
    
    // Battery API (randomize)
    if (navigator.getBattery) {
      navigator.getBattery = () => Promise.resolve({
        charging: Math.random() > 0.4,
        level: Math.random(),
        chargingTime: Math.floor(Math.random() * 10000),
        dischargingTime: Math.floor(Math.random() * 10000)
      });
    }
  }, device, locale, timezone);

  return page;
}

/* ---------- Human-like Interactions ---------- */
async function humanLikeMouseMove(page, targetX, targetY) {
  const start = await page.evaluate(() => ({ x: window.innerWidth / 2, y: window.innerHeight / 2 }));
  const steps = rand(15, 40);
  
  for (let i = 0; i <= steps; i++) {
    const progress = i / steps;
    const ease = progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;
    
    const currentX = start.x + (targetX - start.x) * ease + rand(-3, 3);
    const currentY = start.y + (targetY - start.y) * ease + rand(-3, 3);
    
    await page.mouse.move(currentX, currentY);
    await sleep(rand(10, 25));
  }
}

async function naturalScroll(page, intensity = 'medium') {
  const scrollAmounts = {
    low: { min: 50, max: 200, bursts: 2 },
    medium: { min: 100, max: 400, bursts: 4 },
    high: { min: 200, max: 600, bursts: 6 }
  };
  
  const config = scrollAmounts[intensity] || scrollAmounts.medium;
  
  for (let i = 0; i < config.bursts; i++) {
    const direction = Math.random() > 0.7 ? -1 : 1; // Occasionally scroll up
    const amount = rand(config.min, config.max) * direction;
    
    await page.evaluate(y => window.scrollBy({ top: y, behavior: 'smooth' }), amount);
    await sleep(rand(500, 2000));
    
    // Random pause to "read"
    if (Math.random() < 0.4) {
      await sleep(rand(1000, 4000));
    }
  }
}

/* ---------- NEW: Advanced Human Behaviors ---------- */
async function hoverOverImages(page) {
  try {
    const img = await page.evaluate(() => {
      const images = Array.from(document.querySelectorAll('img'))
        .filter(img => {
          const rect = img.getBoundingClientRect();
          return rect.width > 100 && rect.height > 100 && rect.top > 0 && rect.top < window.innerHeight;
        });
      if (!images.length) return null;
      const chosen = images[Math.floor(Math.random() * images.length)];
      const rect = chosen.getBoundingClientRect();
      return { x: rect.left + rect.width/2, y: rect.top + rect.height/2 };
    });
    
    if (img) {
      await humanLikeMouseMove(page, img.x, img.y);
      await sleep(rand(800, 2500)); // Hover time
      // Move away slowly
      await page.mouse.move(img.x + rand(50, 150), img.y + rand(-30, 30));
    }
  } catch(e) {}
}

async function simulateTextSelection(page) {
  try {
    const para = await page.evaluate(() => {
      const paras = Array.from(document.querySelectorAll('p')).filter(p => {
        const rect = p.getBoundingClientRect();
        return p.innerText.length > 100 && rect.top > 100 && rect.top < window.innerHeight - 100;
      });
      if (!paras.length) return null;
      const p = paras[Math.floor(Math.random() * paras.length)];
      const rect = p.getBoundingClientRect();
      return {
        startX: rect.left,
        startY: rect.top + 20,
        endX: rect.left + Math.min(rect.width * 0.7, 300),
        endY: rect.top + 20
      };
    });
    
    if (!para) return;
    
    await humanLikeMouseMove(page, para.startX, para.startY);
    await page.mouse.down();
    await sleep(rand(300, 600));
    
    // Drag to select
    const steps = 8;
    for (let i = 0; i <= steps; i++) {
      const x = para.startX + (para.endX - para.startX) * (i/steps);
      await page.mouse.move(x, para.endY + rand(-2, 2));
      await sleep(rand(50, 120));
    }
    
    await sleep(rand(400, 800));
    await page.mouse.up();
    
    // Sometimes copy it
    if (chance(25)) {
      await page.keyboard.down('Control');
      await page.keyboard.down('c');
      await sleep(150);
      await page.keyboard.up('c');
      await page.keyboard.up('Control');
      // Click elsewhere to deselect
      await sleep(rand(500, 1000));
      await page.mouse.click(rand(100, 400), rand(100, 400));
    }
  } catch(e) {}
}

async function simulatePageSearch(page) {
  try {
    await page.keyboard.down('Control');
    await page.keyboard.down('f');
    await sleep(100);
    await page.keyboard.up('f');
    await page.keyboard.up('Control');
    
    await sleep(rand(500, 1000));
    
    // Type a random word
    const word = ['the', 'and', 'how', 'what', 'best', 'guide', 'tips'][rand(0, 6)];
    await page.keyboard.type(word, { delay: rand(100, 300) });
    
    await sleep(rand(2000, 4000));
    
    // Close search
    await page.keyboard.press('Escape');
  } catch(e) {}
}

async function simulateMisclick(page) {
  try {
    // Click on empty area then realize mistake
    const x = rand(100, 700);
    const y = rand(100, 500);
    await page.mouse.move(x, y, { steps: rand(5, 10) });
    await sleep(rand(100, 300));
    await page.mouse.click(x, y);
    await sleep(rand(300, 800)); // Realize mistake
    // Scroll instead
    await naturalScroll(page, 'low');
  } catch(e) {}
}

async function randomIdlePause(page) {
  // Simulate getting distracted/reading intensively
  const pauseTime = rand(3000, 15000);
  await sleep(pauseTime);
}

async function varyReadingSpeed(page) {
  // Adjust scroll speed based on "content complexity"
  const complexity = rand(1, 3); // 1=simple, 3=complex
  const baseWait = complexity === 1 ? rand(800, 1500) : complexity === 2 ? rand(1500, 3000) : rand(3000, 6000);
  await sleep(baseWait);
}

async function highlightText(page) {
  try {
    // Find a paragraph to highlight
    const textInfo = await page.evaluate(() => {
      const paragraphs = Array.from(document.querySelectorAll('p, article, .entry-content, .post-content'));
      if (!paragraphs.length) return null;
      
      const p = paragraphs[Math.floor(Math.random() * paragraphs.length)];
      const text = p.innerText;
      if (!text || text.length < 20) return null;
      
      const rect = p.getBoundingClientRect();
      return {
        x: rect.left + rect.width * 0.2,
        y: rect.top + rect.height / 2,
        width: rect.width * 0.6,
        height: 20
      };
    });
    
    if (!textInfo) return;
    
    // Move to start of text
    await humanLikeMouseMove(page, textInfo.x, textInfo.y);
    await sleep(rand(100, 300));
    
    // Click and drag to highlight
    await page.mouse.down();
    await sleep(rand(200, 500));
    
    // Drag across
    const steps = 10;
    for (let i = 0; i <= steps; i++) {
      const x = textInfo.x + (textInfo.width * (i / steps));
      await page.mouse.move(x, textInfo.y + rand(-2, 2));
      await sleep(rand(50, 150));
    }
    
    await sleep(rand(100, 300));
    await page.mouse.up();
    
    // Copy behavior (Ctrl+C) sometimes
    if (Math.random() < 0.3) {
      await page.keyboard.down('Control');
      await page.keyboard.down('c');
      await sleep(100);
      await page.keyboard.up('c');
      await page.keyboard.up('Control');
    }
    
    // Click elsewhere to deselect
    await sleep(rand(500, 1000));
    await page.mouse.click(rand(100, 500), rand(100, 500));
    
  } catch (e) {
    // Silent fail
  }
}

async function readArticleBehavior(page, durationMs, debug) {
  const startTime = Date.now();
  let actions = 0;
  
  while (Date.now() - startTime < durationMs) {
    const remaining = durationMs - (Date.now() - startTime);
    if (remaining < 5000) break;
    
    const action = rand(1, 100);
    
    if (action < 40) {
      // Scroll reading
      const intensity = Math.random() > 0.3 ? 'medium' : 'low';
      await naturalScroll(page, intensity);
      await varyReadingSpeed(page);
      actions++;
      if (debug) console.log(`  [Action ${actions}] Scrolled (${intensity})`);
      
    } else if (action < 55) {
      // NEW: Hover images (common behavior)
      await hoverOverImages(page);
      actions++;
      if (debug) console.log(`  [Action ${actions}] Hovered image`);
      
    } else if (action < 65) {
      // NEW: Text selection
      await simulateTextSelection(page);
      actions++;
      if (debug) console.log(`  [Action ${actions}] Selected text`);
      
    } else if (action < 72) {
      // NEW: Misclick then correction
      await simulateMisclick(page);
      actions++;
      if (debug) console.log(`  [Action ${actions}] Misclick corrected`);
      
    } else if (action < 80) {
      // Highlight text (engaged reader)
      if (Math.random() < 0.4) {
        await highlightText(page);
        actions++;
        if (debug) console.log(`  [Action ${actions}] Highlighted text`);
      }
      
    } else if (action < 88) {
      // Micro movements
      await page.evaluate(() => {
        window.scrollBy({ top: Math.floor(Math.random() * 60 - 30), behavior: 'smooth' });
      });
      await sleep(rand(2000, 5000));
      
    } else if (action < 93) {
      // NEW: Random idle (distracted reading)
      await randomIdlePause(page);
      actions++;
      if (debug) console.log(`  [Action ${actions}] Idle pause`);
      
    } else if (action < 97) {
      // NEW: Page search
      await simulatePageSearch(page);
      actions++;
      if (debug) console.log(`  [Action ${actions}] Used Ctrl+F`);
      
    } else {
      // Tab switch simulation
      await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      await sleep(rand(2000, 5000));
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      actions++;
      if (debug) console.log(`  [Action ${actions}] Tab switch`);
    }
    
    // Random reading pause
    if (Math.random() < 0.6) {
      const pause = rand(2000, 8000);
      await sleep(pause);
    }
  }
}

/* ---------- X.com Navigation (FIXED) ---------- */
async function navigateFromXToBlog(page, xUrl, targetDomain, debug) {
  console.log('  Navigating to X.com post...');
  
  // Go to X with extended timeout and waiting
  await page.goto(xUrl, { 
    waitUntil: 'networkidle2', 
    timeout: 90000 
  });
  
  // Wait for X's heavy React app to hydrate (critical fix)
  console.log('  Waiting for X to fully load...');
  await sleep(8000);
  
  // Try to dismiss any login/signup modal that blocks interaction
  try {
    await page.keyboard.press('Escape');
    await sleep(500);
  } catch(e) {}
  
  // Scroll down a bit to ensure tweet is rendered
  await page.evaluate(() => window.scrollBy(0, 300));
  await sleep(2000);
  
  // Look for the link - try multiple strategies
  const linkData = await page.evaluate((domain) => {
    // Strategy 1: Look for anchor with exact text containing domain
    const allLinks = Array.from(document.querySelectorAll('a[href]'));
    
    for (const link of allLinks) {
      const text = (link.innerText || '').toLowerCase();
      const href = (link.href || '').toLowerCase();
      
      if (text.includes(domain) || href.includes(domain)) {
        const rect = link.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          return {
            found: true,
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
            text: link.innerText,
            href: link.href
          };
        }
      }
    }
    
    // Strategy 2: Look for t.co links in the tweet
    const tcoLinks = allLinks.filter(a => a.href && a.href.includes('t.co'));
    if (tcoLinks.length > 0) {
      const link = tcoLinks[0];
      const rect = link.getBoundingClientRect();
      return {
        found: true,
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        text: 't.co-link',
        href: link.href
      };
    }
    
    // Strategy 3: Look for any link in article/tweet area
    const article = document.querySelector('article[data-testid="tweet"]');
    if (article) {
      const links = Array.from(article.querySelectorAll('a[href]'));
      if (links.length > 0) {
        const link = links[links.length - 1]; // Often the last link is the URL card
        const rect = link.getBoundingClientRect();
        return {
          found: true,
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
          text: 'article-link',
          href: link.href
        };
      }
    }
    
    return { found: false };
  }, targetDomain);
  
  if (!linkData.found) {
    console.log('  Could not find link on X, using direct navigation...');
    return false;
  }
  
  console.log(`  Found link: ${linkData.text?.substring(0, 30) || 'link'}...`);
  
  // Human-like click on the link
  await humanLikeMouseMove(page, linkData.x, linkData.y);
  await sleep(rand(1000, 2500));
  
  // Small mouse wiggle (hesitation)
  await page.mouse.move(linkData.x + rand(-3, 3), linkData.y + rand(-3, 3));
  await sleep(rand(300, 800));
  
  // Click
  await page.mouse.down();
  await sleep(rand(100, 250));
  await page.mouse.up();
  
  console.log('  Clicked link, waiting for navigation...');
  
  // Wait for navigation to happen (give it time for redirects)
  await sleep(6000);
  
  // Check current URL
  let currentUrl = await page.url();
  let redirectCount = 0;
  
  // Wait for redirect chain to complete (t.co -> intermediate -> final)
  while ((currentUrl.includes('t.co') || currentUrl.includes('twitter.com') || currentUrl.includes('x.com')) && redirectCount < 10) {
    await sleep(2000);
    currentUrl = await page.url();
    redirectCount++;
    if (debug) console.log(`  Redirect check ${redirectCount}: ${currentUrl}`);
  }
  
  if (currentUrl.includes(targetDomain)) {
    console.log('  Successfully navigated to target');
    return true;
  } else {
    console.log('  Navigation incomplete, loading target directly...');
    await page.goto(`https://${targetDomain}`, { waitUntil: 'networkidle2' });
    return true;
  }
}

/* ---------- Blog Interaction with Ad Redirect Handling ---------- */
async function clickRandomPost(page, debug, retryCoords = null) {
  try {
    let postInfo;
    
    if (retryCoords) {
      // Retry at slightly varied coordinates
      postInfo = {
        x: retryCoords.x + rand(-10, 10),
        y: retryCoords.y + rand(-5, 5),
        text: retryCoords.text,
        href: retryCoords.href
      };
    } else {
      // Fresh find
      postInfo = await page.evaluate(() => {
        const selectors = [
          'article.post h2 a', 'article.post h3 a',
          '.entry-title a', '.post-title a',
          'h1.entry-title a', '.blog-post a',
          'article a[rel="bookmark"]', '.read-more',
          'a[href*="/20"]', 
          '.entry-content a', 
          'h2 a', 'h3 a' 
        ];
        
        let links = [];
        for (const sel of selectors) {
          links = Array.from(document.querySelectorAll(sel));
          if (links.length) break;
        }
        
        links = links.filter(a => {
          const rect = a.getBoundingClientRect();
          const href = a.getAttribute('href') || '';
          return rect.top > 50 && rect.top < window.innerHeight - 50 && 
                 rect.width > 0 && 
                 href.length > 0 &&
                 !href.startsWith('#') &&
                 !href.includes('wp-login') &&
                 !href.includes('wp-admin');
        });
        
        if (!links.length) return null;
        
        const link = links[Math.floor(Math.random() * Math.min(links.length, 5))];
        const rect = link.getBoundingClientRect();
        
        return {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
          text: link.innerText?.substring(0, 30),
          href: link.href || link.getAttribute('href')
        };
      });
    }
    
    if (!postInfo) {
      if (debug) console.log('  No posts found to click');
      return { clicked: false, url: '', coords: null };
    }
    
    if (debug) console.log(`  Clicking post: "${postInfo.text}..."`);
    
    await humanLikeMouseMove(page, postInfo.x, postInfo.y);
    await sleep(rand(800, 2000));
    
    await page.evaluate((y) => window.scrollTo({ top: y - 200, behavior: 'smooth' }), postInfo.y);
    await sleep(rand(500, 1500));
    
    await page.mouse.down();
    await sleep(rand(100, 250));
    await page.mouse.up();
    
    await sleep(4000);
    
    let attempts = 0;
    while (attempts < 5) {
      const loaded = await page.evaluate(() => document.readyState === 'complete');
      if (loaded) break;
      await sleep(1000);
      attempts++;
    }
    
    return { clicked: true, url: postInfo.href, coords: { x: postInfo.x, y: postInfo.y, text: postInfo.text, href: postInfo.href } };
    
  } catch (e) {
    if (debug) console.log('  Post click error:', e.message);
    return { clicked: false, url: '', coords: null };
  }
}

async function isAdRedirect(page, expectedHost) {
  try {
    const url = await page.url();
    return !url.includes(expectedHost) || url.includes('ad') || url.includes('redirect');
  } catch(e) {
    return false;
  }
}

async function curiosityExploration(page, debug) {
  try {
    const element = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('img, button, .tag, .category, nav a, .widget a'));
      if (!elements.length) return null;
      const el = elements[Math.floor(Math.random() * elements.length)];
      const rect = el.getBoundingClientRect();
      return {
        x: rect.left + rect.width/2,
        y: rect.top + rect.height/2,
        type: el.tagName
      };
    });
    
    if (!element) return;
    
    if (debug) console.log(`  [Curiosity] Exploring ${element.type}...`);
    
    await humanLikeMouseMove(page, element.x, element.y);
    await sleep(rand(600, 1200));
    
    const isLink = await page.evaluate((x, y) => {
      const el = document.elementFromPoint(x, y);
      return el && (el.tagName === 'A' || el.closest('a'));
    }, element.x, element.y);
    
    if (isLink) {
      await page.mouse.down();
      await sleep(rand(80, 200));
      await page.mouse.up();
      await sleep(3000);
      
      const wentWrong = await page.evaluate(() => {
        return document.body.innerText.length < 200 || 
               document.title.includes('404') || 
               document.title.includes('Error');
      });
      
      if (wentWrong) {
        if (debug) console.log('  [Curiosity] Wrong click, going back...');
        await page.goBack();
        await sleep(1500);
      }
    } else {
      await page.mouse.click(element.x, element.y);
      await sleep(rand(1000, 2500));
    }
  } catch(e) {}
}

async function interactWithBlog(browser, page, minStay, maxStay, debug) {
  const isEngaged = Math.random() < 0.7; 
  const sessionEndTime = Date.now() + (isEngaged ? rand(180000, maxStay) : rand(30000, 120000));
  
  if (debug) console.log(`  Session type: ${isEngaged ? 'ENGAGED READER' : 'QUICK SCAN'}, ends in ${Math.round((sessionEndTime - Date.now())/1000)}s`);
  
  await sleep(rand(2000, 4000));
  
  try {
    await page.evaluate(() => {
      const closeBtns = document.querySelectorAll('[aria-label="Close"], .close, .dismiss');
      closeBtns.forEach(btn => btn.click());
    });
  } catch(e) {}
  
  let postsRead = 0;
  let maxPosts = isEngaged ? rand(2, 5) : 1;
  
  while (Date.now() < sessionEndTime) {
    const timeLeft = sessionEndTime - Date.now();
    if (timeLeft < 10000) break;
    
    const actionRoll = rand(1, 100);
    
    if (actionRoll < 50 && postsRead < maxPosts) {
      if (debug) console.log(`  [Cycle ${postsRead + 1}] Attempting to read post...`);
      
      let attempt = 0;
      let success = false;
      let lastCoords = null;
      
      while (attempt < 3 && !success && Date.now() < sessionEndTime) {
        // Close any popup tabs that might have opened from previous ad
        const pages = await browser.pages();
        if (pages.length > 1) {
          if (debug) console.log(`  Closing ${pages.length - 1} popup tab(s)...`);
          for (let i = pages.length - 1; i > 0; i--) {
            await pages[i].close().catch(()=>{});
          }
          // Ensure we're on the main page
          await page.bringToFront();
          await sleep(1000);
        }
        
        const result = await clickRandomPost(page, debug, attempt > 0 ? lastCoords : null);
        
        if (!result.clicked) {
          await naturalScroll(page, 'high');
          break;
        }
        
        // Store coordinates for retry
        lastCoords = result.coords;
        
        await sleep(4000);
        
        // Check if we're still on learnblogs or got redirected to ad
        const isAd = await isAdRedirect(page, 'learnblogs.online');
        
        if (isAd) {
          if (debug) console.log(`  Ad popup detected (attempt ${attempt + 1}), closing and retrying...`);
          
          // Close current tab if it's an ad and go back to main
          const currentUrl = await page.url();
          if (!currentUrl.includes('learnblogs.online')) {
            await page.close().catch(()=>{});
            const pages = await browser.pages();
            if (pages.length > 0) {
              page = pages[0];
              await page.bringToFront();
            }
          }
          
          attempt++;
          await sleep(2000);
          
          if (attempt < 3 && lastCoords) {
            // Scroll back to where the post was
            await naturalScroll(page, 'medium');
            await sleep(rand(1000, 2000));
            if (debug) console.log('  Retrying same post...');
          }
        } else {
          success = true;
          postsRead++;
          if (debug) console.log(`  Successfully loaded post (attempt ${attempt + 1})`);
          
          const timeForThisPost = Math.min(rand(90000, 240000), timeLeft * 0.5);
          await sleep(rand(2000, 5000));
          await readArticleBehavior(page, timeForThisPost, debug);
          
          const afterPost = rand(1, 100);
          if (afterPost < 55) {
            if (debug) console.log('  Going back to explore more...');
            await page.goBack();
            await sleep(rand(1500, 4000));
            await readArticleBehavior(page, rand(15000, 35000), debug);
          } else if (afterPost < 75 && postsRead < maxPosts) {
            if (debug) console.log('  Looking for related content...');
            const foundRelated = await clickRelatedPost(page, debug);
            if (foundRelated) {
              postsRead++;
              await sleep(rand(2000, 4000));
              await readArticleBehavior(page, Math.min(rand(60000, 150000), timeLeft * 0.3), debug);
              await page.goBack().catch(()=>{});
              await sleep(1000);
              await page.goBack().catch(()=>{});
              await sleep(1000);
            }
          }
        }
      }
      
      if (!success && debug) console.log('  Failed to load post after retries');
      
    } else if (actionRoll < 65) {
      if (debug) console.log('  Deep scrolling session...');
      await naturalScroll(page, 'high');
      await varyReadingSpeed(page);
      await naturalScroll(page, 'medium');
      await sleep(rand(2000, 5000));
      
    } else if (actionRoll < 80) {
      if (debug) console.log('  Curiosity exploration...');
      await curiosityExploration(page, debug);
      await naturalScroll(page, 'low');
      
    } else if (actionRoll < 90 && postsRead > 0) {
      if (debug) console.log('  Refreshing homepage...');
      await page.goto('https://learnblogs.online', { waitUntil: 'networkidle2' });
      await sleep(rand(1500, 3000));
      
    } else {
      if (debug) console.log('  Extended reading...');
      await readArticleBehavior(page, Math.min(rand(45000, 90000), timeLeft - 5000), debug);
    }
  }
  
  if (debug) console.log(`  Session ended. Read ${postsRead} posts.`);
  
  if (Math.random() < 0.4) {
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await sleep(rand(1000, 3000));
  }
  
  return page; // Return potentially modified page reference
}

async function clickRelatedPost(page, debug) {
  try {
    const link = await page.evaluate(() => {
      const selectors = [
        '.related-posts a', '.post-navigation a', 
        '.tag-links a', '.entry-content a[href*="/20"]',
        'nav a[rel="next"]', '.next-post a',
        '.prev-post a', '.similar-posts a'
      ];
      
      for (const sel of selectors) {
        const links = Array.from(document.querySelectorAll(sel))
          .filter(a => {
            const rect = a.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight;
          });
        if (links.length) {
          const chosen = links[Math.floor(Math.random() * links.length)];
          const rect = chosen.getBoundingClientRect();
          return { x: rect.left + rect.width/2, y: rect.top + rect.height/2 };
        }
      }
      return null;
    });
    
    if (!link) return false;
    
    await humanLikeMouseMove(page, link.x, link.y);
    await sleep(rand(600, 1500));
    await page.mouse.down();
    await sleep(rand(80, 200));
    await page.mouse.up();
    await sleep(4000);
    return true;
    
  } catch(e) {
    return false;
  }
}

/* ---------- Main Execution ---------- */
(async () => {
  const cfg = parseArgs();
  
  if (!cfg.confirmOwned) {
    console.error('ERROR: This script requires --confirm-owned. Only run on domains you own.');
    process.exit(1);
  }

  console.log(`🤖 Human Traffic Bot Started`);
  console.log(`Target: ${cfg.target}`);
  console.log(`X Post: ${cfg.xPost}`);
  console.log(`Session range: ${cfg.minStay/1000}s - ${cfg.maxStay/60000}min`);
  
  let run = 0;
  let stop = false;
  
  process.on('SIGINT', () => { console.log('\nStopping gracefully...'); stop = true; });
  
  while (!stop && (cfg.forever || run < cfg.runs)) {
    run++;
    console.log(`\n=== Session #${run} ===`);
    
    // Pick random device fingerprint
    const device = DEVICES[rand(0, DEVICES.length - 1)];
    console.log(`Device: ${device.name} (${device.isMobile ? 'Mobile' : 'Desktop'})`);
    console.log(`Viewport: ${device.viewport.width}x${device.viewport.height}`);
    
    // Create unique user data dir for this session
    const userDataDir = path.join('/tmp', `humanbot_${Date.now()}_${rand(1000,9999)}`);
    
    const browser = await puppeteer.launch({
      headless: cfg.headless ? 'new' : false,
      userDataDir: userDataDir,
      defaultViewport: null,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=' + device.viewport.width + ',' + device.viewport.height,
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-site-isolation-trials'
      ]
    });
    
    try {
      let page = await setupStealthPage(browser, device);
      
      // Step 1: Go to X.com post
      const arrived = await navigateFromXToBlog(page, cfg.xPost, 'learnblogs.online', cfg.debug);
      
      if (!arrived) {
        console.log('  Failed to navigate from X, trying direct...');
        await page.goto(cfg.target, { waitUntil: 'networkidle2' });
      }
      
      // Verify we're on learnblogs
      const currentUrl = await page.url();
      if (!currentUrl.includes('learnblogs.online')) {
        console.log('  Warning: Not on target site, loading directly...');
        await page.goto(cfg.target, { waitUntil: 'networkidle2' });
      }
      
      console.log('  Landed on learnblogs.online');
      
      // Step 2: Human behavior with MULTIPLE POSTS and Ad Handling
      // Note: page might be reassigned if ad tab closes
      page = await interactWithBlog(browser, page, cfg.minStay, cfg.maxStay, cfg.debug);
      
      console.log(`  Session completed successfully`);
      
      // Cleanup
      await page.close().catch(()=>{});
      
    } catch (error) {
      console.error(`  Session error:`, error.message);
    } finally {
      await browser.close();
      try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch(e) {}
    }
    
    // Interval between sessions
    if (!stop && (cfg.forever || run < cfg.runs)) {
      const waitTime = cfg.interval + rand(-5000, 10000); // Add jitter
      console.log(`Waiting ${Math.round(waitTime/1000)}s until next session...`);
      await sleep(waitTime);
    }
  }
  
  console.log('\n✅ All sessions completed');
  process.exit(0);
})();
