This is an executable that analyzes the usage of free variables (variables coming from outside the source text).

API usage is not stable at this time.

## How does it work?

### Scope Analysis
It first generates an AST for a source text using `@babel/parser` with plugins turned on for looser input verification.

It then does a walk of the AST to generate scope information and mark operations that need to be resolved for things such as `Get` and `Put` operations of bindings. Due to hoisting of variables, scoping operations cannot be resolved until a scope is fully walked.

It finally performs a resolve operation on all pending operations. This allows analysis of the resulting scopes and operations.

### Free variable analysis

It searches for operations that fall through to the global scope.

Note: functions in sloppy mode can leak a reference to the global scope via `this` since calling them without a receiver sets `this` to the global scope.

### Require analysis

It searches for `CallExpression`s that reference the free variable `require` and tries to see if the parameter passed to `require` can be determined statically. If the parameter is complex or requires runtime calculation it will be treated as dynamically calculated.

### Why not require the output of a transpiler to only process true JS?

Variables get added or renamed for runtimes. Transpilation of resources requires trust of the Transpiler to do so properly. Understanding which transpiler is used is non-trivial and ideally all files should be compiled ahead of usage by `node`. Due to this, the tool attempts a best effort approach that can understand transpiled output as transpilation will already flag files as having arbitrary code execution.
