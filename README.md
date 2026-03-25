# Jaculus-registry

Jaculus-registry is a tool for managing Jaculus package registries. It allows you to automatically build, watch, and serve packages in a local registry server.

## Features

- Automatic building of packages in the registry
- Watching for changes in packages for local development
- Serving the registry over HTTP for local testing
- Extracting package versions to a specified directory for inspection or use

## Installation

Developer (local) install:

```bash
git clone https://github.com/jaculus-org/Jaculus-registry.git
cd Jaculus-registry
pnpm install
pnpm run build

# makes the `jaculus-registry` command available globally
pnpm link
```

Install published [NPM package](https://www.npmjs.com/package/@jaculus/registry):

```bash
npm install -g @jaculus/registry
```

## Usage

You can use Jaculus-registry through its CLI or programmatically in your Node.js projects.

### CLI

Main commands is `jaculus-registry` with options for building, watching, and serving the registry.

```bash
Usage: jaculus-registry [options] [command]

Registry management CLI

Options:
  -h, --help                                         display help for command

Commands:
  init [options]                                     Clone the registry repository and initialize the dist
  info                                               Print registry cache info
  generate [options]                                 Run generateRegistry for new commits (respects cache)
  serve                                              Serve the current registry over HTTP
  build                                              Build all packages in the current registry
  watch-build                                        Watch and build packages on changes in the current registry
  extract <packageName> <version> <destinationPath>  Extract a specific package version to the given destination path
  help [command]                                     display help for command
```

Published package archives always include `package.json`, optional `README.md`, optional `tsconfig.json`, and the declared blocks directory (typically `blocks/`). Any generated code or other shipped files are copied according to the package's `package.json#files` entries, and glob patterns are supported.

## Running from CI

Jaculus-registry is mainly designed to be run from CI pipelines to automate updating and building the registry.
You can set up a CI job that runs the `generate` command whenever there are new commits in the registry repository.

### Setup CI Job

Generated registry is stored in configured branch (e.g., `registry`) of the same repository.

Steps to set up the CI job:

1. The initial setup of the registry is done manually.
2. Clone the Library repository.
3. Run `pnpm install` to install dependencies (you will get all lint and test tools as well).
4. Run `jaculus-registry init <registryDestPath> --git-url <repository-url> --branch-dist <branch-name>` to create separate folder with the Library registry - Registry branch.
5. The init command automatically initializes the dist registry and prepares the first commit.
6. If everything is fine, push the `registry` branch to the remote repository.

#### Set up a CI workflow (e.g., GitHub Actions)

You have prepared the `registry` branch with the initial registry state.
Create a workflow that triggers on pushes to the main branch and runs the build and generate commands.

The latest version of CI workflow can be found in:
https://github.com/Jaculus-org/Jaculus-libraries/tree/master/.github/workflows
