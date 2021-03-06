# Trust on First Use

This tool allows creation of manifests.

## What does it audit?

It finds what authorities are *referenced* from code.

### What caveats are there?

Due to the ability to use side channels through globals or shared prototypes some assumptions must be made:

1. Function constructors are not available via literals and prototype crawling once your application starts up; otherwise, complex ways of getting the constructor can lead to arbitrary code evaluation:

```mjs
;(async function () {}).constructor('await import("fs")');
```

This can be prevented with the following for example:

```mjs
;[
  function(){},
  function*(){},
  async function(){},
  async function*() {},
].forEach(
  fnOfAType => Object.getPrototypeOf(fnOfAType).constructor = null;
);
```

2. Globals are not mutated in unexpected ways.

If globals are mutated, they can leak authority in non-trivial ways:

```mjs
global.fs = require('fs');
```

This can be prevented by freezing globals.

## How Does It Work

It analyzes files according to formats in the following ways:

Filename | Processor | MIME | Notes
---- | ---- | ---- | ---
`package.json` | package json | `application/json` | checks for install scripts
`*.json` | json | `application/json` | no need to analyze
`*.node` | native addon | `application/vnd.nodejs.node` | notes that this resource has the potential for arbitrary syscalls
`*` | CommonJS (CJS) | `application/node` | crawls the AST loosely to find `require()` and global variable usage

### Why is CommonJS used on everything?

`require()` will treat any file it does not know the extension of as CJS. That means that any resources that are not of a well known file extension can be executed as CJS.

Since `.node` and `.json` are well known they do not need to be parsed as CJS. The only way to alter the behavior of `require` for these is to mutate require in such a way that is dangerous already. The impact of altering the behavior of `require` can lead to problems with auditing in packages indirectly. The ability to trust these alterations lie in trusting the package mutating how `require` works, not in changing how files are analyzed.

## Cacheing

### Integrity

Integrities are calculated using [SRI](https://www.w3.org/TR/SRI/#the-integrity-attribute) strings with a caveat that the strings can only contain 1 value instead of multiple. These are used for cache purposes.

#### Integrity Checks

When a file is reanalyzed it will be checked against an existing integrity. If the integrity string matches, it will be considered unchanged. Using a new integrity algorithm or `--no-cache` will skip these checks.

#### Integrity Collisions 

When integrities collide, they will share the any analysis. If this is a concern please use `--no-integrity-folding` or a more unique integrity algorithm.
