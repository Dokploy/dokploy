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

		it("does not exclude anything the public site serves", () => {
			const served = [
				"README.md",
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

		it("embeds a parseable FAQPage with 8 to 12 questions", () => {
			expect(faqPage["@context"]).toBe("https://schema.org");
			expect(faqPage["@type"]).toBe("FAQPage");
			expect(faqPage.mainEntity.length).toBeGreaterThanOrEqual(8);
			expect(faqPage.mainEntity.length).toBeLessThanOrEqual(12);
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
			]) {
				expect(names).toMatch(topic);
			}
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
			return { status: response.status, text: await response.text() };
		};

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

		it("serves the IndexNow key file with its own key", async () => {
			const [file] = indexNowKeyFiles() as [string];
			const { status, text } = await get(`/${file}`);
			expect(status).toBe(200);
			expect(text.trim()).toBe(path.basename(file, ".txt"));
		});
	},
);
