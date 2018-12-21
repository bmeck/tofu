'use strict';
const {
  Declare,
  Get,
  Put
} = require('./scope');

const analyze = (scopes, {loc: keepLocations = true} = {}) => {
  const globalScope = scopes.scopes[0];
  const freeVars = globalScope.variables;
  const rawConstExprOf = (path) => {
    let value;
    if (path.type === 'StringLiteral') {
      value = JSON.stringify(path.node.value);
    } else if (path.type === 'TemplateLiteral') {
      if (path.get('expressions').node.length !== 0) {
        return null;
      }
      // assert quasis.length === 1 && quasis[len-1].tail === true
      value = JSON.stringify(path.get('quasis').node[0].value.cooked);
    } else if (path.type === 'BooleanLiteral') {
      value = path.node.value ? 'true' : 'false';
    } else if (path.type === 'NumericLiteral') {
      value = path.node.extra.raw;
    } else if (path.type === 'NullLiteral') {
      value = "null";
    } else {
      return null;
    }
    return {value};
  };
  let requires = [];
  let freeVariables = {};
  let imports = [];
  for (const imp of globalScope.imports) {
    const specifier = rawConstExprOf(imp.specifier);
    const loc = keepLocations ? {loc: imp.path.node.loc} : null;
    if (specifier) {
      imports.push({
        type: 'static',
        specifier,
        names: imp.names,
        ...loc
      });
    } else {
      imports.push({
        type: 'dynamic',
        names: imp.names,
        ...loc
      });
    }
  }
  if (freeVars.has('require')) {
    requires = freeVars.get('require').operations.reduce((acc, x) => {
      if (x instanceof Get &&
        x.path.parent.type === 'CallExpression' &&
        x.path.key === 'callee') {
        // call to require
        const args = x.path.parent.get('arguments');
        if (args.node.length !== 1) {
          // warn, strange call
        }
        const specifier = rawConstExprOf(args.get(0));
        const loc = keepLocations ? {loc: x.path.node.loc} : null;
        if (specifier) {
          acc.push({type: 'static', specifier, ...loc});
        } else {
          acc.push({type: 'dynamic', ...loc});
        }
      } else if (x.path.parent.type === 'MemberExpression' && x.path.key === 'object') {
        // member expression for require.resolve etc
      } else {
        // someone is doing something weird
        // warn?
      }
      return acc;
    }, []);
  }
  for (const [k,v] of freeVars.entries()) {
    const store = freeVariables[k] = {
      gets: [],
      puts: [],
      declares: [],
    };
    for (const op of v.operations) {
      const loc = keepLocations ? {loc: op.path.node.loc} : null;
      if (op instanceof Get) {
        const purpose = op.purpose;
        store.gets.push({...loc, purpose});
      } else if (op instanceof Put) {
        store.puts.push({...loc});
      } else if (op instanceof Declare) {
        store.declares.push({...loc});
      } else {
        // warn?
      }
    }
  }
  return {
    requires,
    freeVariables,
    imports
  };
}
module.exports = analyze;
