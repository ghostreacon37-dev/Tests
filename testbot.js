/**
 * testbot.js
 *
 * Repeatable site tester (for domains you own)
 *
 * Behavior summary (defaults):
 * - random 2..7 tabs per run (use --fixed-instances to set exact)
 * - open referrer URL -> wait 1..2 min with micro-actions -> click a link to target (if present)
 * - if redirected to another domain, behave like a human there
 * - on landing page (target or redirect): partial/random scroll + wait 1..4.5 min
 * - click a random internal post (same hostname as current page) -> partial/random scroll + wait 1..4.5 min
 * - repeats for --runs (or forever with --forever) with --interval between runs
 *
 * Usage:
 *   npm i puppeteer-extra puppeteer-extra-plugin-stealth puppeteer
 *   node testbot.js <target_url> <referrer_url> [options] --confirm-owned
 *
 * Example:
 *   node testbot.js https://learnwithblog.xyz https://x.com/GhostReacondev/status/1981679871513575623 \
 *     --runs=5 --interval=30000 --confirm-owned
 *
 * IMPORTANT: Only run on domains you OWN or have explicit written permission to test.
 */

const puppeteer = require('puppeteer-extra');
const fs = require('fs');
const path = require('path');
puppeteer.use(require('puppeteer-extra-plugin-stealth')());

/* ---------- helpers ---------- */
function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

const UA_LIST = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/121.0.0.0 Mobile/15E148 Safari/604.1'
];

const VIEWPORTS = [
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 412, height: 915 },
  { width: 390, height: 844 },
  { width: 1024, height: 768 },
];

/* ---------- CLI parsing ---------- */
function parseArgs() {
  const argv = process.argv.slice(2);
  const cfg = {
    target: null,
    referrer: null,
    runs: 1,
    forever: false,
    interval: 10000,       // ms between runs
    minRefWait: 60000,     // 1 min
    maxRefWait: 120000,    // 2 min
    minTargetWait: 60000,  // 1 min
    maxTargetWait: 270000, // 4.5 min
    minTabs: 2,
    maxTabs: 7,
    fixedInstances: null,  // if set, use this exact number instead of random 2..7
    confirmOwned: false,
    headless: false,
    debug: false,
    screenshot: false
  };

  for (const a of argv) {
    if (!cfg.target && !a.startsWith('--')) cfg.target = a;
    else if (!cfg.referrer && !a.startsWith('--')) cfg.referrer = a;
    else if (a.startsWith('--runs=')) cfg.runs = Math.max(1, parseInt(a.split('=')[1]) || 1);
    else if (a === '--forever') cfg.forever = true;
    else if (a.startsWith('--interval=')) cfg.interval = Math.max(0, parseInt(a.split('=')[1]) || cfg.interval);
    else if (a.startsWith('--min-ref-wait=')) cfg.minRefWait = Math.max(1000, parseInt(a.split('=')[1]) || cfg.minRefWait);
    else if (a.startsWith('--max-ref-wait=')) cfg.maxRefWait = Math.max(cfg.minRefWait, parseInt(a.split('=')[1]) || cfg.maxRefWait);
    else if (a.startsWith('--min-target-wait=')) cfg.minTargetWait = Math.max(1000, parseInt(a.split('=')[1]) || cfg.minTargetWait);
    else if (a.startsWith('--max-target-wait=')) cfg.maxTargetWait = Math.max(cfg.minTargetWait, parseInt(a.split('=')[1]) || cfg.maxTargetWait);
    else if (a.startsWith('--min-tabs=')) cfg.minTabs = Math.max(1, parseInt(a.split('=')[1]) || cfg.minTabs);
    else if (a.startsWith('--max-tabs=')) cfg.maxTabs = Math.max(cfg.minTabs, parseInt(a.split('=')[1]) || cfg.maxTabs);
    else if (a.startsWith('--fixed-instances=')) cfg.fixedInstances = Math.max(1, parseInt(a.split('=')[1]) || 1);
    else if (a === '--confirm-owned') cfg.confirmOwned = true;
    else if (a === '--headless') cfg.headless = true;
    else if (a === '--debug') cfg.debug = true;
    else if (a === '--screenshot') cfg.screenshot = true;
  }

  return cfg;
}

/* ---------- human-like micro-actions (light partial scrolls) ---------- */
async function microMouse(page, moves = 6) {
  const vw = page.viewport() || { width: 800, height: 600 };
  for (let i = 0; i < moves; i++) {
    const x = rand(10, Math.max(10, (vw.width || 800) - 10));
    const y = rand(10, Math.max(10, (vw.height || 600) - 10));
    try {
      await page.mouse.move(x, y, { steps: rand(2, 12) });
    } catch (_) {}
    await sleep(rand(80, 500));
  }
}

// partial scroll: only small bursts, never to bottom
async function partialRandomScroll(page) {
  const viewport = page.viewport() || { height: 800 };
  const fullHeight = await page.evaluate(() => {
    try {
      return Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight
      );
    } catch {
      return 0;
    }
  }).catch(() => 0);

  const bursts = rand(2, 5);
  const maxTotal = Math.max(
    Math.min(fullHeight, viewport.height * rand(1, 2)),
    viewport.height
  ); // at most ~2 viewports
  let scrolled = 0;

  for (let b = 0; b < bursts && scrolled < maxTotal; b++) {
    const step = rand(80, Math.floor((viewport.height || 800) / 2));
    const times = rand(1, 4);
    for (let t = 0; t < times && scrolled < maxTotal; t++) {
      await page.evaluate(y => window.scrollBy(0, y), step).catch(() => {});
      scrolled += step;
      await sleep(rand(500, 2000));
      if (Math.random() < 0.12) {
        await page
          .evaluate(y => window.scrollBy(0, -y), rand(20, 100))
          .catch(() => {});
      }
    }
    await sleep(rand(700, 2000));
  }
}

/* ---------- flow actions ---------- */

async function waitOnReferrer(page, minMs, maxMs, debug = false) {
  const wait = rand(minMs, maxMs);
  if (debug) console.log(`  debug: referrer wait ~${Math.round(wait / 1000)}s`);
  const start = Date.now();
  while (Date.now() - start < wait) {
    await microMouse(page, rand(3, 10));
    try {
      await page.evaluate(
        () => window.scrollBy(0, Math.floor(Math.random() * 80 - 40))
      );
    } catch (_) {}
    await sleep(rand(2000, 6000));
  }
}

// try to click a link on referrer that leads to the target host
async function clickLinkToTarget(page, targetHost, debug = false) {
  try {
    await page.waitForTimeout(rand(800, 2500));
  } catch (_) {}

  const clicked = await page
    .evaluate(targetHost => {
      try {
        const anchors = Array.from(document.querySelectorAll('a[href]')).filter(
          a => a.href && a.href.includes(targetHost)
        );
        if (!anchors.length) return false;
        const el = anchors[Math.floor(Math.random() * anchors.length)];
        el.target = '_self';
        el.click();
        return true;
      } catch {
        return false;
      }
    }, targetHost)
    .catch(() => false);

  if (clicked) {
    if (debug) console.log('  debug: clicked direct anchor to target');
    return true;
  }

  // fallback: anchors with text/shorteners
  const fb = await page
    .evaluate(targetHost => {
      try {
        const anchors = Array.from(document.querySelectorAll('a[href]')).slice(
          0,
          80
        );
        for (const a of anchors) {
          const href = (a.href || '').toLowerCase();
          if (
            href.includes('t.co') ||
            href.includes('bit.ly') ||
            href.includes('tinyurl')
          ) {
            a.target = '_self';
            a.click();
            return true;
          }
          if (
            (a.innerText || '')
              .toLowerCase()
              .includes(targetHost.toLowerCase())
          ) {
            a.target = '_self';
            a.click();
            return true;
          }
        }
        return false;
      } catch {
        return false;
      }
    }, targetHost)
    .catch(() => false);

  if (fb && debug) console.log('  debug: clicked fallback anchor');
  return !!fb;
}

// behave like a human on whatever domain we're currently on
async function humanSessionOnCurrentSite(
  page,
  minWait,
  maxWait,
  debug = false
) {
  await partialRandomScroll(page);

  const waitHome = rand(minWait, maxWait);
  if (debug) {
    const u = await page.url().catch(() => '?');
    console.log(
      `  debug: human session on ${u} ~${Math.round(waitHome / 1000)}s`
    );
  }

  const sHome = Date.now();
  while (Date.now() - sHome < waitHome) {
    await microMouse(page, rand(3, 8));
    await sleep(rand(2000, 8000));
  }
}

// open a random internal link on the CURRENT host and wait there
async function openRandomInternalPostAndWait(
  page,
  minWait,
  maxWait,
  debug = false
) {
  const currentHost = await page
    .evaluate(() => location.hostname)
    .catch(() => null);

  const href = await page
    .evaluate(() => {
      try {
        const currentHost = location.hostname;
        const links = Array.from(document.querySelectorAll('a[href]'))
          .map(a => a.href)
          .filter(
            h =>
              h &&
              h.includes(currentHost) &&
              h !== location.origin + '/' &&
              !h.endsWith('#')
          );
        if (!links.length) return null;
        return links[Math.floor(Math.random() * links.length)];
      } catch {
        return null;
      }
    })
    .catch(() => null);

  if (!href) {
    return {
      opened: false,
      finalUrl: await page.url().catch(() => null),
      host: currentHost
    };
  }

  try {
    await page
      .goto(href, { waitUntil: 'domcontentloaded', timeout: 60000 })
      .catch(() => {});

    await partialRandomScroll(page);
    const wait = rand(minWait, maxWait);
    if (debug) {
      console.log(
        `  debug: waiting on internal post ~${Math.round(wait / 1000)}s`
      );
    }

    const start = Date.now();
    while (Date.now() - start < wait) {
      await microMouse(page, rand(3, 10));
      await sleep(rand(2000, 8000));
    }

    return {
      opened: true,
      finalUrl: await page.url().catch(() => href),
      host: await page
        .evaluate(() => location.hostname)
        .catch(() => currentHost)
    };
  } catch (e) {
    return {
      opened: false,
      finalUrl: await page.url().catch(() => null),
      host: currentHost
    };
  }
}

/* ---------- main loop ---------- */

(async () => {
  const cfg = parseArgs();
  if (!cfg.target || !cfg.referrer) {
    console.error(
      'Usage: node testbot.js <target_url> <referrer_url> [--runs=N] [--forever] [--interval=ms] [--fixed-instances=N] --confirm-owned'
    );
    process.exit(1);
  }
  if (!cfg.confirmOwned) {
    console.error(
      'ERROR: This script requires --confirm-owned. Only run on domains you own or have permission to test.'
    );
    process.exit(1);
  }

  const targetHost = new URL(cfg.target).hostname;
  console.log(
    `Starting repeatable tester — target: ${cfg.target}, referrer: ${cfg.referrer}`
  );
  console.log(
    `Runs: ${cfg.runs}${cfg.forever ? ' (forever)' : ''}, interval=${cfg.interval}ms`
  );
  if (cfg.fixedInstances) {
    console.log(`Using fixed instances: ${cfg.fixedInstances}`);
  } else {
    console.log(`Tabs per run: random ${cfg.minTabs}..${cfg.maxTabs}`);
  }

  let run = 0;
  let stop = false;
  process.on('SIGINT', () => {
    console.log('\nSIGINT received — stopping after current run');
    stop = true;
  });
  process.on('SIGTERM', () => {
    console.log('\nSIGTERM received — stopping after current run');
    stop = true;
  });

  while (!stop && (cfg.forever || run < cfg.runs)) {
    run++;
    console.log(`\n=== Run ${run} ===`);

    const tabs = cfg.fixedInstances
      ? cfg.fixedInstances
      : rand(cfg.minTabs, cfg.maxTabs);
    const profileDir = path.join('/tmp', `testbot_profile_${Date.now()}`);

    const browser = await puppeteer.launch({
      headless: !!cfg.headless,
      userDataDir: profileDir,
      defaultViewport: null,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
      const flows = [];
      for (let t = 0; t < tabs; t++) {
        const flow = (async tabIndex => {
          const page = await browser.newPage();
          const ua = UA_LIST[rand(0, UA_LIST.length - 1)];
          const vp = VIEWPORTS[rand(0, VIEWPORTS.length - 1)];
          await page.setUserAgent(ua);
          await page.setViewport({ width: vp.width, height: vp.height });
          await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });

          if (cfg.debug) {
            page.on('console', msg =>
              console.log(`page[${tabIndex}] console:`, msg.text && msg.text())
            );
            page.on('pageerror', e =>
              console.log(`page[${tabIndex}] error:`, e.message)
            );
          }

          const start = Date.now();
          let refClicked = false;

          try {
            // 1) open referrer
            await page
              .goto(cfg.referrer, {
                waitUntil: 'domcontentloaded',
                timeout: 60000
              })
              .catch(err => {
                if (cfg.debug) {
                  console.warn(
                    `tab[${tabIndex}] referrer goto failed: ${
                      err && err.message
                    }`
                  );
                }
              });

            // 2) wait 1-2 min on referrer with micro actions
            await waitOnReferrer(
              page,
              cfg.minRefWait,
              cfg.maxRefWait,
              cfg.debug
            );

            // 3) attempt click to target
            refClicked = await clickLinkToTarget(
              page,
              targetHost,
              cfg.debug
            );
            if (refClicked) {
              try {
                await page.waitForNavigation({
                  waitUntil: 'domcontentloaded',
                  timeout: 15000
                });
              } catch (_) {}
            } else {
              // fallback: navigate directly with referer
              try {
                await page
                  .goto(cfg.target, {
                    waitUntil: 'domcontentloaded',
                    timeout: 60000,
                    referer: cfg.referrer
                  })
                  .catch(err => {
                    if (cfg.debug) {
                      console.warn(
                        `tab[${tabIndex}] fallback goto error: ${
                          err && err.message
                        }`
                      );
                    }
                  });
              } catch (err) {
                if (cfg.debug) {
                  console.warn(
                    `tab[${tabIndex}] second fallback goto error: ${
                      err && err.message
                    }`
                  );
                }
                await page
                  .goto(cfg.target, {
                    waitUntil: 'domcontentloaded',
                    timeout: 60000
                  })
                  .catch(() => {});
              }
            }

            // 4) we might now be on TARGET or REDIRECTED website
            const activeUrl = await page.url().catch(() => cfg.target);
            let activeHost = null;
            try {
              activeHost = new URL(activeUrl).hostname;
            } catch (_) {}

            if (cfg.debug) {
              console.log(
                `tab[${tabIndex}] landed on ${activeUrl} (host=${activeHost}, targetHost=${targetHost})`
              );
            }

            // behave like a human on whatever host we actually landed on
            await humanSessionOnCurrentSite(
              page,
              cfg.minTargetWait,
              cfg.maxTargetWait,
              cfg.debug
            );

            // 5) click random internal post and wait 1..4.5 min (on current host)
            const postResult = await openRandomInternalPostAndWait(
              page,
              cfg.minTargetWait,
              cfg.maxTargetWait,
              cfg.debug
            );

            // optional screenshot
            if (cfg.screenshot) {
              try {
                const shotPath = path.join(
                  process.cwd(),
                  `shot_run${run}_tab${tabIndex}_${Date.now()}.png`
                );
                await page
                  .screenshot({ path: shotPath, fullPage: false })
                  .catch(() => {});
              } catch (_) {}
            }

            const finalUrl = await page.url().catch(() => cfg.target);
            const duration = Date.now() - start;

            if (cfg.debug) {
              console.log(
                `tab[${tabIndex}] done: clicked=${refClicked}, postOpened=${postResult.opened}, duration=${Math.round(
                  duration / 1000
                )}s, finalUrl=${finalUrl}`
              );
            }

            await page.close().catch(() => {});
            return {
              tab: tabIndex,
              clicked: refClicked,
              finalUrl: finalUrl,
              postOpened: postResult.opened
            };
          } catch (e) {
            if (cfg.debug) {
              console.error(
                `tab[${tabIndex}] flow error:`,
                e && (e.message || e)
              );
            }
            try {
              await page.close();
            } catch (_) {}
            return {
              tab: tabIndex,
              clicked: refClicked,
              finalUrl: null,
              postOpened: false
            };
          }
        })(t + 1);

        flows.push(flow);
        await sleep(rand(300, 1200)); // stagger tab starts
      }

      // wait all flows
      const results = await Promise.allSettled(flows);
      results.forEach(r => {
        if (r.status === 'fulfilled') {
          const v = r.value;
          console.log(
            ` - tab${v.tab}: clicked=${v.clicked} postOpened=${v.postOpened} url=${v.finalUrl}`
          );
        } else {
          console.log(' - tab failed:', r.reason);
        }
      });
    } catch (e) {
      console.error('Run-level error:', e && (e.message || e));
    } finally {
      try {
        await browser.close();
      } catch (_) {}
      try {
        if (fs.existsSync(profileDir)) {
          fs.rmSync(profileDir, { recursive: true, force: true });
        }
      } catch (_) {}
    }

    if (!cfg.forever || stop) {
      if (run >= cfg.runs || stop) break;
    }

    console.log(`Waiting ${cfg.interval}ms before next run...`);
    await sleep(cfg.interval);
  }

  console.log('All runs complete.');
  process.exit(0);
})();
