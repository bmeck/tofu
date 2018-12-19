'use strict';
const child_process = require('child_process');
const out = child_process.execSync('npm pack --dry-run --json --loglevel=silent');
const paths = JSON.parse(out)[0].files.map(f => f.path);

const path = require('path');
const ambient = new Set();
for (const file of paths) {
  const ret = child_process.spawnSync(process.execPath, [
    path.join(__dirname, './dump.js'),
    '--',
    file
  ], {
    encoding: 'UTF-8'
  });
  if (ret.status) {
    // not JS?
    continue;
  }
  const out = ret.output.filter(Boolean).join('');
  const {requires} = JSON.parse(out);
  for (const found of requires) {
    if (found.type !== 'static') {
      ambient.add('*');
    } else {
      const specifier = JSON.parse(found.specifier.value);
      ambient.add(specifier);
    }
  }
}
const {builtinModules} = require('module');
const aggregate = [...ambient.values()].reduce((acc, spec) => {
  if (spec === '*') {
    acc.dynamic = true;
  } if (builtinModules.includes(spec)) {
    acc.intrinsic.push(spec);
  } else {
    acc.provided.push(spec);
  }
  return acc;
}, {
  dynamic: false,
  intrinsic: [],
  provided: []
});
console.log(aggregate);