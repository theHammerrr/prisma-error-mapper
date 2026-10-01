# Releasing

The package version describes this library's API. Prisma compatibility is declared by `peerDependencies` and documented in each release. Do not widen the peer range until the supported Prisma versions pass both type checks and PostgreSQL integration tests.

## Prepare a release

Use conventional commit titles when merging changes into `main`: `fix:` for a patch, `feat:` for a minor release, and `feat!:` or `BREAKING CHANGE:` for a major release. The Release workflow opens or updates a release pull request with the version bump, lockfile update, and `CHANGELOG.md` entry. Review its compatibility notes and CI results before merging it.

After that pull request is merged, the same workflow creates the `v<package-version>` tag and GitHub release. The tag identifies the exact release commit. Do not create a tag for the unpublished 0.2.0 baseline.

The workflow uses GitHub's default token. Repository settings must allow GitHub Actions to create pull requests. Events made with the default token do not trigger other workflows, so run the package checks on the release pull request before merging it. If the release pull request does not run CI automatically, start CI manually or configure a dedicated GitHub App token for the release workflow.

## npm publication

The current package name has not yet been reserved on npm. Reserve and publish it under the intended npm account before configuring automated publication. When npm trusted publishing is configured for this repository and workflow, add a separate publish job that runs only for a successfully tagged release, with `id-token: write`, and checks that the tag equals the package version before calling `npm publish`. Until then, GitHub releases and tags are the release record; npm publication is a separate maintainer action.
