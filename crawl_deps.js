'use strict';
const child_process = require('child_process');
const fs = require('fs');
const rimraf = require('rimraf');
const rrdir = require('rrdir');

const path = require('path');
const {builtinModules, createRequireFromPath} = require('module');
const out = child_process.execSync('npm i --dry-run --json --loglevel=silent');
{
  const {
    added,
    removed,
    updated,
    moved,
    failed,
  } = JSON.parse(out);
  if (failed && failed.length) {
    process.exit(1);
  }
  const grants = JSON.parse(fs.readFileSync('tofu.json', 'utf8') || '{}');
  rimraf.sync('.tofu/');
  fs.mkdirSync('.tofu/', {
    recursive: true
  });
  for (const {name, version, path: addedPath} of [...added, ...updated]) {
    const tarball = child_process.execSync(`npm pack --loglevel=silent ${name}@${version}`, {
      cwd: '.tofu',
      encoding: 'UTF-8'
    }).trimRight();
    const tarOut = child_process.execSync(`tar -xzf ${tarball}`, {
      cwd: '.tofu',
      encoding: 'UTF-8'
    });
    const pkgDir = path.join('.tofu', tarball.slice(0, -path.extname(tarball).length));
    fs.renameSync(
      path.join('.tofu', 'package'),
      pkgDir
    );
    fs.unlinkSync(path.join('.tofu', tarball));
    const files = rrdir.sync(pkgDir, {
      strict: true,
    });
    const paths = files.filter(f => !f.directory).map(f => f.path);
    // console.error(paths)

    // for skipping binding.gyp check
    let hasInstall = false;
    
    const scripts = Object.entries(
        JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'))).scripts
      )
      .filter(([k,v]) => [
        'preinstall',
        'install',
        'postinstall',
      ].includes(k)).reduce((acc, [k,v]) => {
        if (['preinstall', 'install',].includes(k)) {
          hasInstall = true;
        }
        acc[k] = v;
        return acc;
      }, {});

    if (!hasInstall) {
      const hasGyp = fs.existsSync(path.join(pkgDir, 'binding.gyp'));
      if (hasGyp) {
        scripts.install = 'node-gyp rebuild';
      }
    }
    const ambient = {  
      native: true,
      scripts,
    };
    const dependencies = {
      dynamic: true,
      bare: new Set(),
      intrinsic: new Set(),
      relative: new Set(),
    };
    for (const file of paths) {
      if (path.extname(file) === '.node') {
        ambient.native = true;
      }
      const ret = child_process.spawnSync(process.execPath, [
        path.join(__dirname, 'dump', 'dump.js'),
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
      const resolve = createRequireFromPath(
        path.join(process.cwd(), file)
      ).resolve;
      for (const found of requires) {
        if (found.type !== 'static') {
          dependencies.dynamic = true;
        } else {
          let specifier = JSON.parse(found.specifier.value);
          if (builtinModules.includes(specifier)) {
            dependencies.intrinsic.add(specifier);
          } else if (path.isAbsolute(specifier) ||
              new RegExp(`^..?${path.sep}`).test(specifier)) {
            specifier = resolve(specifier);
            dependencies.relative.add(path.relative(pkgDir, specifier));
          } else {
            // gonna go through node_modules
            dependencies.bare.add(specifier);
          }
        }
      }
    }
    dependencies.bare = [...dependencies.bare];
    dependencies.intrinsic = [...dependencies.intrinsic];
    dependencies.relative = [...dependencies.relative];
    console.log({
      name,
      version,
      ambient,
      dependencies,
    });
  }
}