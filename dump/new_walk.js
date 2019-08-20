'use strict';
const {
  ScopeStack
} = require('./scope');
const {
  Operations,
  PendingIdentifier,
  Operation,
  WellKnownValue,
} = require('./new_scope');
const LEXICAL_SCOPE_KINDS = new Set(['let', 'const']);
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
    return new Operations();
  } else if (type === 'Identifier') {
    return new Operations({
      instructions: [new PendingIdentifier(path.node.name)]
    });
  } else if (type === 'BooleanLiteral') {
    return new Operations({
      instructions: [WellKnownValue.BooleanLiteral(path.node.value)]
    });
  } else if (type === 'NumericLiteral') {
    return new Operations({
      instructions: [WellKnownValue.NumericLiteral(path.node.extra.raw)]
    });
  } else if (type === 'NullLiteral') {
    return new Operations({
      instructions: [WellKnownValue.NullLiteral()]
    });
  } else if (type === 'StringLiteral') {
    return new Operations({
      instructions: [WellKnownValue.StringLiteral(path.node.value)]
    });
  } else if (type === 'ExpressionStatement') {
    return operations.expression.closeExpression();
  } else if (type === 'AssignmentExpression') {
    return Operations.concat(
      operations.left.closeAssignment(operations.right),
    );
  } else if (type === 'BinaryExpression') {
    return Operations.concat(operations.left, operations.right, new Operations({
      instructions: [new Operation.Algorithm(path.node.operator, 2)]
    }));
  } else if (type === 'ArrayPattern') {
    return Operations.concat(...operations.elements);
  } else if (type === 'AssignmentPattern') {
    return Operations.concat(
      operations.left,
      operations.right.closeExpression()
    );
  } else if (type === 'VariableDeclarator') {
    const ret = Operations.concat(
      operations.id,
      ...(
        operations.init ? [
          operations.id.closeAssignment(operations.init.closeExpression()),
        ] : []
      ),
    );
    return ret;
  } else if (type === 'VariableDeclaration') {
    return Operations.concat(...operations.declarations).closeDeclaration(path.node.kind);
  } else if (type === 'LogicalExpression') {
    return Operations.concat(operations.left, operations.right);
  } else if (type === 'UnaryExpression') {
    return Operations.concat(operations.argument, new Operations({
      instructions: [new Operation.Algorithm(path.node.operator, 1)]
    }));
  } else if (type === 'MemberExpression') {
    let propOps;
    if (path.node.computed) {
      propOps = operations.property.closeExpression();
    } else {
      propOps = operations.property.closeName();
    }
    return Operations.concat(operations.object, propOps, new Operations({
      instructions: [new Operation.Algorithm('CreateReference', 2)]
    }));
  } else if (type === 'BlockStatement') {
    const ops = Operations.concat(...operations.body);
    // if (path.node.sourceType === 'module') {
    //   ops.currentScope().create('this');
    //   ops.currentScope().create('import.meta');
    //   ops.closeScope(MODULE_SCOPE_KINDS);
    // }
    return ops.closeScope(LEXICAL_SCOPE_KINDS)
  } else if (type === 'Program') {
    const ops = Operations.concat(...operations.body);
    // if (path.node.sourceType === 'module') {
    //   ops.currentScope().create('this');
    //   ops.currentScope().create('import.meta');
    //   ops.closeScope(MODULE_SCOPE_KINDS);
    // }
    return ops
      .closeScope(GLOBAL_LEXICAL_SCOPE_KINDS)
      .closeScope(GLOBAL_SCOPE_KINDS).scopes[0];
  } else if (type === 'File') {
    return operations.program;
  } else {
    // console.log(path);
    throw TypeError(`unknown .type ${type}`);
  }
};

const ret = walk(
  require('./node_path').NodePath.from(
    require('@babel/parser').parse(
    `
      let e=1;
    `
    )
  )
);
console.dir(ret, {colors: true, depth: null});
module.exports = walk;
