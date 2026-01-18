---
title: "Podman vs Docker Desktop: Choose Your Runtime"
date: 2026-01-17
draft: false
description: "Based on community feedback, the homelab project now supports both Podman and Docker Desktop. Here's how to choose and switch between them."
tags: ["homelab", "kubernetes", "k3d", "podman", "docker", "macos"]
featured_image: "/images/blog/02-runtime-choice/header.png"
---

> **TL;DR**: The homelab project now supports both Podman and Docker Desktop as container runtimes. The Makefile auto-detects which one is available, or you can explicitly choose with `RUNTIME=docker` or `RUNTIME=podman`.

---

Based on feedback from readers, I've added Docker Desktop support to the homelab project. Now you can choose whichever container runtime fits your workflow better.

## Why Both?

Different users have different preferences and constraints:

| Consideration | Podman | Docker Desktop |
|---------------|--------|----------------|
| Licensing | Apache 2.0 (fully open source) | Free for personal use |
| Resource usage | Lighter (~500MB VM) | Heavier (~2GB with GUI) |
| Familiarity | Newer, Red Hat ecosystem | Industry standard |
| macOS integration | CLI-focused | Native GUI app |
| k3d compatibility | Supported | Native support |

Both work great with k3d. Choose based on your preference.

## Quick Start

### Option A: Docker Desktop

```bash
# Install
brew install --cask docker

# Start Docker Desktop from Applications (or it auto-starts)

# Create cluster
make setup
```

### Option B: Podman

```bash
# Install
brew install podman

# Initialize VM
make init-podman

# Create cluster
make setup
```

## Runtime Auto-Detection

The Makefile automatically detects which runtime is available:

```bash
make start   # Detects Docker or Podman, starts the appropriate one
make status  # Shows which runtime is active
```

To force a specific runtime:

```bash
RUNTIME=docker make start
RUNTIME=podman make start
```

## Switching Runtimes

If you want to switch from one runtime to another:

```bash
# 1. Backup Sealed Secrets keys (important!)
make sealed-secrets-backup

# 2. Delete the cluster
make clean

# 3. Stop current runtime
make stop

# 4. Start new runtime and recreate cluster
RUNTIME=docker make setup   # or RUNTIME=podman
```

Your GitOps configuration (ArgoCD ApplicationSets) will automatically resync all applications.

## New Makefile Targets

| Target | Description |
|--------|-------------|
| `make init-docker` | Verify Docker Desktop is running |
| `make init-podman` | Initialize Podman machine |
| `make docker-start` | Start Docker Desktop |
| `make docker-status` | Show Docker Desktop status |
| `make runtime-start` | Start detected runtime |
| `make runtime-status` | Show active runtime |
| `make cluster-restart` | Full cluster recreate (with Sealed Secrets backup) |
| `make sealed-secrets-backup` | Backup encryption keys |
| `make sealed-secrets-restore` | Restore encryption keys |

## Architecture

Both runtimes provide the same end result:

```
macOS
└── Podman VM or Docker Desktop VM
    └── k3d cluster "homelab"
        ├── 1 server + 3 agents
        ├── kubeAPI on Tailscale IP
        └── GitOps Stack (ArgoCD, Sealed Secrets, External Secrets)
```

The cluster configuration, GitOps setup, and all Kubernetes resources remain identical regardless of which runtime you choose.

## Summary

- **Docker Desktop**: Choose if you want a familiar, GUI-based experience
- **Podman**: Choose if you prefer open source and lighter resource usage

Both are first-class citizens in this project. Pick one and get started!

---

*Questions or feedback? Open an issue in the [cd-homelab repository](https://github.com/tomasz-wostal-eu/cd-homelab).*
