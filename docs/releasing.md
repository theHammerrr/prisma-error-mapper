# Releasing

The package version describes this library's API. Prisma compatibility is declared by `peerDependencies` and documented in each release. Do not widen the peer range until the supported Prisma versions pass both type checks and PostgreSQL integration tests.

## Prepare a release

Use conventional commit titles when merging changes into `main`: `fix:` for a patch, `feat:` for a minor release, and `feat!:` or `BREAKING CHANGE:` for a major release. The Release workflow opens or updates a release pull request with the version bump, lockfile update, and `CHANGELOG.md` entry. Review its compatibility notes and CI results before merging it.

After that pull request is merged, the same workflow creates the `v<package-version>` tag and GitHub release. The tag identifies the exact release commit. Historical `v0.1.0` and `v0.2.0` tags were published to npm separately on 2026-10-01.

The workflow uses GitHub's default token. Repository settings must allow GitHub Actions to create pull requests. Events made with the default token do not trigger other workflows. If CI does not start on the release pull request, run `gh workflow run ci.yml --ref <release-pr-branch>` and confirm its checks before merging, or configure a dedicated GitHub App token for the release workflow.

## npm publication

The package is published as [`prisma-error-mapper`](https://www.npmjs.com/package/prisma-error-mapper). npm publication is currently a separate maintainer action after the GitHub release. Publish from the exact `v<package-version>` tag with npm 2FA, then verify that npm lists the version and that `latest` points to it. npm can accept an upload before the new version appears in the public registry; wait for processing to finish before treating publication as complete.

For automated publication, configure npm trusted publishing for this repository and a dedicated GitHub workflow. The workflow should run only for a successfully tagged release, request `id-token: write`, check that the tag equals the package version, and run the package checks before `npm publish`.
