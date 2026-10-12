const express = require('express');
const path = require('path');
const zlib = require('zlib');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();

app.use(express.static(path.join(__dirname, 'public')));

const COVER_SNIPPET = `
<style id="ixl-cover-style">
  html.ixl-top:not(.ixl-fullscreen)::before {
    content: '';
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    cursor: pointer;
    background: #fff url('/ixl.png') top center / cover no-repeat;
  }
  html.ixl-top:not(.ixl-fullscreen) { overflow: hidden !important; }
</style>
<script id="ixl-cover-script">
(function () {
  var root = document.documentElement;

  if (window.top !== window.self) return;
  root.classList.add('ixl-top');

  function inElementFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  }

  function inBrowserFullscreen() {
    if (window.matchMedia('(display-mode: fullscreen)').matches) return true;
    return window.innerHeight >= screen.height - 1 && window.innerWidth >= screen.width - 1;
  }

  function sync() {
    root.classList.toggle('ixl-fullscreen', inElementFullscreen() || inBrowserFullscreen());
  }

  function enterFullscreen() {
    var request = root.requestFullscreen || root.webkitRequestFullscreen;
    if (!request) {
      root.classList.add('ixl-fullscreen');
      return;
    }
    var result = request.call(root);
    if (result && result.catch) {
      result.catch(function () { root.classList.add('ixl-fullscreen'); });
    }
  }

  document.addEventListener('click', function (event) {
    if (root.classList.contains('ixl-fullscreen')) return;
    event.preventDefault();
    event.stopPropagation();
    enterFullscreen();
  }, true);

  document.addEventListener('fullscreenchange', sync);
  document.addEventListener('webkitfullscreenchange', sync);
  window.addEventListener('resize', sync);
  window.addEventListener('pageshow', sync);
  sync();
})();
</script>`;

function injectCover(html) {
  const headOpen = /<head(\s[^>]*)?>/i;
  if (headOpen.test(html)) {
    return html.replace(headOpen, (match) => match + COVER_SNIPPET);
  }
  return COVER_SNIPPET + html;
}

function decompress(buffer, encoding) {
  switch ((encoding || '').toLowerCase()) {
    case 'gzip':
      return zlib.gunzipSync(buffer);
    case 'br':
      return zlib.brotliDecompressSync(buffer);
    case 'deflate':
      return zlib.inflateSync(buffer);
    default:
      return buffer;
  }
}

// Home page with textbox to input any site
app.get('/', (req, res) => {
  res.send(`<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Universal Proxy</title>
    <style>
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      body {
        font-family: Arial, sans-serif;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        min-height: 100vh;
        display: flex;
        justify-content: center;
        align-items: center;
      }
      .container {
        background: white;
        padding: 40px;
        border-radius: 10px;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
        max-width: 600px;
        width: 90%;
      }
      h1 {
        text-align: center;
        margin-bottom: 30px;
        color: #333;
      }
      .input-group {
        display: flex;
        gap: 10px;
      }
      input {
        flex: 1;
        padding: 12px 15px;
        border: 2px solid #ddd;
        border-radius: 5px;
        font-size: 16px;
        transition: border-color 0.3s;
      }
      input:focus {
        outline: none;
        border-color: #667eea;
      }
      button {
        padding: 12px 30px;
        background: #667eea;
        color: white;
        border: none;
        border-radius: 5px;
        font-size: 16px;
        cursor: pointer;
        transition: background 0.3s;
      }
      button:hover {
        background: #764ba2;
      }
      .info {
        margin-top: 20px;
        padding: 15px;
        background: #f0f0f0;
        border-radius: 5px;
        font-size: 14px;
        color: #666;
      }
      .info p {
        margin: 5px 0;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>🌐 Universal Proxy</h1>
      <div class="input-group">
        <input type="text" id="siteUrl" placeholder="Enter website URL (e.g., yohoho.io, google.com)" />
        <button onclick="openSite()">Open</button>
      </div>
      <div class="info">
        <p><strong>How to use:</strong></p>
        <p>✓ Type a website URL in the textbox</p>
        <p>✓ You can include https:// or just the domain</p>
        <p>✓ Click the cover to enter fullscreen mode</p>
      </div>
    </div>

    <script>
      function openSite() {
        let input = document.getElementById('siteUrl').value.trim();
        if (!input) {
          alert('Please enter a website URL');
          return;
        }

        if (!input.startsWith('http://') && !input.startsWith('https://')) {
          input = 'https://' + input;
        }

        const encoded = btoa(input);
        window.location.href = '/proxy?site=' + encoded;
      }

      document.getElementById('siteUrl').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') openSite();
      });
    </script>
  </body>
</html>`);
});

// Proxy endpoint
app.use('/proxy', createProxyMiddleware({
  router: (req) => {
    const encoded = req.query.site;
    if (!encoded) {
      return 'http://localhost:' + (process.env.PORT || 3000);
    }

    let targetSite;
    try {
      targetSite = Buffer.from(encoded, 'base64').toString('utf-8');
      new URL(targetSite);
    } catch (e) {
      return 'http://localhost:' + (process.env.PORT || 3000);
    }

    return targetSite;
  },
  changeOrigin: true,
  secure: false,
  followRedirects: true,
  selfHandleResponse: true,
  onProxyReq(proxyReq) {
    proxyReq.removeHeader('x-forwarded-for');
    proxyReq.removeHeader('x-real-ip');
    proxyReq.removeHeader('via');
  },
  onProxyRes(proxyRes, req, res) {
    const isHtml = /text\/html/i.test(proxyRes.headers['content-type'] || '');
    res.statusCode = proxyRes.statusCode;
    res.statusMessage = proxyRes.statusMessage;

    if (!isHtml) {
      for (const [name, value] of Object.entries(proxyRes.headers)) {
        const key = name.toLowerCase();
        if (key === 'content-length' || key === 'content-encoding' || key === 'transfer-encoding') continue;
        res.setHeader(name, value);
      }
      proxyRes.pipe(res);
      return;
    }

    const chunks = [];
    proxyRes.on('data', (chunk) => chunks.push(chunk));
    proxyRes.on('end', () => {
      let body;
      try {
        const raw = decompress(Buffer.concat(chunks), proxyRes.headers['content-encoding']);
        body = Buffer.from(injectCover(raw.toString('utf8')), 'utf8');
      } catch (error) {
        console.error('Failed to inject cover:', error.message);
        for (const [name, value] of Object.entries(proxyRes.headers)) {
          const key = name.toLowerCase();
          if (key === 'content-length' || key === 'content-encoding' || key === 'transfer-encoding') continue;
          res.setHeader(name, value);
        }
        res.end(Buffer.concat(chunks));
        return;
      }

      for (const [name, value] of Object.entries(proxyRes.headers)) {
        const key = name.toLowerCase();
        if (key === 'content-length' || key === 'content-encoding' || key === 'transfer-encoding') continue;
        res.setHeader(name, value);
      }
      res.setHeader('content-length', body.length);
      res.end(body);
    });
    proxyRes.on('error', () => res.end());
  },
  onError(error, req, res) {
    console.error('Proxy error:', error.message);
    if (res.writeHead && !res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
    }
    res.end('Bad gateway');
  },
}));

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Proxy server running on port ${port}`);
});
