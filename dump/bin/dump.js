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

/**
 * @typedef {import('babel-types').Node} ASTNode
 */
const {parse} = require('@babel/parser');
const walk = require('../walk');
const {NodePath} = require('../node_path');
const analyze = require('../analyze');

// see https://babeljs.io/docs/en/babel-parser#options
const parseOptions = process.env.PARSE_OPTIONS ?
  JSON.parse(process.env.PARSE_OPTIONS) :
  {};

// read in and buffer the source text before parsing
const body = [];
const input = argv._.length ?
  require('fs').createReadStream(argv._[0]) :
  process.stdin;
input.on('data', (data) => body.push(data));
input.on('end', () => {
  check(Buffer.concat(body).toString('utf8'));
});
const useStrict = argv['use-strict'];
if (useStrict) {
  parseOptions.strictMode = true;
}
const useFunction = argv.fn;
if (useFunction) {
  parseOptions.allowReturnOutsideFunction = true;
}
const sourceType = argv['source-type'];
if (typeof sourceType !== 'undefined') {
  if (!['module', 'script'].includes(sourceType)) {
    throw RangeError(`Expected a value of "module" or "script", got ${JSON.stringify(sourceType)}`);
  }
  parseOptions.sourceType = argv['source-type'];
}
const check = (body) => {
  /**
   * @type {NodePath<ASTNode>}
   */
  const root = NodePath.from(parse(body, parseOptions));
  const scopes = walk(root, undefined, {
    forceFunction: useFunction,
    nonFreeVariables: () => [].concat(argv.var || []),
    forceStrict: useStrict
  });
  scopes.resolveOperations();

  if (argv.r || argv.raw) {
    console.log(JSON.stringify(scopes, null, 2));
    process.exit(0);
  }

  console.log(JSON.stringify(analyze(scopes, {
    loc: !(argv['no-locations'])
  })));
}
