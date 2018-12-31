// WIP...
'use strict';
const { stringify: JSON_stringify } = JSON;
const path = require('path');

const stringForms = str => {
  const middle = JSON_stringify(str)
    .slice(1, -1)
    .replace(/'|`/g, '\\$&');
  return [`'${middle}'`, `"${middle}"`, `\`${middle}\``];
};
const AN_ABSOLUTE_PATH = process.cwd();
const AN_ABSOLUTE_URL = Object.assign(new URL('file:///'), {
  pathname: AN_ABSOLUTE_PATH,
}).href;
const A_CONTEXTUAL_PATH = `./${Math.random()}`;
const AN_EXTERIOR_PATH = path.join('..', `${Math.random()}`);
const A_DEEP_BARE_PATH = `_/${Math.random()}`;
const A_BARE_PATH = `_`;
const WRAP_WITH_REQUIRE = str => `require(${str})`;
const STATIC_REQUIRE_FIXTURES = raw => {
  return Array.from(
    stringForms(raw),
    cooked => new RequireFixture(raw, cooked, true)
  );
};
class RequireFixture {
  constructor(raw, cooked, isStatic = false) {
    this.isStatic = false;
    this.raw = raw;
    this.cooked = cooked;
    if (!isStatic && raw !== cooked) {
      throw new TypeError(
        `dynamic require() fixtures must have matching raw and cooked forms`
      );
    }
    this.code = WRAP_WITH_REQUIRE(cooked);
  }
}
const generateRequires = () => {
  return [
    ...STATIC_REQUIRE_FIXTURES(AN_ABSOLUTE_PATH),
    ...STATIC_REQUIRE_FIXTURES(AN_ABSOLUTE_URL),
    ...STATIC_REQUIRE_FIXTURES(A_CONTEXTUAL_PATH),
    ...STATIC_REQUIRE_FIXTURES(AN_EXTERIOR_PATH),
    ...STATIC_REQUIRE_FIXTURES(A_BARE_PATH),
    ...STATIC_REQUIRE_FIXTURES(A_DEEP_BARE_PATH),
    (str => new RequireFixture(str, str, false))(`[]`),
    (str => new RequireFixture(str, str, false))(`{}`),
    (str => new RequireFixture(str, str, false))(`void 0`),
  ];
};
exports.fixtures = generateRequires();
exports.RequireFixture = RequireFixture;

const hasLineBreak = str => /[\n\r\u2028\u2029]/.test(str);
// only performs a Put
const ASSIGNMENT_OPERATOR = '=';
// these perform a Get prior to Put
const RELATIVE_ASSIGNMENT_OPERATORS = [
  '*=',
  '/=',
  '%=',
  '+=',
  '-=',
  '<<=',
  '>>=',
  '>>>=',
  '&=',
  '^=',
  '|=',
  '**=',
];
const UPDATE_OPERATORS = {
  Increment: '++',
  Decrement: '--',
};
const BINARY_OPERATORS = {
  BitwiseOr: '|',
  BitwiseExclusiveOr: '^',
  BitwiseAnd: '&',
  Equals: '==',
  StrictEquals: '===',
  NotEquals: '!=',
  StrictNotEquals: '!==',
  LessThan: '<',
  LessThanOrEqual: '<=',
  GreaterThan: '>',
  GreaterThanOrEqual: '>=',
  InstanceOf: 'instanceof',
  In: 'in',
  ArithmeticShiftLeft: '<<',
  ArithmeticShiftRight: '>>',
  LogicalShiftRight: '>>>',
  Addition: '+',
  Subtraction: '-',
  Multiplication: '*',
  Division: '/',
  Remainder: '%',
  Exponentiation: '**',
};
const YIELD_OPERATOR = 'yield';
const DELEGATED_YIELD_OPERATOR = 'yield*';
const POSITION_KINDS = {
  // "use strict"
  'DirectivePrologue': Symbol('DirectivePrologue'),
  // function bindingIdentifier() {}
  'BindingIdentifier': Symbol('BindingIdentifier'),
  // label: /* */
  // break label;
  // continue label;
  'LabelIdentifier': Symbol('LabelIdentifier'),
  // foo.bar
  'Reference': Symbol('Reference'),
  // [...pattern] = /* */
  'Pattern': Symbol('Pattern'),
  // let /* */ = /* */
  'BindingKind': Symbol('BindingKind'),
};
const DirectivePrologues = {
  StrictMode: 'use strict',
};
const BINDING_KINDS = {
  Const: 'const',
  Let: 'let',
  Var: 'var',
};
const GRAMMAR_FLAGS = {
  'In': Symbol('In'),
  'Yield': Symbol('Yield'),
  'Await': Symbol('Await'),
  'Tagged': Symbol('Tagged'),
  'Return': Symbol('Return'),
  'Default': Symbol('Default'),
  'U': Symbol('U'),
  'N': Symbol('N'),
}
const UNARY_OPERATOR = {
  Delete: 'delete',
  Void: 'void',
  Typeof: 'typeof',
  CoerceToNumber: '+',
  ArithmeticNegate: '-',
  BitwiseNot: '~',
  LogicalNot: '!',
  Await: {
    sourceText: 'await',
    requiresGrammar: [GRAMMAR_FLAGS.Await]
  },
};
// ASI concerns
const NEWLINE_SAFETY = {
  'Unsafe': Symbol('Unsafe'),
  'Safe': Symbol('Safe'),
};

function literal() {
  const suppliers = [
    booleanLiteral,
    nullLiteral,
    numericLiteral,
  ];
  return suppliers[Math.floor(Math.random() * suppliers.length)]();
}
function nullLiteral() {
  return {
    sourceText: 'null'
  }
}
function numericLiteral() {
  const exponent = Math.random() >= 0.5 ? (
    Math.random() >= 0.5 ?
      'e' :
      'E'
  ) + Math.random().toString().slice(2) : '';
  const radix = [
    2,
    8,
    10,
    16,
  ];
  const decimal = Math.random() >= 0.5 ? Math.random().toString().slice(1) : '';
  const negative = Math.random() >= 0.5 ? '-' : '';
  const whole = Math.random().toString().slice(2);
  return {
    sourceText: `${negative}${whole}${decimal}${exponent}`
  };
}
function booleanLiteral() {
  const raw = Math.random() >= 0.5 ? true : false;
  return {
    sourceText: JSON.stringify(raw),
  }
}
function* unaryOperations({
  onRequest,
  grammarFlags
}) {
  for (const [name, value] of Object.entries(UNARY_OPERATOR)) {
    let op = null;
    if (typeof value === 'string') {
      op = value;
    } else if (value.requiresGrammar.every(v => grammarFlags.includes(v))) {
      op = value.sourceText;
    }
    if (op !== null) {
      yield `${op} ${onRequest(POSITION_KINDS.Reference)}`
    }
  }
}
console.log([...unaryOperations({
  onRequest(positionKind) {
    return literal().sourceText;
  },
  grammarFlags: [GRAMMAR_FLAGS.Await]
})]);