# installation

clone and run `npm i --ignore-scripts`

# usage

`cat file | node dump.js`

will print a JSON object.

* `.requires` is the require analysis of a file.
* `.freeVariables` is the access analysis of free variables in the file.
