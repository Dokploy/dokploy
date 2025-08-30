# Contributing

Hey, thanks for your interest in contributing to Dokploy! We appreciate your help and taking your time to contribute.

Before you start, please first discuss the feature/bug you want to add with the owners and comunity via github issues.

We have a few guidelines to follow when contributing to this project:

- [Commit Convention](#commit-convention)
- [Setup](#setup)
- [Development](#development)
- [Build](#build)
- [Pull Request](#pull-request)

## Commit Convention

Before you create a Pull Request, please make sure your commit message follows the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) specification.

### Commit Message Format

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

#### Type

Must be one of the following:

- **feat**: A new feature
- **fix**: A bug fix
- **docs**: Documentation only changes
- **style**: Changes that do not affect the meaning of the code (white-space, formatting, missing semi-colons, etc)
- **refactor**: A code change that neither fixes a bug nor adds a feature
- **perf**: A code change that improves performance
- **test**: Adding missing tests or correcting existing tests
- **build**: Changes that affect the build system or external dependencies (example scopes: gulp, broccoli, npm)
- **ci**: Changes to our CI configuration files and scripts (example scopes: Travis, Circle, BrowserStack, SauceLabs)
- **chore**: Other changes that don't modify `src` or `test` files
- **revert**: Reverts a previous commit

Example:

```
feat: add new feature
```

## Setup

Before you start, please make the clone based on the `canary` branch, since the `main` branch is the source of truth and should always reflect the latest stable release, also the PRs will be merged to the `canary` branch.

We use Node v20.16.0 and recommend this specific version. If you have nvm installed, you can run `nvm install 20.16.0 && nvm use` in the root directory.

```bash
git clone https://github.com/dokploy/dokploy.git
cd dokploy
pnpm install
cp apps/dokploy/.env.example apps/dokploy/.env
```

## Requirements

- [Docker](/GUIDES.md#docker)

### Setup

Run the command that will spin up all the required services and files.

```bash
pnpm run dokploy:setup
```

Run this script

```bash
pnpm run server:script
```

Now run the development server.

```bash
pnpm run dokploy:dev
```

Go to http://localhost:3000 to see the development server

> [!NOTE]
> This project uses Biome. If your editor is configured to use another formatter such as Prettier, it's recommended to either change it to use Biome or turn it off.

## Build

```bash
pnpm run dokploy:build
```

## Docker

To build the docker image

```bash
pnpm run docker:build
```

To push the docker image

```bash
pnpm run docker:push
```

## Password Reset

In the case you lost your password, you can reset it using the following command

```bash
pnpm run reset-password
```

If you want to test the webhooks on development mode using localtunnel, make sure to install [`localtunnel`](https://localtunnel.app/)

```bash
pnpm dlx localtunnel --port 3000
```

If you run into permission issues of docker run the following command

```bash
sudo chown -R USERNAME dokploy or sudo chown -R $(whoami) ~/.docker
```

## Application deploy

In case you want to deploy the application on your machine and you selected nixpacks or buildpacks, you need to install first.

```bash
# Install Nixpacks
curl -sSL https://nixpacks.com/install.sh -o install.sh \
    && chmod +x install.sh \
    && ./install.sh
```

```bash
# Install Railpack
curl -sSL https://railpack.com/install.sh | sh
```

```bash
# Install Buildpacks
curl -sSL "https://github.com/buildpacks/pack/releases/download/v0.35.0/pack-v0.35.0-linux.tgz" | tar -C /usr/local/bin/ --no-same-owner -xzv pack
```

## Pull Request

- The `canary` branch is the source of truth and should always reflect the latest stable release.
- Create a new branch for each feature or bug fix.
- Make sure to add tests for your changes.
- Make sure to update the documentation for any changes Go to the [docs.dokploy.com](https://docs.dokploy.com) website to see the changes.
- When creating a pull request, please provide a clear and concise description of the changes made.
- If you include a video or screenshot, would be awesome so we can see the changes in action.
- If your pull request fixes an open issue, please reference the issue in the pull request description.
- Once your pull request is merged, you will be automatically added as a contributor to the project.

**Important Considerations for Pull Requests:**

- **Focus and Scope:** Each Pull Request should ideally address a single, well-defined problem or introduce one new feature. This greatly facilitates review and reduces the chances of introducing unintended side effects.
- **Avoid Unfocused Changes:** Please avoid submitting Pull Requests that contain only minor changes such as whitespace adjustments, IDE-generated formatting, or removal of unused variables, unless these are part of a larger, clearly defined refactor or a dedicated "cleanup" Pull Request that addresses a specific `good first issue` or maintenance task.
- **Issue Association:** For any significant change, it's highly recommended to open an issue first to discuss the proposed solution with the community and maintainers. This ensures alignment and avoids duplicated effort. If your PR resolves an existing issue, please link it in the description (e.g., `Fixes #123`, `Closes #456`).

Thank you for your contribution!

## Templates

To add a new template, go to `https://github.com/Dokploy/templates` repository and read the README.md file.

### Recommendations

- Use the same name of the folder as the id of the template.
- The logo should be in the public folder.
- If you want to show a domain in the UI, please add the `_HOST` suffix at the end of the variable name.
- Test first on a vps or a server to make sure the template works.

## Docs & Website

To contribute to the Dokploy docs or website, please go to this [repository](https://github.com/Dokploy/website).
