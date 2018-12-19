'use strict';
const { freeze } = Object;
/**
 * Simple class to be able to generate a path from root to a specific node.
 */
class NodePath {
  constructor(parent = null, node, key = null) {
    this.node = node;
    this.parent = parent;
    this.key = key;
    freeze(this);
  }
  get type() {
    if (this.node && typeof this.node === 'object' && !Array.isArray(this.node)) {
      return this.node.type;
    }
    return null;
  }
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
  *[Symbol.iterator]() {
    if (!this.node || typeof this.node !== 'object') {
      return;
    }
    yield* [...Object.keys(this.node)].map((key) => {
      return new NodePath(this, this.node[key], key);
    });
  }
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
