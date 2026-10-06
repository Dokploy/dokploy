---
title: "Dokploy Integrations Guide"
description: "Connect Uptimely monitoring, Snapvisor visual testing, DoDomain domain DNS verification, and Sendly and Notifly notifications in Dokploy Community Edition."
permalink: /integrations/
---

# Dokploy integrations: Settings → Integrations

[Dokploy Community Edition](https://dokploy-community.devino.ca/) is a self-hosted fork of Dokploy. It adds native integrations that you connect once per organization and then use from the pages of your services. This page covers each one: what it does, what you need, how to connect it, and its limits.

| Integration | What it gives you | Where you connect it |
|---|---|---|
| [Uptimely](#uptimely-uptime-ssl-and-domain-monitoring) | External uptime, SSL certificate and domain monitors for each service | Settings → Integrations |
| [Snapvisor](#snapvisor-visual-testing-on-preview-deployments) | Visual-diff review status on preview deployments | Settings → Integrations |
| [DoDomain](#dodomain-custom-domain-connect-and-dns-verification) | Hosted flow for domain owners to connect DNS, with verification | Settings → Integrations |
| [Sendly](#sendly-and-notifly-notification-providers) | Notification emails | Settings → Notifications |
| [Notifly](#sendly-and-notifly-notification-providers) | Notification workflows | Settings → Notifications |

The Integrations page (`/dashboard/settings/integrations`) shows cards for Uptimely, DoDomain and Snapvisor. Each organization has one connection per product, so connecting again opens an edit instead. Secrets are write-only: after you save a key or token, Dokploy only shows its last four characters, and leaving the field blank while editing keeps the stored value. Every connect dialog has a **Test connection** button, so you can check the credentials before saving.

## Uptimely: uptime, SSL and domain monitoring

[Uptimely](https://getuptimely.com) runs checks from outside your server. With the integration, each application, compose stack or database gets an opt-in uptime panel on its **Monitoring** tab: a status pill, a 30-day timeline per monitor, and a link to each monitor in Uptimely. Checks run every 5 minutes. Uptimely also publishes a [Dokploy × Uptimely page](https://getuptimely.com/integrations/dokploy) that walks through the integration with screenshots.

**What you need**

- An Uptimely project and one of its project API keys. Create the key in Uptimely under Settings → API Keys. It is locked to a single project.
- **AI write operations** turned on for that project (Uptimely → Settings → API Keys). Creating monitors and running probes are write operations, and Uptimely refuses them while the setting is off. Reading status works either way.

**How to connect**

1. Open Settings → Integrations and press **Connect Uptimely**.
2. Fill in **Name**, **Project API key** and **Project ID**. You can leave Project ID blank and press **Test connection**: Dokploy lists the projects the key can reach and fills it in when there is exactly one.
3. Leave **Base URL** at `https://app.getuptimely.com` unless you run a self-hosted Uptimely.
4. Optionally set **Status page slug**. When it is set, the public status badge is shown on each monitored service. Only public status pages have a badge.
5. Press **Connect**.

**How to monitor a service**

1. Open the service and go to its **Monitoring** tab.
2. In the **Uptime by Uptimely** panel, press **Monitor with Uptimely**. Nothing is created until you press it.
3. For applications and compose stacks, tick **Also add SSL certificate and domain monitors** if you want them as well.
4. For applications and compose stacks, optionally fill in **Path to check (optional)**, for example `/health`. It is added to each domain's URL, so pick a path that returns 200 (a 2xx or 3xx counts as up). Leave it blank to monitor the domain's own URL. The path is only used when the monitors are first created.
5. Below the path, the **Reachability check** makes a real request to each URL the monitors would watch and shows what it answers. A URL that answers an error or does not respond gets a warning that Uptimely will report it **Offline**, before any monitor exists. Press **Check** to run it again.
6. Use **Run probe now** to run a check immediately, **Add monitors for new domains** after you add a domain (it creates a Website monitor for each HTTPS domain added since the service was linked and keeps the existing monitors), and **Open in Uptimely** to jump to a monitor.

**What gets created**

- Applications and compose stacks: one **Website** monitor per HTTPS domain. Wildcard domains and preview-deployment domains are skipped. With the checkbox ticked, each distinct HTTPS host also gets an **SSL Certificate** monitor and a **Domain** monitor.
- Databases: one **Port** monitor for the database's external port. Expose the database on an external port first.
- Monitors that already exist for the same target are not created twice.

**Limits to know about**

- One Website monitor is created per HTTPS domain. A service with no HTTPS domain, or a database with no external port, has nothing to monitor: the **Monitor with Uptimely** button is disabled and the panel says what to add (an HTTPS domain, or an external port).
- Uptimely checks the exact URL: the domain's host plus its path. If that URL answers 404 or another error, the monitor shows **Offline** even when the rest of the site works. Open the URL in a browser to see what Uptimely sees.
- Once monitors exist, a Website monitor that is **Offline** shows a note under the timeline. If the service answers 404 there, unlink it and monitor again with a path such as `/health`.
- Monitors cannot be deleted from Dokploy, because Uptimely's API has no monitor delete. **Unlink** only makes Dokploy forget the monitors for that service. Disconnecting the integration removes the stored API key and every link. In both cases the monitors keep running in Uptimely until you delete them there.
- One Uptimely project is connected per organization.

## Snapvisor: visual testing on preview deployments

[Snapvisor](https://snapvisor.io) diffs screenshots from your CI against a baseline and lets your team approve or reject the changes. With the integration, each preview deployment of an application shows the review status of its build.

**What you need**

- A Snapvisor account, a personal access token (created in your Snapvisor account settings) and your account slug, which is the `my-team` in `app.snapvisor.io/my-team/my-project`.
- The Snapvisor CLI running in your own CI. Screenshots are still captured and uploaded there. Dokploy does not create builds: it finds the build Snapvisor already created for the commit it just deployed and shows its status.

**How to connect**

1. Open Settings → Integrations and press **Connect Snapvisor**.
2. Fill in **Name**, **Personal access token** and **Account slug**.
3. Leave **Base URL** at `https://api.snapvisor.io` unless you run a self-hosted Snapvisor.
4. Press **Test connection**, then **Connect**.

**How to turn it on for an application**

1. Open the application, go to **Preview Deployments** and open the preview deployment settings.
2. Under **Visual testing (Snapvisor)**, pick the Snapvisor project. **Off** is the default.
3. Each preview card now shows a Snapvisor badge: **Pending**, **No changes**, **Changes detected**, **Approved**, **Rejected**, **Error** or **Expired**, with a refresh button and a **Review in Snapvisor** link.

**Limits to know about**

- The build is looked up by the full 40-character commit SHA of the preview's latest deployment. If your CI has not produced a build for that exact commit yet, the badge reads **Not registered**; refresh once the build exists.
- The lookup applies to application previews. Dokploy polls while a build is still pending and stops once it reaches a final status.
- Disconnecting removes the stored token and every application's project link. Builds already created in Snapvisor are unaffected.

## DoDomain: custom-domain connect and DNS verification

[DoDomain](https://dodomain.io) lets the owner of a domain connect it to your service through a hosted flow: one-click Cloudflare sign-in, Domain Connect with the DNS provider, or guided manual DNS setup. DoDomain verifies the records and tells Dokploy through a webhook.

**What you need**

- A DoDomain app and its server-side secret key from the DoDomain dashboard.
- The Dokploy panel reachable over HTTPS (Settings → Web Server). Saving the integration registers a webhook at `/api/webhooks/dodomain` on the panel's public URL, so DoDomain can report verification results.

**How to connect**

1. Open Settings → Integrations and press **Connect DoDomain**.
2. Fill in **Name**, **Secret key** and **App ID**. You can leave App ID blank and press **Test connection** to fill it in from the key.
3. Leave **Base URL** at `https://app.dodomain.io` unless you run a self-hosted DoDomain.
4. Press **Connect**. The card shows whether the webhook is registered.

**How to use it**

1. On a service's **Domains** tab, add the domain the customer owns. In the domain dialog, **Check DNS** shows which provider hosts it and how its owner will connect.
2. In the domain's row, open the DoDomain actions menu and choose **Send connect link**. Dokploy shows the link, the DNS records it will request and when it expires. **Copy connect link** copies the active link and **Re-verify DNS** asks DoDomain to recheck an existing connection.
3. Send the link to the domain's owner. When DoDomain reports back, the domain row shows **DNS verified**. Until then it shows **Awaiting domain owner**, and **DNS verification failed** when the records no longer match.

**Limits to know about**

- Only concrete hostnames can be connected. Wildcard hosts and generated `sslip.io` and `traefik.me` names cannot.
- DoDomain only delivers webhooks to a public HTTPS address. If the panel is served on a private address (for example a Tailscale `*.ts.net` name, a `.local` or `.internal` host, or a private IP), DoDomain refuses to register the webhook or cannot deliver to it, so the domain status never updates by itself. Dokploy still saves the integration and shows a warning on the card and in the edit dialog. In that case, press **Re-verify DNS** to refresh a domain's status, or serve the panel on a public HTTPS URL to receive webhooks. **Re-verify DNS** is disabled until a connect link has been sent for the domain.
- A DNS verification failure is sent to the notification providers that are subscribed to deploy failures.
- Disconnecting removes the stored secret key and deletes the webhook endpoint from DoDomain. Domains keep their current verification state.

## Sendly and Notifly: notification providers

Sendly and Notifly are notification providers, so they live in Settings → Notifications rather than on the Integrations page. Press **Add Notification**, then under **Select a provider** choose **Sendly** or **Notifly**. Choose which events should notify it, press **Test Notification** to send a test, then **Create**.

**Sendly** ([sendly.now](https://sendly.now)) sends notifications as email. Fields: **Name**, **API Key**, **Base URL** (defaults to `https://app.sendly.now`, the base URL of your Sendly instance), **From Address** and one or more **To Addresses**.

**Notifly** ([notifly.io](https://notifly.io)) triggers a Notifly workflow for each notification. Fields: **Name**, **API Key**, **Base URL** (defaults to `https://api.notifly.io`), **Workflow Key** (the identifier of the workflow to trigger) and an optional **Subscriber ID** that defaults to `dokploy`.

## Related

- [Frequently asked questions](https://dokploy-community.devino.ca/faq/)
- [Dokploy Community Edition overview, install and upgrade](https://dokploy-community.devino.ca/)
- [Source code and releases on GitHub](https://github.com/DevinoSolutions/dokploy-community)
