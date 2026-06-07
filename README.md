# 🔗 ShortLink – Retro Game Style URL Shortener

A fast, self‑hosted URL shortener with a pixel‑perfect retro game interface, click analytics, rate limiting, and permanent redirects for SEO.

![Demo](https://img.shields.io/badge/demo-live-brightgreen) ![Node.js](https://img.shields.io/badge/node-18%2B-green) ![License](https://img.shields.io/badge/license-MIT-blue)

## ✨ Features

- 🎮 **Retro Game UI** – CRT scanlines, pixel fonts, 8‑bit colour palette
- ⚡ **Instant redirects** – 301 permanent redirects (SEO friendly)
- 📊 **Click analytics** – track referrer, browser, OS, device, country, city
- 🔒 **Rate limiting** – prevent abuse (100 requests / 15 min per IP)
- 📋 **Copy buttons** – one‑click copy for new and past links
- 🗑️ **Clear history** – delete all shortened links at once
- 💾 **File‑based storage** – no database required, works out of the box
- 🚀 **Ready to deploy** – works on Render, Railway, Fly.io, or any Node.js host

## 🖼️ Screenshot

![ShortLink Screenshot](https://via.placeholder.com/800x400?text=Retro+Link+Shortener+UI)

## 📦 Installation

### Prerequisites
- [Node.js](https://nodejs.org) (v18 or higher)
- [Git](https://git-scm.com)

### Clone & Setup

```bash
git clone https://github.com/your-username/link-shortener.git
cd link-shortener
npm install
```
Run Locally
```bash
npm start
Visit http://localhost:3000 and start shortening URLs.
```
### 🧪 Usage

Web Interface

- 1.Paste a long URL into the input field.
- 2.Click Shorten – get a short link like http://localhost:3000/abc123.
- 3.Copy the link or use it immediately.
- 4.Every click is counted and displayed in the recent links table.

### 🚀 Deployment

- Push your code to a GitHub repository.
- Click New + → Web Service → connect your repo.
- Use these settings:
```
Build Command: npm install
Start Command: node server.js
```
Click Deploy.

### 📁 Project Structure

```link-shortener/
├── data/                # Auto‑created: links.json, analytics.json
├── public/
│   ├── index.html       # Retro game UI
│   ├── style.css        # Pixel‑perfect styling
│   └── script.js        # Frontend logic (copy, load history, clear)
├── server.js            # Express backend + analytics + rate limiting
├── package.json
└── README.md
```

### Built With

- Express – web framework
- express-rate-limit – abuse protection
- request-ip – client IP extraction
- ua-parser-js – browser/OS/device detection
- geoip-lite – IP to location mapping
- Press Start 2P – pixel game font

### 🤝 Contributing
Pull requests are welcome. For major changes, open an issue first.

### 📄 License
MIT – use it freely for personal or commercial projects.

