const API_BASE = '/api';
let currentShortCode = null;

// DOM elements
const form = document.getElementById('shortenForm');
const urlInput = document.getElementById('longUrl');
const resultDiv = document.getElementById('result');
const shortLinkAnchor = document.getElementById('shortLink');
const copyBtn = document.getElementById('copyBtn');
const clickStats = document.getElementById('clickStats');
const recentList = document.getElementById('recentList');

// Helper: Show result with animation
function showResult(shortUrl, code, clicks) {
  shortLinkAnchor.href = shortUrl;
  shortLinkAnchor.textContent = shortUrl;
  clickStats.textContent = `📈 ${clicks} clicks`;
  currentShortCode = code;
  resultDiv.classList.remove('hidden');
  resultDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Copy to clipboard (for main result)
async function copyToClipboard() {
  if (!shortLinkAnchor.href) return;
  try {
    await navigator.clipboard.writeText(shortLinkAnchor.href);
    const originalText = copyBtn.textContent;
    copyBtn.textContent = 'Copied! ✓';
    setTimeout(() => {
      copyBtn.textContent = originalText;
    }, 2000);
  } catch (err) {
    alert('Failed to copy link');
  }
}

// Fetch and display recent links (with copy buttons)
async function loadRecentLinks() {
  try {
    const response = await fetch(`${API_BASE}/links`);
    const links = await response.json();
    
    if (!links.length) {
      recentList.innerHTML = '<div class="empty">✨ No links yet. Create your first short link above!</div>';
      return;
    }
    
    const baseUrl = `${window.location.protocol}//${window.location.host}`;
    
    recentList.innerHTML = links.map(link => `
      <div class="link-item" data-code="${link.code}">
        <div class="link-info">
          <a href="${baseUrl}/${link.code}" target="_blank" class="link-short">${baseUrl}/${link.code}</a>
          <div class="link-original" title="${link.longUrl}">
            ${link.longUrl.length > 60 ? link.longUrl.substring(0, 60) + '...' : link.longUrl}
          </div>
        </div>
        <div class="link-actions">
          <span class="link-clicks">👆 ${link.clicks} click${link.clicks !== 1 ? 's' : ''}</span>
          <button class="copy-recent-btn" data-url="${baseUrl}/${link.code}">📋 COPY</button>
        </div>
      </div>
    `).join('');
    
    // Add event listeners to all copy buttons in recent links
    document.querySelectorAll('.copy-recent-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const urlToCopy = btn.getAttribute('data-url');
        try {
          await navigator.clipboard.writeText(urlToCopy);
          const originalText = btn.textContent;
          btn.textContent = '✓ COPIED!';
          setTimeout(() => {
            btn.textContent = originalText;
          }, 1500);
        } catch (err) {
          alert('Failed to copy link');
        }
      });
    });
  } catch (error) {
    console.error('Failed to load recent links:', error);
    recentList.innerHTML = '<div class="empty">⚠️ Could not load recent links</div>';
  }
}

// Handle form submission
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const url = urlInput.value.trim();
  if (!url) return;
  
  // Disable button and show loading state
  const submitBtn = form.querySelector('button[type="submit"]');
  const originalBtnText = submitBtn.textContent;
  submitBtn.textContent = 'Shortening...';
  submitBtn.disabled = true;
  
  // Add retro loading cursor
  document.body.classList.add('loading-cursor');
  
  try {
    const response = await fetch(`${API_BASE}/shorten`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to shorten URL');
    }
    
    showResult(data.shortUrl, data.code, data.clicks);
    urlInput.value = '';
    await loadRecentLinks(); // ← this is why it works after creating a link
    
  } catch (error) {
    alert(error.message);
    console.error(error);
  } finally {
    // Remove loading cursor
    document.body.classList.remove('loading-cursor');
    
    submitBtn.textContent = originalBtnText;
    submitBtn.disabled = false;
    urlInput.focus();
  }
});

// Copy button event (main result)
copyBtn.addEventListener('click', copyToClipboard);

// Clear history button
const clearBtn = document.getElementById('clearHistoryBtn');
if (clearBtn) {
  clearBtn.addEventListener('click', async () => {
    const confirmClear = confirm('⚠️ DELETE ALL LINKS? This cannot be undone. ⚠️');
    if (!confirmClear) return;
    
    document.body.classList.add('loading-cursor');
    
    try {
      const response = await fetch(`${API_BASE}/links`, {
        method: 'DELETE'
      });
      
      if (!response.ok) throw new Error('Failed to clear');
      
      recentList.innerHTML = '<div class="empty">🗑️ History cleared. Create a new short link!</div>';
      await loadRecentLinks(); // reloads empty list
      
    } catch (error) {
      alert('Error clearing history: ' + error.message);
    } finally {
      document.body.classList.remove('loading-cursor');
    }
  });
}

// ✅ Load recent links when the page first loads
document.addEventListener('DOMContentLoaded', () => {
  loadRecentLinks();
  urlInput.focus();
});