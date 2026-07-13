## [0.37.1](https://github.com/Bl4ckBl1zZ/dokploy/compare/v0.37.0...v0.37.1) (2026-07-13)


### Bug Fixes

* make Dokploy self-updates converge ([a20f130](https://github.com/Bl4ckBl1zZ/dokploy/commit/a20f1301be302f4e9dac3742b91c8ebc2a97f266))

# [0.37.0](https://github.com/Bl4ckBl1zZ/dokploy/compare/v0.36.2...v0.37.0) (2026-07-13)


### Bug Fixes

* add docker cleanup toggle to remote server creation ([#4559](https://github.com/Bl4ckBl1zZ/dokploy/issues/4559)) ([e6fc3db](https://github.com/Bl4ckBl1zZ/dokploy/commit/e6fc3db08f7ad65e020854a185bedd2c5c0d091c))
* add method="post" to auth forms to prevent credential leak in URL ([#4683](https://github.com/Bl4ckBl1zZ/dokploy/issues/4683)) ([8b64815](https://github.com/Bl4ckBl1zZ/dokploy/commit/8b6481501e6e379b9ce32c4da4201fcb7a65364a))
* add tls=true label for domains when certificateType is none ([#4018](https://github.com/Bl4ckBl1zZ/dokploy/issues/4018)) ([#4474](https://github.com/Bl4ckBl1zZ/dokploy/issues/4474)) ([103e2f7](https://github.com/Bl4ckBl1zZ/dokploy/commit/103e2f70a8432d028117eddd3e8b346fb2c4a849))
* add type="button" to TooltipTrigger in form components to prevent accidental submission ([#4422](https://github.com/Bl4ckBl1zZ/dokploy/issues/4422)) ([f6e6e5c](https://github.com/Bl4ckBl1zZ/dokploy/commit/f6e6e5cc004d8d54c3f970acf3f84fcd4f0ebc9c))
* **ai:** allow configFiles to be null in template generator Details type ([#4736](https://github.com/Bl4ckBl1zZ/dokploy/issues/4736)) ([38de9ef](https://github.com/Bl4ckBl1zZ/dokploy/commit/38de9ef2183f9237d1fcc084e909ca83a95a731e))
* **ai:** allow Ollama Cloud API key in AI settings ([#4262](https://github.com/Bl4ckBl1zZ/dokploy/issues/4262)) ([ca2708a](https://github.com/Bl4ckBl1zZ/dokploy/commit/ca2708a58aea96109e2f1e33a887b3ea33e5148c))
* **ai:** use nullable instead of optional for configFiles in AI suggestion schema ([#4732](https://github.com/Bl4ckBl1zZ/dokploy/issues/4732)) ([3e11c0a](https://github.com/Bl4ckBl1zZ/dokploy/commit/3e11c0a240d16dc519f7b05505c0fc70a26d5129)), closes [#4267](https://github.com/Bl4ckBl1zZ/dokploy/issues/4267)
* allow members with git providers permission to create and delete their own ([#4713](https://github.com/Bl4ckBl1zZ/dokploy/issues/4713)) ([aa72091](https://github.com/Bl4ckBl1zZ/dokploy/commit/aa720913165ffb924da26ef1177ea407ab6cc55f)), closes [#4695](https://github.com/Bl4ckBl1zZ/dokploy/issues/4695)
* allow square brackets in zip path validation for Next.js dynamic routes ([#4468](https://github.com/Bl4ckBl1zZ/dokploy/issues/4468)) ([af8072d](https://github.com/Bl4ckBl1zZ/dokploy/commit/af8072d7ad33b5fd5b216ae30e3e1fb1a0dade2d))
* automatically converting username to lowercase both in creation of register, and build for extra. ([#4382](https://github.com/Bl4ckBl1zZ/dokploy/issues/4382)) ([6e342ee](https://github.com/Bl4ckBl1zZ/dokploy/commit/6e342ee2f2b728a42c3a5901749c42dfc41b7ef2))
* **backup:** redact S3 credentials from logs and error output ([#4648](https://github.com/Bl4ckBl1zZ/dokploy/issues/4648)) ([f8a3561](https://github.com/Bl4ckBl1zZ/dokploy/commit/f8a3561f1ed906821baf4ec32ca7b1f108bcdc13)), closes [#4621](https://github.com/Bl4ckBl1zZ/dokploy/issues/4621) [#4621](https://github.com/Bl4ckBl1zZ/dokploy/issues/4621)
* copy Dokploy server IP when clicking server badge ([#4390](https://github.com/Bl4ckBl1zZ/dokploy/issues/4390)) ([8d88a34](https://github.com/Bl4ckBl1zZ/dokploy/commit/8d88a34a6459eb99674ab7d238695b0efd6d9b44))
* correct deriveCookieSecret test to validate 16-byte hex secret as per oauth2-proxy requirements ([dfbae18](https://github.com/Bl4ckBl1zZ/dokploy/commit/dfbae18557f8f47b9ed91dc0ab57fa741fe5069b))
* correct git provider access check for existing deploys ([#4570](https://github.com/Bl4ckBl1zZ/dokploy/issues/4570)) ([e9a0932](https://github.com/Bl4ckBl1zZ/dokploy/commit/e9a0932b2393c95e77d18283037fa76e61fbc4b1)), closes [#4469](https://github.com/Bl4ckBl1zZ/dokploy/issues/4469)
* **databases:** resolve crash when opening rebuild database dialog ([4e3a6db](https://github.com/Bl4ckBl1zZ/dokploy/commit/4e3a6db83aa72f2e2532d82da8eb82cda566c442))
* **databases:** update default Redis version from 7 to 8 ([#4224](https://github.com/Bl4ckBl1zZ/dokploy/issues/4224)) ([475a01c](https://github.com/Bl4ckBl1zZ/dokploy/commit/475a01c4a2138d0a2f668553fbb0fc515ecf3c5d)), closes [#4172](https://github.com/Bl4ckBl1zZ/dokploy/issues/4172)
* **deployment:** resolve schedule to its service before permission check in allByType ([#4733](https://github.com/Bl4ckBl1zZ/dokploy/issues/4733)) ([8a0e442](https://github.com/Bl4ckBl1zZ/dokploy/commit/8a0e44291f68189fb3b1b077ff1c9741a2c15959))
* **domain:** validate hostname format to reject invalid characters ([#4729](https://github.com/Bl4ckBl1zZ/dokploy/issues/4729)) ([b2692cd](https://github.com/Bl4ckBl1zZ/dokploy/commit/b2692cd594eb2f6ba92855f9e44157b791511a1e)), closes [#4716](https://github.com/Bl4ckBl1zZ/dokploy/issues/4716)
* don't let ssh-keyscan abort SSH git clones ([#4605](https://github.com/Bl4ckBl1zZ/dokploy/issues/4605)) ([8d44c6a](https://github.com/Bl4ckBl1zZ/dokploy/commit/8d44c6a1e81a133f7daf39babc4455e1802d5998))
* enable comment toggle shortcut in env variable editor ([#4402](https://github.com/Bl4ckBl1zZ/dokploy/issues/4402)) ([#4473](https://github.com/Bl4ckBl1zZ/dokploy/issues/4473)) ([34d38cf](https://github.com/Bl4ckBl1zZ/dokploy/commit/34d38cf90ed861c6adbc34a6a4740608976f37aa))
* enforce docker:read on container start/stop/kill/restart mutations ([#4568](https://github.com/Bl4ckBl1zZ/dokploy/issues/4568)) ([a0288f8](https://github.com/Bl4ckBl1zZ/dokploy/commit/a0288f83d5063436150bcf1cd3ee6ac8520be1a9))
* grant create and delete SSH key permissions when canAccessToSSHKeys is enabled for members ([#4512](https://github.com/Bl4ckBl1zZ/dokploy/issues/4512)) ([4ba0f71](https://github.com/Bl4ckBl1zZ/dokploy/commit/4ba0f7122085cd6fdd4871e85d7e24a2dbea0f50))
* **migrate-auth-secret:** exit cleanly when there are no 2FA records ([9f10f0f](https://github.com/Bl4ckBl1zZ/dokploy/commit/9f10f0f4e979978f753ff42fc6440d6b0a0ce619)), closes [#4392](https://github.com/Bl4ckBl1zZ/dokploy/issues/4392)
* preserve HOME in compose deploy so --with-registry-auth can read docker config ([#4485](https://github.com/Bl4ckBl1zZ/dokploy/issues/4485)) ([85211af](https://github.com/Bl4ckBl1zZ/dokploy/commit/85211afd415f8424f11c109754c5e55a3348e94b)), closes [#4401](https://github.com/Bl4ckBl1zZ/dokploy/issues/4401)
* prevent registry password from appearing in error messages and shell commands ([#4579](https://github.com/Bl4ckBl1zZ/dokploy/issues/4579)) ([1f4f940](https://github.com/Bl4ckBl1zZ/dokploy/commit/1f4f94042f1d874349c42d8ae7fee51346cd086e))
* prevent request path truncation in request logs ([#4643](https://github.com/Bl4ckBl1zZ/dokploy/issues/4643)) ([1bf661b](https://github.com/Bl4ckBl1zZ/dokploy/commit/1bf661b621829f43f895c9b68a1e15f89cdc6c5c)), closes [#4642](https://github.com/Bl4ckBl1zZ/dokploy/issues/4642)
* prevent webhook deploy crash when commit data lacks modified files ([#4470](https://github.com/Bl4ckBl1zZ/dokploy/issues/4470)) ([b06138b](https://github.com/Bl4ckBl1zZ/dokploy/commit/b06138b23002a1fc72e735dc390fb16b4ad44ea9))
* **projects:** make project cards grid fill available width on wide screens ([#4731](https://github.com/Bl4ckBl1zZ/dokploy/issues/4731)) ([b96c5e8](https://github.com/Bl4ckBl1zZ/dokploy/commit/b96c5e865501b047c1a0e1a311d0e77cd83f8ce3))
* refine permission check for privileged static roles in permission service ([95633b4](https://github.com/Bl4ckBl1zZ/dokploy/commit/95633b412221446301c74ebfc50cf0768ce4fe89))
* **registry:** preserve username case for ECR compatibility ([#4632](https://github.com/Bl4ckBl1zZ/dokploy/issues/4632)) ([#4647](https://github.com/Bl4ckBl1zZ/dokploy/issues/4647)) ([ec9dd28](https://github.com/Bl4ckBl1zZ/dokploy/commit/ec9dd289244ba24af0fc4e1d9590fc99eb56b64e))
* **requests:** remove nested ResponsiveContainer breaking chart height ([c9ac723](https://github.com/Bl4ckBl1zZ/dokploy/commit/c9ac7236a77577a134023d91330f84dceab9b577))
* resolve server from parent entity in deployment.readLogs ([#4689](https://github.com/Bl4ckBl1zZ/dokploy/issues/4689)) ([b4e2d27](https://github.com/Bl4ckBl1zZ/dokploy/commit/b4e2d274b1f8320968489fcd9c434bf811cfbd74)), closes [#4687](https://github.com/Bl4ckBl1zZ/dokploy/issues/4687)
* resolve traefik container dynamically in access-log cleanup ([#4646](https://github.com/Bl4ckBl1zZ/dokploy/issues/4646)) ([d87229c](https://github.com/Bl4ckBl1zZ/dokploy/commit/d87229ccd3bc6f9d14e2b52eeeb6ef57ae6181ec)), closes [#4620](https://github.com/Bl4ckBl1zZ/dokploy/issues/4620)
* respect gitProviders permissions in git provider UI ([#4561](https://github.com/Bl4ckBl1zZ/dokploy/issues/4561)) ([c377be0](https://github.com/Bl4ckBl1zZ/dokploy/commit/c377be0a14fbe927018f195042eab2f972e25ffa))
* responsive layout ([#4391](https://github.com/Bl4ckBl1zZ/dokploy/issues/4391)) ([ef0cf9b](https://github.com/Bl4ckBl1zZ/dokploy/commit/ef0cf9bd02be4569b1e0077bc5fd69162b63f097))
* scope dokploy-server schedules to organization instead of user ([#4526](https://github.com/Bl4ckBl1zZ/dokploy/issues/4526)) ([c73632c](https://github.com/Bl4ckBl1zZ/dokploy/commit/c73632cbe0f3eeb03e1d186a6bd98798f3ebc7de)), closes [#4300](https://github.com/Bl4ckBl1zZ/dokploy/issues/4300)
* scope dokploy-server schedules to organization instead of user ([#4526](https://github.com/Bl4ckBl1zZ/dokploy/issues/4526)) ([6ff2ca0](https://github.com/Bl4ckBl1zZ/dokploy/commit/6ff2ca0173e6dffecca73f63b9f896690449a19b)), closes [#4300](https://github.com/Bl4ckBl1zZ/dokploy/issues/4300)
* **server-setup:** report the installed Docker version in the setup banner ([#4723](https://github.com/Bl4ckBl1zZ/dokploy/issues/4723)) ([db0cb66](https://github.com/Bl4ckBl1zZ/dokploy/commit/db0cb66f0dafc855b50131560e6173fbbbe7351c))
* **sso:** apply trusted origin changes without server restart ([b3621bc](https://github.com/Bl4ckBl1zZ/dokploy/commit/b3621bcfff5fb3613fc65ee89f5f1514962c9f72))
* strip credentials from gitProvider.getAll API response ([#4569](https://github.com/Bl4ckBl1zZ/dokploy/issues/4569)) ([6b68fca](https://github.com/Bl4ckBl1zZ/dokploy/commit/6b68fcab8c22d5de646973b438bb057bd03bf213))
* strip credentials from service-level API responses ([#4564](https://github.com/Bl4ckBl1zZ/dokploy/issues/4564)) ([c968a27](https://github.com/Bl4ckBl1zZ/dokploy/commit/c968a2755e85bf76fc97eb6ba15e23c4ff65a5c7))
* swarm health check fields not resetting to default values ([#4558](https://github.com/Bl4ckBl1zZ/dokploy/issues/4558)) ([57ef96a](https://github.com/Bl4ckBl1zZ/dokploy/commit/57ef96a45821fdf1a1b884222ad94954205875e6)), closes [#4553](https://github.com/Bl4ckBl1zZ/dokploy/issues/4553)
* **tag-filter:** update no tags message and improve layout ([8c90040](https://github.com/Bl4ckBl1zZ/dokploy/commit/8c900408bdd779465b3aa6c1ed93f7fb7050849b))
* **ui:** adjust button container to grid layout to prevent overflow in 2FA screen ([01ac309](https://github.com/Bl4ckBl1zZ/dokploy/commit/01ac30974ff3f59fdc46458362c46f46164e0685))
* **ui:** enable vertical scroll on collapsed sidebar ([a296407](https://github.com/Bl4ckBl1zZ/dokploy/commit/a296407c8588f2897f46ff4cb5578ce2468d0339))
* **ui:** improve select component behavior and styling across various providers ([8db1250](https://github.com/Bl4ckBl1zZ/dokploy/commit/8db1250487c7c97f2fa09ebaa183c2cba4cb5a58))
* **ui:** prevent scrollbar layout shift ([71bbbb4](https://github.com/Bl4ckBl1zZ/dokploy/commit/71bbbb44dbd2a74b964daea924457eb9b242400a))
* **ui:** resolve CommandDialog crash on ⌘J shortcut ([17fdd64](https://github.com/Bl4ckBl1zZ/dokploy/commit/17fdd64c10b4643dd0ee590bce2ffb1138876935))
* **ui:** update project name display in environment page ([d7b9f01](https://github.com/Bl4ckBl1zZ/dokploy/commit/d7b9f015677f0b698823c120113e8f1d9b7cd5ef))
* update deriveCookieSecret to meet oauth2-proxy requirements ([c1c887d](https://github.com/Bl4ckBl1zZ/dokploy/commit/c1c887d03c3f7da6b1d3df6563981f9324acfe22))
* update schedule scoping from user to organization ([6a0acd9](https://github.com/Bl4ckBl1zZ/dokploy/commit/6a0acd9cad0a00f2ef09a10124d2d40f57e220f6))
* use create permission for basic auth delete instead of delete ([#4513](https://github.com/Bl4ckBl1zZ/dokploy/issues/4513)) ([d7d6422](https://github.com/Bl4ckBl1zZ/dokploy/commit/d7d642230cde13ba4e493484bba5a9bc294deb42))
* use github owner login for webhook deploy matching ([#4674](https://github.com/Bl4ckBl1zZ/dokploy/issues/4674)) ([f5ded8b](https://github.com/Bl4ckBl1zZ/dokploy/commit/f5ded8b2731e68b66adf17b1cbfdaa53c2f593c0))
* use stop-first update order for all database services ([#4560](https://github.com/Bl4ckBl1zZ/dokploy/issues/4560)) ([e944603](https://github.com/Bl4ckBl1zZ/dokploy/commit/e944603f99df989772fd14945ab317d7b1064733)), closes [#4550](https://github.com/Bl4ckBl1zZ/dokploy/issues/4550)
* use swarm advertise address in docker swarm join command ([#4567](https://github.com/Bl4ckBl1zZ/dokploy/issues/4567)) ([4900204](https://github.com/Bl4ckBl1zZ/dokploy/commit/4900204107a8ccbdd5bccddf50012e73757f0b3b))
* **user:** scope user.get relation columns to reduce SSR payload size ([#4730](https://github.com/Bl4ckBl1zZ/dokploy/issues/4730)) ([3e74f9a](https://github.com/Bl4ckBl1zZ/dokploy/commit/3e74f9a374a2354540a36fc5020d95d586af3871))
* **validation:** allow hashtag in git branch names ([#4714](https://github.com/Bl4ckBl1zZ/dokploy/issues/4714)) ([6431e9b](https://github.com/Bl4ckBl1zZ/dokploy/commit/6431e9b7b0e97f6319051d42768cc3f90c367c00)), closes [feat#123](https://github.com/feat/issues/123) [feat#123](https://github.com/feat/issues/123) [#4585](https://github.com/Bl4ckBl1zZ/dokploy/issues/4585)
* wrap long server names and keep actions menu visible ([#4434](https://github.com/Bl4ckBl1zZ/dokploy/issues/4434)) ([ad680ae](https://github.com/Bl4ckBl1zZ/dokploy/commit/ad680ae108de2b0e98fe6373f2fa7821bffbf3b4))


### Features

* add claim mapping functionality to OIDC registration dialog ([#4712](https://github.com/Bl4ckBl1zZ/dokploy/issues/4712)) ([c2a9587](https://github.com/Bl4ckBl1zZ/dokploy/commit/c2a95870f5815d0cf6066ce466cbe7bb6519314f))
* add self-hosted enterprise restrictions (remote-servers-only, enforce-sso) ([#4511](https://github.com/Bl4ckBl1zZ/dokploy/issues/4511)) ([8018027](https://github.com/Bl4ckBl1zZ/dokploy/commit/801802733057931f6b356d1fb7ed593ebf64612c))
* add SQL migration for lucky echo and update foreign key constraints ([aa545ec](https://github.com/Bl4ckBl1zZ/dokploy/commit/aa545ec71c9fcde002c423e25e817b59858b8695))
* **ci:** attach install.sh from website repo to each release ([d3e0b10](https://github.com/Bl4ckBl1zZ/dokploy/commit/d3e0b100a00331b9f64a8894c01206c3c1b68656))
* **ci:** pin install.sh release asset to the released version ([9749d86](https://github.com/Bl4ckBl1zZ/dokploy/commit/9749d86b4c808607f48893ec9dfe685eac70337d))
* **compose:** add import from base64 in create service dropdown ([754774e](https://github.com/Bl4ckBl1zZ/dokploy/commit/754774ea02d07b02cda9cfbf4e581b230f7ebe98))
* **databases:** add copy button to User and Database Name fields ([#4735](https://github.com/Bl4ckBl1zZ/dokploy/issues/4735)) ([cb23d72](https://github.com/Bl4ckBl1zZ/dokploy/commit/cb23d726fe7970eca8cb68f65855ef50cd38781d)), closes [#4495](https://github.com/Bl4ckBl1zZ/dokploy/issues/4495)
* **deployment:** add readLogs procedure to fetch deployment logs ([558d809](https://github.com/Bl4ckBl1zZ/dokploy/commit/558d8098719039d2523037289c31160633ac25d9))
* **deployment:** add server access validation for deployment actions ([aff200f](https://github.com/Bl4ckBl1zZ/dokploy/commit/aff200f84f30647658149b6487feca7a86f25ac5))
* encrypt environment variables at rest with AES-256-GCM ([1cb9491](https://github.com/Bl4ckBl1zZ/dokploy/commit/1cb94910133532e545c18bb3ccb330812c7930e9))
* enhance container dashboard with new features ([1c44141](https://github.com/Bl4ckBl1zZ/dokploy/commit/1c4414165d4aedbf6e28afab7a94c8fb7c053373))
* enhance TLS certificate selection UI in AddDomain component ([#4705](https://github.com/Bl4ckBl1zZ/dokploy/issues/4705)) ([ed0abb2](https://github.com/Bl4ckBl1zZ/dokploy/commit/ed0abb24656bf997641a87f397d674e04fd88547))
* export full keyring in backup encryption key file ([c04d56b](https://github.com/Bl4ckBl1zZ/dokploy/commit/c04d56bf2ca65aebeb1b1b3f0f1da59d7365cac6))
* implement forward authentication settings and UI components ([41c09cd](https://github.com/Bl4ckBl1zZ/dokploy/commit/41c09cd86bb62e0028d3d57be1b2ba16b630c741))
* make concurrent builds an OSS feature without license gating ([8d0ae19](https://github.com/Bl4ckBl1zZ/dokploy/commit/8d0ae19b58142e9ec307d15f15babf3068f707b1))
* optionally include encryption key in web server backups ([2e867c5](https://github.com/Bl4ckBl1zZ/dokploy/commit/2e867c5be1fa3c136d0d3f738f0c0d39e1d4de6e))
* **organization:** prevent inviting users with owner role ([67278d8](https://github.com/Bl4ckBl1zZ/dokploy/commit/67278d87839a3a649aa4537fdba3bbccc235231f))
* **scim:** implement SCIM 2.0 user provisioning support ([d831607](https://github.com/Bl4ckBl1zZ/dokploy/commit/d831607f3a4b06fbfd0b1f7be68122c26679b4e8))
* **settings:** add copy button to server IP in web server settings ([#4397](https://github.com/Bl4ckBl1zZ/dokploy/issues/4397)) ([a50f958](https://github.com/Bl4ckBl1zZ/dokploy/commit/a50f958a6f99a6123935e3b1438c4477b5b056e0))
* **sidebar:** add enterprise badge for valid license in sidebar ([86f941d](https://github.com/Bl4ckBl1zZ/dokploy/commit/86f941d606e618ff94151e5dcb00587d8de3242f))
* **user:** implement session cleanup on user update ([1fdbe87](https://github.com/Bl4ckBl1zZ/dokploy/commit/1fdbe87d84c0481ec5e1c1f4a159aebae9556028))
* **whitelabeling:** implement public whitelabeling configuration retrieval ([8f9be16](https://github.com/Bl4ckBl1zZ/dokploy/commit/8f9be1636c8d21f1fbe63827c1009dfaac813569))


### Performance Improvements

* share db, docker and auth singletons across duplicated bundles ([7924794](https://github.com/Bl4ckBl1zZ/dokploy/commit/7924794ae70b2d7c569bce56a0697528c4dd2e93))

## [0.36.2](https://github.com/Bl4ckBl1zZ/dokploy/compare/v0.36.1...v0.36.2) (2026-06-06)


### Bug Fixes

* provide build auth secret for GHCR image ([3e53940](https://github.com/Bl4ckBl1zZ/dokploy/commit/3e5394091080e0ce1ada30799d2573cbbbe36185))

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
