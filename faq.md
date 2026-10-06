---
title: "Dokploy Fork FAQ and Migration"
description: "Dokploy Community Edition FAQ: migrating from Dokploy, the built-in MCP server for Claude Code, 25 MB deploy webhooks, DoDomain, uptime monitoring, telemetry."
permalink: /faq/
---

# Dokploy Community Edition FAQ

Short answers to common questions about [Dokploy Community Edition](https://dokploy-community.devino.ca/), the self-hosted Dokploy fork. For feature setup guides see the [integrations page](https://dokploy-community.devino.ca/integrations/).

## What is Dokploy Community Edition?

Dokploy Community Edition is a community fork of Dokploy, the self-hosted platform for deploying applications, databases and Docker Compose stacks. It includes everything in upstream Dokploy v0.30.8 plus 100+ community features and fixes that have not landed upstream yet, each ported 1:1 with credit to its original author, plus fork-only security hardening.

[What is different in this fork](https://dokploy-community.devino.ca/)

## Is Dokploy Community Edition affiliated with Dokploy?

No. It is a community fork stewarded by Devino Solutions, and it is not affiliated with or competing against the Dokploy project. The fork exists to make new features available faster, and every ported change credits its original upstream author.

[Credits and source on GitHub](https://github.com/DevinoSolutions/dokploy-community)

## How do I install Dokploy Community Edition?

On a clean Linux server with root access, the same requirements as Dokploy, run the install script from this site. To install a specific version set the DOKPLOY_VERSION environment variable first, and to update an existing installation run the script with the update argument. The commands are shown below.

```bash
curl -sSL https://dokploy-community.devino.ca/install.sh | sh

# a specific version
export DOKPLOY_VERSION=v0.30.8-community.4
curl -sSL https://dokploy-community.devino.ca/install.sh | sh

# update an existing installation
curl -sSL https://dokploy-community.devino.ca/install.sh | sh -s update
```

## How do I migrate from upstream Dokploy to Dokploy Community Edition?

Run one docker service update command against the dokploy service on your existing server, pointing it at the ghcr.io/devinosolutions/dokploy-community image. It keeps every application, database, domain and setting because the extra migrations are additive, and the image is public so no registry login is required. The command is shown below.

```bash
docker service update \
  --image ghcr.io/devinosolutions/dokploy-community:v0.30.8-community.4 \
  --with-registry-auth \
  dokploy
```

## Can I go back to official Dokploy after switching?

Yes. Update the dokploy service back to the official dokploy/dokploy image at the version you want, for example v0.30.8. The extra tables and columns that this fork adds are simply ignored by official Dokploy.

```bash
docker service update --image dokploy/dokploy:v0.30.8 --with-registry-auth dokploy
```

## Is the Dokploy Community Edition image multi-arch?

Yes. Recent release images are multi-arch, covering linux/amd64 and linux/arm64, and are built by CI from the release commit. The public image is ghcr.io/devinosolutions/dokploy-community, with versioned tags, a latest tag for the latest release and a canary tag for the latest build.

[Image tags on GitHub](https://github.com/DevinoSolutions/dokploy-community#docker-image)

## How do I connect Claude Code to Dokploy with MCP?

Dokploy Community Edition has a built-in remote MCP server, so you do not need to run a separate npx process or create an API key. Add it to Claude Code with the command shown below, using your own panel address, then run /mcp, choose Authenticate and sign in once in the browser through OAuth. An MCP client that cannot use the browser sign-in can send a Dokploy API key in the x-api-key header instead.

```bash
claude mcp add --transport http --scope user dokploy https://<host>/api/mcp

# optional: authenticate with a Dokploy API key instead of OAuth
claude mcp add --transport http --scope user dokploy https://<host>/api/mcp --header "x-api-key: <key>"
```

[Remote MCP server in the README](https://github.com/DevinoSolutions/dokploy-community#remote-mcp-server-with-oauth-fork-original)

## Why does my Dokploy GitHub webhook not trigger a deploy for large pushes?

Upstream Dokploy rejected webhook request bodies larger than 1 MB, so a large GitHub push, for example one with many commits or changed files, was skipped and the request was answered with HTTP 413 Payload Too Large. Since v0.30.8-community.1 the Community Edition accepts deploy webhook payloads up to 25 MB, so those pushes trigger a deploy.

[Webhook payload limit change on GitHub](https://github.com/DevinoSolutions/dokploy-community/pull/263)

## Why did my service status reset after saving provider settings?

Upstream Dokploy set the status of a service back to idle when you saved the provider settings of an application, or disconnected the Git provider of an application or compose stack, so a running service could look stopped until its next deploy. Since v0.30.8-community.1 the Community Edition keeps the current status when you save provider settings.

[Release notes on GitHub](https://github.com/DevinoSolutions/dokploy-community/releases/tag/v0.30.8-community.1)

## How do I move a Dokploy service to another server?

Yes, in multi-server mode. Open the Application, Compose stack or database you want to move and start the transfer to another server. The move runs in two phases, scan and then execute, and uses a copy-based cutover: the source is stopped, its data is copied to the destination, and the service switches to the new server only after the copy fully succeeds. If anything fails the source is restarted and left untouched, so the service keeps running where it was.

[Server transfer pull request on GitHub](https://github.com/DevinoSolutions/dokploy-community/pull/148)

## How do I connect DoDomain to Dokploy?

Open Settings → Integrations, choose Connect DoDomain and paste the server-side secret key of your DoDomain app, which starts with dd_sk_. Press Test connection to fill in the App ID from the key. Leave the Base URL at its default unless you run a self-hosted DoDomain, and note that it must use https, with http allowed only for localhost. Then press Connect.

[DoDomain setup in detail](https://dokploy-community.devino.ca/integrations/#dodomain-custom-domain-connect-and-dns-verification)

## How do I add uptime monitoring to Dokploy?

Connect the Uptimely integration in Settings → Integrations with a project API key from Uptimely, and turn on AI write operations for that project in Uptimely. Then open an application, compose stack or database, go to its Monitoring tab and press Monitor with Uptimely. Dokploy creates one Website monitor per HTTPS domain, or a Port monitor for a database with an external port, and the checks run every 5 minutes.

[Uptimely setup in detail](https://dokploy-community.devino.ca/integrations/#uptimely-uptime-ssl-and-domain-monitoring)

## Why does my Uptimely monitor show Offline?

Uptimely checks the exact URL of the domain, which is its host plus its path. If that URL answers 404 or another error, the monitor shows Offline even when the rest of the site works. Open the URL in a browser to see what it returns, then fix the application or the domain path. Monitors cannot be deleted from Dokploy, so delete an obsolete monitor in Uptimely itself.

[Uptimely limits](https://dokploy-community.devino.ca/integrations/#uptimely-uptime-ssl-and-domain-monitoring)

## Can I type into a container from the Dokploy log viewer?

Yes. The container log viewer has a Send a command box that sends what you type to the container as input. The viewer attaches to the container only when you send a command and never forwards signals, so looking at logs does not restart services that exit on SIGHUP. Since v0.30.7-community.9 the input keeps working after the container restarts, including for TTY containers.

[Release notes on GitHub](https://github.com/DevinoSolutions/dokploy-community/releases)

## How does Dokploy Community Edition stay in sync with upstream Dokploy?

The fork merges upstream release tags, never the moving upstream canary branch, so it always tracks a tested and published state. It diverges only for features that upstream lacks, and when upstream ships an equivalent the fork drops its own version and takes the upstream one. Releases are versioned as the upstream version plus a community release number, for example v0.30.8-community.4.

[Versioning table](https://github.com/DevinoSolutions/dokploy-community#versioning)

## Does Dokploy Community Edition send telemetry?

It reports unhandled backend errors, meaning crashes and internal server errors, to a Devino-hosted Sentry instance. An event contains the stack trace, the error message and the fork version. No environment variables, secrets, deployment logs, request data or personal information are sent, and the reporting server hostname is stripped. You can opt out by setting DOKPLOY_DISABLE_SENTRY=true on the dokploy service, and the DO_NOT_TRACK=1 convention is also respected.

[Error reporting and privacy](https://github.com/DevinoSolutions/dokploy-community#error-reporting--privacy)

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "What is Dokploy Community Edition?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Dokploy Community Edition is a community fork of Dokploy, the self-hosted platform for deploying applications, databases and Docker Compose stacks. It includes everything in upstream Dokploy v0.30.8 plus 100+ community features and fixes that have not landed upstream yet, each ported 1:1 with credit to its original author, plus fork-only security hardening."
      }
    },
    {
      "@type": "Question",
      "name": "Is Dokploy Community Edition affiliated with Dokploy?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "No. It is a community fork stewarded by Devino Solutions, and it is not affiliated with or competing against the Dokploy project. The fork exists to make new features available faster, and every ported change credits its original upstream author."
      }
    },
    {
      "@type": "Question",
      "name": "How do I install Dokploy Community Edition?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "On a clean Linux server with root access, the same requirements as Dokploy, run the install script from this site. To install a specific version set the DOKPLOY_VERSION environment variable first, and to update an existing installation run the script with the update argument. The commands are shown below."
      }
    },
    {
      "@type": "Question",
      "name": "How do I migrate from upstream Dokploy to Dokploy Community Edition?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Run one docker service update command against the dokploy service on your existing server, pointing it at the ghcr.io/devinosolutions/dokploy-community image. It keeps every application, database, domain and setting because the extra migrations are additive, and the image is public so no registry login is required. The command is shown below."
      }
    },
    {
      "@type": "Question",
      "name": "Can I go back to official Dokploy after switching?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes. Update the dokploy service back to the official dokploy/dokploy image at the version you want, for example v0.30.8. The extra tables and columns that this fork adds are simply ignored by official Dokploy."
      }
    },
    {
      "@type": "Question",
      "name": "Is the Dokploy Community Edition image multi-arch?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes. Recent release images are multi-arch, covering linux/amd64 and linux/arm64, and are built by CI from the release commit. The public image is ghcr.io/devinosolutions/dokploy-community, with versioned tags, a latest tag for the latest release and a canary tag for the latest build."
      }
    },
    {
      "@type": "Question",
      "name": "How do I connect Claude Code to Dokploy with MCP?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Dokploy Community Edition has a built-in remote MCP server, so you do not need to run a separate npx process or create an API key. Add it to Claude Code with the command shown below, using your own panel address, then run /mcp, choose Authenticate and sign in once in the browser through OAuth. An MCP client that cannot use the browser sign-in can send a Dokploy API key in the x-api-key header instead."
      }
    },
    {
      "@type": "Question",
      "name": "Why does my Dokploy GitHub webhook not trigger a deploy for large pushes?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Upstream Dokploy rejected webhook request bodies larger than 1 MB, so a large GitHub push, for example one with many commits or changed files, was skipped and the request was answered with HTTP 413 Payload Too Large. Since v0.30.8-community.1 the Community Edition accepts deploy webhook payloads up to 25 MB, so those pushes trigger a deploy."
      }
    },
    {
      "@type": "Question",
      "name": "Why did my service status reset after saving provider settings?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Upstream Dokploy set the status of a service back to idle when you saved the provider settings of an application, or disconnected the Git provider of an application or compose stack, so a running service could look stopped until its next deploy. Since v0.30.8-community.1 the Community Edition keeps the current status when you save provider settings."
      }
    },
    {
      "@type": "Question",
      "name": "How do I move a Dokploy service to another server?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes, in multi-server mode. Open the Application, Compose stack or database you want to move and start the transfer to another server. The move runs in two phases, scan and then execute, and uses a copy-based cutover: the source is stopped, its data is copied to the destination, and the service switches to the new server only after the copy fully succeeds. If anything fails the source is restarted and left untouched, so the service keeps running where it was."
      }
    },
    {
      "@type": "Question",
      "name": "How do I connect DoDomain to Dokploy?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Open Settings → Integrations, choose Connect DoDomain and paste the server-side secret key of your DoDomain app, which starts with dd_sk_. Press Test connection to fill in the App ID from the key. Leave the Base URL at its default unless you run a self-hosted DoDomain, and note that it must use https, with http allowed only for localhost. Then press Connect."
      }
    },
    {
      "@type": "Question",
      "name": "How do I add uptime monitoring to Dokploy?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Connect the Uptimely integration in Settings → Integrations with a project API key from Uptimely, and turn on AI write operations for that project in Uptimely. Then open an application, compose stack or database, go to its Monitoring tab and press Monitor with Uptimely. Dokploy creates one Website monitor per HTTPS domain, or a Port monitor for a database with an external port, and the checks run every 5 minutes."
      }
    },
    {
      "@type": "Question",
      "name": "Why does my Uptimely monitor show Offline?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Uptimely checks the exact URL of the domain, which is its host plus its path. If that URL answers 404 or another error, the monitor shows Offline even when the rest of the site works. Open the URL in a browser to see what it returns, then fix the application or the domain path. Monitors cannot be deleted from Dokploy, so delete an obsolete monitor in Uptimely itself."
      }
    },
    {
      "@type": "Question",
      "name": "Can I type into a container from the Dokploy log viewer?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes. The container log viewer has a Send a command box that sends what you type to the container as input. The viewer attaches to the container only when you send a command and never forwards signals, so looking at logs does not restart services that exit on SIGHUP. Since v0.30.7-community.9 the input keeps working after the container restarts, including for TTY containers."
      }
    },
    {
      "@type": "Question",
      "name": "How does Dokploy Community Edition stay in sync with upstream Dokploy?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "The fork merges upstream release tags, never the moving upstream canary branch, so it always tracks a tested and published state. It diverges only for features that upstream lacks, and when upstream ships an equivalent the fork drops its own version and takes the upstream one. Releases are versioned as the upstream version plus a community release number, for example v0.30.8-community.4."
      }
    },
    {
      "@type": "Question",
      "name": "Does Dokploy Community Edition send telemetry?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "It reports unhandled backend errors, meaning crashes and internal server errors, to a Devino-hosted Sentry instance. An event contains the stack trace, the error message and the fork version. No environment variables, secrets, deployment logs, request data or personal information are sent, and the reporting server hostname is stripped. You can opt out by setting DOKPLOY_DISABLE_SENTRY=true on the dokploy service, and the DO_NOT_TRACK=1 convention is also respected."
      }
    }
  ]
}
</script>
