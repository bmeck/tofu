#!/usr/bin/env node
'use strict';
const USAGE = `
Usage: node dump.js <file>
Arguments:
  file              file which to analyze, if missing uses STDIN
Options:
  -h, --help        display this message
  --fn              parse with function semantics, will treat "this" as non-global
  --raw             outputs raw full scope details without summarizing
  --source-type     parse with specified goal. "module" and "script" are allowed
  --use-strict      parse with strict mode
  --var NAME        declare a variable name not to be treated as a free variable
  --no-locations
Environment:
  PARSE_OPTIONS     JSON for parse options to @babel/parse module
`;
const argv = require('minimist')(process.argv.slice(2));

if (argv.h || argv.help) {
  console.log(USAGE.trim());
  process.exit(0);
}

const fs = require('fs');

// see https://babeljs.io/docs/en/babel-parser#options
const parseOptions = process.env.PARSE_OPTIONS ?
  JSON.parse(process.env.PARSE_OPTIONS) :
  {};

const forceStrict = argv['use-strict'];
if (forceStrict) {
  parseOptions.strictMode = true;
}
const forceFunction = argv.fn;
if (forceFunction) {
  parseOptions.allowReturnOutsideFunction = true;
}
const sourceType = argv['source-type'];
if (typeof sourceType !== 'undefined') {
  if (!['module', 'script'].includes(sourceType)) {
    throw RangeError(`Expected a value of "module" or "script", got ${JSON.stringify(sourceType)}`);
  }
  parseOptions.sourceType = argv['source-type'];
}

// read in and buffer the source text before parsing
const input = argv._.length ?
  fs.openSync(argv._[0]) :
  process.stdin.fd;
fs.readFile(input, 'utf8', (err, body) => {
  if (err) throw err;

  const nonFreeVariables = () => [].concat(argv.var || []);
  const result = require('../index.js')(body, {
    parseOptions,
    forceFunction,
    forceStrict,
    nonFreeVariables
  });
  if (argv.r || argv.raw) {
    console.log(JSON.stringify(result.raw(), null, 2));
    return;
  }
  console.log(JSON.stringify(result.analyzed({
    loc: !(argv['no-locations'])
  }), null, 2));
});
