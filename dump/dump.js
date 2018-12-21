'use strict';
const USAGE = `
Usage: node dump.js <file>
Arguments:
  file              file which to analyze, if missing uses STDIN
Options:
  -h, --help        display this message
Environment:
  PARSE_OPTIONS     JSON object for parse options to @babel/parse module
`;
const {parse} = require('@babel/parser');
const walk = require('./walk');
const {NodePath} = require('./node_path');
const analyze = require('./analyze');
const argv = require('minimist')(process.argv.slice(2));

if (argv.h || argv.help) {
  console.log(USAGE.trim());
  process.exit(0);
}

// see https://babeljs.io/docs/en/babel-parser#options
const parseOptions = process.env.PARSE_OPTIONS ?
  JSON.parse(process.env.PARSE_OPTIONS) :
  {};

// read in and buffer the source text before parsing
let body = [];
const input = argv._.length ?
  require('fs').createReadStream(argv._[0]) :
  process.stdin;
input.on('data', (data) => body.push(data));
input.on('end', () => {
  check(Buffer.concat(body).toString('utf8'));
});
const check = (body) => {
  const root = NodePath.from(parse(body, parseOptions));
  const scopes = walk(root);
  scopes.resolveOperations();

  if (argv.r || argv.raw) {
    console.log(JSON.stringify(scopes, null, 2));
    process.exit(0);
  }

  console.log(JSON.stringify(analyze(scopes)));
}
