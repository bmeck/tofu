'use strict';
const child_process = require('child_process');
const fs = require('fs');
const rimraf = require('rimraf');

const path = require('path');
const out = child_process.execSync('npm i --dry-run --json --loglevel=silent');
{
  const {
    added,
    removed,
    updated,
    moved,
    failed,
  } = JSON.parse(out);
  const grants = JSON.parse(fs.readFileSync('tofu.json', 'utf8') || '{}');
  rimraf.sync('.tofu/');
  fs.mkdirSync('.tofu/', {
    recursive: true
  });
  console.dir(added, removed, updated, moved);
  for (const {name, version, path: addedPath} of added) {
    const tarball = child_process.execSync(`npm pack --loglevel=silent ${name}@${version}`, {
      cwd: '.tofu',
      encoding: 'UTF-8'
    }).trimRight();
    const tarOut = child_process.execSync(`tar -xzf ${tarball}`, {
      cwd: '.tofu',
      encoding: 'UTF-8'
    });
    fs.renameSync(
      path.join('.tofu', 'package'),
      path.join('.tofu', tarball.slice(0, -path.extname(tarball).length))
    );
    fs.unlinkSync(path.join('.tofu', tarball));
  }
}
const rrdir = require('rrdir');
const files = rrdir.sync('.tofu', {
  strict: true,
});
const paths = files.filter(f => !f.directory).map(f => f.path);
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