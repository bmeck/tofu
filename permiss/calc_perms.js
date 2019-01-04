// from a directory given
// generate a structure that aggregates all permissions with backrefs
// /app/node_modules/foo using fs / globals
// save to .tofu.json for speedy cache purposes
//
// usage: node calc_perms.js --dir $DIR
//
// if modified, please rerun using `--no-cache`
// if wanting to avoid integrity folding, use `--no-integrity-folding`
'use strict';
const {spawn} = require('child_process');
const PQueue = require('p-queue');
const fs = require('fs');
const rrdir = require('rrdir');
const { promisify } = require('util');
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const exists = promisify(fs.exists);
const realpath = promisify(fs.realpath);
const {createHash} = require('crypto')
const {AuthorityUsage} = require('./authority');

const {basename, dirname, extname, join, relative, sep} = require('path');

const argv = require('minimist')(process.argv.slice(2), {
  boolean: ['cache', 'integrity-folding', ],
  default: {
    cache: true,
    'integrity-folding': true,
    'intrinsics': 'skip',
  }
});
const dir = argv.dir || process.cwd();

const INSTALL_SCRIPTS = new Set(['preinstall', 'install', 'postinstall']);
const NODE_GYP_SKIPPED_IF_HAS_SCRIPTS = new Set(['preinstall', 'install']);
const BUILTIN_MODULES = new Set(require('module').builtinModules);

const OK_GETS = new Set(['TypeOf', 'Identity']);
async function run() {
  let original;
  try {
    original = new Map(Object.entries(JSON.parse(await readFile('.tofu.json'))));
  } catch (e) {
    original = new Map();
  }
  const totality = new Map();
  const files = await rrdir(dir, {
    strict: true,
  });
  const integritiesFound = new Map();
  const integrityCollisions = new Map();
  const paths = files.filter(f => !f.directory);
  async function processPackageJSON(src, sourceFilename) {
    let willUseNodeGypByDefault = true;
    // righteous anger if it isn't JSON
    const scripts = JSON.parse(src.toString('utf8')).scripts;
    let installScripts = {__proto__: null};
    if (scripts && typeof scripts === 'object') {
      installScripts = Object.entries(scripts).filter(
        ([k]) => {
          if (NODE_GYP_SKIPPED_IF_HAS_SCRIPTS.has(k)) {
            willUseNodeGypByDefault = false;
          }
          return INSTALL_SCRIPTS.has(k)
        }
      ).reduce((acc, [k, v]) => {
        acc[k] = v;
        return acc;
      }, {
        __proto__: null
      });

      // should this just be a separate processor?
      if (willUseNodeGypByDefault) {
        const hasGyp = await exists(join(sourceFilename, '..', 'binding.gyp'));
        if (hasGyp) {
          installScripts.install = 'node-gyp rebuild';
        }
      }
    }
    return {
      deps: [],
      syscalls: Object.keys(installScripts).length !== 0,
      variables: [],
      mime: 'application/json'
    }
  }
  const concurrency = Math.max(1, require('os').cpus().length - 1);
  const queue = new PQueue({
    concurrency
  });
  async function processSourceText(src, sourceFilename) {
    if (/^#!/.test(src.slice(0, 2).toString('utf8'))) {
      // has a hashbang, be wary?
    }
    return new Promise((f, r) => {
      queue.add(async () => {
        const child = spawn(process.execPath, [
          join(__dirname, '..', 'dump', 'bin', 'dump.js'),
          '--fn',
          '--var', 'this',
          '--no-locations'
        ], {
          env: {
            PARSE_OPTIONS: JSON.stringify({
              sourceType: 'script',
              allowImportExportEverywhere: true,
              allowReturnOutsideFunction: true,
              sourceFilename,
              plugins: ['jsx', 'typescript', 'importMeta', 'dynamicImport']
            })
          },
          stdio: "pipe"
        })
        child.on('error', r);
        const [code, buffer] = await Promise.all([
          new Promise((f, r) => {
            child.on('exit', (code) => {
              f(code);
            });
          }),
          new Promise(f => {
            const bufs = [];
            let len = 0;
            child.stdin.end(src);
            child.stdout.on('data', d => {
              bufs.push(d);
              len += d.byteLength;
            });
            child.stdout.on('end', () => {
              f(Buffer.concat(bufs, len));
            });
          })
        ]);
        const deps = new Set();
        if (code === 0) {
          const body = buffer.toString('utf8');
          const output = JSON.parse(body);
          const reqs = output.requires;
          for (const req of reqs) {
            if (req.type === 'dynamic') {
              deps.clear();
              deps.add('*');
              break;
            } else {
              const spec = JSON.parse(req.specifier.value);
              if (BUILTIN_MODULES.has(spec)) {
                deps.add(spec);
              } else {
                // TODO
                // resolve and setup backref
              }
            }
          }
          f({
            deps: [...deps],
            syscalls: false,
            variables: Object.keys(output.freeVariables).reduce(
              (acc, k) => {
                if (output.freeVariables[k].puts.length !== 0) return acc;
                // if everything is just simple id/typeof, skip free variable
                if (output.freeVariables[k].gets.every(g => OK_GETS.has(g.purpose))) {
                  return acc;
                }
                acc.push(k);
                return acc;
              },
              []
            ),
            mime: 'application/node'
          });
        }
        f({
          deps: [],
          syscalls: false,
          variables: [],
          mime: 'application/octet-stream'
        });
      });
    })
  }
  function updateTotality(path, fields) {
    if (!totality.has(path)) {
      totality.set(path, {
      });
    }
    totality.set(path, {...totality.get(path), ...fields});
  }
  const packagePaths = new Set();
  const tasks = new PQueue();
  const symlinks = new Map();
  for (const {path, symlink} of paths) {
    tasks.add(async () => {
      if (symlink) {
        const real = relative(dir, await realpath(path)).replace(/^\.\//, '');
        symlinks.set(path, real);
        return;
      }
      const filename = basename(path);
      const body = await readFile(path);
      const hasher = createHash('sha256');
      hasher.update(body);
      if (filename === 'package.json') {
        packagePaths.add(dirname(path));
      }
      const integrity = `sha256-${hasher.digest('base64')}`;
      if (!!argv['integrity-folding'] && integritiesFound.has(integrity)) {
        integrityCollisions.set(path, integritiesFound.get(integrity));
        return;
      }
      if (!!argv['cache']) {
        if (original.has(path)) {
          const old = original.get(path);
          integritiesFound.set(integrity, path);
          if (old.integrity === integrity) {
            updateTotality(path, old);
            return;
          }
        }
      }
      integritiesFound.set(integrity, path);
      updateTotality(path, {
        integrity
      });
      if (filename === 'package.json') {
        updateTotality(path, await processPackageJSON(body, path));
        return;
      } 
      const extension = extname(filename);
      if (extension === '.node') {
        updateTotality(path, {
          deps: [],
          syscalls: true,
          variables: [],
          mime: 'application/vnd.nodejs.node'
        });
      } else if (extension === '.json') {
        updateTotality(path, {
          deps: [],
          syscalls: false,
          variables: [],
          mime: 'application/json'
        });
      } else {
        updateTotality(path, await processSourceText(body, path));
      }
    });
  }
  await tasks.onIdle();
  integritiesFound.clear();
  for (const [collision, analyzedPath] of integrityCollisions.entries()) {
    totality.set(collision, totality.get(analyzedPath));
  }
  for (const [link, real] of symlinks.entries()) {
    totality.set(link, totality.get(real));
  }
  const packageAggregates = new Map();
  for (let [path, currentPerms] of totality.entries()) {
    if (symlinks.has(path)) {
      path = symlinks.get(path);
    }
    let pkg = path;
    while (pkg && !packagePaths.has(pkg)) {
      pkg = pkg.slice(0, Math.max(0, pkg.lastIndexOf(sep)));
    }
    if (!packageAggregates.has(pkg)) {
      packageAggregates.set(pkg, new AuthorityUsage());
    }
    packageAggregates.get(pkg).merge(currentPerms);
    // // TODO, summarize on a per package basis rather than per resource
    // for (const dep of currentPerms.deps) {
    //   aggregate.deps.add(dep);
    // }
    // aggregate.syscalls = aggregate.syscalls || currentPerms.syscalls;
    // for (const binding of currentPerms.variables) {
    //   aggregate.globals.add(binding);
    // }
    // if (!argv['no-cache'] && original.has(path)) {
    //   const oldPerms = original.get(path);
    //   if (currentPerms.integrity === oldPerms.integrity) {
    //     // nothing updated
    //     continue;
    //   }
    //   if (
    //     currentPerms.syscalls !== oldPerms.syscalls ||
    //     !currentPerms.deps.every(d => oldPerms.deps.includes(d))
    //   ) {
    //     // console.log('AUTHORITY USAGE ADDED FOR EXISTING RESOURCE:', path);
    //     // console.log('old deps:', oldPerms.deps.filter(d => currentPerms.deps.includes(d)));
    //     // console.log('new deps:', currentPerms.deps.filter(d => oldPerms.deps.includes(d) === false));
    //     // console.log('removed deps: ', oldPerms.deps.filter(d => currentPerms.deps.includes(d) === false));
    //     // console.log('uses arbitrary syscalls:', currentPerms.syscalls);
    //     // console.log('global variables:', currentPerms.variables);
    //     // console.log('----');
    //   }
    //   continue;
    // }
    // console.log('AUTHORITY USAGE FOR NEW RESOURCE:', path);
    // console.log('new deps:', currentPerms.deps);
    // console.log('uses arbitrary syscalls:', currentPerms.syscalls);
    // console.log('global variables:', currentPerms.variables);
    // console.log('----');
  }
  const summary = {
    deps: new Map(),
    syscalls: [],
    variables: new Map(),
  };
  const intrinsicVariables = new Set(require('vm').runInNewContext('Object.keys(Object.getOwnPropertyDescriptors(this))'))
  for (const [pkgName, usage] of packageAggregates.entries()) {
    if (usage.syscalls) {
      summary.syscalls.push(pkgName);
    }
    for (const dep of usage.deps) {
      if (!summary.deps.has(dep)) summary.deps.set(dep, []);
      summary.deps.get(dep).push(pkgName);
    }
    for (const variable of usage.variables) {
      if (argv['intrinsics'] === 'skip' && intrinsicVariables.has(variable)) {
        continue;
      }
      if (!summary.variables.has(variable)) summary.variables.set(variable, []);
      summary.variables.get(variable).push(pkgName);
    }
  }
  console.dir(summary, {colors: true, depth: null});
  // console.log('Finished aggregating authority for', totality.size, 'resources');
  const newTOFU = [
    ...totality.entries()
  ].reduce((acc, [k,v]) => {acc[k] = v; return acc;}, {});
  writeFile('.tofu.json', JSON.stringify(newTOFU, null, 2));
}
run();
