'use strict';
const { defineProperty, freeze, keys } = Object;
const { from: Array_from, isArray } = Array;
/**
 * Simple class to be able to generate a path from root to a specific node.
 * Used to ease cases of complex inspection by having default operations that
 * allow safe inspection of ASTs that avoid throwing errors.
 * 
 * @template {*} ASTNode - a value that can be reached in the AST
 * 
 * @see NodePath.from
 */
class NodePath {
  /**
   * @constructor
   * @private
   * @param {NodePath<ASTNode> | null} parent backpath to the path that led to this 
   * @param {ASTNode} node value from the AST
   * @param {string} key backpath to verify which field of the parent was used to get this
   * 
   * @see NodePath.from
   */
  constructor(parent = null, node, key = null) {
    this.node = node;
    this.parent = parent;
    this.key = key;
    freeze(this);
  }
  /**
   * The node's type or null if the node is not an AST
   * @returns {string | null}
   * 
   * @example
   * if (path.type === 'Identifier') {
   *   const id = path.get('name').node;
   *   // ...
   * }
   */
  get type() {
    if (this.node &&
        typeof this.node === 'object' &&
        !isArray(this.node)) {
      return this.node.type;
    }
    return null;
  }
  /**
   * Obtains a new NodePath by following the keys listed
   * Will never
   * @param  {...string} keys 
   * @returns {NodePath<ASTNode>}
   * 
   * @example
   * // will safely work even if there isn't a .expression.callee.type
   * if (path.get('expression', 'callee').type === 'Identifier') {
   *   // ...
   * }
   */
  get(...keys) {
    /**
     * @type {NodePath<ASTNode>}
     */
    let needle = this;
    // DO NOT OPTIMIZE THE ALLOCATIONS OUT
    // WE WANT A FULL PATH OF NodePaths
    // TO ALLOW RELIABLE .parent COUNT
    for (const key of keys) {
      if (typeof needle.node === 'object' && needle.node) {
        needle = new NodePath(needle, needle.node[key], key);
      } else {
        needle = new NodePath(needle, null, key);
      }
    }
    return needle;
  }
  /**
   * iterate all the direct children of this NodePath
   * @returns {Iterator<NodePath>}
   * 
   * @example
   * for (const path of blk.get('body')) {
   *   if (path.key === '0') {
   *     // ...
   *   } else {
   *     // ...
   *   }
   * }
   */
  *[Symbol.iterator]() {
    if (!this.node || typeof this.node !== 'object') {
      return;
    }
    // we do an eager map to avoid mutation confusion
    yield* Array_from(keys(this.node), (key) => {
      return new NodePath(this, this.node[key], key);
    });
  }
  /**
   * Prefered way to construct a root NodePath
   * @template T
   * @param {T} node 
   * @returns {NodePath<T>}
   * 
   * @example
   * const root = NodePath.from(parse(sourceText));
   */
  static from(node) {
    return new NodePath(null, node, null);
  }
}
freeze(NodePath);
freeze(NodePath.prototype);

exports.NodePath = NodePath;
freeze(exports);
defineProperty(module, 'exports', {
  value: exports,
  configurable: false,
  enumerable: true,
  writable: false
});
