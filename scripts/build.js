#!/usr/bin/env node
const { mkdirSync, copyFileSync, existsSync } = require('fs');
const { join } = require('path');
const src = join(__dirname, '..', 'src');
const dist = join(__dirname, '..', 'dist');
const cp = require('child_process');
if (!existsSync(dist)) {
  mkdirSync(dist);
}
cp.execSync('cp -r src dist');
