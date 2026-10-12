const express = require('express');
const path = require('path');

const app = express();

app.use('/ixl.png', express.static(path.join(__dirname, 'public', 'ixl.png')));

function siteOrigin(req) {
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

app.get('*', (req, res) => {
  const origin = siteOrigin(req);
  const cover = `${origin}/ixl.png`;
  res.send(`
    <!doctype html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>IXL | Math, Language Arts, Science, Social Studies, and Spanish</title>
        <link rel="icon" href="https://www.ixl.com/favicon.ico" />

        <meta property="og:title" content="My Site" />
        <meta property="og:description" content="My site description" />
        <meta property="og:image" content="${cover}" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="${origin}${req.path}" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="${cover}" />

        <style>
          html, body { margin: 0; height: 100%; }
          #intro {
            position: fixed;
            inset: 0;
            z-index: 10;
            background: #fff url('/ixl.png') top center / cover no-repeat;
            transition: opacity 1.2s ease, transform 1.2s ease, filter 1.2s ease;
          }
          #intro.hide {
            opacity: 0;
            transform: scale(1.04);
            filter: blur(6px);
            pointer-events: none;
          }
          #content {
            opacity: 0;
            transition: opacity 1.2s ease 0.3s;
          }
          #content.show { opacity: 1; }
          @media (prefers-reduced-motion: reduce) {
            #intro, #content { transition: opacity 0.3s linear; }
            #intro.hide { transform: none; filter: none; }
          }
        </style>
      </head>
      <body>
        <div id="intro" aria-hidden="true"></div>

        <div id="content">
          <h1>My Site</h1>
        </div>

        <script>
          setTimeout(function () {
            var intro = document.getElementById('intro');
            intro.classList.add('hide');
            document.getElementById('content').classList.add('show');
            document.title = 'My Site';
            intro.addEventListener('transitionend', function () { intro.remove(); }, { once: true });
          }, 5000);
        </script>
      </body>
    </html>
  `);
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
