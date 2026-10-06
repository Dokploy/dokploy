import fs from "node:fs";
import path from "node:path";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NotiflyIcon, SendlyIcon } from "@/components/icons/notification-icons";
import {
	DoDomainLogo,
	NotiflyLogo,
	SendlyLogo,
	SnapvisorLogo,
	UptimelyLogo,
} from "@/components/icons/product-logos";
import {
	INTEGRATION_LEARN_MORE_URLS,
	type IntegrationProductId,
} from "@/components/dashboard/settings/integrations/integration-links";
import { DoDomainMark } from "@/components/dashboard/settings/integrations/dodomain/dodomain-logo";
import { SnapvisorMark } from "@/components/dashboard/settings/integrations/snapvisor/snapvisor-logo";
import { UptimelyMark } from "@/components/dashboard/settings/integrations/uptimely/uptimely-logo";
import { LearnMoreLink } from "@/components/shared/learn-more-link";

const REPO_ROOT = path.resolve(__dirname, "../../../..");
const APP_ROOT = path.resolve(__dirname, "../..");

const readRepo = (file: string) =>
	fs.readFileSync(path.join(REPO_ROOT, file), "utf8").replace(/\r\n/g, "\n");
const readApp = (file: string) =>
	fs.readFileSync(path.join(APP_ROOT, file), "utf8");

const LOGOS = [
	["Uptimely", UptimelyLogo],
	["Snapvisor", SnapvisorLogo],
	["DoDomain", DoDomainLogo],
	["Sendly", SendlyLogo],
	["Notifly", NotiflyLogo],
] as const;

describe("product logos", () => {
	it.each(LOGOS)(
		"%s renders an optimized, labelled inline SVG",
		(name, Logo) => {
			const html = renderToStaticMarkup(createElement(Logo));
			expect(html).toMatch(/^<svg /);
			expect(html).toContain("viewBox=");
			expect(html).toContain(`aria-label="${name}"`);
			// Stripped of metadata, fixed pixel sizes and web-font text.
			expect(html).not.toMatch(/<(title|desc|metadata|style|text|image)\b/);
			expect(html.match(/^<svg[^>]*>/)?.[0]).not.toMatch(/\s(width|height)=/);
			expect(html).not.toContain("<script");
		},
	);

	it.each(LOGOS)("%s takes its size from className", (_name, Logo) => {
		const html = renderToStaticMarkup(
			createElement(Logo, { className: "size-10" }),
		);
		expect(html).toContain("size-10");
		// The default size is replaced, not stacked.
		expect(html).not.toContain("size-8");
	});

	it.each(LOGOS)("%s has only well-formed path data", (_name, Logo) => {
		const html = renderToStaticMarkup(createElement(Logo));
		const paths = [...html.matchAll(/ d="([^"]*)"/g)].map(
			(m) => m[1] as string,
		);
		expect(paths.length).toBeGreaterThan(0);
		for (const d of paths) {
			expect(d).toMatch(/^M[MmLlHhVvCcSsQqTtAaZz0-9 .,\-eE]+$/);
		}
	});

	it("keeps DoDomain's tile theme-aware instead of OS-media-query driven", () => {
		const html = renderToStaticMarkup(createElement(DoDomainLogo));
		expect(html).toContain("fill-foreground");
		expect(html).toContain("fill-background");
		expect(html).not.toContain("prefers-color-scheme");
	});

	it("gives each rendered DoDomain logo its own mask id", () => {
		const html = renderToStaticMarkup(
			createElement(
				Fragment,
				null,
				createElement(DoDomainLogo),
				createElement(DoDomainLogo),
			),
		);
		const ids = [...html.matchAll(/<mask id="([^"]+)"/g)].map((m) => m[1]);
		expect(ids).toHaveLength(2);
		expect(new Set(ids).size).toBe(2);
		for (const id of ids) {
			expect(html).toContain(`mask="url(#${id})"`);
		}
	});

	it("renders the brand mark through the integration Mark components", () => {
		expect(renderToStaticMarkup(createElement(UptimelyMark))).toContain(
			'aria-label="Uptimely"',
		);
		expect(renderToStaticMarkup(createElement(SnapvisorMark))).toContain(
			'aria-label="Snapvisor"',
		);
		expect(renderToStaticMarkup(createElement(DoDomainMark))).toContain(
			'aria-label="DoDomain"',
		);
	});

	it("uses the brand marks for the Sendly and Notifly notification providers", () => {
		expect(renderToStaticMarkup(createElement(SendlyIcon))).toContain(
			'aria-label="Sendly"',
		);
		expect(renderToStaticMarkup(createElement(NotiflyIcon))).toContain(
			'aria-label="Notifly"',
		);
	});
});

describe("LearnMoreLink", () => {
	it("opens in a new tab with a safe rel and the external-link glyph", () => {
		const html = renderToStaticMarkup(
			createElement(LearnMoreLink, { href: "https://example.com/x" }),
		);
		expect(html).toContain('href="https://example.com/x"');
		expect(html).toContain('target="_blank"');
		expect(html).toContain('rel="noopener noreferrer"');
		expect(html).toContain("Learn more");
		expect(html).toContain("<svg");
		expect(html).toContain("text-muted-foreground");
	});
});

describe("integration Learn more targets", () => {
	const GUIDE = "https://dokploy-community.devino.ca/integrations/";
	const slug = (heading: string) =>
		heading
			.toLowerCase()
			.replace(/[^a-z0-9 -]/g, "")
			.replace(/ /g, "-");
	const guideAnchors = readRepo("integrations.md")
		.split("\n")
		.filter((line) => line.startsWith("## "))
		.map((line) => slug(line.slice(3)));

	it("points Uptimely at the Dokploy x Uptimely page on getuptimely.com", () => {
		expect(INTEGRATION_LEARN_MORE_URLS.uptimely).toBe(
			"https://getuptimely.com/integrations/dokploy",
		);
	});

	it.each(["snapvisor", "dodomain", "sendly", "notifly"] as const)(
		"points %s at an existing heading of the public integrations guide",
		(product) => {
			const url = INTEGRATION_LEARN_MORE_URLS[product];
			expect(url.startsWith(`${GUIDE}#`)).toBe(true);
			expect(guideAnchors).toContain(url.slice(GUIDE.length + 1));
		},
	);

	it("keeps the three guide anchors the brief specifies", () => {
		expect(INTEGRATION_LEARN_MORE_URLS.snapvisor).toBe(
			`${GUIDE}#snapvisor-visual-testing-on-preview-deployments`,
		);
		expect(INTEGRATION_LEARN_MORE_URLS.dodomain).toBe(
			`${GUIDE}#dodomain-custom-domain-connect-and-dns-verification`,
		);
		expect(INTEGRATION_LEARN_MORE_URLS.sendly).toBe(
			`${GUIDE}#sendly-and-notifly-notification-providers`,
		);
		expect(INTEGRATION_LEARN_MORE_URLS.notifly).toBe(
			INTEGRATION_LEARN_MORE_URLS.sendly,
		);
	});

	it("mentions the Dokploy x Uptimely page in the Uptimely section of integrations.md", () => {
		const body = readRepo("integrations.md");
		const start = body.indexOf("## Uptimely");
		const end = body.indexOf("\n## ", start + 1);
		expect(body.slice(start, end)).toContain(
			"https://getuptimely.com/integrations/dokploy",
		);
	});

	// Components that need tRPC cannot be rendered here, so assert the wiring:
	// every surface imports its URL from the shared table with the right key.
	const SURFACES: [string, IntegrationProductId[]][] = [
		[
			"components/dashboard/settings/integrations/uptimely/show-uptimely.tsx",
			["uptimely"],
		],
		[
			"components/dashboard/settings/integrations/snapvisor/show-snapvisor.tsx",
			["snapvisor"],
		],
		[
			"components/dashboard/settings/integrations/dodomain/show-dodomain.tsx",
			["dodomain"],
		],
		[
			"components/dashboard/settings/integrations/integrations-page.tsx",
			["sendly"],
		],
		[
			"components/dashboard/monitoring/uptimely/uptimely-service-panel.tsx",
			["uptimely"],
		],
		[
			"components/dashboard/application/preview-deployments/show-preview-settings.tsx",
			["snapvisor"],
		],
		[
			"components/dashboard/application/domains/dodomain-verification.tsx",
			["dodomain"],
		],
	];

	it.each(SURFACES)("%s renders a Learn more link", (file, products) => {
		const source = readApp(file);
		expect(source).toContain("<LearnMoreLink");
		for (const product of products) {
			expect(source).toContain(`INTEGRATION_LEARN_MORE_URLS.${product}`);
		}
	});

	it("shows an intro with a Learn more link in both the Sendly and Notifly forms", () => {
		const intro = readApp(
			"components/dashboard/settings/notifications/devino-provider-intro.tsx",
		);
		expect(intro).toContain("<LearnMoreLink");
		const form = readApp(
			"components/dashboard/settings/notifications/handle-notifications.tsx",
		);
		expect(form).toContain('<DevinoProviderIntro provider="sendly" />');
		expect(form).toContain('<DevinoProviderIntro provider="notifly" />');
	});

	it("no longer uses generic lucide icons for the Uptimely panel header", () => {
		const panel = readApp(
			"components/dashboard/monitoring/uptimely/uptimely-service-panel.tsx",
		);
		expect(panel).toContain("<UptimelyMark");
		const mark = readApp(
			"components/dashboard/settings/integrations/uptimely/uptimely-logo.tsx",
		);
		expect(mark).not.toContain("lucide-react");
	});
});
