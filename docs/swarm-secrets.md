# Docker Swarm secrets

Open **Docker > Swarm > Secrets** and select the server that manages your Swarm.
You need Dokploy's Docker permission and access to that server. A Swarm worker
cannot manage secrets. This feature is available on self-hosted local servers and
on assigned remote Swarm managers. Cloud users must select a remote server.

The Swarm Overview also shows a **Total Secrets** card for the selected server.
This count does not expose secret names or values. If Docker cannot return the
count, the card shows **Unavailable** instead of zero.

The list opens directly for signed-in users with Docker permission and access to
the selected server, using the same access checks as the other Docker tabs.
Use HTTPS to protect new secret values while they are sent to the dashboard.

Choose **Create secret**, enter the content in Dokploy's shared code editor and
a unique name, then submit. Names
must start with a letter or number and contain at most 64 letters, numbers, dots,
underscores, or hyphens. Values support UTF-8 text, including multiline keys,
less than 500 KiB (maximum 511,999 UTF-8 bytes). Whitespace is preserved. Binary
file upload is not supported.

Docker stores the value in the Swarm. Dokploy does not keep another copy. Docker
never returns the value after creation, so existing content cannot be loaded or
changed in place. To rotate a secret, choose **Create secret** and enter new
content and a new name. Update your stack to use the new name and redeploy, then
delete the old secret after its references are removed. Keep a separate copy in
your password manager if you need one.

## Use a secret in a stack

Create the secrets on the same Swarm that deploys your stack. In Dokploy, select
the **Stack** deployment type. Ordinary **Docker Compose** deployments cannot
consume external Swarm secrets.

Set these environment variables to the secret names, not the secret values:

```dotenv
MYSQL_PASSWORD_SECRET=mysql_password_production_v1
MYSQL_ROOT_PASSWORD_SECRET=mysql_root_password_production_v1
```

Add these fields to your existing MySQL stack. Keep its database, user, storage,
and other required settings:

```yaml
services:
  mysql:
    environment:
      MYSQL_PASSWORD_FILE: /run/secrets/mysql_password
      MYSQL_ROOT_PASSWORD_FILE: /run/secrets/mysql_root_password
    secrets:
      - mysql_password
      - mysql_root_password

secrets:
  mysql_password:
    external: true
    name: ${MYSQL_PASSWORD_SECRET:?Set the application password secret for this environment}
  mysql_root_password:
    external: true
    name: ${MYSQL_ROOT_PASSWORD_SECRET:?Set the root password secret for this environment}
```

Top-level declarations alone do not grant a service access. The service also
needs its `secrets` entries, and the application must read the mounted files.
MySQL supports the `_FILE` variables shown above. Other images may use different
settings. Existing MySQL databases do not change passwords merely because you
replace a secret file; follow the database's password rotation procedure too.

## References and deletion

The list shows each secret's ID, name, creation time, and the current and rollback
service specifications that reference it. Stack names appear beside services.
The **Used by** column counts distinct Swarm services, including rollback-only
references. The copy button beside each secret name copies its exact name for
use in your stack environment. The Created column appears before Actions and
shows the date above the relative time, without an exact clock time. Sort by
name or creation date using the table headers.
Search by secret name, ID, service, or stack. References use immutable Docker
secret IDs, so a different secret with the same name is not treated as the same
object.

Hover over or focus a disabled delete icon to see why the secret cannot be
deleted. Deletion requires typing the exact secret name in the confirmation
dialog.
The server checks the confirmation name against the secret with that ID too.
Deletion is blocked for referenced secrets, including
services scaled to zero and rollback-only references. Remove those references
before deleting. The server checks again when deleting, and Docker rejects a
concurrent attachment. No service is stopped or changed automatically. Refresh
shows changes made outside Dokploy. Failed lookups show an error instead of
reporting a secret as unused.

Secrets are Swarm-wide resources. As with the other Docker management tabs,
Docker access grants visibility into the selected Swarm, rather than filtering
by Dokploy project. Names and service references are metadata, but should still
be chosen carefully. Create and delete actions use Dokploy's existing audit log;
secret values are excluded.

See [Docker secrets](https://docs.docker.com/engine/swarm/secrets/) for Docker's
storage and rotation behavior.
