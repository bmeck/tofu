'use strict';
const {parse} = require('@babel/parser');
const {NodePath} = require('../../dump/node_path');
const walk = require('../../dump/walk');
const analyze = require('../../dump/analyze');
const explodeDelimiters = (pat) => {
  const delimiters = [
    '"',
    '\'',
    '`',
  ];
  return delimiters.map(d => {
    return pat.join(d);
  });
}
const requirePat = (specifier) => {
  return ['require(', specifier, ')'];
}
const generateStaticRequireCallExpectation = (specifier) => ({
  gets: [
    {
      purpose: 'Call'
    }
  ],
  requires: [
    {
      type:'static',
      specifier: {
        value: '"fs"'
      }
    }
  ],
});
const scaffoldFixture = (expected = []) => {
  let hadRequire = false;
  const require = {
    declares: [],
    gets: [],
    puts: [],
  };
  const fixture = {
    freeVariables: { },
    requires: [],
    imports: [],
  };
  for (const {
    declares = [],
    gets = [],
    puts = [],
    requires = [],
  } of expected) {
    hadRequire = true;
    require.declares.push(...declares);
    require.gets.push(...gets);
    require.puts.push(...puts);
    fixture.requires.push(...requires);
  }
  if (hadRequire) {
    fixture.freeVariables.require = require;
  }
  return fixture;
}
const DYNAMIC_REQUIRE_CALL_EXPECTATION = {
  gets: [{purpose: 'Call'}],
  requires: [{type: 'dynamic'}]
}
const binaryOps = [
  '+',
  '-',
  '%',
  '*',
  '/',
  '**',
  '||',
  '&&',
  '^',
  '|',
  '&',
  '<',
  '>',
  '==',
  '<=',
  '>=',
  '===',
  'instanceof',
];
const unaryOps = [
  '+',
  '-',
  '~',
  '!',
  'typeof',
  'void',
  'delete'
];
const FIXTURES = [
  {
    name: 'Empty',
    sourceTexts: [''],
    expected: scaffoldFixture()
  },
  {
    name: 'Line Comment',
    sourceTexts: ['// require(fs)'],
    expected: scaffoldFixture()
  },
  {
    name: 'Block Comment',
    sourceTexts: ['/* require(fs) */'],
    expected: scaffoldFixture()
  },
  {
    name: 'In Directive',
    sourceTexts: explodeDelimiters(['', 'require(fs)', '']),
    expected: scaffoldFixture()
  },
  {
    name: 'In String',
    sourceTexts: explodeDelimiters(['(', 'require(fs)', ')']),
    expected: scaffoldFixture()
  },
  {
    name: 'Expression Statement Static String',
    sourceTexts: explodeDelimiters(['require(','fs',')']),
    expected: scaffoldFixture([
      generateStaticRequireCallExpectation('fs')
    ])
  },
  {
    name: 'Expression Statement Dynamic String',
    sourceTexts: ['require("f" + "s")'],
    expected: scaffoldFixture([DYNAMIC_REQUIRE_CALL_EXPECTATION])
  },
  {
    name: 'Block Statement Dynamic String',
    sourceTexts: ['{require("f" + "s")}'],
    expected: scaffoldFixture([DYNAMIC_REQUIRE_CALL_EXPECTATION])
  },
  {
    name: 'Throw Statement Dynamic String',
    sourceTexts: ['throw require("f" + "s")'],
    expected: scaffoldFixture([DYNAMIC_REQUIRE_CALL_EXPECTATION])
  },
  {
    name: 'Return Statement Dynamic String',
    sourceTexts: ['() => {return require("f" + "s")}'],
    expected: scaffoldFixture([DYNAMIC_REQUIRE_CALL_EXPECTATION])
  },
  {
    name: 'Binary Expression Right Dynamic String',
    sourceTexts: binaryOps.map(s => `0 ${s} require("f" + "s")`),
    expected: scaffoldFixture([DYNAMIC_REQUIRE_CALL_EXPECTATION])
  },
  {
    name: 'Binary Expression Left Dynamic String',
    sourceTexts: binaryOps.map(s => `require("f" + "s") ${s} 1`),
    expected: scaffoldFixture([DYNAMIC_REQUIRE_CALL_EXPECTATION])
  },
  {
    name: 'Unary Expression Dynamic String',
    sourceTexts: unaryOps.map(s => `${s} require("f" + "s")`),
    expected: scaffoldFixture([DYNAMIC_REQUIRE_CALL_EXPECTATION])
  },
  {
    name: 'Conditional Expression Dynamic String',
    sourceTexts: ['require("f" + "s") ? 0 : 1'],
    expected: scaffoldFixture([DYNAMIC_REQUIRE_CALL_EXPECTATION])
  },
  {
    name: 'Sequential Expression Dynamic String',
    sourceTexts: ['(require("f" + "s"), 0)'],
    expected: scaffoldFixture([DYNAMIC_REQUIRE_CALL_EXPECTATION])
  },
  {
    name: 'Let init Dynamic String',
    sourceTexts: ['{let _ = require("f" + "s")}'],
    expected: scaffoldFixture([DYNAMIC_REQUIRE_CALL_EXPECTATION])
  },
  {
    name: 'Const init Dynamic String',
    sourceTexts: ['{const _ = require("f" + "s")}'],
    expected: scaffoldFixture([DYNAMIC_REQUIRE_CALL_EXPECTATION])
  },
  {
    name: 'Pattern init Dynamic String',
    sourceTexts: ['{const [_ = require("f" + "s")] = []}'],
    expected: scaffoldFixture([DYNAMIC_REQUIRE_CALL_EXPECTATION])
  },
  {
    name: 'Arrow fn body expression Dynamic String',
    sourceTexts: ['() => require("f" + "s")'],
    expected: scaffoldFixture([DYNAMIC_REQUIRE_CALL_EXPECTATION])
  },
  {
    name: 'Await expression Dynamic String',
    sourceTexts: ['async () => await require("f" + "s")'],
    expected: scaffoldFixture([DYNAMIC_REQUIRE_CALL_EXPECTATION])
  },
  {
    name: 'Yield expression Dynamic String',
    sourceTexts: ['(function* () {yield require("f" + "s")})'],
    expected: scaffoldFixture([DYNAMIC_REQUIRE_CALL_EXPECTATION])
  },
  {
    name: 'Import expression Dynamic String',
    sourceTexts: ['import(require("f" + "s"))'],
    expected: {
      ...scaffoldFixture([DYNAMIC_REQUIRE_CALL_EXPECTATION]),
      imports: [
        {names: ['*'], type: 'dynamic'}
      ]
    }
  },
  {
    name: 'Super expression Dynamic String',
    sourceTexts: ['(class {constructor() { super(require("f" + "s")) }})'],
    expected: scaffoldFixture([DYNAMIC_REQUIRE_CALL_EXPECTATION])
  },
  {
    name: 'Calculated member expression Dynamic String',
    sourceTexts: ['{let x;x[require("f" + "s")]}'],
    expected: scaffoldFixture([DYNAMIC_REQUIRE_CALL_EXPECTATION])
  },
  {
    name: 'Variable init',
    sourceTexts: ['{let x = require("f" + "s")}'],
    expected: scaffoldFixture([DYNAMIC_REQUIRE_CALL_EXPECTATION])
  },
  {
    name: 'Array Literal',
    sourceTexts: ['[require("f" + "s")]'],
    expected: scaffoldFixture([DYNAMIC_REQUIRE_CALL_EXPECTATION])
  },
  {
    name: 'Array Spread value',
    sourceTexts: ['([...require("f" + "s")])'],
    expected: scaffoldFixture([DYNAMIC_REQUIRE_CALL_EXPECTATION])
  },
  {
    name: 'Object Literal key',
    sourceTexts: ['({"require(fs)": {}})'],
    expected: scaffoldFixture()
  },
  {
    name: 'Object Literal computed key',
    sourceTexts: ['({[require("f" + "s")]: {}})'],
    expected: scaffoldFixture([DYNAMIC_REQUIRE_CALL_EXPECTATION])
  },
  {
    name: 'Object Literal value',
    sourceTexts: ['({"": [require("f" + "s")]})'],
    expected: scaffoldFixture([DYNAMIC_REQUIRE_CALL_EXPECTATION])
  },
  {
    name: 'Object Spread value',
    sourceTexts: ['({...require("f" + "s")})'],
    expected: scaffoldFixture([DYNAMIC_REQUIRE_CALL_EXPECTATION])
  },
  {
    name: 'Parameter value',
    sourceTexts: ['(() => {})(require("f" + "s"))'],
    expected: scaffoldFixture([DYNAMIC_REQUIRE_CALL_EXPECTATION])
  },
  {
    name: 'Parameter Spread value',
    sourceTexts: ['(() => {})(...require("f" + "s"))'],
    expected: scaffoldFixture([DYNAMIC_REQUIRE_CALL_EXPECTATION])
  },
  {
    name: 'JSX value',
    sourceTexts: ['{let a;<a>{require("f" + "s")}</a>}'],
    expected: scaffoldFixture([DYNAMIC_REQUIRE_CALL_EXPECTATION])
  },
  {
    name: 'JSX Attribute value',
    sourceTexts: ['{let a;<a href={require("f" + "s")}></a>}'],
    expected: scaffoldFixture([DYNAMIC_REQUIRE_CALL_EXPECTATION])
  },
  {
    name: 'JSX Attribute string',
    sourceTexts: [`{let a;<a href="require(fs)"></a>}`],
    expected: scaffoldFixture()
  },
];

const assert = require('assert');
for (let {
  name,
  sourceTexts,
  expected,
  parseOptions = {
    plugins: [
      'dynamicImport',
      'jsx'
    ]
  }
} of FIXTURES) {
  // console.error(name)
  if (typeof sourceTexts === 'function') {
    sourceTexts = sourceTexts();
  }
  for (const text of sourceTexts) {
    const root = NodePath.from(parse(text, parseOptions));
    const scopes = walk(root);
    scopes.resolveOperations();
    const result = JSON.parse(JSON.stringify(analyze(scopes, {loc: false})));
    try {
      assert.deepStrictEqual(result, expected);
    } catch (e) {
      e.message = `Test: ${name}, Text: ${text}\n${e.message}`;
      throw e;
    }
  }
}