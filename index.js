const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const dynogels = require('dynogels-promisified');
const Joi = require('joi');

const { createHash } = require('crypto');

const sha256 = str => createHash('sha256')
  .update(str)
  .digest('hex');

let AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, LOG_TABLE_NAME;
try {
  const res = fs.readJsonSync(path.join(__dirname, '.env.json')) || {};
  AWS_ACCESS_KEY_ID = res.AWS_ACCESS_KEY_ID;
  AWS_SECRET_ACCESS_KEY = res.AWS_SECRET_ACCESS_KEY;
  AWS_REGION = res.AWS_REGION;
  LOG_TABLE_NAME = res.LOG_TABLE_NAME;
  dynogels.AWS.config.update({
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
    region: AWS_REGION
  });
} catch(err) {
  console.log('No .env.json found');
}

let LogTable;

if(AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY && AWS_REGION && LOG_TABLE_NAME) {
  LogTable = dynogels.define(LOG_TABLE_NAME, {
    hashKey: '_id',
    rangeKey: 'time',
    timestamps: false,
    schema: {
      _id: Joi.string(),
      time: Joi.number(),
    },
  });
  dynogels.createTables(err => {
    if(err)
      return console.error(err);
  });
}

const publicDir = path.join(__dirname, 'public');
fs.ensureDirSync(publicDir);

const port = 3300;

express()
  .use(express.static(publicDir))
  .get('/ip', (req, res) => {
    try {
      const ip = req.headers['x-forwarded-for'];
      res.send(ip);
      if(ip)
        LogTable
          .createAsync({
            _id: sha256(ip),
            time: new Date().getTime()
          })
          .catch(console.error);
    } catch(err) {
      console.error(err);
      res.sendStatus(500);
    }
  })
  .listen(port, () => {
    console.log(`Server listening at port ${port}`);
    console.log(`Public folder: ${publicDir}`);
  });

