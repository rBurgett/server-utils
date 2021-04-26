const fs = require('fs-extra');
const path = require('path');
const dynogels = require('dynogels-promisified');
const Joi = require('joi');
const dayjs = require('dayjs');
const { Map, Set } = require('immutable');
const CronJob = require('cron').CronJob;

const getUniqueCount = arr => arr
  .map(a => [...a[1].values()])
  .reduce((arr, set) => arr.concat([...set.values()]), [])
  .reduce((set, hash) => set.add(hash), Set())
  .size;

const sendLogNotification = async function() {
  try {

    const res = await fs.readJsonSync(path.join(__dirname, '.env.json'));

    const { AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, LOG_TABLE_NAME, LOG_TOPIC_ARN } = res;

    dynogels.AWS.config.update({
      accessKeyId: AWS_ACCESS_KEY_ID,
      secretAccessKey: AWS_SECRET_ACCESS_KEY,
      region: AWS_REGION
    });

    const sns = new dynogels.AWS.SNS();

    const LogTable = dynogels.define(LOG_TABLE_NAME, {
      hashKey: '_id',
      rangeKey: 'time',
      timestamps: false,
      schema: {
        _id: Joi.string(),
        time: Joi.number(),
      },
    });

    await new Promise((resolve, reject) => {
      dynogels.createTables(err => {
        if(err)
          reject(err);
        else
          resolve();
      });
    });

    const now = dayjs()
      .hour(0)
      .minute(0)
      .second(0)
      .millisecond(0);
    const sevenDaysAgo = now
      .subtract(7, 'day');
    const thirtyDaysAgo = now
      .subtract(30, 'days');

    const { Items } = await LogTable
      .scan()
      .loadAll()
      .where('time').gte(thirtyDaysAgo.valueOf())
      .where('time').lt(now.valueOf())
      .execAsync();
    const items = Items
      .map(i => i.attrs);

    let days = Map();
    for(let i = 1; i < 31; i++) {
      days = days.set(now.subtract(i, 'day').valueOf(), Set());
    }

    for(const {_id, time} of items) {
      const startOfDay = dayjs(time)
        .hour(0)
        .minute(0)
        .second(0)
        .millisecond(0)
        .valueOf();
      if(days.has(startOfDay)) {
        days = days.set(startOfDay, days.get(startOfDay).add(_id));
      } else {
        days = days.set(startOfDay, Set([_id]));
      }
    }

    const lastThirtyDays = [...days.entries()]
      .sort((a, b) => a[0] === b[0] ? 0 : a[0] > b[0] ? -1 : 1);
    const lastSevenDays = lastThirtyDays
      .slice(0, 7);
    const lastDay = lastThirtyDays
      .slice(0, 1);

    let message = `Date:\n${dayjs().format('YYYY-MM-DD')}\n\nUnique IP address checks in the last day:\n`;

    message += lastDay[0][1].size;

    message += '\n\nUnique IP address checks in the last seven days:\n';

    message += getUniqueCount(lastSevenDays);

    message += '\n\nUnique IP address checks in the last thirty days:\n';

    message += getUniqueCount(lastThirtyDays);

    message += '\n';

    sns.publish({
      TopicArn: LOG_TOPIC_ARN,
      Subject: 'IP Check Visits Log',
      Message: message,
    }, err => {
      if(err) console.error(err);
    });

  } catch(err) {
    console.error(err);
  }
}

new CronJob('0 0 0 * * *', () => {
  sendLogNotification();
}, null, true, 'America/New_York');
