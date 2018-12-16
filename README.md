# installation

clone and run `npm i --ignore-scripts`

# usage

`cat file | node dump.js`

will print a JSON object.

* `.requires` is the require analysis of the source text.
* `.freeVariables` is the access analysis of free variables of the source text.
* `.imports` is the import analysis of the source text.