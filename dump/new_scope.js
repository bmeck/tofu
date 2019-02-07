'use strict';

/**
 * @enum {string}
 */
const WellKnownValueType = Object.freeze({
  BooleanLiteral: 'BooleanLiteral',
  Infinity: 'Infinity',
  NegativeInfinity: 'NegativeInfinity',
  NumericLiteral: 'NumericLiteral',
  NullLiteral: 'NullLiteral',
  StringLiteral: 'StringLiteral',
  Undefined: 'Undefined',
});
let WellKnownNull;
let WellKnownUndefined;
let WellKnownInfinity;
let WellKnownNegativeInfinity;
let WellKnownNegativeZero;
let WellKnownNotANumber;
class WellKnownValue {
  /**
   * @param {WellKnownValueType} type 
   * @param {string | number | boolean | null | undefined} value 
   */
  constructor(type, value) {
    this.type = type;
    this.value = value;
    Object.freeze(this);
  }
  unary(op, a) {
    if (a instanceof WellKnownValue) {
      switch (op) {
        case '+': {
          let ret = +a.value;
          return new WellKnownValue(typeof ret, ret);
        }
        case '-': {
          let ret = -a.value;
          return new WellKnownValue(typeof ret, ret);
        }
        case '~': {
          let ret = ~a.value;
          return new WellKnownValue(typeof ret, ret);
        }
        case '!': {
          let ret = !a.value;
          return new WellKnownValue(typeof ret, ret);
        }
        case 'typeof': {
          let ret = void a.value;
          return new WellKnownValue(typeof ret, ret);
        }
        case 'void': {
          let ret = void a.value;
          return new WellKnownValue(typeof ret, ret);
        }
      }
    }
    throw Error('operation is not well known or value is not well known');
  }
  binary(op, a, b) {
    if (a instanceof WellKnownValue) {
      switch (op) {
        case '+': {
          let ret = a.value + b.value;
          return new WellKnownValue(typeof ret, ret);
        }
        case '-': {
          let ret = a.value - b.value;
          return new WellKnownValue(typeof ret, ret);
        }
        case '*': {
          let ret = a.value * b.value;
          return new WellKnownValue(typeof ret, ret);
        }
        case '/': {
          let ret = a.value * b.value;
          return new WellKnownValue(typeof ret, ret);
        }
        case '%': {
          let ret = a.value % b.value;
          return new WellKnownValue(typeof ret, ret);
        }
        case '**': {
          let ret = a.value ** b.value;
          return new WellKnownValue(typeof ret, ret);
        }
        case '&&': {
          let ret = a.value && b.value;
          return new WellKnownValue(typeof ret, ret);
        }
        case '||': {
          let ret = a.value || b.value;
          return new WellKnownValue(typeof ret, ret);
        }
        case '&': {
          let ret = a.value & b.value;
          return new WellKnownValue(typeof ret, ret);
        }
        case '|': {
          let ret = a.value | b.value;
          return new WellKnownValue(typeof ret, ret);
        }
        case '^': {
          let ret = a.value ^ b.value;
          return new WellKnownValue(typeof ret, ret);
        }
        case '<<': {
          let ret = a.value << b.value;
          return new WellKnownValue(typeof ret, ret);
        }
        case '>>': {
          let ret = a.value >> b.value;
          return new WellKnownValue(typeof ret, ret);
        }
        case '>>>': {
          let ret = a.value >>> b.value;
          return new WellKnownValue(typeof ret, ret);
        }
        case '<': {
          let ret = a.value < b.value;
          return new WellKnownValue(typeof ret, ret);
        }
        case '>': {
          let ret = a.value > b.value;
          return new WellKnownValue(typeof ret, ret);
        }
        case '<=': {
          let ret = a.value <= b.value;
          return new WellKnownValue(typeof ret, ret);
        }
        case '>=': {
          let ret = a.value >= b.value;
          return new WellKnownValue(typeof ret, ret);
        }
        case '==': {
          let ret = a.value == b.value;
          return new WellKnownValue(typeof ret, ret);
        }
        case '===': {
          let ret = a.value === b.value;
          return new WellKnownValue(typeof ret, ret);
        }
        case '!=': {
          let ret = a.value != b.value;
          return new WellKnownValue(typeof ret, ret);
        }
        case '!==': {
          let ret = a.value !== b.value;
          return new WellKnownValue(typeof ret, ret);
        }
      }
    }
    throw Error('operation is not well known or value is not well known');
  }
  /**
   * @param {boolean} value 
   */
  static BooleanLiteral(value) {
    return new WellKnownValue(WellKnownValueType.BooleanLiteral, value);
  }
  static NullLiteral() {
    return WellKnownNull || (WellKnownNull = new WellKnownValue(WellKnownValueType.NullLiteral, null));
  }
  /**
   * Strings are used here because numbers are lossy
   * @param {string} value 
   */
  static NumericLiteral(value) {
    return new WellKnownValue(WellKnownValueType.NumericLiteral, value);
  }
  /**
   * @param {string} value 
   */
  static StringLiteral(value) {
    return new WellKnownValue(WellKnownValueType.StringLiteral, value);
  }
  static Undefined() {
    return WellKnownUndefined || (WellKnownUndefined = new WellKnownValue(WellKnownValueType.Undefined, void 0));
  }
  static Infinity() {
    return WellKnownInfinity || (WellKnownInfinity = new WellKnownValue(WellKnownValueType.Infinity, 1/0));
  }
  static NegativeInfinity() {
    return WellKnownNegativeInfinity || (WellKnownNegativeInfinity = new WellKnownValue(WellKnownValueType.Infinity, 1/-0));
  }
  static NegativeZero() {
    return WellKnownNegativeZero || (WellKnownNegativeZero = new WellKnownValue(WellKnownValueType.Infinity, -0));
  }
  static NotANumber() {
    return WellKnownNotANumber || (WellKnownNotANumber = new WellKnownValue(WellKnownValueType.Infinity, +'NaN'));
  }
}
/**
 * Represents an Identifier that has been identified during a walk but does
 * not know if it was in a pattern or expression context.
 * 
 * This *should* be resolved to a Binding or Reference prior to any walk ending.
 */
class PendingIdentifier {
  /**
   * @param {string} name of the identifier
   */
  constructor(name) {
    this.name = name;
  }
}
/**
 * Represents a Reference used for Delete/Get/Initialize/Put.
 */
class PendingReference {
  constructor(name) {
    this.name = name;
  }
}
class Reference {
  constructor(name, base, strict) {
    this.name = name;
    this.base = base;
    this.strict = strict;
  }
  static fromScope(pendingReference, scope) {
    return new Reference(pendingReference.name, scope, pendingReference.strict);
  }
}
/**
 * Represents a binding that can be referenced prior to knowing
 * the scope which contains the binding.
 */
class PendingBinding {
  constructor(name, kind) {
    this.name = name;
    this.kind = kind;
  }
}
class Binding {
  constructor() {
  }
}
const Operation = Object.freeze({
  Algorithm: class Algorithm {
    /**
     * @param {string} name 
     * @param {number} argc 
     */
    constructor(name, argc) {
      this.name = name;
      this.argc = argc;
    }
  },
});

/**
 * Represents a scope that has not been tied to a parent Scope yet
 * 
 * @property {PendingScope[]} children
 * 
 * @property {{[name: string]: Binding}} bindings
 * 
 * @property {boolean} dynamic Marks this scope as having indeterminate scope.
 * 
 * This occurs when a binding could be added or removed at runtime such as using direct eval,
 * with() {}, or being a global scope.
 * 
 * NOTE: non-dynamic bindings are not deletable so we still want the create() to be performed
 * appropriately
 * 
 * We do not know if a scope is strict or not at the time of creation
 */
class PendingScope {
  /**
   * @param {{children?: PendingScope[], bindings?: {[name: string]: Binding}, dynamic?: boolean, strict?: boolean}} children
   */
  constructor({
    children = [],
    bindings = {__proto__: null},
    dynamic = false,
    strict = false,
  } = {}) {
    this.children = children;
    this.bindings = bindings;
    this.dynamic = dynamic;
    this.strict = strict;
  }
}

/**
 * Can only be generated once top level scope determines if it is strict.
 * Converts all bindings and child scopes to non-pending forms.
 */
class Scope {
  /**
   * 
   * @param {{children: PendingScope[], bindings: {[name: string]: Binding}, dynamic: boolean, strict: boolean}} parts
   */
  constructor({
    children = [],
    bindings = {__proto__: null},
    dynamic = false,
    strict = false,
  }) {
    this.children = children.map(child => {
      return new Scope({
        children: child.children,
        bindings: child.bindings,
        dynamic: child.dynamic,
        strict: strict || child.strict,
      })
    });
    this.bindings = bindings;
    this.dynamic = dynamic;
    this.strict = strict;
  }
}


/**
 * An aggregator that is used to collect data during the walk expressions
 * relevant to scopes such as creation of pending bindings are removed when
 * a wrapping scope is encountered.
 * 
 * Note that not all scopes drain the same kinds of expressions.
 */
class Operations {
  constructor({
    declarations = [],
    instructions = [],
    scopes = [],
  } = {}) {
    this.declarations = declarations;
    this.instructions = instructions;
    this.scopes = scopes;
  }

  /**
   * @template DrainBindingKind
   * @param {Set<DrainBindingKind>} kinds
   */
  closeScope(kinds, dynamic) {
    const remaining = [];
    const bindings = {__proto__: null};
    for (const binding of this.declarations) {
      if (kinds.has(binding.kind)) {
        bindings[binding.name] = new Binding();
      } else {
        remaining.push(binding);
      }
    }
    return new Operations({
      declarations: remaining,
      instructions: this.instructions,
      scopes: [new PendingScope({
        children: this.scopes,
        bindings,
        dynamic,
      })],
    });
  }

  /**
   * Takes pending identifiers and turns them into pending bindings
   */
  closePattern(kind) {
    const declarations = this.declarations;
    const remaining = [];
    for (const instruction of this.instructions) {
      if (instruction instanceof PendingIdentifier) {
        declarations.push(new PendingBinding(instruction.name, kind));
      } else {
        remaining.push(instruction);
      }
    }
    return new Operations({
      declarations,
      instructions: remaining,
      scopes: this.scopes,
    });
  }

  /**
   * Takes pending identifiers and turns them into pending references
   */
  closeExpression() {
    const declarations = this.declarations;
    const remaining = [];
    for (const instruction of this.instructions) {
      if (instruction instanceof PendingIdentifier) {
        declarations.push(new PendingReference(instruction.name));
      } else {
        remaining.push(instruction);
      }
    }
    return new Operations({
      declarations,
      instructions: remaining,
      scopes: this.scopes,
    });
  }

  /**
   * Used for manual pushing of bindings for implicit bindings like
   * `this`, `super`, `arguments`, etc.
   * @param  {...any} declarations 
   */
  pushDeclarations(...declarations) {
    return new Operations({
      declarations: [...this.declarations, ...declarations],
      instructions: this.instructions,
      scopes: this.scopes,
    });
  }

  pushInstructions(...instructions) {
    return new Operations({
      declarations: this.declarations,
      instructions: [...this.instructions, ...instructions],
      scopes: this.scopes,
    });
  }

  /**
   * This should only be used for inspection not mutation
   */
  get currentScope() {
    return this.scopes[this.scopes.length - 1];
  }

  /**
   * @param  {...Operations} aggregates 
   */
  static concat(...aggregates) {
    return new Operations({
      // @ts-ignore
      declarations: aggregates.flatMap(a => a.declarations),
      // @ts-ignore
      instructions: aggregates.flatMap(a => a.instructions),
      // @ts-ignore
      scopes: aggregates.flatMap(a => a.scopes),
    });
  }
}

module.exports = {
  __proto__: null,
  Binding,
  Operation,
  Operations,
  PendingBinding,
  PendingIdentifier,
  PendingReference,
  PendingScope,
  Reference,
  WellKnownValue,
  WellKnownValueType,
};
