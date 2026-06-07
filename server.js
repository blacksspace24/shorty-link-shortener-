const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const rateLimit = require('express-rate-limit');
const requestIp = require('request-ip');
const UAParser = require('ua-parser-js');
const geoip = require('geoip-lite');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'data', 'links.json');
const ANALYTICS_FILE = path.join(__dirname, 'data', 'analytics.json');
const API_KEYS_FILE = path.join(__dirname, 'data', 'api-keys.json');

// Middleware
app.use(express.json());
app.use(express.static('public'));
app.use(requestIp.mw());

// Rate limiting for public web endpoint (not for API, but can be added separately)
const webLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests from this IP, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Helper to initialize data files
async function initDB() {
  const dataDir = path.join(__dirname, 'data');
  try { await fs.access(dataDir); } catch { await fs.mkdir(dataDir); }
  const files = [DB_FILE, ANALYTICS_FILE, API_KEYS_FILE];
  for (const file of files) {
    try { await fs.access(file); } catch { await fs.writeFile(file, JSON.stringify([], null, 2)); }
  }
}

// Read / Write helpers
async function readLinks() {
  const data = await fs.readFile(DB_FILE, 'utf-8');
  return JSON.parse(data);
}
async function writeLinks(links) {
  await fs.writeFile(DB_FILE, JSON.stringify(links, null, 2));
}
async function readAnalytics() {
  const data = await fs.readFile(ANALYTICS_FILE, 'utf-8');
  return JSON.parse(data);
}
async function writeAnalytics(analytics) {
  await fs.writeFile(ANALYTICS_FILE, JSON.stringify(analytics, null, 2));
}
async function readApiKeys() {
  const data = await fs.readFile(API_KEYS_FILE, 'utf-8');
  return JSON.parse(data);
}
async function writeApiKeys(keys) {
  await fs.writeFile(API_KEYS_FILE, JSON.stringify(keys, null, 2));
}

// Generate random short code (6 characters)
function generateCode() {
  return Math.random().toString(36).substring(2, 8);
}
async function getUniqueCode() {
  const links = await readLinks();
  let code;
  let exists = true;
  let attempts = 0;
  while (exists && attempts < 10) {
    code = generateCode();
    exists = links.some(link => link.code === code);
    attempts++;
  }
  if (exists) code = generateCode() + Date.now().toString(36).slice(-2);
  return code;
}

// Helper: validate API key and return tier ('premium' or null)
async function getKeyTier(apiKey) {
  if (!apiKey) return null;
  const keys = await readApiKeys();
  const keyEntry = keys.find(k => k.key === apiKey);
  if (!keyEntry) return null;
  if (keyEntry.expiresAt && keyEntry.expiresAt < Date.now()) return null;
  return keyEntry.tier; // should be 'premium'
}

// ---------- PUBLIC WEB ENDPOINT (no key required, random codes) ----------
app.post('/api/shorten/web', webLimiter, async (req, res) => {
  try {
    let { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });
    if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'http://' + url;
    try { new URL(url); } catch { return res.status(400).json({ error: 'Invalid URL' }); }

    const links = await readLinks();
    // Optional: check for duplicate long URL
    const existing = links.find(link => link.longUrl === url);
    if (existing) {
      const shortUrl = `${req.protocol}://${req.get('host')}/${existing.code}`;
      return res.json({ shortUrl, code: existing.code, longUrl: existing.longUrl, clicks: existing.clicks });
    }

    const code = await getUniqueCode();
    const newLink = { code, longUrl: url, clicks: 0, createdAt: Date.now() };
    links.push(newLink);
    await writeLinks(links);

    const shortUrl = `${req.protocol}://${req.get('host')}/${code}`;
    res.json({ shortUrl, code, longUrl: url, clicks: 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- PREMIUM API ENDPOINT (valid premium key required, supports custom aliases) ----------
app.post('/api/shorten', async (req, res) => {
  try {
    let { url, alias, apiKey } = req.body;
    if (!apiKey) return res.status(401).json({ error: 'API key required' });
    const tier = await getKeyTier(apiKey);
    if (tier !== 'premium') return res.status(403).json({ error: 'Valid premium API key required' });

    if (!url) return res.status(400).json({ error: 'URL is required' });
    if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'http://' + url;
    try { new URL(url); } catch { return res.status(400).json({ error: 'Invalid URL' }); }

    const links = await readLinks();
    const existing = links.find(link => link.longUrl === url);
    if (existing) {
      const shortUrl = `${req.protocol}://${req.get('host')}/${existing.code}`;
      return res.json({ shortUrl, code: existing.code, longUrl: existing.longUrl, clicks: existing.clicks });
    }

    let code;
    const wantAlias = alias && alias.trim() !== '';
    if (wantAlias) {
      alias = alias.trim().toLowerCase();
      const aliasRegex = /^[a-zA-Z0-9\-_]{3,20}$/;
      if (!aliasRegex.test(alias)) {
        return res.status(400).json({ error: 'Alias must be 3-20 alphanumeric, dash, or underscore characters.' });
      }
      const reserved = ['api', 'favicon.ico', 'assets', 'public', 'docs'];
      if (reserved.includes(alias)) {
        return res.status(400).json({ error: 'Alias is reserved.' });
      }
      const aliasTaken = links.some(link => link.code === alias);
      if (aliasTaken) {
        return res.status(409).json({ error: 'Alias already taken.' });
      }
      code = alias;
    } else {
      code = await getUniqueCode();
    }

    const newLink = { code, longUrl: url, clicks: 0, createdAt: Date.now() };
    links.push(newLink);
    await writeLinks(links);

    const shortUrl = `${req.protocol}://${req.get('host')}/${code}`;
    res.json({ shortUrl, code, longUrl: url, clicks: 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- OTHER API ENDPOINTS ----------
// GET all links (last 20)
app.get('/api/links', async (req, res) => {
  try {
    const links = await readLinks();
    const sorted = links.sort((a, b) => b.createdAt - a.createdAt).slice(0, 20);
    res.json(sorted);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch links' });
  }
});

// DELETE all links and analytics
app.delete('/api/links', async (req, res) => {
  try {
    await writeLinks([]);
    await writeAnalytics([]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to clear' });
  }
});

// GET analytics for a specific short code
app.get('/api/analytics/:code', async (req, res) => {
  const { code } = req.params;
  const analytics = await readAnalytics();
  const filtered = analytics.filter(a => a.code === code);
  res.json(filtered);
});

// ---------- ADMIN: Generate Premium API Keys ----------
app.post('/api/admin/keys', async (req, res) => {
  const { secret, expiresInDays } = req.body;
  const adminSecret = process.env.ADMIN_SECRET || 'change_me_in_production';
  if (secret !== adminSecret) return res.status(403).json({ error: 'Invalid admin secret' });

  const newKey = {
    key: 'pk_' + Math.random().toString(36).substring(2, 20),
    tier: 'premium',
    createdAt: Date.now(),
    expiresAt: expiresInDays ? Date.now() + expiresInDays * 86400000 : null,
  };
  const keys = await readApiKeys();
  keys.push(newKey);
  await writeApiKeys(keys);
  res.json({ apiKey: newKey.key, tier: newKey.tier, expiresAt: newKey.expiresAt });
});

// ---------- REDIRECT WITH ANALYTICS (301 permanent) ----------
app.get('/:code', async (req, res) => {
  try {
    const { code } = req.params;
    if (code === 'api' || code === 'favicon.ico') return res.status(404).send('Not found');

    const links = await readLinks();
    const link = links.find(l => l.code === code);
    if (!link) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head><title>Link Not Found</title></head>
        <body style="font-family: system-ui; text-align: center; padding: 50px;">
          <h1>🔗 Link Not Found</h1>
          <p>The short link <strong>/${code}</strong> does not exist.</p>
          <a href="/">Go to Homepage</a>
        </body>
        </html>
      `);
    }

    // Increment click count
    link.clicks++;
    await writeLinks(links);

    // Collect analytics
    const clientIp = req.clientIp;
    const geo = geoip.lookup(clientIp);
    const ua = UAParser(req.headers['user-agent']);
    const analyticsEntry = {
      code,
      timestamp: Date.now(),
      ip: clientIp,
      referrer: req.headers.referer || 'direct',
      userAgent: req.headers['user-agent'],
      browser: ua.browser.name || 'unknown',
      os: ua.os.name || 'unknown',
      device: ua.device.type || 'desktop',
      country: geo ? geo.country : 'unknown',
      city: geo ? geo.city : 'unknown',
    };
    const analytics = await readAnalytics();
    analytics.push(analyticsEntry);
    await writeAnalytics(analytics);

    // 301 permanent redirect
    res.redirect(301, link.longUrl);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// ---------- Start Server ----------
initDB().then(async () => {
  // Create a default premium key if none exist (optional)
  const keys = await readApiKeys();
  if (keys.length === 0) {
    const defaultKey = {
      key: 'pk_' + Math.random().toString(36).substring(2, 20),
      tier: 'premium',
      createdAt: Date.now(),
      expiresAt: null,
    };
    await writeApiKeys([defaultKey]);
    console.log(`🔑 Default premium API key created: ${defaultKey.key}`);
    console.log(`   (Use this key with the API endpoint /api/shorten)`);
  }

  app.listen(PORT, () => {
    console.log(`✨ Link shortener running at http://localhost:${PORT}`);
    console.log(`📊 Analytics enabled | 🔒 Rate limiting active | 🔗 301 redirects`);
    console.log(`🌐 Web endpoint: POST /api/shorten/web (no key)`);
    console.log(`🔐 API endpoint: POST /api/shorten (requires premium key)`);
  });
});