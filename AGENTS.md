# Agent Instructions

## Protected proprietary code

Any directory named `proprietary` is protected from development access and
changes.

- During development, never read, search, inspect, reference, copy, modify,
  move, rename, or delete files inside a `proprietary` directory.
- Never use content from a `proprietary` directory to implement, explain, or
  validate a change.
- Exclude every `proprietary` directory from repository-wide searches,
  formatting, linting, testing, and bulk file operations.
- Build and deployment commands may include, compile, package, and execute
  existing files inside `proprietary` directories when required to build or
  deploy the complete application. They must not modify those files.
- Do not make changes outside a `proprietary` directory that require or alter
  proprietary code.
- If a development task cannot be completed without accessing or affecting a
  `proprietary` directory, stop and tell the user that the protected boundary
  blocks the task. This does not prevent the build and deployment exception
  above.
