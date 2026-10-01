# Changelog

This project follows [Semantic Versioning](https://semver.org/). Each future release has a matching `v<version>` Git tag and GitHub release. Prisma compatibility is stated in the release notes and the package's peer dependency range.

## [0.3.1](https://github.com/theHammerrr/prisma-error-mapper/compare/v0.3.0...v0.3.1) (2026-10-01)


### Bug Fixes

* **docs:** correct published installation and Prisma compatibility guidance ([b10bd5d](https://github.com/theHammerrr/prisma-error-mapper/commit/b10bd5da3ec39c736cd6f757cad90d4ed0298137))
* **docs:** correct published installation and Prisma compatibility guidance ([7933256](https://github.com/theHammerrr/prisma-error-mapper/commit/793325665886b99a747a29b64a4b322362d77ac1))

## [0.3.0](https://github.com/theHammerrr/prisma-error-mapper/compare/v0.2.0...v0.3.0) (2026-10-01)

Compatible with `@prisma/client` 6.14.x through the root entrypoint and 7.10.x through `prisma-error-mapper/prisma7`.


### Features

* add Prisma 7 constructor-bound mapper ([cab480a](https://github.com/theHammerrr/prisma-error-mapper/commit/cab480a72b3cfbd27a1e09644c2de323d50a6bbf))


### Bug Fixes

* constrain Prisma peer range to verified minors ([9bd1afc](https://github.com/theHammerrr/prisma-error-mapper/commit/9bd1afc932822766e4e8f6bfe88db92f906abf51))
* normalize Prisma 7 adapter constraint metadata ([e78a1c3](https://github.com/theHammerrr/prisma-error-mapper/commit/e78a1c350a51646f5caf35ccc438feaa51fdd0bc))

## 0.2.0 (source version 2026-09-27)

- Added provider-aware PostgreSQL CHECK constraint parsing and named constraint handlers.
- Added an unmatched Prisma error policy separate from the unrelated-error fallback.
- Added the Express demo and PostgreSQL integration coverage.

This version predates the release workflow. It was published to npm on 2026-10-01 from the `v0.2.0` source tag.

## 0.1.0 (source version 2026-09-27)

- Introduced typed Prisma 6.14 error guards, metadata normalization, and application mappings.
- Added initial PostgreSQL integration coverage.

This version was published to npm on 2026-10-01 from the `v0.1.0` source tag, which records the final snapshot before the 0.2.0 version bump.
