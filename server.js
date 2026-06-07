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

// Middleware
app.use(express.json());
app.use(express.static('public'));
app.use(requestIp.mw()); // Get real client IP

// Rate limiting (prevent abuse) – only for shortening endpoint
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per window
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/shorten', limiter);

// Ensure data directory and files exist
async function initDB() {
  const dataDir = path.join(__dirname, 'data');
  try { await fs.access(dataDir); } catch { await fs.mkdir(dataDir); }
  
  try { await fs.access(DB_FILE); } catch { await fs.writeFile(DB_FILE, JSON.stringify([], null, 2)); }
  try { await fs.access(ANALYTICS_FILE); } catch { await fs.writeFile(ANALYTICS_FILE, JSON.stringify([], null, 2)); }
}

// Read/write helpers
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

// Generate short code
function generateCode() {
  return Math.random().toString(36).substring(2, 8);
}
async function getUniqueCode() {
  const links = await readLinks();
  let code, exists = true;
  let attempts = 0;
  while (exists && attempts < 10) {
    code = generateCode();
    exists = links.some(link => link.code === code);
    attempts++;
  }
  if (exists) code = generateCode() + Date.now().toString(36).slice(-2);
  return code;
}

// ---------- API Routes ----------

// GET all links (public)
app.get('/api/links', async (req, res) => {
  try {
    const links = await readLinks();
    const sorted = links.sort((a, b) => b.createdAt - a.createdAt).slice(0, 20);
    res.json(sorted);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch links' });
  }
});

// POST /api/shorten (no API key required)
app.post('/api/shorten', async (req, res) => {
  try {
    let { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }
    
    // Add protocol if missing
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'http://' + url;
    }
    
    // Validate URL
    try {
      new URL(url);
    } catch {
      return res.status(400).json({ error: 'Invalid URL format' });
    }
    
    const links = await readLinks();
    
    // Check if URL already exists
    const existing = links.find(link => link.longUrl === url);
    if (existing) {
      const shortUrl = `${req.protocol}://${req.get('host')}/${existing.code}`;
      return res.json({
        shortUrl,
        code: existing.code,
        longUrl: existing.longUrl,
        clicks: existing.clicks
      });
    }
    
    // Generate unique code
    const code = await getUniqueCode();
    
    // Create new link entry
    const newLink = {
      code,
      longUrl: url,
      clicks: 0,
      createdAt: Date.now()
    };
    
    links.push(newLink);
    await writeLinks(links);
    
    const shortUrl = `${req.protocol}://${req.get('host')}/${code}`;
    res.json({
      shortUrl,
      code,
      longUrl: url,
      clicks: 0
    });
    
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/links (clear all links and analytics)
app.delete('/api/links', async (req, res) => {
  try {
    await writeLinks([]);
    await writeAnalytics([]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to clear' });
  }
});

// ---------- Redirect with Analytics (301 permanent) ----------
app.get('/:code', async (req, res) => {
  try {
    const { code } = req.params;
    
    // Skip API and static file requests
    if (code === 'api' || code === 'favicon.ico') {
      return res.status(404).send('Not found');
    }
    
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
    
    // ---- Collect Analytics ----
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
    
    // ---- Permanent redirect (301) for SEO ----
    res.redirect(301, link.longUrl);
    
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// Optional: View analytics for a short code (GET /api/analytics/:code)
app.get('/api/analytics/:code', async (req, res) => {
  const { code } = req.params;
  const analytics = await readAnalytics();
  const filtered = analytics.filter(a => a.code === code);
  res.json(filtered);
});

// Start server
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`✨ Link shortener running at http://localhost:${PORT}`);
    console.log(`📊 Analytics enabled | 🔒 Rate limiting active | 🔗 301 redirects`);
  });
});