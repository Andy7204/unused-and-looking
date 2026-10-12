#!/usr/bin/env node
const { Emailer } = require('../src/emailer');

function seedProducts() {
  return [{ id: 1, name: 'lonely heart mug', price: 12 }];
}

function seedUsersFromCsv(path) {
  const fs = require('fs');
  return fs.readFileSync(path, 'utf8').split('\n').map((line) => line.split(','));
}

console.log(seedProducts(), new Emailer('bot@shop.test'));
