const express = require('express');
const fs = require('fs-extra');
const path = require('path');

const publicDir = path.join(__dirname, 'public');
fs.ensureDirSync(publicDir);

const port = 3300;

express()
  .use(express.static(publicDir))
  .get('/ip', (req, res) => {
    try {
      const ip = req.headers['x-forwarded-for'];
      res.send(ip);
    } catch(err) {
      console.error(err);
      res.sendStatus(500);
    }
  })
  .listen(port, () => {
    console.log(`Server listening at port ${port}`);
    console.log(`Public folder: ${publicDir}`);
  });

