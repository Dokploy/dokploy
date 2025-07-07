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