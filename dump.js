'use strict';
const {parse} = require('@babel/parser');
const {NodePath} = require('./node_path');

class BindingOperation {
  constructor(name, path) {
    this.name = name;
    this.path = path;
  }
}
class Declare extends BindingOperation {
  constructor(kind, name, path) {
    super(name, path);
    this.kind = kind;
  }
}
class Get extends BindingOperation {
}
class Set extends BindingOperation {
}
class Binding {
  constructor() {
    this.operations = [];
  }
}
class Scope {
  constructor(parent = null, declareCatches, modes = []) {
    this.parent = parent;
    this.children = [];
    if (parent) {
      parent.children.push(this);
    }
    this.declareCatches = declareCatches;
    this.variables = new Map();
    this.modes = modes;
  }
  hasMode(mode) {
    if (this.modes.includes(mode)) {
      return true;
    } else if (this.parent) {
      return this.parent.hasMode(mode);
    }
    return false;
  }
  encounter(operation) {
    const {variables} = this;
    const {name, kind} = operation;
    if (operation instanceof Declare) {
      if (this.declareCatches(kind)) {
        if (!variables.has(name)) {
          variables.set(name, new Binding());
        }
        variables.get(name).operations.push(operation);
        return;
      }
    } else {
      if (!this.parent) {
        if (!variables.has(name)) {
          variables.set(name, new Binding());
        }
      }
      if (variables.has(name)) {
        variables.get(name).operations.push(operation);
        return;
      }
    }
    this.parent.encounter(operation);
  }
}
class ScopeStack {
  constructor(topScope) {
    this.scopes = [];
    if (topScope) {
      this.push(topScope);
    }
    this.pendingEncounters = [];
  }
  get current() {
    return this.scopes.length > 0 ?
      this.scopes[this.scopes.length - 1] :
      null;
  }
  hasMode(mode) {
    return this.current.hasMode(mode);
  }
  push(catcher, modes) {
    this.scopes.push(
      new Scope(this.current, catcher, modes)
    );
  }
  pop() {
    this.scopes.pop();
  }
  declare(decl) {
    this.current.encounter(decl);
  }
  markOperation(operation, scope = this.current) {
    this.pendingEncounters.push({
      scope,
      operation
    });
  }
  resolveOperations() {
    for (const {scope,operation} of this.pendingEncounters) {
      scope.encounter(operation);
    }
    this.pendingEncounters = null;
  }
}
const BINDING_KINDS = {
  BLOCK: 'block',
  HOISTED: 'hoisted',
};
const GlobalCatch = (kind) => true;
const ScriptCatch = (kind) => kind === BINDING_KINDS.BLOCK;
const ModuleCatch = (kind) => true;
const BlockCatch = (kind) => kind === BINDING_KINDS.BLOCK;
const CatchCatch = (kind) => kind === BINDING_KINDS.BLOCK;
const FunctionCatch = (kind) => true;
const WithCatch = (kind) => true;
// walks in order to mark bindings as being Get
const walkExpression = (path, scopeStack) => {
  if (Array.isArray(path.node)) {
    for (const element of path) {
      walkExpression(element, scopeStack);
    }
  } else if (path.type === 'Identifier') {
    const name = path.get('name').node;
    scopeStack.markOperation(new Get(name, path));
  } else if (path.type === 'Super') {
    scopeStack.markOperation(new Get('super', path));
  } else if (path.type === 'ThisExpression') {
    if (!scopeStack.current.hasMode('strict')) {
      // sloppy this accesses globals
      if (scopeStack.current.parent) {
        let needle = scopeStack.current;
        while (needle.parent) {
          needle = needle.parent;
        }
        scopeStack.markOperation(new Get('this', path), needle);
      }
    }
    scopeStack.markOperation(new Get('this', path));
  } else if (path.type === 'CallExpression' || path.type === 'NewExpression') {
    walkExpression(path.get('callee'), scopeStack);
    walkExpression(path.get('arguments'), scopeStack);
  } else if (path.type === 'MemberExpression') {
    walkExpression(path.get('object'), scopeStack);
    if (path.get('computed').node) {
      walkExpression(path.get('property'), scopeStack);
    }
  } else if (path.type === 'UnaryExpression' ||
    path.type === 'UpdateExpression' ||
    path.type === 'AwaitExpression' ||
    path.type === 'YieldExpression') {
    walkExpression(path.get('argument'), scopeStack);
  } else if (path.type === 'BinaryExpression') {
    walkExpression(path.get('left'), scopeStack);
    walkExpression(path.get('right'), scopeStack);
  } else if (path.type === 'ArrayExpression') {
    walkExpression(path.get('elements'), scopeStack);
  } else if (path.type === 'ObjectExpression') {
    walkExpression(path.get('properties'), scopeStack);
  } else if (path.type === 'SpreadElement') {
    walkExpression(path.get('argument'), scopeStack);
  } else if (path.type === 'ObjectProperty') {
    if (path.get('computed').node) {
      walkExpression(path.get('key'), scopeStack);
    }
    walkExpression(path.get('value'), scopeStack);
  }  else if (path.type === 'ObjectMethod') {
    if (path.get('computed').node) {
      walkExpression(path.get('key'), scopeStack);
    }
  } else if (path.type === 'ConditionalExpression') {
    walkExpression(path.get('test'), scopeStack);
    walkExpression(path.get('consequent'), scopeStack);
    walkExpression(path.get('alternate'), scopeStack);
  } else if (path.type === 'SequenceExpression') {
    walkExpression(path.get('expressions'), scopeStack);
  } else if (path.type === 'TaggedTemplateExpression') {
    walkExpression(path.get('tag'), scopeStack);
    walkExpression(path.get('quasi'), scopeStack);
  } else if (path.type === 'TemplateLiteral') {
    walkExpression(path.get('expressions'), scopeStack);
  }
};
// walks in order to mark bindings as being Declare
const walkPattern = (path, scopeStack, kind, init) => {
  if (Array.isArray(path.node)) {
    for (const element of path) {
      walkPattern(element, scopeStack, kind, init);
    }
  } else if (path.type === 'Identifier') {
    const name = path.get('name').node;
    scopeStack.declare(new Declare(kind, name, path));
    if (init && init.node) {
      scopeStack.markOperation(new Set(name, init));
    }
  } else if (path.type === 'AssignmentPattern') {
    walkPattern(path.get('left'), scopeStack, kind, init);
  } else if (path.type === 'ObjectPattern') {
    for (const prop of path.get('properties')) {
      walkPattern(prop, scopeStack, kind, init);
    }
  } else if (path.type === 'ObjectProperty') {
    if (path.get('computed').node) {
      walkExpression(path.get('key'), scopeStack);
    }
    walkPattern(path.get('value'), scopeStack, kind, init);
  } else if (path.type === 'ArrayPattern') {
    for (const prop of path.get('elements')) {
      walkPattern(prop, scopeStack, kind, init);
    }
  } else if (path.type === 'RestElement') {
    const name = path.get('argument', 'name').node;
    scopeStack.declare(new Declare(kind, name, path));
  } else if (path.type === 'ImportSpecifier' ||
    path.type === 'ImportDefaultSpecifier' || 
    path.type === 'ImportNamespaceSpecifier') {
    walkPattern(path.get('local'), scopeStack, kind, init);
  }
}
const hasUseStrict = (directiveHoldingPath) => {
  const directives = directiveHoldingPath.get('directives');
  return Array.isArray(directives.node) && [
    ...directives
  ].find((d) => d.get('value', 'value').node === 'use strict');
};
const walk = (path, scopeStack = new ScopeStack(GlobalCatch), ctx = {}) => {
  for (const child of path.entries()) {
    let finalizers = [];
    if (child.type === 'Program') {
      finalizers.push(() => scopeStack.pop());
      const sourceType = child.get('sourceType').node;
      scopeStack.push(
        sourceType === 'script' ?
          ScriptCatch :
          ModuleCatch,
        sourceType === 'module' || hasUseStrict(child) ? ['strict'] : []
      );
    } else if (child.type === 'BlockStatement') {
      if ([
        'ForInStatement',
        'ForOfStatement',
      ].includes(child.parent.type)) {
        // loop heads are weird
      } else {
        finalizers.push(() => scopeStack.pop());
        scopeStack.push(BlockCatch);
      }
    } else if (child.type === 'CatchClause') {
      finalizers.push(() => scopeStack.pop());
      scopeStack.push(CatchCatch);
      walkPattern(child.get('param'), scopeStack, BINDING_KINDS.BLOCK, null);
    } else if (child.type === 'FunctionExpression' || child.type === 'FunctionDeclaration') {
      const id = child.get('id', 'name').node;
      if (child.type === 'FunctionDeclaration') {
        scopeStack.declare(new Declare(BINDING_KINDS.HOISTED, id, child));
      }
      finalizers.push(() => scopeStack.pop());
      scopeStack.push(FunctionCatch, hasUseStrict(child) ? ['strict'] : []);
      scopeStack.declare(new Declare(BINDING_KINDS.HOISTED, 'this', child));
      scopeStack.declare(new Declare(BINDING_KINDS.HOISTED, 'arguments', child));
      if (id) {
        scopeStack.declare(new Declare(BINDING_KINDS.HOISTED, id, child));
      }
      walkPattern(child.get('params'), scopeStack, BINDING_KINDS.HOISTED, null);
    } else if (child.type === 'ArrowFunctionExpression') {
      finalizers.push(() => scopeStack.pop());
      scopeStack.push(FunctionCatch, hasUseStrict(child) ? ['strict'] : []);
      walkPattern(child.get('params'), scopeStack, BINDING_KINDS.HOISTED, null);
    } else if (child.type === 'ObjectMethod' || child.type === 'ClassMethod') {
      finalizers.push(() => scopeStack.pop());
      scopeStack.push(FunctionCatch, hasUseStrict(child) ? ['strict'] : []);
      scopeStack.declare(new Declare(BINDING_KINDS.HOISTED, 'this', child));
      scopeStack.declare(new Declare(BINDING_KINDS.HOISTED, 'arguments', child));
      scopeStack.declare(new Declare(BINDING_KINDS.HOISTED, 'super', child));
      walkPattern(child.get('params'), scopeStack, BINDING_KINDS.HOISTED, null);
    } else if (child.type === 'ClassDeclaration' || child.type === 'ClassExpression') {
      const id = child.get('id', 'name').node;
      if (child.type === 'ClassDeclaration') {
        scopeStack.declare(new Declare(BINDING_KINDS.BLOCK, id, child));
      }
      walkExpression(child.get('superClass'), scopeStack);
      finalizers.push(() => scopeStack.pop());
      scopeStack.push(FunctionCatch, ['strict']);
      scopeStack.declare(new Declare(BINDING_KINDS.HOISTED, 'this', child));
      scopeStack.declare(new Declare(BINDING_KINDS.HOISTED, 'super', child));
      if (id) {
        scopeStack.declare(new Declare(BINDING_KINDS.HOISTED, id, child));
      }
    } else if (child.type === 'WithStatement') {
      walkExpression(child.get('object'), scopeStack);
      finalizers.push(() => scopeStack.pop());
      scopeStack.push(WithCatch);
    } else if (child.type === 'VariableDeclaration') {
      const kind = {
        'var': BINDING_KINDS.HOISTED,
        'let': BINDING_KINDS.BLOCK,
        'const': BINDING_KINDS.BLOCK,
      }[
        child.get('kind').node
      ];
      for (const decl of child.get('declarations')) {
        walkPattern(decl.get('id'), scopeStack, kind, decl.get('init'));
        walkExpression(decl.get('init'), scopeStack);
      }
    } else if (child.type === 'WhileStatement' || child.type === 'DoWhileStatement') {
      walkExpression(child.get('test'), scopeStack);
    } else if (child.type === 'ForInStatement' || child.type === 'ForInStatement') {
      const right = child.get('right');
      walkExpression(right, scopeStack);
      finalizers.push(() => scopeStack.pop());
      scopeStack.push(BlockCatch);
      const left = child.get('left')
      if (left.type !== 'VariableDeclaration') {
        walkPattern(left, scopeStack, BINDING_KINDS.HOISTED, right);
      }
    }  else if (child.type === 'ForStatement') {
      finalizers.push(() => scopeStack.pop());
      scopeStack.push(BlockCatch);
      const init = child.get('init')
      if (init.type !== 'VariableDeclaration') {
        walkExpression(init, scopeStack);
      }
      walkExpression(child.get('test'), scopeStack);
      walkExpression(child.get('update'), scopeStack);
    } else if (child.type === 'SwitchStatement') {
      walkExpression(child.get('discriminant'), scopeStack);
    } else if (child.type === 'SwitchClause') {
      walkExpression(child.get('test'), scopeStack);
    } else if (child.type === 'ExpressionStatement') {
      walkExpression(child.get('expression'), scopeStack);
    }
    walk(child, scopeStack, ctx);
    for (const fn of finalizers) {
      fn();
    }
  }
  return scopeStack;
};
const body = 'function y(){this}';//fs.readFileSync(file, 'utf8');
const root = NodePath.from(parse(body, {
  // options: https://babeljs.io/docs/en/babel-parser
  sourceType: 'script'
}));
const scopes = walk(root);
scopes.resolveOperations();
const freeVars = scopes.scopes[0].variables;
console.dir(freeVars.get('require').operations.reduce((acc, x) => {
  if (x instanceof Get &&
    x.path.parent.type === 'CallExpression' &&
    x.path.key === 'callee') {
    // call to require
    acc.push(x.path.parent.get('arguments').node);
  } else if (x.path.parent.type === 'MemberExpression' && x.path.key === 'object') {
    // member expression for require.resolve etc
  } else {
    // someone is doing something weird
    // warn?
  }
  return acc;
}, []), {depth: 5});
console.dir(freeVars.get('this'), {depth: 4});
