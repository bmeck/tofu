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
  'delete',
];
const FIXTURES = [
  {
    name: 'Empty',
    sourceTexts: [''],
    expected: scaffoldFixture()
  },
  {
    name: 'Non-call get',
    sourceTexts: ['require'],
    expected: ((s) => {
      s.freeVariables.require = {
        declares: [],
        gets: [{
          purpose: 'ComplexReified'
        }],
        puts: []
      };
      return s;
    })(scaffoldFixture())
  },
  {
    name: 'Non-call member',
    sourceTexts: ['require.extensions'],
    expected: ((s) => {
      s.freeVariables.require = {
        declares: [],
        gets: [{
          purpose: 'ComplexReified'
        }],
        puts: []
      };
      return s;
    })(scaffoldFixture())
  },
  {
    name: 'Import Specifier',
    sourceTexts: ['import "require(fs)"'],
    expected: {
      freeVariables: {},
      requires: [],
      imports: [
        {
          names: [], specifier: {
            value: JSON.stringify("require(fs)")
          }, type: 'static'
        }
      ]
    },
    parseOptions: {
      sourceType: 'module'
    }
  },
  {
    name: 'Named Export From Specifier',
    sourceTexts: ['export {_} from "require(fs)"'],
    expected: {
      freeVariables: {},
      requires: [],
      imports: [
        {
          names: ['_'], specifier: {
            value: JSON.stringify("require(fs)")
          }, type: 'static'
        }
      ]
    },
    parseOptions: {
      sourceType: 'module'
    }
  },
  {
    name: 'Export Star From Specifier',
    sourceTexts: ['export * from "require(fs)"'],
    expected: {
      freeVariables: {},
      requires: [],
      imports: [
        {
          names: ['*'], specifier: {
            value: JSON.stringify("require(fs)")
          }, type: 'static'
        }
      ]
    },
    parseOptions: {
      sourceType: 'module'
    }
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
    name: 'RegExp',
    sourceTexts: ['/require(fs)/'],
    expected: scaffoldFixture()
  },
  {
    name: 'Static MemberExpression',
    sourceTexts: ['({}.require("fs"))'],
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
    name: 'Shadowed',
    sourceTexts: ['{let require; require("fs");}'],
    expected: scaffoldFixture()
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
    name: 'With Statement Object Dynamic String',
    sourceTexts: ['with(require("f" + "s")) {}'],
    expected: scaffoldFixture([DYNAMIC_REQUIRE_CALL_EXPECTATION])
  },
  {
    name: 'Eval Argument Dynamic String',
    sourceTexts: ['eval(require("f" + "s"))'],
    expected: ((s) => {
      s.freeVariables.eval = {
        declares: [],
        gets: [{
          purpose: 'Call'
        }],
        puts: []
      };
      return s;
    })(scaffoldFixture([DYNAMIC_REQUIRE_CALL_EXPECTATION]))
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
    name: 'New expression Dynamic String',
    sourceTexts: ['new require("f" + "s")'],
    expected: ((s) => {
      s = JSON.parse(JSON.stringify(s));
      s.freeVariables.require.gets[0].purpose = 'Construct';
      return s;
    })(scaffoldFixture([DYNAMIC_REQUIRE_CALL_EXPECTATION]))
  },
  {
    name: 'Extends class expression Dynamic String',
    sourceTexts: ['(class extends require("f" + "s") {})'],
    expected: scaffoldFixture([DYNAMIC_REQUIRE_CALL_EXPECTATION])
  },
  {
    name: 'Extends class declaration Dynamic String',
    sourceTexts: ['{class Foo extends require("f" + "s") {}}'],
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
    name: 'Template Tag',
    sourceTexts: ['require("f" + "s")``'],
    expected: scaffoldFixture([DYNAMIC_REQUIRE_CALL_EXPECTATION])
  },
  {
    name: 'Template Value',
    sourceTexts: ['`${require("f" + "s")}`'],
    expected: scaffoldFixture([DYNAMIC_REQUIRE_CALL_EXPECTATION])
  },
  {
    name: 'Do While Test',
    sourceTexts: ['do {} while(require("f" + "s"))'],
    expected: scaffoldFixture([DYNAMIC_REQUIRE_CALL_EXPECTATION])
  },
  {
    name: 'While Test',
    sourceTexts: ['while(require("f" + "s")) {}'],
    expected: scaffoldFixture([DYNAMIC_REQUIRE_CALL_EXPECTATION])
  },
  {
    name: 'For Var Init',
    sourceTexts: ['for(let _ = require("f" + "s");;) {}'],
    expected: scaffoldFixture([DYNAMIC_REQUIRE_CALL_EXPECTATION])
  },
  {
    name: 'For Init',
    sourceTexts: ['for(require("f" + "s");;) {}'],
    expected: scaffoldFixture([DYNAMIC_REQUIRE_CALL_EXPECTATION])
  },
  {
    name: 'For Test',
    sourceTexts: ['for(;require("f" + "s");) {}'],
    expected: scaffoldFixture([DYNAMIC_REQUIRE_CALL_EXPECTATION])
  },
  {
    name: 'For Update',
    sourceTexts: ['for(;;require("f" + "s")) {}'],
    expected: scaffoldFixture([DYNAMIC_REQUIRE_CALL_EXPECTATION])
  },
  {
    name: 'For In Object Bare Binding Block',
    sourceTexts: ['for(eval in require("f" + "s")) {}'],
    expected:  ((s) => {
      s.freeVariables.eval = {
        declares: [],
        gets: [],
        puts: [{}]
      };
      return s;
    })(scaffoldFixture([DYNAMIC_REQUIRE_CALL_EXPECTATION]))
  },
  {
    name: 'For In Object Block',
    sourceTexts: ['for(let x in require("f" + "s")) {}'],
    expected: scaffoldFixture([DYNAMIC_REQUIRE_CALL_EXPECTATION])
  },
  {
    name: 'For In Object Empty',
    sourceTexts: ['for(let x in require("f" + "s"));'],
    expected: scaffoldFixture([DYNAMIC_REQUIRE_CALL_EXPECTATION])
  },
  {
    name: 'For Of Object Bare Binding Block',
    sourceTexts: ['for(eval of require("f" + "s")) {}'],
    expected:  ((s) => {
      s.freeVariables.eval = {
        declares: [],
        gets: [],
        puts: [{}]
      };
      return s;
    })(scaffoldFixture([DYNAMIC_REQUIRE_CALL_EXPECTATION]))
  },
  {
    name: 'For Of Object Block',
    sourceTexts: ['for(let x of require("f" + "s")) {}'],
    expected: scaffoldFixture([DYNAMIC_REQUIRE_CALL_EXPECTATION])
  },
  {
    name: 'For Of Object Empty',
    sourceTexts: ['for(let x of require("f" + "s"));'],
    expected: scaffoldFixture([DYNAMIC_REQUIRE_CALL_EXPECTATION])
  },
  {
    name: 'Switch Test',
    sourceTexts: ['switch(require("f" + "s")) {}'],
    expected: scaffoldFixture([DYNAMIC_REQUIRE_CALL_EXPECTATION])
  },
  {
    name: 'Case Test',
    sourceTexts: ['switch([]) {case require("f" + "s"): {}}'],
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
let ran = 0;
describe('Should detect require() dependencies', () => {
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
    test(name, () => {
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
          ran++;
          expect(result).toEqual(expected)
          ;(result, expected);
        } catch (e) {
          e.message = `Test: ${name}, Text: ${text}\n${e.message}`;
          throw e;
        }
      }
    });
  }
});
