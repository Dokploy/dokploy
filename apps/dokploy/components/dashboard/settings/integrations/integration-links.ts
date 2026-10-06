/**
 * "Learn more" targets for the Devino integrations. Uptimely has a dedicated
 * Dokploy × Uptimely page on its own site; the other four link to the matching
 * section of the public Dokploy Community integrations guide
 * (`integrations.md`, rendered by GitHub Pages). The anchors are the
 * kramdown ids of that file's headings, and `__test__/site` checks them.
 */
const GUIDE_URL = "https://dokploy-community.devino.ca/integrations/";

export const INTEGRATION_LEARN_MORE_URLS = {
	uptimely: "https://getuptimely.com/integrations/dokploy",
	snapvisor: `${GUIDE_URL}#snapvisor-visual-testing-on-preview-deployments`,
	dodomain: `${GUIDE_URL}#dodomain-custom-domain-connect-and-dns-verification`,
	sendly: `${GUIDE_URL}#sendly-and-notifly-notification-providers`,
	notifly: `${GUIDE_URL}#sendly-and-notifly-notification-providers`,
} as const;

export type IntegrationProductId = keyof typeof INTEGRATION_LEARN_MORE_URLS;
