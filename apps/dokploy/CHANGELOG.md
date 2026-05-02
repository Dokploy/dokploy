# [0.32.0](https://github.com/Bl4ckBl1zZ/dokploy/compare/v0.31.1...v0.32.0) (2026-05-02)


### Bug Fixes

* **typecheck:** drop unused [@ts-expect-error](https://github.com/ts-expect-error) in web-server terminal ([d78086b](https://github.com/Bl4ckBl1zZ/dokploy/commit/d78086b680b9a66ec904df51f9f7c6aad9baf615))


### Features

* **ui:** mobile-optimize dashboard layouts and primitives ([e47788b](https://github.com/Bl4ckBl1zZ/dokploy/commit/e47788b1d0f468223fc27a7ca59dbf877d3ab736))

## [0.31.1](https://github.com/Bl4ckBl1zZ/dokploy/compare/v0.31.0...v0.31.1) (2026-04-30)


### Bug Fixes

* **release:** disable github plugin PR/issue commenting ([97c412f](https://github.com/Bl4ckBl1zZ/dokploy/commit/97c412f9a41dffb32d7778297c3ca0b2820c6d5f)), closes [#4303](https://github.com/Bl4ckBl1zZ/dokploy/issues/4303)

# [0.31.0](https://github.com/Bl4ckBl1zZ/dokploy/compare/v0.30.1...v0.31.0) (2026-04-30)


### Bug Fixes

* add cross-org ownership checks to cluster, deployment, backup, and WebSocket endpoints ([018e2b1](https://github.com/Bl4ckBl1zZ/dokploy/commit/018e2b153e564cf9af163d47ce4a1ee409dfb848))
* fallback to DownstreamStatus when OriginStatus is 0 in requests table ([e9fdc19](https://github.com/Bl4ckBl1zZ/dokploy/commit/e9fdc19b9615dfd6dc832e52b1fcda4e2e39cd86)), closes [#4250](https://github.com/Bl4ckBl1zZ/dokploy/issues/4250)
* filter requests by hostname instead of path ([598fae0](https://github.com/Bl4ckBl1zZ/dokploy/commit/598fae0e92e5bd9941f78170d26ac6b6a088e9cc)), closes [#4249](https://github.com/Bl4ckBl1zZ/dokploy/issues/4249)
* limit application columns in findPreviewDeploymentById to avoid postgres 100-arg limit ([54417ca](https://github.com/Bl4ckBl1zZ/dokploy/commit/54417ca8e73ad7ff26558fc305256abf45208587)), closes [#4256](https://github.com/Bl4ckBl1zZ/dokploy/issues/4256)
* **release:** bump version with exec plugin instead of npm ([b714c8d](https://github.com/Bl4ckBl1zZ/dokploy/commit/b714c8dcf447b71c1bfe39d23a4c5cd62c028699))
* stop leaking Drizzle SQL queries in webhook error responses ([#4276](https://github.com/Bl4ckBl1zZ/dokploy/issues/4276)) ([f8c6c8f](https://github.com/Bl4ckBl1zZ/dokploy/commit/f8c6c8f7ccee57ac16b5d13cba398a967b92706d))
* strictly use ssh2 1.16.0 package ([eafbd03](https://github.com/Bl4ckBl1zZ/dokploy/commit/eafbd0353e067abfb289707fb44957fcc170dd52))
* update import statements to include file extensions for consistency ([628f16e](https://github.com/Bl4ckBl1zZ/dokploy/commit/628f16e8cb5683bd29e0ba18fdb883808f29d0ae))
* upgrade ssh2 from 1.15.0 to ^1.16.0 (util.isDate removed in Node.js v23+) ([91ebf3b](https://github.com/Bl4ckBl1zZ/dokploy/commit/91ebf3b6f5937c72970ab1c3627880d01b3b3af7))


### Features

* add organization-level authorization checks to WebSocket servers ([232ccc9](https://github.com/Bl4ckBl1zZ/dokploy/commit/232ccc913967e28d58635a989a80cd77733d9f96))
* enhance schedule management with permission checks and cloud restrictions ([c3fa638](https://github.com/Bl4ckBl1zZ/dokploy/commit/c3fa638a566e77dc4d71d9b49de84a1942e1f824))
* implement invitation email functionality for organization creation ([b610f7a](https://github.com/Bl4ckBl1zZ/dokploy/commit/b610f7aeffccbb6f841bcb73ec50a4b68733d152))

# Changelog

## [0.30.1](https://github.com/Bl4ckBl1zZ/dokploy/compare/v0.30.0...v0.30.1) (2026-04-19)


### Bug Fixes

* **monitoring:** collect container metrics by default and surface failures ([#8](https://github.com/Bl4ckBl1zZ/dokploy/issues/8)) ([d8bcd56](https://github.com/Bl4ckBl1zZ/dokploy/commit/d8bcd56fbcbb8f971c0489d07d3be26aeb2a736f))

## [0.30.0](https://github.com/Bl4ckBl1zZ/dokploy/compare/v0.29.1...v0.30.0) (2026-04-18)


### Features

* **monitoring:** expose remote-server monitoring tab on self-hosted ([#4](https://github.com/Bl4ckBl1zZ/dokploy/issues/4)) ([2f83478](https://github.com/Bl4ckBl1zZ/dokploy/commit/2f83478af73fab271a52a463c1ab6288019d7770))
