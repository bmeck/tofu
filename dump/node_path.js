'use strict';
const { freeze } = Object;
const { isArray } = Array;
/**
 * Simple class to be able to generate a path from root to a specific node.
 * Used to ease cases of complex inspection by having default operations that
 * allow safe inspection of ASTs that avoid throwing errors.
 */
class NodePath {
  /**
   * @private
   * @param {NodePath | null} parent 
   * @param {*} node 
   * @param {string} key 
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
   * @returns {NodePath}
   */
  get(...keys) {
    let needle = this;
    for (const key of keys) {
      let node = null;
      if (typeof needle.node === 'object' && needle.node) {
        node = needle.node[key];
      }
      needle = new NodePath(needle, node, key);
    }
    return needle;
  }
  /**
   * iterate all the direct children of this NodePath
   * @returns {Iterator<NodePath>}
   */
  *[Symbol.iterator]() {
    if (!this.node || typeof this.node !== 'object') {
      return;
    }
    yield* [...Object.keys(this.node)].map((key) => {
      return new NodePath(this, this.node[key], key);
    });
  }
  /**
   * Prefered way to construct a root NodePath
   * @param {*} node 
   * @returns {NodePath}
   */
  static from(node) {
    return new NodePath(null, node, null);
  }
}
Object.freeze(NodePath);
Object.freeze(NodePath.prototype);

exports.NodePath = NodePath;
Object.freeze(exports);
Object.defineProperty(module, 'exports', {
  value: exports,
  configurable: false,
  enumerable: true,
  writable: false
});
