'use strict';

const {
  Declare,
  Get,
  Put,
  ScopeStack
} = require('./scope');

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

const EXPRESION_TYPE = {
  Get: 'Get',
  Put: 'Put',
  Update: 'Update',
};
/**
 * Properly marks operations for an Expression
 * Abstracts the check for Set positions that are actually Gets
 * like `x[0] = 1` being a Get of `x`
 * @param {string} name 
 * @param {NodePath} path 
 * @param {ScopeStack} scopeStack 
 * @param {EXPRESSION_TYPE} type 
 * @param {Scope | undefined} scope 
 */
const markExpression = (name, path, scopeStack, type, scope) => {
  let needGet = false;
  let needSet = false;
  if (type === EXPRESION_TYPE.Get || type === EXPRESION_TYPE.Update) {
    needGet = true;
  }
  if (type === EXPRESION_TYPE.Put || type === EXPRESION_TYPE.Update) {
    // check if we are getting the variable for prop access
    if (path.parent.type === 'MemberExpression' && path.key === 'object') {
      needGet = true;
    } else {
      needSet = true;
    }
  }
  if (needGet) {
    scopeStack.markOperation(new Get(name, path), scope);
  }
  if (needSet) {
    scopeStack.markOperation(new Put(name, path), scope);
  }
};
/**
 * Walks expressions and marks identifiers with relevent operations
 * @param {NodePath} path 
 * @param {ScopeStack} scopeStack 
 * @param {EXPRESION_TYPE} type 
 */
const walkExpression = (path, scopeStack, type = EXPRESION_TYPE.Get) => {
  if (Array.isArray(path.node)) {
    for (const element of path) {
      walkExpression(element, scopeStack, type);
    }
  } else if (path.type === 'Identifier') {
    const name = path.get('name').node;
    markExpression(name, path, scopeStack, type);
  } else if (path.type === 'Super') {
    markExpression('super', path, scopeStack, type);
  } else if (path.type === 'ThisExpression') {
    if (!scopeStack.current.hasMode('strict')) {
      // sloppy this accesses globals
      if (scopeStack.current.parent) {
        let needle = scopeStack.current;
        while (needle.parent) {
          needle = needle.parent;
        }
        markExpression('this', path, scopeStack, type, needle);
      }
    }
    markExpression('this', path, scopeStack, type);
  } else if (path.type === 'CallExpression' || path.type === 'NewExpression') {
    walkExpression(path.get('callee'), scopeStack);
    walkExpression(path.get('arguments'), scopeStack);
  } else if (path.type === 'MemberExpression') {
    walkExpression(path.get('object'), scopeStack, type);
    if (path.get('computed').node) {
      walkExpression(path.get('property'), scopeStack);
    }
  } else if (path.type === 'UnaryExpression' ||
    path.type === 'AwaitExpression' ||
    path.type === 'YieldExpression') {
    let kind = EXPRESION_TYPE.Get;
    if (path.get('operator').node === 'delete') {
      kind = EXPRESION_TYPE.Put;
    }
    walkExpression(path.get('argument'), scopeStack, kind);
  } else if (path.type === 'UpdateExpression') {
    walkExpression(path.get('argument'), scopeStack, EXPRESION_TYPE.Update);
  } else if (path.type === 'JSXElement') {
    markExpression(path.get('openingElement', 'name', 'name').node, path, scopeStack, EXPRESION_TYPE.Get);
    for (const attrValue of path.get('openingElement', 'attributes')) {
      walkExpression(attrValue.get('value'), scopeStack);
    }
    for (const attrValue of path.get('children')) {
      walkExpression(attrValue.get('expression'), scopeStack);
    }
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
  } else if (path.type === 'AssignmentExpression') {
    walkExpression(path.get('left'), scopeStack, EXPRESION_TYPE.Put);
    walkExpression(path.get('right'), scopeStack);
  } else if (path.type === 'TaggedTemplateExpression') {
    walkExpression(path.get('tag'), scopeStack);
    walkExpression(path.get('quasi'), scopeStack);
  } else if (path.type === 'TemplateLiteral') {
    walkExpression(path.get('expressions'), scopeStack);
  }
};
/**
 * Walks a binding pattern and marks related declarations
 * @param {NodePath} path 
 * @param {ScopeStack} scopeStack 
 * @param {string} kind 
 * @param {NodePath} init 
 */
const walkPattern = (path, scopeStack, kind, init) => {
  if (Array.isArray(path.node)) {
    for (const element of path) {
      walkPattern(element, scopeStack, kind, init);
    }
  } else if (path.type === 'Identifier') {
    const name = path.get('name').node;
    scopeStack.declare(new Declare(kind, name, path));
    if (init && init.node) {
      scopeStack.markOperation(new Put(name, init));
    }
  } else if (path.type === 'AssignmentPattern') {
    walkPattern(path.get('left'), scopeStack, kind, init);
    walkExpression(path.get('right'), scopeStack, EXPRESION_TYPE.Get);
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
/**
 * Tests if the path has the "use strict" directive
 * @param {NodePath} directiveHoldingPath 
 * @returns {boolean}
 */
const hasUseStrict = (directiveHoldingPath) => {
  const directives = directiveHoldingPath.get('directives');
  return Array.isArray(directives.node) && [
    ...directives
  ].some((d) => d.get('value', 'value').node === 'use strict');
};
/**
 * Walks an entire AST to produce an analysis of all scopes within
 * @param {NodePath} path 
 * @param {ScopeStack} scopeStack 
 */
const walk = (path, scopeStack = new ScopeStack(GlobalCatch, undefined, true)) => {
  for (const child of path) {
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
      const body = child.get('body');
      if (body.type !== 'BlockStatement') {
        walkExpression(body, scopeStack);
      }
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
    } else if (child.type === 'ImportDeclaration') {
      scopeStack.import(child.get('source'), [...child.get('specifiers')].map(
        b => {
          if (b.type === 'ImportDefaultSpecifier') return 'default';
          else if (b.type === 'ImportNamespaceSpecifier') return '*';
          else if (b.type === 'ImportSpecifier') return b.get('imported', 'name').node;
          else {
            // warn
          }
        }
      ), child);
    } else if (child.type === 'ExportAllDeclaration') {
      scopeStack.import(child.get('source'), ['*'], child);
    }  else if (child.type === 'ExportNamedDeclaration' && child.get('source').node) {
      scopeStack.import(child.get('source'), [...child.get('specifiers')].map(
        b => {
          if (b.type === 'ExportSpecifier') return b.get('local', 'name').node;
          else if (b.type === 'ExportDefaultSpecifier') return 'default';
          else if (b.type === 'ExportNamespaceSpecifier') return '*';
          else {
            // warn
          }
        }
      ), child);
    } else if (child.type === 'Import' && child.parent.type === 'CallExpression' && child.key === 'callee') {
      scopeStack.import(child.parent.get('arguments', 0), ['*'], child);
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
    } else if (child.type === 'ThrowStatement' || child.type === 'ReturnStatement') {
      walkExpression(child.get('argument'), scopeStack);
    }
    walk(child, scopeStack);
    for (const fn of finalizers) {
      fn();
    }
  }
  return scopeStack;
};

module.exports = walk;
