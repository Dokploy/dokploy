import { getPublicWhitelabelingConfig } from "@dokploy/server";
import NextDocument, {
	type DocumentContext,
	type DocumentInitialProps,
	Head,
	Html,
	Main,
	NextScript,
} from "next/document";

interface WhitelabelingDocumentProps {
	metaTitle: string | null;
	faviconHref: string | null;
	customCss: string | null;
}

// Cache the resolved favicon (inlined as a data URI) so we don't re-fetch the
// remote image on every server render. Keyed by the configured favicon URL.
const FAVICON_CACHE_TTL = 60 * 60 * 1000; // 1 hour

const SETTINGS_CACHE_TTL = 60 * 1000; // 1 minute

declare global {
	var __SETTINGS_CACHE: {
		data: {
			metaTitle: string | null;
			faviconHref: string | null;
			customCss: string | null;
		};
		expiresAt: number;
	} | null;
	var __FAVICON_CACHE: Map<string, { href: string; expiresAt: number }>;
}

const faviconCache =
	globalThis.__FAVICON_CACHE ||
	new Map<string, { href: string; expiresAt: number }>();
globalThis.__FAVICON_CACHE = faviconCache;

/**
 * Resolve the favicon to an inline data URI so it is present in the initial
 * HTML and renders without a network round-trip (no flash of the default
 * favicon). Falls back to the raw URL if the image can't be fetched.
 */
async function resolveFaviconHref(
	faviconUrl: string | null | undefined,
): Promise<string | null> {
	if (!faviconUrl) return null;

	const cached = faviconCache.get(faviconUrl);
	if (cached && cached.expiresAt > Date.now()) {
		return cached.href;
	}

	// Default to the raw URL so the custom favicon still loads if inlining fails.
	let href = faviconUrl;
	try {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 3000);
		const response = await fetch(faviconUrl, { signal: controller.signal });
		clearTimeout(timeout);

		if (response.ok) {
			const buffer = Buffer.from(await response.arrayBuffer());
			// Avoid embedding very large images directly in the HTML.
			if (buffer.byteLength <= 512 * 1024) {
				const contentType = response.headers.get("content-type") || "image/png";
				href = `data:${contentType};base64,${buffer.toString("base64")}`;
			}
		}
	} catch {
		// Keep the raw URL fallback.
	}

	faviconCache.set(faviconUrl, {
		href,
		expiresAt: Date.now() + FAVICON_CACHE_TTL,
	});
	return href;
}

export default function Document({
	metaTitle,
	faviconHref,
	customCss,
}: WhitelabelingDocumentProps) {
	const title = metaTitle || "Dokploy";
	return (
		<Html lang="en" className="font-sans">
			<Head>
				{/* Rendered on the server so the correct branding is present on first
				    paint (and for social scrapers), avoiding a flash of / fallback to
				    the default Dokploy branding. */}
				<title>{title}</title>
				<link rel="icon" href={faviconHref || "/icon.svg"} />
				{customCss && (
					<style
						id="whitelabeling-styles"
						dangerouslySetInnerHTML={{ __html: customCss }}
					/>
				)}
			</Head>
			<body className="flex h-full w-full flex-col font-sans">
				<Main />
				<NextScript />
			</body>
		</Html>
	);
}

Document.getInitialProps = async (
	ctx: DocumentContext,
): Promise<DocumentInitialProps & WhitelabelingDocumentProps> => {
	const initialProps = await NextDocument.getInitialProps(ctx);

	let metaTitle: string | null = null;
	let faviconHref: string | null = null;
	let customCss: string | null = null;

	if (
		globalThis.__SETTINGS_CACHE &&
		globalThis.__SETTINGS_CACHE.expiresAt > Date.now() &&
		globalThis.__SETTINGS_CACHE.data
	) {
		return {
			...initialProps,
			...globalThis.__SETTINGS_CACHE.data,
		};
	}

	try {
		const config = await getPublicWhitelabelingConfig();
		if (config) {
			metaTitle = config.metaTitle;
			customCss = config.customCss;
			faviconHref = await resolveFaviconHref(config.faviconUrl);
		}
	} catch {
		// Fall back to defaults if settings can't be read (e.g. DB not ready)
	}

	globalThis.__SETTINGS_CACHE = {
		data: {
			metaTitle,
			faviconHref,
			customCss,
		},
		expiresAt: Date.now() + SETTINGS_CACHE_TTL,
	};

	return {
		...initialProps,
		metaTitle,
		faviconHref,
		customCss,
	};
};
