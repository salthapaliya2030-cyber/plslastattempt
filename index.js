const express = require('express');
const path = require('path');

const app = express();

app.use('/cover.jpg', express.static(path.join(__dirname, 'public', 'cover.jpg')));

app.get('/', (req, res) => {
  res.send(`
    <!doctype html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>My Site</title>

        <meta property="og:title" content="My Site" />
        <meta property="og:description" content="My site description" />
        <meta property="og:image" content="https://idkwhatdoyouthink.vercel.app/cover.jpg" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://idkwhatdoyouthink.vercel.app" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://idkwhatdoyouthink.vercel.app/cover.jpg" />
      </head>
      <body>
        <h1>My Site</h1>
      </body>
    </html>
  `);
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
