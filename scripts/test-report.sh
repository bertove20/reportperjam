#!/bin/bash
cd /var/www/html/reportperjam
echo "Testing report send..."
node --env-file=.env -e "
const { sendPhoto } = require('./src/tim/tim-sender.js');
const groupId = process.env.TG_REPORT_GROUP;
const token = process.env.TG_BOT_TOKEN;
console.log('Group ID:', groupId);
console.log('Token:', token ? 'OK' : 'MISSING');
" 2>&1
