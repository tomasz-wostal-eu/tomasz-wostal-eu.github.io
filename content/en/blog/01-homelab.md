---
title: "Building a Production-Grade Kubernetes Homelab on macOS: The Complete Guide"
date: 2026-01-15
draft: false
description: "How to build a portable, cloud-native Kubernetes environment on macOS using Podman and k3d. Includes NFS storage, Tailscale networking, and architecture decisions explained."
tags: ["homelab", "kubernetes", "k3d", "podman", "macos", "devops", "infrastructure"]
featured_image: "/images/blog/01-homelab/header.png"
---

> **TL;DR**: We're building a 4-node Kubernetes cluster (k3s via k3d) running inside Podman on macOS. The setup includes NFS-based shared storage for RWX volumes, Tailscale for secure remote access, and a foundation ready for GitOps, observability, and hybrid cloud connectivity. All configuration is declarative and version-controlled.

---

Welcome to the first post in my Homelab Series. Our goal is ambitious: build a personal cloud platform from scratch that mirrors production-grade infrastructure patterns.

This isn't a toy project. We're engineering a versatile environment ready for:
- **GitOps workflows** with ArgoCD
- **Full observability stack** (Prometheus, Grafana, Loki)
- **Stateful workloads** with proper persistent storage
- **Service mesh** for advanced networking
- **Home automation integration** (Home Assistant, MQTT)
- **Hybrid cloud connectivity** with AWS/GCP

The guiding principle is **environment parity**: the architecture we build will run identically here on a local machine and in a cloud environment. Multi-cloud support is the long-term goal.

It all begins with a solid foundation—a local Kubernetes cluster on macOS that doesn't cut corners.

In this post, we'll cover:
- The complete installation process with **copy-paste-ready commands**
- Why **Podman** beats Docker Desktop for this use case
- The **storage challenge**: why Longhorn fails and NFS wins
- **Tailscale networking** for secure remote cluster access
- Architecture decisions and their trade-offs

## Architecture Overview

Before diving into commands, let's understand the layered architecture we're building:

{{< mermaid >}}
graph TB
    subgraph macOS["macOS Host"]
        subgraph podman["Podman Machine (Fedora VM)"]
            subgraph k3d["k3d Cluster 'homelab'"]
                server["Server-0<br/>(control-plane, etcd)"]
                agent0["Agent-0"]
                agent1["Agent-1"]
                agent2["Agent-2"]
            end
        end
        ports["Tailscale IP:6443 (kubeAPI)<br/>Ports 80/443 (Ingress)"]
    end

    nas[("Synology NAS<br/>RWX Storage")]

    k3d --> ports
    ports -.->|"NFS: 192.168.55.x:/volume1/k8s-volumes"| nas
{{< /mermaid >}}

This is a **Configuration-as-Code** project—the entire cluster definition lives in version-controlled files. This approach gives us:

- **Reproducibility**: Destroy and recreate the cluster in minutes
- **Auditability**: Every change is tracked in Git history
- **Portability**: Share the setup across machines or team members
- **Documentation**: The config files *are* the documentation

### Why k3s?

[k3s](https://k3s.io/) is a CNCF-certified Kubernetes distribution optimized for resource-constrained environments. Compared to full Kubernetes (kubeadm, kubespray), k3s offers:

| Feature | k3s | Full Kubernetes |
|---------|-----|-----------------|
| Binary size | ~70MB | ~1GB+ |
| Memory footprint | ~512MB | ~2GB+ |
| Default datastore | SQLite/etcd | etcd |
| Built-in components | Traefik, CoreDNS, Metrics Server | Manual installation |
| Certificate management | Automatic | Manual/cert-manager |

For a homelab, k3s is the sweet spot: full Kubernetes API compatibility with a fraction of the overhead.

### Why k3d?

[k3d](https://k3d.io/) wraps k3s in Docker/Podman containers, enabling:

- **Multi-node clusters** on a single machine
- **Fast iteration**: create/destroy clusters in seconds
- **Port mapping**: expose services to the host
- **Registry integration**: local container registries

The alternative would be running k3s directly on the Podman VM, but k3d gives us the flexibility to simulate multi-node topologies.

---

## Workshop: Building the Cluster Step-by-Step

Time for the hands-on part. Every command below has been tested and is ready to copy-paste.

### Step 1: Prerequisites

Before we start, ensure you have the necessary tools. [Homebrew](https://brew.sh/) is the easiest way to install them on macOS.

```bash
# Install all required packages
brew install podman k3d helm kubectl

# Verify installations
podman --version   # Tested with: podman version 5.x
k3d version        # Tested with: k3d version v5.x
helm version       # Tested with: v3.x
kubectl version --client
```

**Required tools explained:**

| Tool | Purpose |
|------|---------|
| `podman` | Container runtime (Docker alternative) |
| `k3d` | k3s-in-Docker/Podman wrapper |
| `helm` | Kubernetes package manager |
| `kubectl` | Kubernetes CLI |

**Optional but recommended:**

- **[Tailscale](https://tailscale.com/download)**: Secure remote access to the cluster from anywhere. Free for personal use (up to 100 devices).
- **NFS Server**: For shared storage (RWX volumes). A Synology/QNAP NAS works great, or any Linux box with `nfs-kernel-server`.
- **[k9s](https://k9scli.io/)**: Terminal-based Kubernetes dashboard (`brew install k9s`).

### Step 2: Configuring the Podman Machine

On macOS, containers can't run natively—they need a Linux VM. Podman manages this transparently through "Podman Machine," a lightweight Fedora-based VM running under Apple's Virtualization framework (or QEMU on Intel Macs).

```bash
# 1. Initialize the virtual machine with appropriate resources
podman machine init \
  --cpus 6 \
  --memory 8192 \
  --disk-size 50 \
  --volume /private/nfs/k8s-volumes:/private/nfs/k8s-volumes
```

**Resource allocation guidelines:**

| Resource | Minimum | Recommended | Notes |
|----------|---------|-------------|-------|
| CPUs | 4 | 6+ | More helps with parallel workloads |
| Memory | 4GB | 8GB+ | k3s needs ~512MB, rest for workloads |
| Disk | 30GB | 50GB+ | Container images add up quickly |

The `--volume` flag creates a mount point for NFS passthrough (optional, for advanced NFS setups).

```bash
# 2. Enable rootful mode (required for privileged port binding)
podman machine set --rootful
```

**Why rootful?** By default, Podman runs in rootless mode for security. However, binding ports below 1024 (like 80/443 for HTTP/HTTPS) requires root privileges. Since we want our Ingress controller on standard ports, rootful mode is necessary.

```bash
# 3. Start the machine
podman machine start

# Verify it's running
podman machine list
```

**Docker Desktop conflict resolution:**

If you have Docker Desktop installed alongside Podman, ensure your shell uses the correct socket:

```bash
# Check current context
docker context list

# Switch to Podman (the "default" context uses Podman's socket)
docker context use default

# Verify you're talking to Podman
docker info | grep -i "operating system"
# Should show: Fedora Linux (not Docker Desktop)
```

> **Pro tip**: Add `export DOCKER_HOST="unix://$HOME/.local/share/containers/podman/machine/podman.sock"` to your shell profile to ensure Podman is always used.

### Step 3: Configuring the k3d Cluster

The `k3d/config.yaml` file is the declarative definition of our cluster. Let's examine the key configuration options:

```yaml
# k3d/config.yaml - Key sections explained

apiVersion: k3d.io/v1alpha5
kind: Simple
metadata:
  name: homelab

servers: 1          # Control plane nodes (1 is enough for homelab)
agents: 3           # Worker nodes (scale based on workload needs)

kubeAPI:
  host: "100.115.231.42"  # Your Tailscale IP (run: tailscale ip -4)
  hostPort: "6443"        # Standard Kubernetes API port

ports:
  - port: 80:80           # HTTP ingress
    nodeFilters: [loadbalancer]
  - port: 443:443         # HTTPS ingress
    nodeFilters: [loadbalancer]

options:
  k3s:
    extraArgs:
      - arg: --disable=traefik      # We'll install our own ingress
        nodeFilters: [server:*]
      - arg: --disable=servicelb    # Using NodePort/Ingress instead
        nodeFilters: [server:*]
```

**Configuration breakdown:**

| Setting | Value | Rationale |
|---------|-------|-----------|
| `servers: 1` | Single control plane | HA requires 3+ servers; overkill for homelab |
| `agents: 3` | Three workers | Allows testing pod anti-affinity and rolling updates |
| `kubeAPI.host` | Tailscale IP | Enables remote `kubectl` access from any device |
| `--disable=traefik` | No default ingress | We'll install nginx-ingress or Traefik ourselves for more control |
| `--disable=servicelb` | No ServiceLB | Using standard Ingress instead of k3s's Klipper LB |

**Before creating the cluster**, update the `kubeAPI.host`:

```bash
# Get your Tailscale IP
tailscale ip -4

# Or use your Mac's local IP (for LAN-only access)
ipconfig getifaddr en0
```

Edit `k3d/config.yaml` and paste your IP in the `kubeAPI.host` field.

### Step 4: Creating the Cluster

With configuration in place, cluster creation is a single command:

```bash
k3d cluster create --config k3d/config.yaml
```

Behind the scenes, k3d:
1. Pulls the `rancher/k3s` image
2. Creates a Docker network for inter-node communication
3. Starts the server container (control plane)
4. Starts agent containers (workers)
5. Sets up the load balancer for port forwarding
6. Generates TLS certificates and kubeconfig

**Expected output:**

```
INFO[0000] Using config file k3d/config.yaml
INFO[0000] Prep: Network
INFO[0001] Created network 'k3d-homelab'
INFO[0001] Created image volume k3d-homelab-images
INFO[0001] Starting new tools node...
INFO[0002] Creating node 'k3d-homelab-server-0'
INFO[0003] Creating node 'k3d-homelab-agent-0'
INFO[0003] Creating node 'k3d-homelab-agent-1'
INFO[0003] Creating node 'k3d-homelab-agent-2'
INFO[0004] Creating LoadBalancer 'k3d-homelab-serverlb'
...
INFO[0025] Cluster 'homelab' created successfully!
```

The entire process takes 20-40 seconds depending on your machine.

### Step 5: Accessing the Cluster (Kubeconfig)

Kubernetes tools need a `kubeconfig` file to authenticate with the cluster. k3d can merge the new cluster's credentials with your existing config:

```bash
# Merge and switch context in one command
k3d kubeconfig merge homelab --kubeconfig-switch-context
```

**Alternative: Keep k3d config separate**

If you manage multiple clusters, you might prefer isolated kubeconfig files:

```bash
# Export to a dedicated file
k3d kubeconfig get homelab > ~/.config/k3d/kubeconfig-homelab.yaml

# Use it for this session
export KUBECONFIG=~/.config/k3d/kubeconfig-homelab.yaml

# Or add to your shell profile for persistence
echo 'export KUBECONFIG=~/.config/k3d/kubeconfig-homelab.yaml' >> ~/.zshrc
```

**Verify the cluster:**

```bash
kubectl get nodes -o wide
```

Expected output (4 nodes in `Ready` state):

```
NAME                   STATUS   ROLES                  AGE   VERSION        INTERNAL-IP
k3d-homelab-server-0   Ready    control-plane,master   30m   v1.33.4+k3s1   172.18.0.3
k3d-homelab-agent-0    Ready    <none>                 29m   v1.33.4+k3s1   172.18.0.4
k3d-homelab-agent-1    Ready    <none>                 29m   v1.33.4+k3s1   172.18.0.5
k3d-homelab-agent-2    Ready    <none>                 29m   v1.33.4+k3s1   172.18.0.6
```

**Quick health check:**

```bash
# Check system pods are running
kubectl get pods -n kube-system

# Verify storage classes
kubectl get storageclass
```

You should see `local-path` as the default StorageClass (installed by k3s automatically).

### Step 6: Installing the NFS CSI Driver (for RWX Storage)

Our cluster has `local-path` storage by default, which is great for single-pod workloads (RWO = ReadWriteOnce). But many real-world applications need **shared storage**—databases with replicas, content management systems, shared caches.

This is where **NFS** and `ReadWriteMany` (RWX) volumes come in.

**Understanding Kubernetes storage access modes:**

| Access Mode | Abbreviation | Use Case |
|-------------|--------------|----------|
| ReadWriteOnce | RWO | Single pod can read/write (databases, single-replica apps) |
| ReadOnlyMany | ROX | Many pods can read (static assets, configs) |
| ReadWriteMany | RWX | Many pods can read/write (shared uploads, CMS, collaboration tools) |

**Install the NFS CSI driver:**

```bash
# Add the Helm repository
helm repo add csi-driver-nfs https://raw.githubusercontent.com/kubernetes-csi/csi-driver-nfs/master/charts
helm repo update

# Install the driver
helm upgrade --install csi-driver-nfs csi-driver-nfs/csi-driver-nfs \
  --namespace kube-system \
  --set externalSnapshotter.enabled=false \
  --set controller.replicas=1

# Verify installation
kubectl get pods -n kube-system -l app.kubernetes.io/name=csi-driver-nfs
```

The CSI driver provides the interface between Kubernetes and NFS—it handles mounting, provisioning, and lifecycle management.

### Step 7: Creating the StorageClass for NFS

The driver is installed, but Kubernetes needs a `StorageClass` to know *where* to provision NFS volumes.

**Configure the NFS server details:**

Edit `extras/nfs/storageclass-nfs.yaml`:

```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: nfs-rwx
provisioner: nfs.csi.k8s.io
parameters:
  server: 192.168.55.115       # IP of your NFS server (NAS, Linux box)
  share: /volume1/k8s-volumes  # NFS export path
reclaimPolicy: Delete          # Auto-delete PV when PVC is deleted
volumeBindingMode: Immediate   # Provision immediately when PVC is created
mountOptions:
  - nfsvers=4.1               # NFS version (4.1 recommended for performance)
  - hard                       # Hard mount (retry indefinitely on failure)
  - noatime                    # Don't update access times (better performance)
```

**Apply the StorageClass:**

```bash
kubectl apply -f extras/nfs/storageclass-nfs.yaml

# Verify it exists
kubectl get storageclass
```

**Test NFS provisioning:**

```bash
# Create a test PVC
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: test-nfs-pvc
spec:
  accessModes: [ReadWriteMany]
  storageClassName: nfs-rwx
  resources:
    requests:
      storage: 1Gi
EOF

# Check it's bound
kubectl get pvc test-nfs-pvc

# Clean up
kubectl delete pvc test-nfs-pvc
```

If the PVC shows `Bound` status, your NFS storage is working correctly.

---

## Deep Dive: Tailscale for Zero-Config Remote Access

In Step 3, we configured the Kubernetes API to listen on a Tailscale IP. This section explains why Tailscale is a game-changer for homelab infrastructure.

### What is Tailscale?

Tailscale is a **mesh VPN** built on [WireGuard](https://www.wireguard.com/)—a modern, high-performance VPN protocol that's now part of the Linux kernel. But unlike traditional VPNs that require server setup, certificate management, and firewall rules, Tailscale handles all the complexity for you.

**How it works:**

{{< mermaid >}}
graph LR
    laptop["Laptop (anywhere)<br/>100.x.y.z"]
    coord["Tailscale<br/>Coordination Servers"]
    homelab["Homelab Mac<br/>100.a.b.c"]

    laptop <-->|"Direct P2P<br/>(encrypted traffic)"| homelab
    laptop -.->|"Key exchange only"| coord
    homelab -.->|"Key exchange only"| coord
{{< /mermaid >}}

The coordination servers handle identity, key exchange, and NAT traversal—but your actual traffic flows **directly between devices** (peer-to-peer) whenever possible. Even through most NATs and firewalls.

### Why Tailscale for Kubernetes?

| Challenge | Traditional Solution | Tailscale Solution |
|-----------|---------------------|-------------------|
| Remote kubectl access | Port forwarding, dynamic DNS, certificates | Just works™ via stable IPs |
| Changing home IP | DDNS updates, kubeconfig changes | Tailscale IP never changes |
| Security | Exposing API to internet, firewall rules | Zero exposed ports, E2E encryption |
| Multi-device access | VPN server setup, client configs | Install app, sign in, done |

**Specific benefits for our setup:**

1. **Stable API endpoint**: The `100.x.y.z` IP in `kubeAPI.host` never changes, regardless of your local network configuration.

2. **No port forwarding**: Your home router doesn't need any configuration. Tailscale punches through NAT automatically.

3. **Security by default**: The Kubernetes API is never exposed to the public internet—only devices on your tailnet can reach it.

4. **MagicDNS**: Access your homelab by name (`homelab-mac.tail-net.ts.net`) instead of memorizing IPs.

### Future: Hybrid Cloud with Tailscale

The real power of Tailscale emerges when you connect cloud resources:

{{< mermaid >}}
graph LR
    subgraph tailnet["Your Tailnet (100.x.y.z/8)"]
        laptop["Laptop"]
        homelab["Homelab k8s"]
        aws["AWS EC2<br/>Worker"]
        gcp["GCP VM<br/>Monitoring"]
    end

    laptop <--> homelab
    homelab <--> aws
    aws <--> gcp
    laptop <--> gcp
{{< /mermaid >}}

**Scenarios this enables:**

- **Hybrid CI/CD**: GitHub Actions runner in the cloud deploys directly to your homelab cluster
- **Managed services integration**: Homelab apps connect to AWS RDS, CloudSQL, or ElastiCache
- **Distributed monitoring**: Centralized Grafana in the cloud scrapes metrics from homelab Prometheus
- **Disaster recovery**: Replicate data from homelab to cloud storage

All without complex site-to-site VPN tunnels, static IPs, or exposing services to the internet.

## Deep Dive: Podman vs Docker Desktop

"Docker" and "containers" have become synonymous, but Docker Desktop isn't the only option—and for homelabs, it might not be the best one.

### The Docker Licensing Issue

In 2021, Docker Inc. changed Docker Desktop's licensing: **free for personal use and small businesses (< 250 employees, < $10M revenue), paid for larger organizations**. While this likely doesn't affect homelab users, it created an industry-wide push toward alternatives.

### Enter Podman

**Podman (Pod Manager)** is Red Hat's OCI-compliant container engine. It's the default container runtime in RHEL, Fedora, and CentOS Stream.

**Architectural differences:**

| Aspect | Docker Desktop | Podman |
|--------|---------------|--------|
| Architecture | Client-server (dockerd daemon) | Daemonless (fork/exec model) |
| Process model | Daemon manages all containers | Each container is a direct process |
| Default security | Root daemon | Rootless by default |
| macOS implementation | Heavy GUI app + VM | CLI + minimal VM |
| Licensing | Proprietary (free tier) | Apache 2.0 (fully open source) |
| Resource usage | ~2GB+ RAM for Desktop app | ~500MB for VM only |

**Why daemonless matters:**

{{< mermaid >}}
graph TB
    subgraph docker["Docker Architecture"]
        dcli["docker CLI"] -->|"API call"| daemon["dockerd (daemon)<br/>SPOF"]
        daemon --> cont1["Container Process"]
    end

    subgraph podman["Podman Architecture"]
        pcli["podman CLI"] -->|"fork/exec"| cont2["Container Process<br/>Direct process"]
    end
{{< /mermaid >}}

If `dockerd` crashes, all containers become unmanageable. With Podman, containers are independent processes—if Podman CLI crashes, containers keep running.

### Why Podman for This Project?

1. **Lower resource overhead**: No heavy GUI app eating RAM in the background
2. **Full Docker compatibility**: Same CLI commands, same image format, compatible socket API
3. **Rootless security**: Better isolation (though we use rootful for port 80/443)
4. **Open source**: No licensing concerns, community-driven development
5. **Red Hat backing**: Enterprise-grade stability and long-term support

### Podman Commands Cheat Sheet

```bash
# Most Docker commands work identically
podman pull nginx:alpine
podman run -d -p 8080:80 nginx:alpine
podman ps
podman logs <container-id>
podman exec -it <container-id> sh
podman stop <container-id>
podman rm <container-id>

# Podman Machine (macOS only)
podman machine list
podman machine start
podman machine stop
podman machine ssh              # SSH into the VM
podman machine inspect          # Show VM details
```

> **Alias tip**: Add `alias docker=podman` to your shell profile for muscle memory compatibility.

## Deep Dive: Why Longhorn Won't Work (And What Will)

When planning Kubernetes storage, [Longhorn](https://longhorn.io/) is often the first choice—it's a CNCF-incubating project that provides distributed block storage with replication, snapshots, and disaster recovery.

So why aren't we using it?

### The Nested Virtualization Problem

Our architecture creates a "matryoshka doll" situation:

{{< mermaid >}}
graph TB
    subgraph macos["macOS Host"]
        subgraph vm["Podman VM (Fedora)"]
            subgraph container["k3d Container (Node)"]
                longhorn["Longhorn needs:<br/>/dev/longhorn (block device)<br/>iSCSI kernel modules<br/>Direct disk access"]
            end
        end
    end
{{< /mermaid >}}

**Longhorn requires:**
1. **Block device access** (`/dev/longhorn/*`) — containers don't have real block devices
2. **iSCSI kernel modules** — the container shares the host's kernel (Podman VM), not its own
3. **Open-iSCSI initiator** — requires `iscsid` daemon with proper privileges

In cloud environments (AWS, GCP), Kubernetes nodes are full VMs with their own kernels and attached block devices (EBS, Persistent Disks). Longhorn works great there.

In our setup, "nodes" are containers sharing a single VM's kernel. There's no way to provide isolated block devices to each container.

### Storage Options Comparison

| Storage Solution | Works in k3d? | Access Modes | Use Case |
|-----------------|---------------|--------------|----------|
| `local-path` (k3s default) | ✅ Yes | RWO | Single-pod workloads |
| NFS CSI driver | ✅ Yes | RWO, ROX, **RWX** | Shared storage |
| Longhorn | ❌ No | RWO, RWX | Cloud/bare metal only |
| OpenEBS (Jiva) | ⚠️ Complex | RWO | Requires privileged containers |
| Rook-Ceph | ❌ No | RWO, RWX | Full VMs only |

### Why NFS is the Right Choice

For our local homelab, NFS provides exactly what we need:

| NFS Advantage | Explanation |
|---------------|-------------|
| **RWX support** | Multiple pods can read/write simultaneously |
| **External storage** | Data persists even if cluster is destroyed |
| **Simple setup** | Any NAS or Linux box can serve NFS |
| **Performance** | NFSv4.1+ is fast enough for most workloads |
| **No kernel dependencies** | Just needs network connectivity |

**When you eventually deploy to cloud**, you can replace NFS with Longhorn or cloud-native storage (EBS CSI, GCE PD CSI) while keeping the same `PersistentVolumeClaim` abstractions. That's the beauty of Kubernetes storage classes.

---

## Troubleshooting

### Cluster won't start

**Symptom**: `k3d cluster create` hangs or fails

```bash
# Check Podman machine is running
podman machine list

# If stopped, start it
podman machine start

# Check for port conflicts (80, 443, 6443)
lsof -i :80
lsof -i :443
lsof -i :6443
```

### kubectl can't connect

**Symptom**: `Unable to connect to the server: dial tcp: lookup ... no such host`

```bash
# Verify kubeconfig is set
echo $KUBECONFIG

# Re-merge kubeconfig
k3d kubeconfig merge homelab --kubeconfig-switch-context

# Test connectivity to API server
curl -k https://<your-tailscale-ip>:6443/healthz
```

### NFS PVC stuck in Pending

**Symptom**: PVC shows `Pending` status indefinitely

```bash
# Check CSI driver pods
kubectl get pods -n kube-system -l app.kubernetes.io/name=csi-driver-nfs

# Check NFS server connectivity from a pod
kubectl run nfs-test --rm -it --image=busybox -- \
  ping -c 3 192.168.55.115

# Verify NFS export is accessible
showmount -e 192.168.55.115
```

### Podman vs Docker context issues

**Symptom**: Commands fail with "Cannot connect to Docker daemon"

```bash
# Check active context
docker context list

# Force Podman
docker context use default

# Or set environment variable
export DOCKER_HOST="unix://$HOME/.local/share/containers/podman/machine/podman.sock"
```

### Nodes not Ready

**Symptom**: `kubectl get nodes` shows `NotReady` status

```bash
# Check node conditions
kubectl describe node k3d-homelab-server-0

# Check container status
podman ps -a | grep k3d-homelab

# Restart stuck containers
k3d cluster stop homelab && k3d cluster start homelab
```

---

## Quick Reference: Common Commands

```bash
# Cluster lifecycle
k3d cluster create --config k3d/config.yaml  # Create
k3d cluster start homelab                     # Start (after stop)
k3d cluster stop homelab                      # Stop (preserves data)
k3d cluster delete homelab                    # Destroy completely

# Podman machine
podman machine start                          # Start VM
podman machine stop                           # Stop VM
podman machine ssh                            # SSH into VM

# Kubeconfig
k3d kubeconfig merge homelab --kubeconfig-switch-context
export KUBECONFIG=~/.config/k3d/kubeconfig-homelab.yaml

# Verification
kubectl get nodes -o wide
kubectl get pods -A
kubectl get storageclass
```

---

## Summary

We've built a production-grade local Kubernetes environment:

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Container runtime | Podman | Lighter, open source, Docker-compatible |
| Kubernetes distribution | k3s (via k3d) | Lightweight, CNCF-certified, fast |
| Cluster topology | 1 server + 3 agents | Realistic multi-node simulation |
| Storage (RWO) | local-path | Built into k3s, zero config |
| Storage (RWX) | NFS CSI | Works in containers, external persistence |
| Remote access | Tailscale | Zero-config VPN, stable IPs |

**What we've learned:**
- Why Podman's daemonless architecture matters
- How k3d simulates multi-node clusters in containers
- Why Longhorn doesn't work in nested container environments
- How Tailscale simplifies secure remote access

**Coming up in Part 2:**
- Installing an Ingress Controller (nginx-ingress or Traefik)
- Deploying first applications
- Setting up TLS certificates with cert-manager
- Introduction to GitOps with ArgoCD

---

4*All code and configuration from this post is available in the [cd-homelab repository](https://github.com/tomasz-wostal-eu/cd-homelab).*
