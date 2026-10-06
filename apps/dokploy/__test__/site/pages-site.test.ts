import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

/**
 * Public site (GitHub Pages, legacy Jekyll build from the repo root, served at
 * https://dokploy-community.devino.ca).
 *
 * Block 1 checks the files in the repository and always runs.
 * Block 2 fetches the deployed site (not mocked) and only runs with
 * `SITE_LIVE_TESTS=1`. Its assertions pass once the files below are on
 * `canary` and Pages has rebuilt:
 *
 *   SITE_LIVE_TESTS=1 npx vitest run --config __test__/vitest.config.ts \
 *     __test__/site/pages-site.test.ts
 */

const SITE = "https://dokploy-community.devino.ca";
const REPO_ROOT = path.resolve(__dirname, "../../../..");

const read = (file: string) =>
	fs.readFileSync(path.join(REPO_ROOT, file), "utf8");

/** Splits a Markdown file into parsed YAML front matter and its body. */
const parseMarkdown = (file: string) => {
	const raw = read(file).replace(/\r\n/g, "\n");
	const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
	if (!match) throw new Error(`${file} has no front matter`);
	return {
		frontMatter: parseYaml(match[1] as string) as Record<string, unknown>,
		body: match[2] as string,
	};
};

const JSON_LD_RE = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;

type FaqPage = {
	"@context": string;
	"@type": string;
	mainEntity: {
		"@type": string;
		name: string;
		acceptedAnswer: { "@type": string; text: string };
	}[];
};

const extractFaqPage = (html: string): FaqPage | undefined => {
	for (const match of html.matchAll(JSON_LD_RE)) {
		const data = JSON.parse(match[1] as string) as FaqPage;
		if (data["@type"] === "FAQPage") return data;
	}
	return undefined;
};

const indexNowKeyFiles = () =>
	fs.readdirSync(REPO_ROOT).filter((name) => /^[0-9a-f]{32}\.txt$/.test(name));

/** The release the repository is at, for example `v0.30.8-community.1`. */
const packageVersion = (
	JSON.parse(read("apps/dokploy/package.json")) as { version: string }
).version;

const COMMUNITY_TAG_RE = /v\d+\.\d+\.\d+-community\.\d+/g;

const REPO_URL = "https://github.com/DevinoSolutions/dokploy-community";
const LICENSE_URL = `${REPO_URL}/blob/canary/LICENSE.MD`;
const MARKDOWN_PAGES = ["README.md", "faq.md", "integrations.md", "404.md"];

/** Drops fenced code blocks (``` or ~~~, also when indented in a list). */
const withoutCodeFences = (text: string) => {
	let inFence = false;
	return text
		.replace(/\r\n/g, "\n")
		.split("\n")
		.filter((line) => {
			if (/^\s*(```|~~~)/.test(line)) {
				inFence = !inFence;
				return false;
			}
			return !inFence;
		})
		.join("\n");
};

/** Markdown front matter if there is any (README.md has none). */
const frontMatterOf = (file: string) => {
	const match = read(file)
		.replace(/\r\n/g, "\n")
		.match(/^---\n([\s\S]*?)\n---\n/);
	return match
		? (parseYaml(match[1] as string) as Record<string, unknown>)
		: {};
};

/** The PNG width and height from the IHDR chunk. */
const pngSize = (file: string) => {
	const buffer = fs.readFileSync(path.join(REPO_ROOT, file));
	expect(buffer.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
	expect(buffer.subarray(12, 16).toString("ascii")).toBe("IHDR");
	return {
		width: buffer.readUInt32BE(16),
		height: buffer.readUInt32BE(20),
		bytes: buffer.length,
	};
};

describe("pages site: repository files", () => {
	describe("_config.yml", () => {
		const config = parseYaml(read("_config.yml")) as Record<string, unknown>;
		const exclude = (config.exclude ?? []) as string[];

		it("uses the https site URL with an empty baseurl", () => {
			expect(config.url).toBe(SITE);
			expect(config.baseurl).toBe("");
		});

		it("has a title, an English language and a description with the key terms", () => {
			expect(config.title).toBe("Dokploy Community Edition");
			expect(config.lang).toBe("en");
			const description = String(config.description);
			expect(description).toContain("Dokploy fork");
			expect(description).toContain("self-hosted");
			expect(description.length).toBeGreaterThan(100);
			expect(description.length).toBeLessThanOrEqual(200);
		});

		it("has a short tagline so the home page <title> stays under about 60 characters", () => {
			const homeTitle = `${config.title} | ${config.tagline}`;
			expect(homeTitle.length).toBeLessThanOrEqual(60);
		});

		it("enables jekyll-seo-tag and jekyll-sitemap", () => {
			expect(config.plugins).toEqual(
				expect.arrayContaining(["jekyll-seo-tag", "jekyll-sitemap"]),
			);
		});

		it("excludes source and internal documentation from the site", () => {
			for (const dir of ["apps", "packages", "docs", ".github", ".claude"]) {
				expect(exclude).toContain(dir);
			}
			expect(exclude).toContain("node_modules");
		});

		it("does not set a theme (keeps the default one)", () => {
			expect(config).not.toHaveProperty("theme");
			expect(config).not.toHaveProperty("remote_theme");
		});

		it("keeps the site description within a search snippet", () => {
			const description = String(config.description);
			expect(description.length).toBeGreaterThanOrEqual(70);
			expect(description.length).toBeLessThanOrEqual(160);
		});

		it("sets the social preview image for every page and does not exclude it", () => {
			// jekyll-seo-tag reads `image` from the page only, so it comes in
			// through front matter defaults.
			const defaults = (config.defaults ?? []) as {
				scope?: { path?: string };
				values?: Record<string, unknown>;
			}[];
			const forAllPages = defaults.find(
				(entry) => entry.scope?.path === "" && entry.values?.image,
			);
			expect(forAllPages?.values?.image).toBe("/assets/og.png");
			expect(fs.existsSync(path.join(REPO_ROOT, "assets/og.png"))).toBe(true);
			expect(exclude).not.toContain("assets");
			expect(exclude).not.toContain("assets/og.png");
		});

		it("has a version equal to the package.json version", () => {
			expect(config.version).toBe(packageVersion);
		});

		it("does not exclude anything the public site serves", () => {
			const served = [
				"README.md",
				"404.md",
				"_layouts",
				"_includes",
				"assets",
				"integrations.md",
				"faq.md",
				"llms.txt",
				"robots.txt",
				"install.sh",
				"CNAME",
			];
			for (const file of served) {
				expect(exclude).not.toContain(file);
			}
		});

		it("excludes only paths that exist or are common tooling names", () => {
			// Guards against typos in the exclude list: every entry that is not a
			// known optional name must exist at the repository root.
			const optional = new Set([
				"scripts",
				"vendor",
				"node_modules",
				"Gemfile",
				"Gemfile.lock",
			]);
			for (const entry of exclude) {
				if (optional.has(entry)) continue;
				expect(
					fs.existsSync(path.join(REPO_ROOT, entry)),
					`${entry} is excluded but does not exist`,
				).toBe(true);
			}
		});
	});

	describe("robots.txt", () => {
		const robots = read("robots.txt");

		it("declares the sitemap", () => {
			expect(robots).toMatch(
				/^Sitemap: https:\/\/dokploy-community\.devino\.ca\/sitemap\.xml\s*$/m,
			);
		});

		it("allows everything", () => {
			expect(robots).toMatch(/^User-agent: \*$/m);
			expect(robots).toMatch(/^Allow: \/$/m);
			expect(robots).not.toMatch(/^Disallow:\s*\/\s*$/m);
		});

		it("has no front matter", () => {
			expect(robots.startsWith("---")).toBe(false);
		});
	});

	describe("llms.txt", () => {
		const llms = read("llms.txt");
		const lines = llms.split(/\r?\n/);
		const links = [...llms.matchAll(/\]\(([^)\s]+)\)/g)].map(
			(match) => match[1] as string,
		);

		it("starts with an H1 followed by a blockquote summary", () => {
			expect(llms.startsWith("# ")).toBe(true);
			const firstContent = lines.slice(1).find((line) => line.trim() !== "");
			expect(firstContent?.startsWith("> ")).toBe(true);
		});

		it("has link sections", () => {
			const sections = lines.filter((line) => line.startsWith("## "));
			expect(sections.length).toBeGreaterThanOrEqual(3);
			expect(links.length).toBeGreaterThanOrEqual(8);
		});

		it("uses only absolute https links", () => {
			for (const link of links) {
				expect(link, link).toMatch(/^https:\/\//);
			}
		});

		it("links the integrations page, the FAQ, the repository, releases and issues", () => {
			expect(links).toEqual(
				expect.arrayContaining([
					`${SITE}/integrations/`,
					`${SITE}/faq/`,
					"https://github.com/DevinoSolutions/dokploy-community",
					"https://github.com/DevinoSolutions/dokploy-community/releases",
					"https://github.com/DevinoSolutions/dokploy-community/issues",
				]),
			);
		});

		it("carries the install command and image name from the README", () => {
			const readme = read("README.md");
			const install =
				"curl -sSL https://dokploy-community.devino.ca/install.sh | sh";
			expect(readme).toContain(install);
			expect(llms).toContain(install);
			expect(readme).toContain("ghcr.io/devinosolutions/dokploy-community");
			expect(llms).toContain("ghcr.io/devinosolutions/dokploy-community");
		});
	});

	describe("faq.md", () => {
		const { frontMatter, body } = parseMarkdown("faq.md");
		const faqPage = (() => {
			const blocks = [...body.matchAll(JSON_LD_RE)];
			expect(blocks.length).toBe(1);
			return JSON.parse(
				(blocks[0] as RegExpMatchArray)[1] as string,
			) as FaqPage;
		})();

		it("has title, description and the /faq/ permalink", () => {
			expect(String(frontMatter.title).length).toBeGreaterThan(10);
			expect(String(frontMatter.description).length).toBeGreaterThan(50);
			expect(frontMatter.permalink).toBe("/faq/");
		});

		it("embeds a parseable FAQPage with 8 to 16 questions", () => {
			expect(faqPage["@context"]).toBe("https://schema.org");
			expect(faqPage["@type"]).toBe("FAQPage");
			expect(faqPage.mainEntity.length).toBeGreaterThanOrEqual(8);
			expect(faqPage.mainEntity.length).toBeLessThanOrEqual(16);
		});

		it("keeps the description short enough for a search snippet and names MCP and webhooks", () => {
			const description = String(frontMatter.description);
			expect(description.length).toBeLessThanOrEqual(160);
			expect(description).toMatch(/MCP/);
			expect(description).toMatch(/webhook/i);
		});

		it("shows every Question name verbatim as a heading", () => {
			const headings = body
				.split("\n")
				.filter((line) => line.startsWith("## "))
				.map((line) => line.slice(3).trim());
			for (const question of faqPage.mainEntity) {
				expect(question["@type"]).toBe("Question");
				expect(headings).toContain(question.name);
			}
		});

		it("shows every Answer text verbatim as a paragraph of the page", () => {
			const visible = body.replace(JSON_LD_RE, "");
			const paragraphs = visible.split(/\n{2,}/).map((p) => p.trim());
			for (const question of faqPage.mainEntity) {
				expect(question.acceptedAnswer["@type"]).toBe("Answer");
				expect(paragraphs, question.name).toContain(
					question.acceptedAnswer.text,
				);
			}
		});

		it("keeps answers free of text Jekyll's Markdown would rewrite", () => {
			// kramdown turns quotes, double hyphens and ... into typographic
			// characters, which would make the visible text differ from the JSON-LD.
			for (const question of faqPage.mainEntity) {
				const { text } = question.acceptedAnswer;
				expect(text, question.name).not.toMatch(/['"`]|--|\.\.\.|[*<>&{}]/);
			}
		});

		it("covers the questions people search for", () => {
			const names = faqPage.mainEntity.map((q) => q.name).join("\n");
			for (const topic of [
				/What is Dokploy Community Edition/,
				/affiliated with Dokploy/,
				/install/,
				/migrate from upstream Dokploy/,
				/multi-arch/,
				/uptime monitoring/,
				/Offline/,
				/log viewer/,
				/sync/,
				/telemetry/,
				/webhook/,
				/MCP/,
				/Claude Code/,
				/DoDomain/,
				/move a Dokploy service to another server/,
			]) {
				expect(names).toMatch(topic);
			}
		});

		it("gives the MCP answer the exact command from the README", () => {
			const command =
				"claude mcp add --transport http --scope user dokploy https://<host>/api/mcp";
			expect(read("README.md")).toContain(command);
			expect(body).toContain(command);
		});

		it("states the 25 MB webhook limit that the deploy routes really enforce", () => {
			const answer = faqPage.mainEntity.find((q) => /webhook/.test(q.name))
				?.acceptedAnswer.text;
			expect(answer).toMatch(/1 MB/);
			expect(answer).toMatch(/25 MB/);
			expect(answer).toMatch(/413/);
			for (const route of [
				"apps/dokploy/pages/api/deploy/[refreshToken].ts",
				"apps/dokploy/pages/api/deploy/compose/[refreshToken].ts",
				"apps/dokploy/pages/api/deploy/github.ts",
			]) {
				expect(read(route), route).toContain('sizeLimit: "25mb"');
			}
		});

		it("answers how to move a service with the scan, copy-based cutover and restart-on-failure facts from the README", () => {
			const answer = faqPage.mainEntity.find((q) =>
				/move a Dokploy service/.test(q.name),
			)?.acceptedAnswer.text;
			expect(answer).toMatch(/multi-server/);
			expect(answer).toMatch(/Application/);
			expect(answer).toMatch(/Compose/);
			expect(answer).toMatch(/database/);
			expect(answer).toMatch(/scan/);
			expect(answer).toMatch(/copy-based cutover/);
			expect(answer).toMatch(/restarted/);
			expect(body).toContain(`](${REPO_URL}/pull/148)`);
			expect(read("README.md")).toContain(
				"**Move a service to another server**",
			);
		});

		it("has no Liquid tags that Jekyll would evaluate", () => {
			expect(body).not.toMatch(/\{\{|\{%/);
		});
	});

	describe("integrations.md", () => {
		const { frontMatter, body } = parseMarkdown("integrations.md");

		it("has title, description and the /integrations/ permalink", () => {
			expect(String(frontMatter.title).length).toBeGreaterThan(10);
			expect(String(frontMatter.description).length).toBeGreaterThan(50);
			expect(frontMatter.permalink).toBe("/integrations/");
		});

		it("covers all five integrations", () => {
			for (const name of [
				"Uptimely",
				"Snapvisor",
				"DoDomain",
				"Sendly",
				"Notifly",
			]) {
				expect(body).toContain(name);
			}
		});

		it("states the Uptimely limits", () => {
			expect(body).toContain("Website monitor is created per HTTPS domain");
			expect(body).toContain("AI write operations");
			expect(body).toContain("cannot be deleted from Dokploy");
			expect(body).toContain("404");
			expect(body).toContain("**Offline**");
		});

		it("has no Liquid tags that Jekyll would evaluate", () => {
			expect(body).not.toMatch(/\{\{|\{%/);
		});

		it("is reachable by the in-page anchors the FAQ and llms.txt use", () => {
			const slug = (heading: string) =>
				heading
					.toLowerCase()
					.replace(/[^a-z0-9 -]/g, "")
					.replace(/ /g, "-");
			const anchors = body
				.split("\n")
				.filter((line) => line.startsWith("## "))
				.map((line) => slug(line.slice(3)));
			const referenced = [
				...read("llms.txt").matchAll(/integrations\/#([a-z0-9-]+)/g),
				...read("faq.md").matchAll(/integrations\/#([a-z0-9-]+)/g),
			].map((match) => match[1] as string);
			expect(referenced.length).toBeGreaterThan(0);
			for (const anchor of referenced) {
				expect(anchors).toContain(anchor);
			}
		});
	});

	describe("README.md", () => {
		const readme = read("README.md");

		it("links the site pages with absolute https URLs", () => {
			expect(readme).toContain(`](${SITE}/integrations/)`);
			expect(readme).toContain(`](${SITE}/faq/)`);
		});

		it("keeps the title as its first line (it is the site index)", () => {
			expect(readme.startsWith("# Dokploy Community Edition")).toBe(true);
		});

		it("shows the env reference syntax without feeding it to Liquid", () => {
			expect(readme).toContain(
				"<code>${&#123;service.&lt;name&gt;.fqdn}}</code>",
			);
		});
	});

	describe("Liquid", () => {
		// GitHub Pages runs every page through Liquid, which silently drops
		// `{{ ... }}` and `{% ... %}`. Escape them as `&#123;` in raw HTML.
		it.each(["README.md", "faq.md", "integrations.md"])(
			"%s has no Liquid delimiters",
			(file) => {
				const text = read(file);
				expect(text).not.toContain("{{");
				expect(text).not.toContain("{%");
			},
		);
	});

	describe("release version references", () => {
		// llms.txt and faq.md went stale after a release once (they still said
		// v0.30.7 while the package was v0.30.8). Every install command, tag
		// example and "based on" statement must follow the package version and
		// the README. Historical mentions ("Since v0.30.7-community.9 ...",
		// README's "New in ..." sections) are exempt.
		const readme = read("README.md");
		const baseVersion = readme.match(
			/Based on \*\*Dokploy (v\d+\.\d+\.\d+)\*\*/,
		)?.[1] as string;

		/**
		 * Tags that are examples or commands, not history: "since vX" mentions
		 * and links to a specific release's notes keep their version.
		 */
		const currentTags = (text: string) =>
			[...text.matchAll(COMMUNITY_TAG_RE)]
				.filter((match) => {
					const before = text.slice(Math.max(0, match.index - 14), match.index);
					return !/since $/i.test(before) && !before.endsWith("/releases/tag/");
				})
				.map((match) => match[0]);

		it("has a release version in package.json and a base version in the README", () => {
			expect(packageVersion).toMatch(/^v\d+\.\d+\.\d+-community\.\d+$/);
			expect(baseVersion).toMatch(/^v\d+\.\d+\.\d+$/);
			expect(packageVersion.startsWith(`${baseVersion}-community.`)).toBe(true);
			expect(readme).toContain(`Fork version **${packageVersion}**`);
		});

		it("README install and switch commands use the package version", () => {
			const commandLines = readme
				.split(/\r?\n/)
				.filter(
					(line) =>
						line.includes("DOKPLOY_VERSION=") ||
						line.includes("dokploy-community:v"),
				);
			// the switch command, DOKPLOY_VERSION and the versioned image tag
			expect(commandLines.length).toBeGreaterThanOrEqual(3);
			for (const line of commandLines) {
				const tags = line.match(COMMUNITY_TAG_RE) ?? [];
				expect(tags.length, line).toBeGreaterThan(0);
				for (const tag of tags) expect(tag, line).toBe(packageVersion);
			}
		});

		it.each(["llms.txt", "faq.md"])(
			"%s commands and tag examples use the package version",
			(file) => {
				const tags = currentTags(read(file));
				expect(tags.length).toBeGreaterThan(0);
				for (const tag of tags) expect(tag, file).toBe(packageVersion);
			},
		);

		it.each(["llms.txt", "faq.md"])(
			"%s says it is based on the README's upstream version",
			(file) => {
				const text = read(file);
				const stated = [
					...text.matchAll(/upstream Dokploy (v\d+\.\d+\.\d+)/gi),
				];
				expect(stated.length, file).toBeGreaterThan(0);
				for (const match of stated) expect(match[1], file).toBe(baseVersion);
			},
		);

		it("the go-back-to-official commands use the README's upstream version", () => {
			const official = /dokploy\/dokploy:(v\d+\.\d+\.\d+)/g;
			for (const text of [readme, read("faq.md")]) {
				const versions = [...text.matchAll(official)].map((m) => m[1]);
				expect(versions.length).toBeGreaterThan(0);
				for (const version of versions) expect(version).toBe(baseVersion);
			}
			expect(read("faq.md")).toContain(`for example ${baseVersion}.`);
		});
	});

	describe("layout and navigation", () => {
		const layout = read("_layouts/default.html");
		const nav = layout.match(/<nav\b[\s\S]*?<\/nav>/)?.[0] ?? "";
		const footer = layout.match(/<footer\b[\s\S]*?<\/footer>/)?.[0] ?? "";

		it("overrides the default layout and keeps the SEO tag", () => {
			expect(layout).toContain("{% seo %}");
			expect(layout).toContain("{{ content }}");
			expect(layout).toContain("anchors.add();");
			expect(layout).toMatch(/^<!DOCTYPE html>/);
		});

		it("includes head-custom.html and the file exists", () => {
			expect(layout).toContain("{% include head-custom.html %}");
			expect(
				fs.existsSync(path.join(REPO_ROOT, "_includes/head-custom.html")),
			).toBe(true);
		});

		it("contains no heading element, so the page content owns the only H1", () => {
			expect(layout).not.toMatch(/<h1/i);
		});

		it("has a site navigation that is not a heading and links the FAQ and integrations pages", () => {
			expect(nav).toContain('aria-label="Site"');
			expect(nav).toMatch(/href="\{\{ "\/faq\/" \| relative_url \}\}"/);
			expect(nav).toMatch(
				/href="\{\{ "\/integrations\/" \| relative_url \}\}"/,
			);
			expect(nav).toContain("#fresh-install");
			expect(nav).toContain(REPO_URL);
			expect(nav).toContain(`${REPO_URL}/releases`);
		});

		it("links the install section the README really has", () => {
			expect(read("README.md")).toMatch(/^## Fresh install\s*$/m);
		});

		it("has a footer with the repository, FAQ, integrations, llms.txt and license links", () => {
			expect(footer).toContain(REPO_URL);
			expect(footer).toContain("/faq/");
			expect(footer).toContain("/integrations/");
			expect(footer).toContain("/llms.txt");
			expect(footer).toContain(LICENSE_URL);
		});

		it("adds the SoftwareApplication JSON-LD on the home page only", () => {
			const block = layout.match(
				/\{% if page\.url == "\/"[\s\S]*?<script type="application\/ld\+json">([\s\S]*?)<\/script>[\s\S]*?\{% endif %\}/,
			);
			expect(block).not.toBeNull();
			const ld = block?.[1] as string;
			expect(ld).toContain('"@type": "SoftwareApplication"');
			expect(ld).toContain('"name": "Dokploy Community Edition"');
			expect(ld).toContain('"applicationCategory": "DeveloperApplication"');
			expect(ld).toContain('"operatingSystem": "Linux"');
			expect(ld).toContain("{{ site.description | jsonify }}");
			expect(ld).toContain("{{ site.url | jsonify }}");
			expect(ld).toContain("{{ site.version | jsonify }}");
			expect(ld).toContain('"price": "0"');
			expect(ld).toContain('"priceCurrency": "USD"');
			expect(ld).toContain(
				'"license": "https://www.apache.org/licenses/LICENSE-2.0"',
			);
			expect(ld).toContain(`"sameAs": ["${REPO_URL}"]`);
			expect(ld).toContain('"isBasedOn": "https://github.com/Dokploy/dokploy"');
		});

		it("keeps code blocks scrollable on narrow screens", () => {
			expect(read("_includes/head-custom.html")).toMatch(
				/pre\s*\{\s*overflow-x:\s*auto/,
			);
		});
	});

	describe("pages", () => {
		it.each(MARKDOWN_PAGES)("%s has exactly one H1", (file) => {
			const text = withoutCodeFences(read(file));
			const markdownH1 = text.split("\n").filter((line) => /^# \S/.test(line));
			const htmlH1 = text.match(/<h1[\s>]/gi) ?? [];
			expect(markdownH1.length + htmlH1.length).toBe(1);
		});

		it("has a 404 page at /404.html that stays out of the sitemap", () => {
			expect(fs.existsSync(path.join(REPO_ROOT, "404.md"))).toBe(true);
			const { frontMatter, body } = parseMarkdown("404.md");
			expect(frontMatter.permalink).toBe("/404.html");
			expect(frontMatter.sitemap).toBe(false);
			expect(String(frontMatter.title).length).toBeGreaterThan(5);
			expect(body).toMatch(/^# Page not found$/m);
			for (const link of [
				`${SITE}/`,
				`${SITE}/integrations/`,
				`${SITE}/faq/`,
				`${SITE}/#fresh-install`,
				REPO_URL,
			]) {
				expect(body, link).toContain(`](${link})`);
			}
		});

		it("ships the social preview image as a 1200x630 PNG under 200 KB", () => {
			const { width, height, bytes } = pngSize("assets/og.png");
			expect(width).toBe(1200);
			expect(height).toBe(630);
			expect(bytes).toBeLessThan(200 * 1024);
		});

		describe("descriptions and titles", () => {
			const config = parseYaml(read("_config.yml")) as Record<string, unknown>;
			const pages = ["faq.md", "integrations.md", "404.md"];

			it.each(pages)("%s has a 70 to 160 character description", (file) => {
				const description = String(frontMatterOf(file).description);
				expect(description.length).toBeGreaterThanOrEqual(70);
				expect(description.length).toBeLessThanOrEqual(160);
			});

			it.each(pages)(
				"%s renders a <title> of at most 60 characters",
				(file) => {
					const title = `${frontMatterOf(file).title} | ${config.title}`;
					expect(title.length).toBeLessThanOrEqual(60);
				},
			);

			it("the home page <title> and description fit too", () => {
				const title = `${config.title} | ${config.tagline}`;
				expect(title.length).toBeLessThanOrEqual(60);
				const description = String(config.description);
				expect(description.length).toBeGreaterThanOrEqual(70);
				expect(description.length).toBeLessThanOrEqual(160);
			});

			it("keeps the five integration names in the integrations description", () => {
				const description = String(
					frontMatterOf("integrations.md").description,
				);
				for (const name of [
					"Uptimely",
					"Snapvisor",
					"DoDomain",
					"Sendly",
					"Notifly",
				]) {
					expect(description).toContain(name);
				}
			});
		});

		describe("links", () => {
			// Pages the site serves (relative links to them are fine); any other
			// relative link must point at a repository file that is on the site.
			const sitePages = new Set([
				"/",
				"/faq/",
				"/integrations/",
				"/llms.txt",
				"/robots.txt",
				"/install.sh",
			]);
			const exclude = ((
				parseYaml(read("_config.yml")) as Record<string, unknown>
			).exclude ?? []) as string[];

			const relativeLinks = (file: string) => {
				const text = withoutCodeFences(read(file));
				const targets = [
					...text.matchAll(/\]\(([^)\s]+)/g),
					...text.matchAll(/href="([^"]+)"/g),
				].map((match) => match[1] as string);
				return targets.filter((target) => !/^(https?:|mailto:|#)/.test(target));
			};

			it.each(["README.md", "faq.md", "integrations.md", "404.md"])(
				"%s has no relative link that would 404 on the site",
				(file) => {
					for (const link of relativeLinks(file)) {
						const target = (link.split("#")[0] as string).split(
							"?",
						)[0] as string;
						if (sitePages.has(target)) continue;
						const relative = target.replace(/^\.?\//, "");
						const topLevel = relative.split("/")[0] as string;
						expect(
							fs.existsSync(path.join(REPO_ROOT, relative)) &&
								!exclude.includes(topLevel) &&
								!exclude.includes(relative),
							`${file}: ${link} is not a page or file the site serves`,
						).toBe(true);
					}
				},
			);

			it("README links the license through its real file name", () => {
				expect(read("README.md")).toContain(`[Apache 2.0](${LICENSE_URL})`);
				expect(fs.existsSync(path.join(REPO_ROOT, "LICENSE.MD"))).toBe(true);
			});

			it("README general release-notes links point at the latest release, not an old tag", () => {
				const links = [
					...read("README.md").matchAll(
						/\[([^\]]*(?:full|all) release notes[^\]]*)\]\(([^)\s]+)\)/gi,
					),
				];
				expect(links.length).toBeGreaterThan(0);
				for (const link of links) {
					expect(link[2], link[1]).toMatch(
						new RegExp(`^${REPO_URL}/releases(/latest)?$`),
					);
				}
			});
		});
	});

	describe("IndexNow key file", () => {
		it("is a single root file named after a 32-character hex key", () => {
			expect(indexNowKeyFiles()).toHaveLength(1);
		});

		it("contains exactly its own basename and nothing else", () => {
			const [file] = indexNowKeyFiles() as [string];
			const key = path.basename(file, ".txt");
			expect(read(file)).toBe(key);
		});
	});
});

describe.skipIf(!process.env.SITE_LIVE_TESTS)(
	"pages site: live (https://dokploy-community.devino.ca)",
	{ timeout: 60_000 },
	() => {
		const get = async (pathname: string) => {
			const response = await fetch(`${SITE}${pathname}`, {
				headers: { "user-agent": "dokploy-community-site-test" },
			});
			return {
				status: response.status,
				text: await response.text(),
				robotsHeader: response.headers.get("x-robots-tag") ?? "",
				contentType: response.headers.get("content-type") ?? "",
			};
		};

		const PAGES = ["/", "/faq/", "/integrations/"];

		/** The same-site hrefs of a page, resolved against the page URL. */
		const sameSiteLinks = (html: string, pathname: string) =>
			[...html.matchAll(/<a\s[^>]*href="([^"]+)"/gi)]
				.map((match) => new URL(match[1] as string, `${SITE}${pathname}`))
				.filter((url) => url.origin === SITE);

		const idsOf = (html: string) =>
			new Set(
				[...html.matchAll(/\s(?:id|name)="([^"]+)"/g)].map(
					(match) => match[1] as string,
				),
			);

		it("/ answers 200 with an https canonical", async () => {
			const { status, text } = await get("/");
			expect(status).toBe(200);
			expect(text).toMatch(
				/<link rel="canonical" href="https:\/\/dokploy-community\.devino\.ca\/"\s*\/?>/,
			);
		});

		it("/sitemap.xml answers 200 and lists the integrations and FAQ pages", async () => {
			const { status, text } = await get("/sitemap.xml");
			expect(status).toBe(200);
			expect(text).toContain(`<loc>${SITE}/integrations/</loc>`);
			expect(text).toContain(`<loc>${SITE}/faq/</loc>`);
		});

		it("/llms.txt answers 200 and starts with an H1", async () => {
			const { status, text } = await get("/llms.txt");
			expect(status).toBe(200);
			expect(text.startsWith("# ")).toBe(true);
		});

		it("/faq/ answers 200 with a parseable FAQPage JSON-LD", async () => {
			const { status, text } = await get("/faq/");
			expect(status).toBe(200);
			const faqPage = extractFaqPage(text);
			expect(faqPage).toBeDefined();
			expect(faqPage?.mainEntity.length).toBeGreaterThanOrEqual(8);
		});

		it("/faq/ is not blocked from indexing by an x-robots-tag header", async () => {
			const { status, robotsHeader } = await get("/faq/");
			expect(status).toBe(200);
			expect(robotsHeader).not.toMatch(/noindex/i);
		});

		it("/faq/ HTML has no noindex robots meta tag", async () => {
			const { text } = await get("/faq/");
			expect(text).not.toMatch(
				/<meta[^>]+name="robots"[^>]+content="[^"]*noindex/i,
			);
		});

		// The next two assertions compare the live site with this checkout, so
		// they pass only after the change is merged to canary and Pages has
		// rebuilt. Before that they may fail, which is expected.
		it("/faq/ JSON-LD has the MCP question (post-deploy)", async () => {
			const { text } = await get("/faq/");
			const names = (extractFaqPage(text)?.mainEntity ?? []).map(
				(question) => question.name,
			);
			expect(names).toContain(
				"How do I connect Claude Code to Dokploy with MCP?",
			);
		});

		it("/llms.txt names the package.json version (post-deploy)", async () => {
			const { status, text } = await get("/llms.txt");
			expect(status).toBe(200);
			expect(text).toContain(packageVersion);
		});

		it("/integrations/ answers 200", async () => {
			const { status, text } = await get("/integrations/");
			expect(status).toBe(200);
			expect(text).toContain("Uptimely");
		});

		it("/robots.txt answers 200 and declares the sitemap", async () => {
			const { status, text } = await get("/robots.txt");
			expect(status).toBe(200);
			expect(text).toMatch(
				/^Sitemap: https:\/\/dokploy-community\.devino\.ca\/sitemap\.xml\s*$/m,
			);
		});

		it.each(PAGES)("%s has exactly one <h1 (post-deploy)", async (pathname) => {
			const { text } = await get(pathname);
			expect(text.match(/<h1[\s>]/gi) ?? []).toHaveLength(1);
		});

		it("every same-site link on /, /faq/ and /integrations/ answers 200 and every #fragment exists (post-deploy)", async () => {
			const pages = new Map<string, string>();
			const page = async (pathname: string) => {
				if (!pages.has(pathname))
					pages.set(pathname, (await get(pathname)).text);
				return pages.get(pathname) as string;
			};
			const failures: string[] = [];
			const checked = new Set<string>();
			for (const pathname of PAGES) {
				const html = await page(pathname);
				for (const url of sameSiteLinks(html, pathname)) {
					const key = url.pathname + url.search;
					const label = `${pathname} -> ${url.pathname}${url.hash}`;
					if (!checked.has(key)) {
						checked.add(key);
						const { status } = await get(key);
						if (status !== 200) failures.push(`${label} answered ${status}`);
					}
					if (url.hash.length > 1 && url.pathname.endsWith("/")) {
						const ids = idsOf(await page(url.pathname));
						if (!ids.has(decodeURIComponent(url.hash.slice(1)))) {
							failures.push(`${label} has no matching id`);
						}
					}
				}
			}
			expect(failures).toEqual([]);
		});

		it.each(PAGES)(
			"%s has an og:image that answers 200 as image/png (post-deploy)",
			async (pathname) => {
				const { text } = await get(pathname);
				const image = text.match(
					/<meta property="og:image" content="([^"]+)"/,
				)?.[1];
				expect(image).toBeDefined();
				expect(text).toMatch(
					/<meta name="twitter:card" content="summary_large_image"/,
				);
				const response = await fetch(image as string);
				expect(response.status).toBe(200);
				expect(response.headers.get("content-type")).toMatch(/^image\/png/);
			},
		);

		it("a missing page answers 404 with the custom Page not found body (post-deploy)", async () => {
			const { status, text } = await get("/this-page-does-not-exist/");
			expect(status).toBe(404);
			expect(text).toContain("Page not found");
			// GitHub's own default 404 page also says "Page not found" in its title
			expect(text).toContain('aria-label="Site"');
			expect(text).toContain("Dokploy Community Edition");
		});

		it("/sitemap.xml lists exactly the home, FAQ and integrations pages", async () => {
			const { text } = await get("/sitemap.xml");
			const locations = [...text.matchAll(/<loc>([^<]+)<\/loc>/g)]
				.map((match) => match[1])
				.sort();
			expect(locations).toEqual([
				`${SITE}/`,
				`${SITE}/faq/`,
				`${SITE}/integrations/`,
			]);
		});

		it("/ has SoftwareApplication JSON-LD with the package version (post-deploy)", async () => {
			const { text } = await get("/");
			const software = [...text.matchAll(JSON_LD_RE)]
				.map(
					(match) => JSON.parse(match[1] as string) as Record<string, unknown>,
				)
				.find((data) => data["@type"] === "SoftwareApplication");
			expect(software).toBeDefined();
			expect(software?.applicationCategory).toBe("DeveloperApplication");
			expect(software?.softwareVersion).toBe(packageVersion);
			expect(software?.isBasedOn).toBe("https://github.com/Dokploy/dokploy");
		});

		it("/faq/ JSON-LD has the move-a-service question (post-deploy)", async () => {
			const { text } = await get("/faq/");
			const names = (extractFaqPage(text)?.mainEntity ?? []).map(
				(question) => question.name,
			);
			expect(names).toContain(
				"How do I move a Dokploy service to another server?",
			);
		});

		it("serves the IndexNow key file with its own key", async () => {
			const [file] = indexNowKeyFiles() as [string];
			const { status, text } = await get(`/${file}`);
			expect(status).toBe(200);
			expect(text.trim()).toBe(path.basename(file, ".txt"));
		});
	},
);
