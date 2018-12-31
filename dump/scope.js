'use strict';
/**
 * Helpers for dealing with scopes.
 */

/**
 * A generic helper for constructing
 * @abstract
 */
class BindingOperation {
  /**
   * @constructor
   * @abstract
   * @param {string} name 
   * @param {*} path 
   */
  constructor(name, path) {
    this.name = name;
    this.path = path;
  }
}
/**
 * @template K
 */
class Declare extends BindingOperation {
  /**
   * @param {K} kind
   * @param {string} name
   * @param {*} path
   */
  constructor(kind, name, path) {
    super(name, path);
    this.kind = kind;
  }
}
/**
 * @enum {string}
 */
const GET_PURPOSE = {
  __proto__: null,
  TypeOf: 'TypeOf',
  Call: 'Call',
  ComplexReified: 'ComplexReified',
  Construct: 'Construct',
  Identity: 'Identity',
  JSXTag: 'JSXTag', // differentiated because of implicit tags like <div>
};
class Get extends BindingOperation {
  /**
   * @param {string} name 
   * @param {*} path 
   * @param {GET_PURPOSE} purpose 
   */
  constructor(name, path, purpose) {
    super(name, path);
    if (!purpose) {
      if (path.parent.type === 'CallExpression' && path.key === 'callee') {
        purpose = GET_PURPOSE.Call;
      } else if (path.parent.type === 'NewExpression' && path.key === 'callee') {
        purpose = GET_PURPOSE.Construct;
      } else if (path.parent.type === 'BinaryExpression' &&
          ['===', '!=='].includes(path.parent.get('operator').node)) {
      purpose = GET_PURPOSE.Identity;
      } else if (path.parent.type === 'UnaryExpression' &&
          ['typeof'].includes(path.parent.get('operator').node)) {
        purpose = GET_PURPOSE.Identity;
      } else if (path.type === 'JSXElement') {
        purpose = GET_PURPOSE.JSXTag;
      } else {
        purpose = GET_PURPOSE.ComplexReified;
      }
    }
    this.purpose = purpose;
  }
}
class Put extends BindingOperation {
}
class Binding {
  constructor() {
    this.operations = [];
  }
}
// points to other module bindings
class Import {
  /**
   * @param {string} specifier 
   * @param {string[]} names 
   * @param {*} path 
   */
  constructor(specifier, names = [], path) {
    this.specifier = specifier;
    this.names = names;
    this.path = path;
  }
}
class Scope {
  /**
   * Single scope that can hold variables
   * @param {Scope | null} parent 
   * @param {(kind: string) => boolean} declareCatches 
   * @param {string[]} modes 
   * @param {boolean} catchImports
   */
  constructor(parent = null, declareCatches, modes = [], catchImports = false) {
    this.parent = parent;
    this.children = [];
    if (parent) {
      parent.children.push(this);
    }
    this.declareCatches = declareCatches;
    this.variables = new Map();
    this.modes = modes;
    this.imports = [];
    this.catchImports = catchImports;
  }
  /**
   * removes cycles
   */
  toJSON() {
    const ret = {
      ...this
    };
    ret.variables = [...ret.variables.entries()];
    delete ret.parent;
    return ret;
  }
  /**
   * Test if this scope or its parents contains a specific mode.
   * @param {string} mode 
   * @returns {boolean}
   */
  hasMode(mode) {
    if (this.modes.includes(mode)) {
      return true;
    } else if (this.parent) {
      return this.parent.hasMode(mode);
    }
    return false;
  }
  /**
   * Places the import on the appropriate scope
   * @param {*} specifier
   * @param {string[]} importedNames 
   * @param {NodePath} path 
   * @throws {EvalError}
   */
  import(specifier, importedNames/*not local, "*" is namespace per ImportEntry Record */, path) {
    if (this.catchImports) {
      this.imports.push(new Import(specifier, importedNames, path));
    } else if (this.parent) {
      this.parent.import(specifier, importedNames, path);
    } else {
      throw new EvalError(`uncaught import`);
    }
  }
  /***
   * Places the operation on the appropriate scope.
   * @param {BindingOperation} operation
   */
  encounter(operation) {
    console.log(operation, this)
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
/**
 * Simple structure for managine an aggregate of scopes as you
 * perform a depth first walk of an AST
 * 
 * Has convenience methods to defer actions that are expected to
 * only be resolved when done walking the entire AST
 * 
 * @template K binding kinds
 */
class ScopeStack {
  constructor(topScope, modes, catchImports) {
    this.scopes = [];
    if (topScope) {
      this.push(topScope, modes, catchImports);
    }
    this.pendingEncounters = [];
  }
  toJSON() {
    const ret = {...this};
    delete ret.pendingEncounters;
    return ret;
  }
  /**
   * @returns {Scope}
   */
  get current() {
    return this.scopes.length > 0 ?
      this.scopes[this.scopes.length - 1] :
      null;
  }
  /**
   * @param {string} mode 
   * @returns {boolean}
   */
  hasMode(mode) {
    return this.current.hasMode(mode);
  }
  push(catcher, modes, catchImports) {
    this.scopes.push(
      new Scope(this.current, catcher, modes, catchImports)
    );
  }
  pop() {
    this.scopes.pop();
  }
  /**
   * Immediately declares a binding as the walk iterates the AST
   * @param {Declare<K>} decl 
   */
  declare(decl) {
    this.current.encounter(decl);
  }
  import(specifier, names, path) {
    this.current.import(specifier, names, path);
  }
  /**
   * Marks an operation as needing to be resolved
   * Does not immediately attempt to resolve as the walk may not
   * have seen all hoisted declarations yet
   * @param {Get | Put} operation 
   * @param {Scope} scope 
   */
  markOperation(operation, scope = this.current) {
    this.pendingEncounters.push({
      scope,
      operation
    });
  }
  /**
   * Resolves all operations queued by markOperation
   */
  resolveOperations() {
    for (const {scope,operation} of this.pendingEncounters) {
      scope.encounter(operation);
    }
    this.pendingEncounters = null;
  }
}
module.exports = Object.freeze({
  Declare,
  Get,
  Put,
  Scope,
  ScopeStack
});
