'use strict';
/**
 * @typedef {import('babel-types').Node} ASTNode
 */
const {parse} = require('@babel/parser');
const walk = require('./walk');
const {NodePath} = require('./node_path');
const analyze = require('./analyze');

/**
 * @param {string} body
 */
module.exports = (body, {
  parseOptions,
  forceFunction,
  forceStrict,
  nonFreeVariables
}) => {
  /**
   * @type {NodePath<ASTNode>}
   */
  const root = NodePath.from(parse(body, parseOptions));
  const scopes = walk(root, undefined, {
    forceFunction,
    nonFreeVariables,
    forceStrict
  });
  scopes.resolveOperations();

  return {
    raw() {
      return scopes;
    },
    analyzed({loc}) {
      return analyze(scopes, {
        loc
      })
    }
  };
}