# Docker

Here's how to install docker on different operating systems:

## macOS

1. Visit [Docker Desktop for Mac](https://www.docker.com/products/docker-desktop)
2. Download the Docker Desktop installer
3. Double-click the downloaded `.dmg` file
4. Drag Docker to your Applications folder
5. Open Docker Desktop from Applications
6. Follow the onboarding tutorial if desired

## Linux

### Ubuntu

```bash
# Uninstall old versions
for pkg in docker.io docker-doc docker-compose docker-compose-v2 podman-docker containerd runc; do sudo apt-get remove $pkg; done

# Update package index
sudo apt-get update

# Install prerequisites
sudo apt-get install ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings

# Add Docker's official GPG key
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

# Add the repository to Apt sources
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker Engine
sudo apt-get update
sudo apt-get install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

## Windows

1. Enable WSL2 if not already enabled
2. Visit [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop)
3. Download the installer
4. Run the installer and follow the prompts
5. Start Docker Desktop from the Start menu

## Traefik update notifications

In **Settings → Notifications**, create or edit a destination and turn on
**Traefik update available**. The event is off by default. Enable it on each
destination that should receive alerts.

Dokploy checks daily at 04:00 in the Dokploy process's time zone. On self-hosted
instances, opted-in destinations can receive alerts for the Dokploy server. On
self-hosted and Cloud instances, destinations also receive alerts for active
deployment servers with an SSH key in their organization. Dokploy sends an
alert when a server is running an official Traefik image older than the version
recommended by the installed Dokploy release.

Each alert includes the server, the installed and recommended versions, and
links to settings and the official release notes when available. On a self-hosted
instance, set a Dokploy domain or server IP so recipients can open settings.
Dokploy records delivery once per destination, server, and recommended version.
Failed deliveries are tried again on the next daily check if the server is
still eligible. Turning the event off and back on retains delivery history.

Review the update under **Web Server → Traefik** on the Dokploy server, or under
the remote server's **Web Server Actions**. The check only reads version
information. Applying the update requires the manual **Update** action.
