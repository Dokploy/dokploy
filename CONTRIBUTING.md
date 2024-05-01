

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

Before you craete a Pull Request, please make sure your commit message follows the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) specification.

### Commit Message Format
```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

#### Type
Must be one of the following:

* **feat**: A new feature
* **fix**: A bug fix
* **docs**: Documentation only changes
* **style**: Changes that do not affect the meaning of the code (white-space, formatting, missing semi-colons, etc)
* **refactor**: A code change that neither fixes a bug nor adds a feature
* **perf**: A code change that improves performance
* **test**: Adding missing tests or correcting existing tests
* **build**: Changes that affect the build system or external dependencies (example scopes: gulp, broccoli, npm)
* **ci**: Changes to our CI configuration files and scripts (example scopes: Travis, Circle, BrowserStack, SauceLabs)
* **chore**: Other changes that don't modify `src` or `test` files
* **revert**: Reverts a previous commit

Example:
```
feat: add new feature
```


## Setup

```bash
git clone https://github.com/dokploy/dokploy.git
cd dokploy
pnpm install
cp .env.example .env
```

## Development

Is required to have **Docker** installed on your machine.


### Setup

Run the command that will spin up all the required services and files.

```bash
pnpm run setup
```

Now run the development server.

```bash
pnpm run dev
```


Go to http://localhost:3000 to see the development server

## Build

```bash
pnpm run build
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
pnpm run build-server
```

If you want to test the webhooks on development mode using localtunnel, make sure to install `localtunnel`

```bash
bunx lt --port 3000
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
# Install Buildpacks
curl -sSL "https://github.com/buildpacks/pack/releases/download/v0.32.1/pack-v0.32.1-linux.tgz" | tar -C /usr/local/bin/ --no-same-owner -xzv pack
```


## Pull Request

- The `main` branch is the source of truth and should always reflect the latest stable release.
- Create a new branch for each feature or bug fix.
- Make sure to add tests for your changes.
- Make sure to update the documentation for any changes Go to the [docs.dokploy.com](https://docs.dokploy.com) website to see the changes.
- When creating a pull request, please provide a clear and concise description of the changes made.
- If you include a video or screenshot, would be awesome so we can see the changes in action.
- If your pull request fixes an open issue, please reference the issue in the pull request description.
- Once your pull request is merged, you will be automatically added as a contributor to the project.

Thank you for your contribution!