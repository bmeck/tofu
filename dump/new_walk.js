'use strict';
const {
  ScopeStack
} = require('./scope');
const {
  Operations,
  PendingIdentifier,
  PendingBinding,
  PendingReference,
  Operation,
  WellKnownValue,
} = require('./new_scope');
const GLOBAL_LEXICAL_SCOPE_KINDS = new Set(['let', 'const']);
const GLOBAL_SCOPE_KINDS = new Set(['var', 'let', 'const']);
const NodePath = require('./node_path').NodePath;
/**
 * Allows scopes to determine if a binding should be
 * added to the current scope or passed upwards via
 * 
 * @enum {string}
 */
const BINDING_KINDS = {
  /**
   * Represents when a binding is lexically scoped
   * 
   * @example
   * ```js
   * let foo;
   * ```
   */
  BLOCK: 'block',
  /**
   * Represents when a binding is hoisted by HoistedDeclaration
   * 
   * @example
   * ```js
   * function foo() {};
   * var bar;
   * ```
   */
  HOISTED: 'hoisted',
  /**
   * Represents when a binding is not used via a declarator
   * 
   * @example
   * ```js
   * ( [ x,y ] = [ 0, 1 ] );
   * ```
   */
  BARE: 'bare',
};
/**
 * Tests if the path has the "use strict" directive
 * @template T
 * @param {NodePath<T>} directiveHoldingPath 
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
 * @template T
 * @param {NodePath<T>} path 
 * @param {ScopeStack} scopeStack 
 */
const walk = (path) => {
  return postOrderWalk(path, foldOperations);
};
/**
 * Performs a post order walk, applying a map and to the
 * nodes visited, the data structures should not contain
 * cyles
 * 
 * @template ASTNode
 * @template ArrayASTNode {ASTNode & [ASTNode]}
 * @template TypedASTNode {ASTNode & {type: string}}
 * @template AccumulatorType
 * @param {NodePath<ArrayASTNode> | NodePath<TypedASTNode>} path 
 * @param {(node: NodePath<TypedASTNode>, acc: [AccumulatorType] | {[field: string]: AccumulatorType}) => AccumulatorType} op 
 */
const postOrderWalk = (path, op) => {
  if (Array.isArray(path.node)) {
    return [...path].map(walk);
  }
  if (typeof path.type === 'string') {
    const innerResults = {__proto__: null};
    for (const innerPath of path) {
      if (Array.isArray(innerPath.node) || typeof innerPath.type === 'string') {
        innerResults[innerPath.key] = postOrderWalk(innerPath, op);
      }
    }
    return op(
      /** @type {NodePath<TypedASTNode>} */(path),
      innerResults,
    );
  }
}
/**
 * @template ASTTypedNode
 * @param {NodePath<ASTTypedNode>} path 
 * @param {{[field: string]: Operations}} operations 
 */
const foldOperations = (path, operations) => {
  const type = path.type;
  if (type === 'CommentLine' || type === 'CommentBlock') {
    return new Operations({});
  } else if (type === 'Identifier') {
    return new Operations({
      instructions: [new PendingIdentifier(path.node.name)]
    });
  } else if (type === 'BooleanLiteral') {
    return new Operations({
      expressions: [WellKnownValue.BooleanLiteral(path.node.value)]
    });
  } else if (type === 'NumericLiteral') {
    return new Operations({
      expressions: [WellKnownValue.NumericLiteral(path.node.extra.raw)]
    });
  } else if (type === 'NullLiteral') {
    return new Operations({
      expressions: [WellKnownValue.NullLiteral()]
    });
  } else if (type === 'StringLiteral') {
    return new Operations({
      expressions: [WellKnownValue.StringLiteral(path.node.value)]
    });
  } else if (type === 'ExpressionStatement') {
    return foldExpression(operations.expression);
  } else if (type === 'IfStatement') {
    return Operations.from(
      operations.test,
      operations.consequent,
      ...[path.node.alternate ? [operations.alternate] : []]
    );
  } else if (type === 'BlockStatement') {
    return Operations.from(...operations.body);
  } else if (type === 'VariableDeclarator') {
    return Operations.from(operations.id, foldExpression(operations.init));
  } else if (type === 'VariableDeclaration') {
    return foldPattern(Operations.from(...operations.declarations), path.node.kind);
  } else if (type === 'FunctionDeclaration') {
    const ret = Operations.from(
      foldPattern(Operations.from(...operations.params), 'var'),
      operations.body,
      new Operations({
        expressions: [
          new PendingBinding(path.node.id.name, 'var')
        ]
      })
    );
    return ret;
  } else if (type === 'ArrayPattern') {
    return Operations.from(...operations.elements);
  } else if (type === 'AssignmentPattern') {
    return Operations.from(operations.left, foldExpression(operations.right));
  } else if (type === 'RestElement') {
    return operations.argument;
  } else if (type === 'SequenceExpression') {
    return Operations.from(...operations.expressions);
  } else if (type === 'AssignmentExpression') {
    console.log(operations)
    if (operations.left.instructions.length === 1 && operations.left.instructions[0] instanceof PendingIdentifier) {
      return Operations.from(
        operations.right, foldAssignment(operations.left)
      );
    }
    return Operations.from(operations.left, operations.right);
  }  else if (type === 'BinaryExpression') {
    return Operations.from(operations.left, operations.right);
  } else if (type === 'LogicalExpression') {
    return Operations.from(operations.left, operations.right);
  } else if (type === 'UnaryExpression') {
    return Operations.from(operations.argument);
  } else if (type === 'MemberExpression') {
    let propOps;
    if (path.node.computed) {
      propOps = foldExpression(operations.property);
    } else {
      propOps = foldProperty(operations.property);
    }
    return Operations.from(propOps, operations.object);
  } else if (type === 'Program') {
    const ops = Operations.concat(...operations.body);
    if (path.node.sourceType === 'module') {
      ops.currentScope().create('this');
      ops.currentScope().create('import.meta');
      ops.closeScope(MODULE_SCOPE_KINDS);
    }
    ops.closeScope(GLOBAL_LEXICAL_SCOPE_KINDS);
    ops.closeScope(GLOBAL_SCOPE_KINDS);
    return ops;
  } else if (type === 'File') {
    return operations.program;
  } else {
    // console.log(path);
    throw TypeError(`unknown .type ${type}`);
  }
};
const inPlaceMap = (arr, fn) => {
  for (let i = 0; i < arr.length; i++) {
    arr[i] = fn(arr[i], i, arr);
  }
}
/**
 * 
 * @param {Operations} operations 
 * @returns {Operations}
 */
const foldExpression = (operations) => {
  inPlaceMap(operations.expressions, (expr) => {
    if (expr instanceof PendingIdentifier) {
      return new Get(expr.name);
    }
    return expr;
  });
  return operations;
};
const foldPattern = (operations, kind) => {
  inPlaceMap(operations.expressions, (expr) => {
    if (expr instanceof PendingIdentifier) {
      return new PendingBinding(expr.name, kind);
    }
    return expr;
  });
  return operations;
};
const foldAssignment = (operations) => {
  inPlaceMap(operations.expressions, (expr) => {
    if (expr instanceof PendingIdentifier) {
      return new Put(expr.name);
    }
    return expr;
  });
  return operations;
};
const foldProperty = (operations) => {
  inPlaceMap(operations.expressions, (expr) => {
    if (expr instanceof PendingIdentifier) {
      return WellKnownValue.StringLiteral(expr.name);
    }
    return expr;
  });
  return operations;
};

const ret = walk(
  require('./node_path').NodePath.from(
    require('@babel/parser').parse(
    `
    x=null
    `
    )
  )
);
console.dir(ret, {colors: true, depth: null});
module.exports = walk;
