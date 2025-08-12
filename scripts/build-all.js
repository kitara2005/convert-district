#!/usr/bin/env node
const { execSync } = require('child_process');
const path = require('path');

function run(cmd) {
  execSync(cmd, { stdio: 'inherit', cwd: path.resolve(__dirname) });
}

run('node build-old-catalog.js');
run('node build-mapping.js');


