/**
 * testbot.js
 * Production-ready undetectable browser automation with human behavior simulation
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const AnonymizeUAPlugin = require('puppeteer-extra-plugin-anonymize-ua');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const config = require('./config');

// Apply plugins
puppeteer.use(StealthPlugin());
puppeteer.use(AnonymizeUAPlugin({ makeWindows: true }));

// Global state
let isShuttingDown = false;
let activeBrowsers = new Set();
let consecutiveFailures = 0;
let sessionCount = 0;
let adClickCount = 0;
let dailyStartTime = Date.now();
let profileUsage = new Map(); // profileId -> count today
let clickedAdsToday = new Set(); // selector hashes

// Utility functions
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const rand = (min, max) => Math.random() * (max - min) + min;
const randInt = (min, max) => Math.floor(rand(min, max + 1));
const gaussian = (mean, std) => {
  const u = 1 - Math.random();
  const v = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return mean + z * std;
};

// Logger with daily rotation
class SessionLogger {
  constructor() {
    this.currentDate = new Date().toISOString().split('T')[0];
    this.logPath = path.join(config.logsDir, `sessions-${this.currentDate}.jsonl`);
    this.ensureLogFile();
    this.rotateOldLogs();
  }
  
  ensureLogFile() {
    if (!fs.existsSync(this.logPath)) {
      fs.writeFileSync(this.logPath, '');
    }
  }
  
  rotateOldLogs() {
    const files = fs.readdirSync(config.logsDir).filter(f => f.startsWith('sessions-') && f.endsWith('.jsonl'));
    const cutoff = Date.now() - (14 * 24 * 60 * 60 * 1000);
    
    files.forEach(file => {
      const filePath = path.join(config.logsDir, file);
      const stats = fs.statSync(filePath);
      if (stats.mtimeMs < cutoff) {
        fs.unlinkSync(filePath);
      }
    });
  }
  
  log(entry) {
    const date = new Date().toISOString().split('T')[0];
    if (date !== this.currentDate) {
      this.currentDate = date;
      this.logPath = path.join(config.logsDir, `sessions-${date}.jsonl`);
      this.ensureLogFile();
    }
    
    const line = JSON.stringify(entry) + '\n';
    fs.appendFileSync(this.logPath, line);
    
    if (config.debug) {
      console.log(`[LOG] ${JSON.stringify(entry)}`);
    }
  }
}

const logger = new SessionLogger();

// Profile Manager
class ProfileManager {
  constructor() {
    this.profiles = config.generateProfiles(30);
    this.loadUsage();
  }
  
  loadUsage() {
    try {
      const usagePath = path.join(config.logsDir, 'profile_usage.json');
      if (fs.existsSync(usagePath)) {
        const data = JSON.parse(fs.readFileSync(usagePath, 'utf8'));
        if (data.date === new Date().toISOString().split('T')[0]) {
          profileUsage = new Map(Object.entries(data.counts));
        }
      }
    } catch (e) {
      console.error('Error loading profile usage:', e.message);
    }
  }
  
  saveUsage() {
    const usagePath = path.join(config.logsDir, 'profile_usage.json');
    const data = {
      date: new Date().toISOString().split('T')[0],
      counts: Object.fromEntries(profileUsage)
    };
    fs.writeFileSync(usagePath, JSON.stringify(data));
  }
  
  getAvailableProfile() {
    // Filter profiles used less than 3 times today
    const available = this.profiles.filter(p => {
      const count = profileUsage.get(p.id) || 0;
      return count < 3;
    });
    
    if (available.length === 0) {
      // Reset if all used (shouldn't happen with 30 profiles and low daily volume)
      profileUsage.clear();
      return this.profiles[randInt(0, this.profiles.length - 1)];
    }
    
    const selected = available[randInt(0, available.length - 1)];
    const currentCount = profileUsage.get(selected.id) || 0;
    profileUsage.set(selected.id, currentCount + 1);
    this.saveUsage();
    return selected;
  }
}

const profileManager = new ProfileManager();

// Fingerprint injection script generator
function generateFingerprintScript(profile) {
  const screenWidth = profile.viewport.width;
  const screenHeight = profile.viewport.height;
  
  // Canvas noise function seeded by profile
  const noiseSeed = parseInt(profile.seed.slice(0, 8), 16);
  
  return `
    (() => {
      const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
      const originalToBlob = HTMLCanvasElement.prototype.toBlob;
      const seed = ${noiseSeed};
      
      function seededRandom(n) {
        const x = Math.sin(seed + n) * 10000;
        return x - Math.floor(x);
      }
      
      function addNoise(data) {
        if (!data || data.length < 100) return data;
        const noise = Math.floor(seededRandom(Date.now() % 1000) * 3) - 1; // -1 to 1
        return data.slice(0, 50) + String.fromCharCode(data.charCodeAt(50) + noise) + data.slice(51);
      }
      
      HTMLCanvasElement.prototype.toDataURL = function(...args) {
        const result = originalToDataURL.apply(this, args);
        return args[0] && args[0].includes('image') ? addNoise(result) : result;
      };
      
      HTMLCanvasElement.prototype.toBlob = function(callback, ...args) {
        return originalToBlob.call(this, (blob) => {
          callback(blob); // Note: modifying blobs is complex, keeping simple for stability
        }, ...args);
      };
      
      // WebGL vendor/renderer
      const getParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function(parameter) {
        if (parameter === 37445) return '${profile.webglVendor}';
        if (parameter === 37446) return '${profile.webglRenderer}';
        return getParameter.call(this, parameter);
      };
      
      // Navigator overrides
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => ${profile.hardwareConcurrency} });
      Object.defineProperty(navigator, 'deviceMemory', { get: () => ${profile.deviceMemory} });
      Object.defineProperty(navigator, 'platform', { get: () => '${profile.platform}' });
      Object.defineProperty(navigator, 'languages', { get: () => ['${profile.locale}', 'en'] });
      
      // Plugins
      const plugins = [
        { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
        { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
        { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' }
      ];
      Object.defineProperty(navigator, 'plugins', { get: () => plugins });
      
      // Screen dimensions
      Object.defineProperty(screen, 'width', { get: () => ${screenWidth} });
      Object.defineProperty(screen, 'height', { get: () => ${screenHeight} });
      Object.defineProperty(screen, 'availWidth', { get: () => ${screenWidth} });
      Object.defineProperty(screen, 'availHeight', { get: () => ${screenHeight - 40} });
      Object.defineProperty(window, 'outerWidth', { get: () => ${screenWidth} });
      Object.defineProperty(window, 'outerHeight', { get: () => ${screenHeight} });
      Object.defineProperty(window, 'devicePixelRatio', { get: () => 1 });
      
      // Chrome runtime
      window.chrome = {
        runtime: {
          OnInstalledReason: { CHROME_UPDATE: 'chrome_update', INSTALL: 'install', SHARED_MODULE_UPDATE: 'shared_module_update', UPDATE: 'update' },
          OnRestartRequiredReason: { APP_UPDATE: 'app_update', OS_UPDATE: 'os_update', PERIODIC: 'periodic' },
          PlatformArch: { ARM: 'arm', ARM64: 'arm64', MIPS: 'mips', MIPS64: 'mips64', X86_32: 'x86-32', X86_64: 'x86-64' },
          PlatformNaclArch: { ARM: 'arm', MIPS: 'mips', MIPS64: 'mips64', MIPS64EL: 'mips64el', MIPSEL: 'mipsel', X86_32: 'x86-32', X86_64: 'x86-64' },
          PlatformOs: { ANDROID: 'android', CROS: 'cros', LINUX: 'linux', MAC: 'mac', OPENBSD: 'openbsd', WIN: 'win' },
          RequestUpdateCheckStatus: { NO_UPDATE: 'no_update', THROTTLED: 'throttled', UPDATE_AVAILABLE: 'update_available' }
        }
      };
      
      // Permissions
      const originalQuery = navigator.permissions.query;
      navigator.permissions.query = async (params) => {
        if (params.name === 'notifications') {
          return { state: 'default', onchange: null };
        }
        return originalQuery.call(navigator.permissions, params);
      };
    })();
  `;
}

// Human-like mouse controller
class HumanMouse {
  constructor(page) {
    this.page = page;
    this.currentX = randInt(100, 500);
    this.currentY = randInt(100, 500);
  }
  
  async moveTo(targetX, targetY, options = {}) {
    const { 
      duration = rand(200, 800), 
      overshoot = Math.random() < 0.2,
      jitter = true 
    } = options;
    
    let endX = targetX;
    let endY = targetY;
    
    // Overshoot logic
    if (overshoot) {
      const overshootX = targetX + (Math.random() > 0.5 ? 1 : -1) * randInt(5, 15);
      const overshootY = targetY + (Math.random() > 0.5 ? 1 : -1) * randInt(5, 15);
      
      await this.beMove(overshootX, overshootY, duration * 0.7);
      await sleep(randInt(80, 200));
      await this.beMove(targetX, targetY, duration * 0.3);
    } else {
      await this.beMove(endX, endY, duration);
    }
    
    this.currentX = endX;
    this.currentY = endY;
  }
  
  async beMove(targetX, targetY, duration) {
    const steps = Math.floor(duration / 16); // ~60fps
    const controlX = this.currentX + (targetX - this.currentX) * 0.5 + randInt(-50, 50);
    const controlY = this.currentY + (targetY - this.currentY) * 0.3 + randInt(-30, 30);
    
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const tInv = 1 - t;
      
      // Quadratic Bezier
      const x = tInv * tInv * this.currentX + 2 * tInv * t * controlX + t * t * targetX;
      const y = tInv * tInv * this.currentY + 2 * tInv * t * controlY + t * t * targetY;
      
      // Micro jitter
      const jitterX = randInt(-1, 1);
      const jitterY = randInt(-1, 1);
      
      await this.page.mouse.move(x + jitterX, y + jitterY);
      await sleep(16);
    }
  }
  
  async click(element) {
    const box = await element.boundingBox();
    if (!box) return false;
    
    // Random point within element
    const targetX = box.x + randInt(2, box.width - 2);
    const targetY = box.y + randInt(2, box.height - 2);
    
    await this.moveTo(targetX, targetY);
    await sleep(randInt(50, 150));
    await this.page.mouse.down();
    await sleep(randInt(20, 80));
    await this.page.mouse.up();
    
    return true;
  }
  
  async idleDrift() {
    if (Math.random() < 0.3) {
      const driftX = Math.max(0, this.currentX + randInt(-60, 60));
      const driftY = Math.max(0, this.currentY + randInt(-60, 60));
      await this.beMove(driftX, driftY, rand(1000, 3000));
      await sleep(randInt(1000, 3000));
    }
  }
}

// Human-like scroll controller
class HumanScroll {
  constructor(page, mouse) {
    this.page = page;
    this.mouse = mouse;
    this.totalScrolled = 0;
    this.maxScrollDepth = 0;
  }
  
  async scrollPage(depthPercent = rand(0.4, 0.95)) {
    const height = await this.page.evaluate(() => document.body.scrollHeight);
    const viewportHeight = await this.page.evaluate(() => window.innerHeight);
    const targetY = height * depthPercent;
    
    let currentY = await this.page.evaluate(() => window.scrollY);
    
    while (currentY < targetY) {
      const step = randInt(80, 400);
      const speed = rand(50, 200); // ms per wheel event
      
      // Occasionally scroll up
      if (Math.random() < 0.15 && currentY > 300) {
        await this.scrollUp();
      }
      
      await this.page.mouse.wheel({ deltaY: step });
      currentY += step;
      this.totalScrolled += step;
      this.maxScrollDepth = Math.max(this.maxScrollDepth, currentY / height);
      
      // Pause for "reading"
      if (Math.random() < 0.3) {
        await sleep(randInt(1000, 5000));
        await this.mouse.idleDrift();
      }
      
      await sleep(speed);
    }
    
    // 15% chance to scroll to bottom then back up
    if (Math.random() < 0.15) {
      await this.scrollToBottom();
      await sleep(randInt(1000, 3000));
      const midPoint = height * rand(0.3, 0.6);
      await this.scrollTo(midPoint);
    }
  }
  
  async scrollUp() {
    const amount = randInt(100, 300);
    await this.page.mouse.wheel({ deltaY: -amount });
    await sleep(randInt(500, 1500));
  }
  
  async scrollToBottom() {
    const height = await this.page.evaluate(() => document.body.scrollHeight);
    await this.scrollTo(height);
  }
  
  async scrollTo(y) {
    const current = await this.page.evaluate(() => window.scrollY);
    const delta = y - current;
    const steps = Math.abs(delta) / 100;
    
    for (let i = 0; i < steps; i++) {
      await this.page.mouse.wheel({ deltaY: Math.sign(delta) * 100 });
      await sleep(50);
    }
  }
  
  async scrollElementIntoView(element, holdTime = 2000) {
    await element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(holdTime);
  }
}

// Ad detector and handler
class AdHandler {
  constructor(page) {
    this.page = page;
    this.detectedAds = [];
  }
  
  async detectAds() {
    const ads = await this.page.evaluate((selectors, sizes) => {
      const results = [];
      const elements = document.querySelectorAll(selectors.join(', '));
      
      elements.forEach(el => {
        const rect = el.getBoundingClientRect();
        const isAdSize = sizes.some(s => 
          Math.abs(rect.width - s.width) < 10 && 
          Math.abs(rect.height - s.height) < 10
        );
        
        if (isAdSize || el.tagName === 'IFRAME') {
          results.push({
            selector: el.id || el.className || el.tagName,
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            visible: rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight
          });
        }
      });
      
      return results;
    }, config.adSelectors, config.adSizes);
    
    this.detectedAds = ads.filter(ad => ad.visible);
    return this.detectedAds;
  }
  
  getAdHash(ad) {
    return crypto.createHash('md5').update(`${ad.selector}-${ad.x}-${ad.y}`).digest('hex');
  }
  
  async handleViewability(scroll, mouse) {
    for (const ad of this.detectedAds) {
      // Slow scroll past ad
      await scroll.scrollElementIntoView(
        { scrollIntoView: async () => {
          await this.page.evaluate((y) => window.scrollTo(0, y), ad.y - 100);
        }}, 
        randInt(2000, 5000)
      );
      
      // Simulate viewing
      await mouse.idleDrift();
    }
  }
  
  async clickAd(mouse, scroll) {
    if (this.detectedAds.length === 0) return false;
    
    const ad = this.detectedAds[randInt(0, this.detectedAds.length - 1)];
    const adHash = this.getAdHash(ad);
    
    if (clickedAdsToday.has(adHash)) return false;
    
    // Scroll into view naturally
    await scroll.scrollElementIntoView(
      { scrollIntoView: async () => {
        await this.page.evaluate((y) => window.scrollTo(0, y), ad.y - 50);
      }},
      randInt(1000, 3000)
    );
    
    // Pause as if noticing
    await sleep(randInt(1000, 3000));
    
    // Move to ad
    const targetX = ad.x + randInt(5, ad.width - 5);
    const targetY = ad.y + randInt(5, ad.height - 5);
    await mouse.moveTo(targetX, targetY, { duration: rand(300, 700) });
    
    // Hover
    await sleep(randInt(500, 1500));
    
    if (config.dryRun) {
      console.log('[DRY-RUN] Would click ad at', ad.x, ad.y);
      return true;
    }
    
    // Click
    await this.page.mouse.down();
    await sleep(randInt(20, 50));
    await this.page.mouse.up();
    
    clickedAdsToday.add(adHash);
    
    // Wait on ad page
    await sleep(randInt(3000, 8000));
    
    // Try to go back
    try {
      await this.page.goBack({ waitUntil: 'domcontentloaded', timeout: 10000 });
    } catch (e) {
      // If back fails, continue anyway
    }
    
    return true;
  }
}

// Session controller
class Session {
  constructor(profile) {
    this.profile = profile;
    this.browser = null;
    this.page = null;
    this.mouse = null;
    this.scroll = null;
    this.adHandler = null;
    this.startTime = Date.now();
    this.pagesVisited = 0;
    this.scrollDepths = [];
    this.adImpressions = 0;
    this.adClicked = false;
    this.exitType = 'unknown';
    this.sessionData = {
      profileId: profile.id,
      timestamp: new Date().toISOString(),
      referrerType: 'direct',
      pagesVisited: 0,
      scrollDepths: [],
      adImpressionsCount: 0,
      adClicked: false,
      sessionDurationSec: 0
    };
  }
  
  async init() {
    const fingerprintScript = generateFingerprintScript(this.profile);
    
    this.browser = await puppeteer.launch({
      headless: config.headless ? 'new' : false,
      userDataDir: this.profile.path,
      args: [
        ...config.launchArgs,
        `--window-size=${this.profile.viewport.width},${this.profile.viewport.height}`,
        `--timezone=${this.profile.timezone}`
      ],
      defaultViewport: {
        width: this.profile.viewport.width,
        height: this.profile.viewport.height
      }
    });
    
    activeBrowsers.add(this.browser);
    
    const pages = await this.browser.pages();
    this.page = pages[0];
    
    // Set headers
    await this.page.setExtraHTTPHeaders({
      'Accept-Language': this.profile.locale.replace('_', '-') + ',en;q=0.9',
      'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"'
    });
    
    // Inject fingerprint
    await this.page.evaluateOnNewDocument(fingerprintScript);
    
    this.mouse = new HumanMouse(this.page);
    this.scroll = new HumanScroll(this.page, this.mouse);
    this.adHandler = new AdHandler(this.page);
  }
  
  async navigateReferrer() {
    const ref = config.getWeightedReferrer();
    if (!ref) {
      this.sessionData.referrerType = 'direct';
      return;
    }
    
    this.sessionData.referrerType = ref.type;
    
    try {
      await this.page.goto(ref.url, { waitUntil: 'networkidle2', timeout: 30000 });
      await sleep(randInt(2000, 6000));
      
      // Simulate activity on referrer
      await this.mouse.idleDrift();
      await sleep(randInt(1000, 3000));
      
      // Navigate to target
      await this.page.goto(config.targetURL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (e) {
      // Fallback direct navigation
      await this.page.goto(config.targetURL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    }
  }
  
  async engageHomepage() {
    await sleep(randInt(8000, 25000));
    await this.scroll.scrollPage(rand(0.4, 0.7));
    await this.mouse.idleDrift();
    this.pagesVisited++;
    this.scrollDepths.push(this.scroll.maxScrollDepth);
    
    // Detect ads for viewability
    await this.adHandler.detectAds();
    await this.adHandler.handleViewability(this.scroll, this.mouse);
    this.adImpressions += this.adHandler.detectedAds.length;
  }
  
  async clickInternalLink() {
    const links = await this.page.evaluate(() => {
      return Array.from(document.querySelectorAll('a[href]'))
        .filter(a => {
          const href = a.href;
          return href.includes(window.location.hostname) && 
                 !href.includes('#') && 
                 !href.includes('javascript:');
        })
        .slice(0, 20)
        .map(a => ({ href: a.href, text: a.innerText.slice(0, 50) }));
    });
    
    if (links.length === 0) return false;
    
    const link = links[randInt(0, links.length - 1)];
    
    try {
      await this.page.goto(link.href, { waitUntil: 'domcontentloaded', timeout: 30000 });
      this.pagesVisited++;
      
      // Dwell and scroll
      await sleep(randInt(15000, 60000));
      await this.scroll.scrollPage(rand(0.5, 0.9));
      
      // Text highlight simulation (20% chance)
      if (Math.random() < 0.2) {
        await this.simulateTextHighlight();
      }
      
      this.scrollDepths.push(this.scroll.maxScrollDepth);
      
      // Check for ads
      await this.adHandler.detectAds();
      await this.adHandler.handleViewability(this.scroll, this.mouse);
      this.adImpressions += this.adHandler.detectedAds.length;
      
      return true;
    } catch (e) {
      return false;
    }
  }
  
  async simulateTextHighlight() {
    try {
      const paragraphs = await this.page.$$('p');
      if (paragraphs.length === 0) return;
      
      const p = paragraphs[randInt(0, paragraphs.length - 1)];
      const box = await p.boundingBox();
      if (!box) return;
      
      await this.mouse.moveTo(box.x + 10, box.y + 10);
      await this.page.mouse.down();
      await this.mouse.moveTo(box.x + box.width - 10, box.y + 10, { duration: 500 });
      await this.page.mouse.up();
      await sleep(500);
    } catch (e) {}
  }
  
  async shouldClickAd() {
    // Hard limits check
    const dailyRatio = adClickCount / Math.max(sessionCount, 1);
    if (dailyRatio >= config.adClickDailyMaxPercent) return false;
    
    // Session probability
    if (Math.random() > config.adClickSessionProbability) return false;
    
    // Engagement prerequisites
    if (this.pagesVisited < config.adClickDelayPages) return false;
    if (Math.max(...this.scrollDepths) < config.adClickMinScroll) return false;
    if (this.adClicked) return false; // Already clicked in this session
    
    return true;
  }
  
  async run() {
    try {
      await this.init();
      await this.navigateReferrer();
      await this.engageHomepage();
      
      // Bounce check (10%)
      if (Math.random() < config.bounceRate) {
        this.exitType = 'bounce';
        await sleep(randInt(5000, 12000));
        return;
      }
      
      // Internal navigation
      const numLinks = randInt(config.internalLinksPerSession.min, config.internalLinksPerSession.max);
      let linksClicked = 0;
      
      for (let i = 0; i < numLinks; i++) {
        if (await this.clickInternalLink()) {
          linksClicked++;
          
          // Check ad click eligibility after establishing engagement
          if (await this.shouldClickAd()) {
            if (await this.adHandler.clickAd(this.mouse, this.scroll)) {
              this.adClicked = true;
              adClickCount++;
              
              // Continue browsing after ad click
              await sleep(randInt(5000, 15000));
              if (Math.random() < 0.5) {
                await this.clickInternalLink();
              }
              break; // Max 1 ad click per session
            }
          }
        }
      }
      
      // Search/category navigation (30% chance)
      if (Math.random() < config.useSiteSearchChance) {
        const searchLinks = await this.page.$$('a[href*="/search"], a[href*="/tag"], a[href*="/category"]');
        if (searchLinks.length > 0) {
          const link = searchLinks[randInt(0, searchLinks.length - 1)];
          await this.mouse.click(link);
          await sleep(randInt(5000, 15000));
          await this.scroll.scrollPage(rand(0.3, 0.6));
        }
      }
      
      this.exitType = 'natural';
      
    } catch (error) {
      console.error(`Session error (${this.profile.id}):`, error.message);
      this.exitType = 'error';
      consecutiveFailures++;
      
      if (consecutiveFailures >= 3) {
        console.log('Too many consecutive failures, pausing 10 minutes...');
        await sleep(600000);
        consecutiveFailures = 0;
      }
    } finally {
      await this.cleanup();
    }
  }
  
  async cleanup() {
    const duration = (Date.now() - this.startTime) / 1000;
    
    this.sessionData.pagesVisited = this.pagesVisited;
    this.sessionData.totalDwellSec = duration;
    this.sessionData.scrollDepths = this.scrollDepths.map(d => Math.round(d * 100));
    this.sessionData.adImpressionsCount = this.adImpressions;
    this.sessionData.adClicked = this.adClicked;
    this.sessionData.sessionDurationSec = Math.round(duration);
    this.sessionData.exitType = this.exitType;
    
    logger.log(this.sessionData);
    
    // Console output
    console.log(`Session ${this.profile.id}: ${this.pagesVisited} pages, ${Math.round(duration)}s, Ad: ${this.adClicked ? 'YES' : 'no'}`);
    
    if (this.browser) {
      activeBrowsers.delete(this.browser);
      await this.browser.close().catch(() => {});
    }
  }
}

// Scheduler
class Scheduler {
  constructor() {
    this.running = false;
    this.sessionsCompleted = 0;
    this.targetSessions = config.maxSessions || config.sessionsPerDay;
  }
  
  async shouldRunNow() {
    const hour = new Date().getHours();
    const profile = this.currentProfile || { timezone: 'America/New_York' };
    
    // Simple timezone-based shaping (approximate)
    const localHour = (hour + (profile.timezone.includes('London') ? 5 : profile.timezone.includes('Berlin') ? 6 : 0)) % 24;
    
    // 60% between 8am-11pm, 5% between 1am-6am
    const isPeak = localHour >= 8 && localHour <= 23;
    const isDead = localHour >= 1 && localHour <= 6;
    
    if (isDead && Math.random() > 0.05) return false;
    if (!isPeak && Math.random() > 0.35) return false;
    
    return true;
  }
  
  async getDelay() {
    // Gaussian distribution around mean of 2.5 minutes
    const mean = 150000; // 2.5 minutes in ms
    const std = 60000;   // 1 minute std
    return Math.max(15000, gaussian(mean, std));
  }
  
  async runSession() {
    if (isShuttingDown) return;
    
    const profile = profileManager.getAvailableProfile();
    this.currentProfile = profile;
    
    if (!(await this.shouldRunNow())) {
      await sleep(60000); // Wait 1 minute and try again
      return;
    }
    
    const session = new Session(profile);
    await session.run();
    
    this.sessionsCompleted++;
    sessionCount++;
    consecutiveFailures = 0; // Reset on success
    
    // Staggering delay between concurrent launches
    await sleep(randInt(15000, 90000));
  }
  
  async start() {
    this.running = true;
    console.log(`Starting testbot: target=${config.targetURL}, maxConcurrent=${config.maxConcurrent}`);
    
    // Graceful shutdown handlers
    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());
    
    const queue = [];
    
    while (this.running && this.sessionsCompleted < this.targetSessions) {
      // Maintain 1-3 concurrent instances
      while (queue.length < config.maxConcurrent && !isShuttingDown) {
        queue.push(this.runSession());
      }
      
      await Promise.race(queue);
      queue.length = 0; // Simple semaphore reset
      
      if (!isShuttingDown) {
        const delay = await this.getDelay();
        console.log(`Waiting ${Math.round(delay/1000)}s until next batch...`);
        await sleep(delay);
      }
    }
    
    console.log('Daily session target reached or shutdown requested.');
  }
  
  async shutdown() {
    console.log('\nGraceful shutdown initiated...');
    isShuttingDown = true;
    this.running = false;
    
    // Wait for active browsers to close
    await Promise.all(Array.from(activeBrowsers).map(browser => 
      browser.close().catch(() => {})
    ));
    
    profileManager.saveUsage();
    process.exit(0);
  }
}

// Main
(async () => {
  config.parseCLIArgs();
  
  const scheduler = new Scheduler();
  await scheduler.start();
})();
