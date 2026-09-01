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
			// Remove any </style> tags to prevent XSS breakout
			customCss = config.customCss
				? config.customCss.replace(/<\/\s*style[^>]*>/gi, "")
				: null;
			faviconHref = config.faviconUrl || null;
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
