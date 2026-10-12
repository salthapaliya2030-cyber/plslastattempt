const express = require('express');
const path = require('path');
const zlib = require('zlib');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();

const TARGET = 'https://mathsspot.com';
const TARGET_HOST_PATTERN = /^https?:\/\/(www\.)?mathsspot\.com/i;
const LINK_PREVIEW_BOTS =
  /bot|crawler|spider|facebookexternalhit|embedly|slack|discord|twitter|whatsapp|telegram|linkedin|skype|pinterest|preview/i;

app.use('/ixl.png', express.static(path.join(__dirname, 'public', 'ixl.png')));

function siteOrigin(req) {
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

// Link-preview crawlers don't run scripts, so they get a tiny page whose
// social tags point at the IXL cover.
app.use((req, res, next) => {
  if (req.method !== 'GET' || !LINK_PREVIEW_BOTS.test(req.headers['user-agent'] || '')) {
    return next();
  }
  const origin = siteOrigin(req);
  const cover = `${origin}/ixl.png`;
  res.send(`<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>IXL | Math, Language Arts, Science, Social Studies, and Spanish</title>
    <meta property="og:title" content="IXL | Math, Language Arts, Science, Social Studies, and Spanish" />
    <meta property="og:image" content="${cover}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${origin}${req.originalUrl}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="${cover}" />
  </head>
  <body></body>
</html>`);
});

// Injected into every proxied HTML page. The cover is a fixed pseudo-element on
// <html> so it exists before the page body is parsed. It is visible whenever
// the page is NOT fullscreen; clicking it enters fullscreen, and leaving
// fullscreen (Esc, F11, the page's own exit button) brings it back.
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

  // Embedded frames (games, ads) must not get their own cover.
  if (window.top !== window.self) return;
  root.classList.add('ixl-top');

  function inElementFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  }

  function inBrowserFullscreen() {
    if (window.matchMedia('(display-mode: fullscreen)').matches) return true;
    // ChromeOS F4 / F11 fullscreen: the viewport fills the whole screen.
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

  // Keep navigation on this site: any link or window.open pointing at the
  // real host is rewritten to the same path on the proxy.
  var REAL_HOST = /^(www\\.)?mathsspot\\.com$/i;
  function toProxyUrl(url) {
    try {
      var parsed = new URL(url, location.href);
      if (!REAL_HOST.test(parsed.hostname)) return url;
      return location.origin + parsed.pathname + parsed.search + parsed.hash;
    } catch (error) {
      return url;
    }
  }

  document.addEventListener('click', function (event) {
    var link = event.target && event.target.closest && event.target.closest('a[href]');
    if (!link) return;
    var rewritten = toProxyUrl(link.href);
    if (rewritten !== link.href) {
      link.href = rewritten;
      link.removeAttribute('target');
    }
  }, true);

  var nativeOpen = window.open;
  window.open = function (url) {
    var args = Array.prototype.slice.call(arguments);
    if (typeof url === 'string') args[0] = toProxyUrl(url);
    return nativeOpen.apply(window, args);
  };

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

const REWRITABLE_TYPES = /text\/html|javascript|json|text\/css|text\/plain|xml/i;

function rewriteHostLinks(text, origin) {
  const host = origin.replace(/^https?:\/\//, '');
  const escapedOrigin = origin.replace(/\//g, '\\/');
  return text
    .replace(/https?:\/\/(www\.)?mathsspot\.com/gi, origin)
    .replace(/https?:\\\/\\\/(www\.)?mathsspot\.com/gi, escapedOrigin)
    .replace(/https?%3A%2F%2F(www\.)?mathsspot\.com/gi, encodeURIComponent(origin))
    .replace(/(["'(\s])\/\/(www\.)?mathsspot\.com/gi, `$1//${host}`);
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

function forwardHeaders(proxyRes, res, { stripBodyHeaders }) {
  for (const [name, value] of Object.entries(proxyRes.headers)) {
    const key = name.toLowerCase();
    if (key === 'content-security-policy' || key === 'content-security-policy-report-only' || key === 'x-frame-options') {
      continue;
    }
    if (stripBodyHeaders && (key === 'content-length' || key === 'content-encoding' || key === 'transfer-encoding')) continue;

    if (key === 'location') {
      res.setHeader(name, String(value).replace(TARGET_HOST_PATTERN, ''));
    } else if (key === 'set-cookie') {
      res.setHeader(name, value.map((cookie) => cookie.replace(/;\s*domain=[^;]+/i, '')));
    } else {
      res.setHeader(name, value);
    }
  }
}

const proxy = createProxyMiddleware({
  target: TARGET,
  changeOrigin: true,
  secure: true,
  ws: true,
  selfHandleResponse: true,
  logLevel: 'warn',
  onProxyReq(proxyReq) {
    proxyReq.removeHeader('x-forwarded-for');
    proxyReq.removeHeader('x-real-ip');
    proxyReq.removeHeader('via');
  },
  onProxyRes(proxyRes, req, res) {
    const contentType = proxyRes.headers['content-type'] || '';
    const isHtml = /text\/html/i.test(contentType);
    res.statusCode = proxyRes.statusCode;
    res.statusMessage = proxyRes.statusMessage;

    if (!REWRITABLE_TYPES.test(contentType)) {
      forwardHeaders(proxyRes, res, { stripBodyHeaders: false });
      proxyRes.pipe(res);
      return;
    }

    const chunks = [];
    proxyRes.on('data', (chunk) => chunks.push(chunk));
    proxyRes.on('end', () => {
      let body;
      try {
        const raw = decompress(Buffer.concat(chunks), proxyRes.headers['content-encoding']);
        let text = rewriteHostLinks(raw.toString('utf8'), siteOrigin(req));
        if (isHtml) text = injectCover(text);
        body = Buffer.from(text, 'utf8');
      } catch (error) {
        console.error('Failed to rewrite response:', error.message);
        forwardHeaders(proxyRes, res, { stripBodyHeaders: false });
        res.end(Buffer.concat(chunks));
        return;
      }
      forwardHeaders(proxyRes, res, { stripBodyHeaders: true });
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
});

app.use('/', proxy);

const port = process.env.PORT || 3000;
const server = app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
server.on('upgrade', proxy.upgrade);
