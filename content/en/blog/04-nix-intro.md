---
title: "Configuration as Code: My NixOS and macOS Setup"
date: 2026-01-29
draft: false
description: "How I use Nix, Nix Flakes, and Home Manager to create fully reproducible and declarative configurations for my NixOS and macOS systems."
tags: ["nix", "nixos", "macos", "nix-flakes", "home-manager", "iac", "devops"]
featured_image: "/images/blog/04-nix-intro/header.png"
---

> **TL;DR**: This repository contains my personal configuration for NixOS and macOS, managed 100% declaratively using Nix Flakes. One codebase, multiple machines, full reproducibility. The end of 'it works on my machine'.

---

For years, I've struggled with maintaining consistent development environments across multiple machines. Different operating systems (Linux at work, macOS at home), different toolsets, endless dotfiles - it all led to chaos. I decided to solve this problem once and for all using Nix.

In this post, I'll show how I've organized my configurations using Nix, Flakes, and Home Manager to create a fully automated and reproducible environment that works identically on NixOS and macOS.

By the end of this post, you will understand:

- **What Nix is** and why it's a game-changer for configuration management.
- **How to organize a Nix Flakes project** for multiple systems.
- **The role of Home Manager** in managing your dotfiles.
- **Key elements of my configuration** that you can adapt for yourself.

## What is Nix and NixOS?

Before we dive into my configuration, it's worth explaining what Nix and NixOS are.

- **Nix** is a powerful, cross-platform **package manager**. Unlike traditional managers (like `apt` or `brew`), Nix treats packages like values in functional programming: they are built by functions with no side effects and never change after being built. Each package ends up in a unique directory in `/nix/store`, which eliminates dependency issues and allows multiple versions of the same package to coexist.

- **NixOS** is a Linux distribution that elevates the Nix philosophy to the level of the entire operating system. In NixOS, not only applications, but the **entire system** - kernel, drivers, system services, configuration files - is built declaratively from a single `configuration.nix` file. This allows for achieving unprecedented reproducibility and reliability.

## Why Nix?

Before we dive into the code, let's answer the question: why is it worth it?

**Traditional configuration management:**

```
You → brew install → Manually edit .zshrc → ... → Chaos
            ↓
    'What version of this did I have?'
    'Why did this work yesterday?'
    'Configuring a new machine takes a whole day.'
```

**Configuration management with Nix:**

```
You → Git commit → nix run .#build-switch → Identical environment
            ↓
     Full change history in Git
     Atomic updates and rollbacks
     Configuring a new machine in minutes.
```

Nix treats your operating system as code. Every package, every line of configuration, is defined in `.nix` files, versioned in Git, and built in a way that guarantees an identical result every time.

| Principle           | Traditionally                          | With Nix                                           |
| ------------------- | -------------------------------------- | -------------------------------------------------- |
| **Declarative**     | Imperative scripts (`apt install ...`) | Declarative manifests (`packages = [ pkgs.git ];`) |
| **Versioning**      | 'Latest' version                       | Specific commits in `flake.lock`                   |
| **Automation**      | Manual commands                        | Continuous synchronization                         |
| **Reproducibility** | Impossible                             | Guaranteed mathematically                          |

## Repository Structure

My repository is organized logically to separate machine-specific configurations from shared ones.

```
.
├── flake.nix              # Main Flake input file
├── apps/                  # Helper scripts (build, switch, clean)
├── hosts/                 # Configurations for specific machines
│   ├── darwin/            # macOS settings
│   └── nixos/             # NixOS settings
├── modules/               # Shared and reusable modules
│   ├── darwin/            # macOS-specific modules
│   ├── nixos/             # NixOS-specific modules
│   └── shared/            # Modules shared between OSes
└── overlays/              # Overlays for modifying packages
```

### Key Files

| File/Directory | Purpose                                                                                                                                   |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `flake.nix`    | Defines all dependencies (`inputs`) like `nixpkgs` or `home-manager` and the products (`outputs`), i.e., the final system configurations. |
| `hosts/`       | Each subdirectory corresponds to a single machine. It imports modules from `shared/` and `modules/` and assembles them.                   |
| `modules/`     | Reusable configuration snippets. For example, `modules/shared/packages.nix` contains a list of packages I want on every machine.          |
| `overlays/`    | Allows modifying existing packages or creating new ones.                                                                                  |

---

## Deeper Look: Components

### Flakes: The Heart of Reproducibility

The `flake.nix` file is the starting point. It defines where all dependencies come from and pins them to specific versions in the `flake.lock` file.

```nix
# flake.nix (fragment)
{
  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";
    home-manager.url = "github:nix-community/home-manager";
    darwin.url = "github:LnL7/nix-darwin/master";
    # ... other dependencies
  };

  outputs = { self, nixpkgs, home-manager, darwin, ... }@inputs: {
    # Configurations for macOS
    darwinConfigurations."x86_64-darwin" = darwin.lib.darwinSystem {
      # ...
      modules = [ ./hosts/darwin ];
    };

    # Configurations for NixOS
    nixosConfigurations."x86_64-linux" = nixpkgs.lib.nixosSystem {
      # ...
      modules = [ ./hosts/nixos ];
    };
  };
}
```

Thanks to this, `nix flake update` updates all dependencies at once in a controlled manner.

### Home Manager: Managing Dotfiles

[Home Manager](https://github.com/nix-community/home-manager) is a tool that allows you to manage your user environment (dotfiles, packages, services) in the same declarative way. Instead of manually creating symlinks, you simply declare what your configuration should look like.

### nix-darwin: Nix on macOS

The [nix-darwin](https://github.com/LnL7/nix-darwin) project allows you to manage macOS in the same way as NixOS. You can configure system settings, packages, and even App Store applications (via `homebrew`).

```nix
# hosts/darwin/default.nix (fragment)
{
  # macOS system settings
  system.defaults = {
    NSGlobalDomain = {
      AppleShowAllExtensions = true;
      KeyRepeat = 2;
      InitialKeyRepeat = 15;
    };
    dock = {
      autohide = false;
      show-recents = false;
    };
  };
}
```

---

## Supported Platforms

While Nix itself is a cross-platform system and can be installed on many operating systems (including Ubuntu and Windows via WSL), this specific configuration is tailored and regularly tested on the following platforms:

- **NixOS (x86_64-linux):** The main operating system on development machines.
- **macOS (aarch64-darwin):** System on Apple Silicon computers (M1/M2/M3).
- **macOS (x86_64-darwin):** Older Apple computers with Intel processors.

Thanks to Nix's flexibility, adapting to other architectures (e.g., `aarch64-linux` for Raspberry Pi) is relatively simple.

## How to Start?

To use this or a similar configuration, you first need to install Nix.

1. **Installing Nix:**
   - **On Linux (e.g., Ubuntu) or macOS:** Follow the [official Nix instructions](https://nixos.org/download/) (recommended option for beginners) or the [Determinate Systems installer](https://zero-to-nix.com/start/install).
   - **On Windows:** It is recommended to install Nix under the [Windows Subsystem for Linux (WSL)](https://learn.microsoft.com/en-us/windows/wsl/install). After installing WSL, follow the instructions for Linux.
   - **On NixOS:** Nix is already an integral part of the system!

2. **Enabling Flakes:**
   After installing Nix, make sure you have Flakes support enabled, which is a new, powerful way to manage dependencies. If you used the Determinate Systems installer, this is already done. Otherwise, you need to add `experimental-features = nix-command flakes` to your Nix configuration.

3. **Projects Worth Learning From:**
   - **[nix-darwin](https://github.com/LnL7/nix-darwin):** Essential for managing macOS with Nix.
   - **[Home Manager](https://github.com/nix-community/home-manager):** For declaratively managing your user environment (dotfiles).

## How to Use It?

Thanks to Flakes, using this configuration is incredibly simple.

**1. Building and Activating the Configuration:**

This command builds the new system configuration and, if the build is successful, atomically switches to it.

```bash
nix run .#build-switch
```

The Flake will automatically detect if you are on `x86_64-linux`, `aarch64-darwin`, etc., and run the appropriate script from the `apps/` directory.

**2. Updating Dependencies:**

This command fetches the latest versions of all `inputs` from `flake.nix` and updates the `flake.lock` file.

```bash
nix flake update
```

After updating, run `nix run .#build-switch` to rebuild the system with the new package versions.

**3. Cleaning Old Generations:**

Each configuration change creates a new 'generation' of the system. This allows for instant rollbacks but takes up disk space.

```bash
# Roll back to the previous generation
nix run .#rollback

# Remove generations older than 30 days
nix run .#clean
```

---

## Summary

Migrating my entire configuration to Nix was a time investment, but the benefits are huge.

| Benefit                  | Description                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Reproducibility**      | I can be sure my environment is identical on every machine. Configuring a new computer is now a matter of minutes, not days.          |
| **Versioning**           | The entire history of my system's changes is in Git. If I break something, `git revert` and `nix run .#build-switch` fix the problem. |
| **No 'dependency hell'** | Each package has its own, isolated dependencies. No more library conflicts.                                                           |
| **Atomic updates**       | Updates either work 100% or not at all. If an update fails, the system remains in its intact state.                                   |

All the code and configuration from this post are available in this repository. I encourage you to browse and draw inspiration. If you are considering switching to Nix, I hope this example has shown you how powerful and elegant this solution can be.

