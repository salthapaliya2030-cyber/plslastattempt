const express = require('express');
const path = require('path');
const { createProxyMiddleware, responseInterceptor } = require('http-proxy-middleware');

const app = express();

const nggUrl = 'https://mathsspot.com';
const INTRO_SECONDS = 5;

const introSnippet = `
<style id="ixl-intro-style">
  #ixl-intro {
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    background: #fff url('/__intro/ixl.png') top center / cover no-repeat;
    transition: opacity 1.2s ease, transform 1.2s ease, filter 1.2s ease;
  }
  #ixl-intro.hide {
    opacity: 0;
    transform: scale(1.04);
    filter: blur(6px);
    pointer-events: none;
  }
  @media (prefers-reduced-motion: reduce) {
    #ixl-intro { transition: opacity 0.3s linear; }
    #ixl-intro.hide { transform: none; filter: none; }
  }
</style>
<div id="ixl-intro" aria-hidden="true"></div>
<script>
  (function () {
    var intro = document.getElementById('ixl-intro');
    setTimeout(function () {
      intro.classList.add('hide');
      setTimeout(function () { intro.remove(); }, 1500);
    }, ${INTRO_SECONDS * 1000});
  })();
</script>
`;

app.use('/__intro/ixl.png', express.static(path.join(__dirname, 'public', 'ixl.png')));
app.use('/public', express.static(path.join(__dirname, 'public')));

const proxy = createProxyMiddleware({
  target: nggUrl,
  changeOrigin: true,
  secure: true,
  logLevel: 'debug',
  selfHandleResponse: true,
  router: function (req) {
    if (req.headers.host === 'mathsspot.com') {
      req.headers['X-Forwarded-For'] = '';
      req.headers['X-Real-IP'] = '';
      req.headers['Via'] = '';
    }
    return nggUrl;
  },
  onProxyRes: responseInterceptor(async (buffer, proxyRes, req, res) => {
    const isHtml = (proxyRes.headers['content-type'] || '').includes('text/html');
    const isPageLoad = req.method === 'GET' && req.path === '/';
    if (!isHtml || !isPageLoad) return buffer;

    res.removeHeader('content-security-policy');
    res.removeHeader('content-security-policy-report-only');

    const html = buffer.toString('utf8');
    if (/<body[^>]*>/i.test(html)) {
      return html.replace(/<body[^>]*>/i, (tag) => tag + introSnippet);
    }
    return introSnippet + html;
  }),
});

app.use('/', proxy);

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`CybriaGG is running on port ${port}`);
});
