# Dokploy Community Edition

> **This is a community fork of [Dokploy](https://github.com/Dokploy/dokploy).** We are **not** affiliated with or competing against the Dokploy project. This fork exists to make new features available faster.

Based on **Dokploy v0.29.8** | Fork version **v0.29.8-devino.1**

## What's different

This fork adds two features on top of the official Dokploy release:

### Concurrent Deployments
- Per-server deployment queues with configurable concurrency (default: 1 = serial, same as stock)
- Cancel deployments mid-build (queued or active)
- Process-group isolation — cancelling one build doesn't affect others

https://github.com/user-attachments/assets/628dda12-0524-4b3f-9a13-e4679488889a

### Docker Network Management
- New Networks page in the sidebar
- Create, delete, and manage Docker overlay networks
- Attach networks to any application or database service
- Per-resource network picker in the Advanced tab
  
https://github.com/user-attachments/assets/94134095-5601-4279-be2f-219734c8e199

## Install

Fresh install on a clean server (same requirements as Dokploy — Linux, root access):

```bash
curl -sSL https://dokploy-community.devino.ca/install.sh | sh
```

Install a specific version:

```bash
export DOKPLOY_VERSION=v0.29.8-devino.1
curl -sSL https://dokploy-community.devino.ca/install.sh | sh
```

Update an existing installation:

```bash
curl -sSL https://dokploy-community.devino.ca/install.sh | sh -s update
```

## Upgrade from official Dokploy

If you're already running official `dokploy/dokploy`, you can switch to this fork:

```bash
docker service update \
  --image ghcr.io/devinosolutions/dokploy-community:v0.29.8-devino.1 \
  --with-registry-auth \
  dokploy
```

The new migrations are additive (new table + new columns with defaults). Rollback to official is safe:

```bash
docker service update --image dokploy/dokploy:v0.29.8 --with-registry-auth dokploy
```

## Docker Image

```
ghcr.io/devinosolutions/dokploy-community:v0.29.8-devino.1   # versioned (recommended)
ghcr.io/devinosolutions/dokploy-community:canary              # latest build
```

The image is public — no authentication required.

## Versioning

We follow the scheme `v<upstream-version>-devino.<release>`:

| Upstream | Fork release | Tag |
|---|---|---|
| v0.29.8 | 1st release | `v0.29.8-devino.1` |
| v0.29.8 | 2nd fix | `v0.29.8-devino.2` |
| v0.30.0 | 1st release | `v0.30.0-devino.1` |

## Contributing

This fork tracks upstream Dokploy's `canary` branch. To contribute:

1. Fork this repo
2. Create a feature branch from `canary`
3. Open a PR targeting `canary`

For features that should go upstream, please also open a PR on the [official Dokploy repo](https://github.com/Dokploy/dokploy).

## Credits

- [Dokploy](https://dokploy.com) — the original project by [@siumauricio](https://github.com/siumauricio)
- This fork is maintained by [Devino Solutions](https://devino.ca)

## License

Same as upstream — [Apache 2.0](LICENSE)
