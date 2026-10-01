# Changelog

This project follows [Semantic Versioning](https://semver.org/). Each future release has a matching `v<version>` Git tag and GitHub release. Prisma compatibility is stated in the release notes and the package's peer dependency range.

## [0.3.0](https://github.com/theHammerrr/prisma-error-mapper/compare/v0.2.0...v0.3.0) (2026-10-01)


### Features

* add Prisma 7 constructor-bound mapper ([cab480a](https://github.com/theHammerrr/prisma-error-mapper/commit/cab480a72b3cfbd27a1e09644c2de323d50a6bbf))


### Bug Fixes

* constrain Prisma peer range to verified minors ([9bd1afc](https://github.com/theHammerrr/prisma-error-mapper/commit/9bd1afc932822766e4e8f6bfe88db92f906abf51))
* normalize Prisma 7 adapter constraint metadata ([e78a1c3](https://github.com/theHammerrr/prisma-error-mapper/commit/e78a1c350a51646f5caf35ccc438feaa51fdd0bc))

## 0.2.0 (unpublished source version, 2026-09-27)

- Added provider-aware PostgreSQL CHECK constraint parsing and named constraint handlers.
- Added an unmatched Prisma error policy separate from the unrelated-error fallback.
- Added the Express demo and PostgreSQL integration coverage.

This version predates the release workflow and was not published to npm. Its `v0.2.0` tag records the final source snapshot for this version.

## 0.1.0 (unpublished source version, 2026-09-27)

- Introduced typed Prisma 6.14 error guards, metadata normalization, and application mappings.
- Added initial PostgreSQL integration coverage.

This version was not published to npm. Its `v0.1.0` tag records the final source snapshot before the 0.2.0 version bump.
