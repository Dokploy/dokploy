## [0.36.1](https://github.com/Bl4ckBl1zZ/dokploy/compare/v0.36.0...v0.36.1) (2026-06-05)


### Bug Fixes

* preserve fork image during Dokploy updates ([87dcdaf](https://github.com/Bl4ckBl1zZ/dokploy/commit/87dcdafa4bd557ba5610cfbe2b84eb748f8254be))

# [0.36.0](https://github.com/Bl4ckBl1zZ/dokploy/compare/v0.35.2...v0.36.0) (2026-05-12)


### Bug Fixes

* align card footers to bottom on project and service cards ([1ed41fe](https://github.com/Bl4ckBl1zZ/dokploy/commit/1ed41fe2f8c2ad6283179d6a7f8e06af87c1061c))
* broken layout in project/[projectId]/environment/[environmentId].tsx ([9d6bc4c](https://github.com/Bl4ckBl1zZ/dokploy/commit/9d6bc4cd18bd4ddeaab141cb61fedd4f09973eca))
* broken layout in project/[projectId]/environment/[environmentId].tsx ([65b27af](https://github.com/Bl4ckBl1zZ/dokploy/commit/65b27af0f524e58de6b10665e459eff42813ade2))
* broken layout in project/[projectId]/environment/[environmentId].tsx ([6165114](https://github.com/Bl4ckBl1zZ/dokploy/commit/6165114bc3ba1d5124ecc40fa1226f2c34c10125))
* broken layout in project/[projectId]/environment/[environmentId].tsx ([d310935](https://github.com/Bl4ckBl1zZ/dokploy/commit/d3109359fb34c529759fad2884c76cb4bb21e075))
* broken layout in project/[projectId]/environment/[environmentId].tsx ([58f527d](https://github.com/Bl4ckBl1zZ/dokploy/commit/58f527d029d4bb94a09ff61d0499e80013a13d9d))
* **compose-file-editor:** simplify form reset logic in ComposeFileEditor component ([15296d5](https://github.com/Bl4ckBl1zZ/dokploy/commit/15296d5c858faab106a40aa0d5a234bf3fc6c498))
* enforce email length validation in reset password form ([ed006dc](https://github.com/Bl4ckBl1zZ/dokploy/commit/ed006dc5f9ffb16378ad2dbe2b14dfa0c9fedd83))
* **esbuild:** update path for migrate-auth-secret script ([62aeed5](https://github.com/Bl4ckBl1zZ/dokploy/commit/62aeed5aedd757e75cf3da8ae49fb96e328d8d0d))
* reduce healthcheck frequency to lower memory pressure ([8f3d824](https://github.com/Bl4ckBl1zZ/dokploy/commit/8f3d824ea6e4573472206af6ff3ef0a8fcac0754)), closes [#3909](https://github.com/Bl4ckBl1zZ/dokploy/issues/3909)
* remove leftover debug console.log statements ([7417928](https://github.com/Bl4ckBl1zZ/dokploy/commit/741792883aacd8c4e9e52cda797e0dbd5062c6d1))
* reorder imports and clean up unused ones across various components ([4a3fa6e](https://github.com/Bl4ckBl1zZ/dokploy/commit/4a3fa6e63f7bee6f02a47b32ae1b7fd47e092264))
* replace traefik.me with sslip.io for auto-generated domains ([f5ddc36](https://github.com/Bl4ckBl1zZ/dokploy/commit/f5ddc36f24e4289f4f27f1c27c1f566159e6a70d)), closes [#4365](https://github.com/Bl4ckBl1zZ/dokploy/issues/4365)
* responsiveness in components/dashboard/settings/web-domain.tsx ([de7d6f8](https://github.com/Bl4ckBl1zZ/dokploy/commit/de7d6f81474e02f0e04d1cfd74d2930140b97308))
* **sidebar:** close mobile sidebar on navigation ([096b8b3](https://github.com/Bl4ckBl1zZ/dokploy/commit/096b8b33fc69d3d910dff3ead86183f35dd3b380)), closes [#4340](https://github.com/Bl4ckBl1zZ/dokploy/issues/4340)
* **templates:** add fetch timeout and handle network errors gracefully ([5f5ed0f](https://github.com/Bl4ckBl1zZ/dokploy/commit/5f5ed0f2c2b24f2c48d5a998d6304137a9e5fc5b)), closes [#4282](https://github.com/Bl4ckBl1zZ/dokploy/issues/4282)
* **traefik:** update remote config writing to use base64 encoding ([06a3491](https://github.com/Bl4ckBl1zZ/dokploy/commit/06a349152f20a6e12f56cbb24c8e332acae33a7c))
* ui responsiveness for mobile, tab and desktop screens ([bca62d4](https://github.com/Bl4ckBl1zZ/dokploy/commit/bca62d43d24d4e258f758c82c7eb09141caecff1))
* ui responsiveness for mobile, tab and desktop screens ([d502f4a](https://github.com/Bl4ckBl1zZ/dokploy/commit/d502f4a206a0ea9d34c6360fbc9c03e86da97adc))
* use temporary redirects for auth checks in getServerSideProps ([c854a38](https://github.com/Bl4ckBl1zZ/dokploy/commit/c854a38adb1a2bd2e350fd045721ca13aaf16868)), closes [#4220](https://github.com/Bl4ckBl1zZ/dokploy/issues/4220)
* **validation:** update regex for directory validation in WebSocket utility ([282d358](https://github.com/Bl4ckBl1zZ/dokploy/commit/282d358d048cef0ef648e872bab5418b819e10fc))
* **webhook:** cast signature to string to fix TS2345 ([fc6df3a](https://github.com/Bl4ckBl1zZ/dokploy/commit/fc6df3ae0528d3a2fc63acc0e592cabd238738e5))
* **webhook:** return 401 when signature header is missing ([ba3591b](https://github.com/Bl4ckBl1zZ/dokploy/commit/ba3591b3acab0bb8f185830f6329d201ed89c03f))


### Features

* add copy button to AI log analysis result ([ad490dc](https://github.com/Bl4ckBl1zZ/dokploy/commit/ad490dca3fc60aee4470a669d886bfd2149f462f))
* **auth:** implement migration script for auth secret and refactor secret handling ([9c71458](https://github.com/Bl4ckBl1zZ/dokploy/commit/9c71458eff439e45bcccd9ea8248a3c3f9020dcf))
* **deployment:** enhance log retrieval by encoding log path in base64 ([a4e2317](https://github.com/Bl4ckBl1zZ/dokploy/commit/a4e2317f3e0612a13a4fde5c4ca4f599cf9a2f61))
* **schedules:** add optional description field to schedule form and display ([d3292a2](https://github.com/Bl4ckBl1zZ/dokploy/commit/d3292a28109d896c37ab61e185607727a4c51fed))
* **sync:** add job to sync OpenAPI specification to SDK repository ([2f08b33](https://github.com/Bl4ckBl1zZ/dokploy/commit/2f08b33931e37677a36633f6e7772501f44cabd4))
* **templates:** add isolated deployment configuration to CompleteTemplate ([ffd51cf](https://github.com/Bl4ckBl1zZ/dokploy/commit/ffd51cf32fb081b2fa406eea4c57a0b000d43d01))
* **templates:** support isolated = false opt-out in template.toml ([c182755](https://github.com/Bl4ckBl1zZ/dokploy/commit/c182755591dcad5f6d035a25b5753434c645b7bb)), closes [#4366](https://github.com/Bl4ckBl1zZ/dokploy/issues/4366)
* **validation:** add branch name validation across provider schemas ([fef2de1](https://github.com/Bl4ckBl1zZ/dokploy/commit/fef2de1ec587c9b4da37e5548dc9a5e0ce8732f1))
* **validation:** enhance destination path validation in file upload schema ([b9e97eb](https://github.com/Bl4ckBl1zZ/dokploy/commit/b9e97eb321358145d6aed0bad67d3ac789ae69c4))
* **validation:** enhance registry URL validation in schema ([547ba2d](https://github.com/Bl4ckBl1zZ/dokploy/commit/547ba2d04bc66f820e3635826a85d6141a233b7e))
* **validation:** standardize branch name validation across provider schemas ([5e02179](https://github.com/Bl4ckBl1zZ/dokploy/commit/5e021797f3cdce3b268de72a925f99d789b80110))

## [0.35.2](https://github.com/Bl4ckBl1zZ/dokploy/compare/v0.35.1...v0.35.2) (2026-05-03)


### Bug Fixes

* **cloudflare:** prevent infinite render loop in domain fields ([f046514](https://github.com/Bl4ckBl1zZ/dokploy/commit/f04651425741eaf881821e05b5df0ff3154602e8))

## [0.35.1](https://github.com/Bl4ckBl1zZ/dokploy/compare/v0.35.0...v0.35.1) (2026-05-03)


### Bug Fixes

* address coderabbit review findings ([16f4e04](https://github.com/Bl4ckBl1zZ/dokploy/commit/16f4e04e18f27634f69f101687e4166b57f7e098))
* address second coderabbit review pass ([023be2b](https://github.com/Bl4ckBl1zZ/dokploy/commit/023be2b06d3c2407e5b8177731c6c1853a179462))
* address third coderabbit review pass ([bcc6eda](https://github.com/Bl4ckBl1zZ/dokploy/commit/bcc6eda3533bdf15bc21801460459731f3f18076))
* **cloudflare:** cleanup DNS records when deleting application or compose ([e8fae25](https://github.com/Bl4ckBl1zZ/dokploy/commit/e8fae256f0b19537e946657403cfd15b4daca844))

# [0.35.0](https://github.com/Bl4ckBl1zZ/dokploy/compare/v0.34.0...v0.35.0) (2026-05-03)


### Features

* **cloudflare:** local tunnel for Dokploy panel host ([76b3a67](https://github.com/Bl4ckBl1zZ/dokploy/commit/76b3a671bb93c88d8fff007dc611b0e609188f67))

# [0.34.0](https://github.com/Bl4ckBl1zZ/dokploy/compare/v0.33.0...v0.34.0) (2026-05-03)


### Features

* **cloudflare:** account-aware orchestrator (picker + pre-flight) ([1368f20](https://github.com/Bl4ckBl1zZ/dokploy/commit/1368f2077a8e1176ef4929a6abedf893aa152850))
* **cloudflare:** group available zones by account in add dialog ([8465875](https://github.com/Bl4ckBl1zZ/dokploy/commit/84658759f98de548418c892671b0307ad21c1fce))
* **cloudflare:** multi-account schema (accounts jsonb, server.tunnelAccountId) ([f9ea950](https://github.com/Bl4ckBl1zZ/dokploy/commit/f9ea950b66e0bb3d221e8c96eef1199697134af1))
* **cloudflare:** per-server account picker + rename Reconcile to Push ([3f654d0](https://github.com/Bl4ckBl1zZ/dokploy/commit/3f654d0185a5b8083d7dbd6b434e4ea1fb41cd3d))
* **cloudflare:** pickTunnelAccount derivation helper ([9444468](https://github.com/Bl4ckBl1zZ/dokploy/commit/944446885e51272bcb45739121a9a84b6cf0ccc0))
* **cloudflare:** show all accessible accounts on settings page ([2258e8f](https://github.com/Bl4ckBl1zZ/dokploy/commit/2258e8ffa30e7faadeede20a6b409ceaf76d633a))
* **cloudflare:** surface zone/tunnel account mismatches on server card ([212fb49](https://github.com/Bl4ckBl1zZ/dokploy/commit/212fb49e4aae60015d9770675bdbeee75713deaf))
* **cloudflare:** tRPC procedures for accounts + picker + tunnel-account binding ([1ccee10](https://github.com/Bl4ckBl1zZ/dokploy/commit/1ccee105e5162d31744033ebc93b076d48d21cfe))
* **cloudflare:** verifyToken returns full accounts list ([e3de1b3](https://github.com/Bl4ckBl1zZ/dokploy/commit/e3de1b3dcbaee40d9643b677c9ad4a6d854045cf))

# [0.33.0](https://github.com/Bl4ckBl1zZ/dokploy/compare/v0.32.0...v0.33.0) (2026-05-02)


### Bug Fixes

* **cloudflare:** address PR review findings ([5456ab4](https://github.com/Bl4ckBl1zZ/dokploy/commit/5456ab4e2fb752b9c2bc1aa06d321f0da35a7d43))
* **cloudflare:** register cloudflare in free-tier permissions test fixture ([e400330](https://github.com/Bl4ckBl1zZ/dokploy/commit/e400330ab727cfcda05390b5bab17263239e5591))
* **cloudflare:** second pass on PR review findings ([5de95bf](https://github.com/Bl4ckBl1zZ/dokploy/commit/5de95bf2875b84054d059b4731a1b86cf862904b))


### Features

* **cloudflare:** domain modal CF picker + list view CF badge ([749d784](https://github.com/Bl4ckBl1zZ/dokploy/commit/749d784d133869e59a7d2d9fc825a29326b88537))
* **cloudflare:** HTTP service module + SSH tunnel installer ([16abd2f](https://github.com/Bl4ckBl1zZ/dokploy/commit/16abd2f0e62d32fb9b6d330763e5adbd2817181e))
* **cloudflare:** orchestrator + auto-provision on server setup ([12c05eb](https://github.com/Bl4ckBl1zZ/dokploy/commit/12c05ebdab2b9940288940b11dec37de8e83c8f7))
* **cloudflare:** schema foundation for CF tunnels + managed domains ([dd0aaa3](https://github.com/Bl4ckBl1zZ/dokploy/commit/dd0aaa359e79ec80126aeab9e6917e0637b2f498))
* **cloudflare:** server card tunnel pill + actions menu ([19beccf](https://github.com/Bl4ckBl1zZ/dokploy/commit/19beccf968aba141511388c53fbfe1db52b5ba86))
* **cloudflare:** settings page + sidebar nav ([9715ceb](https://github.com/Bl4ckBl1zZ/dokploy/commit/9715ceb9a19ffd4fd473958270be04ba54ddee60))
* **cloudflare:** tRPC routers + tunnel/domain hooks ([1f77aa5](https://github.com/Bl4ckBl1zZ/dokploy/commit/1f77aa53dad04bf149bbdf915b8f999372b4c252))

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
