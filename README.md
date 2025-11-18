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
