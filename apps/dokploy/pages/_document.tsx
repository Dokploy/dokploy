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
	appName: string | null;
	appDescription: string | null;
	ogImageUrl: string | null;
	faviconHref: string | null;
	customCss: string | null;
	baseUrl: string;
}

export default function Document({
	appName,
	appDescription,
	ogImageUrl,
	faviconHref,
	customCss,
	baseUrl,
}: WhitelabelingDocumentProps) {
	const title = appName || "Dokploy";
	const description =
		appDescription || "The Open Source alternative to Netlify, Vercel, Heroku.";

	let ogImage = ogImageUrl || "/og.png";
	if (ogImage.startsWith("/")) {
		ogImage = `${baseUrl}${ogImage}`;
	}

	return (
		<Html lang="en" className="font-sans">
			<Head>
				{/* Rendered on the server so the correct branding is present on first
				    paint (and for social scrapers), avoiding a flash of / fallback to
				    the default Dokploy branding. */}
				<title>{title}</title>
				<meta property="og:title" content={title} />
				<meta property="og:description" content={description} />
				<meta property="og:image" content={ogImage} />
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
			appName: string | null;
			appDescription: string | null;
			ogImageUrl: string | null;
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

	let appName: string | null = null;
	let appDescription: string | null = null;
	let ogImageUrl: string | null = null;
	let faviconHref: string | null = null;
	let customCss: string | null = null;

	const host = ctx.req?.headers?.host || "localhost:3000";
	const protocol = ctx.req?.headers?.["x-forwarded-proto"] || "http";
	const baseUrl = `${protocol}://${host}`;

	if (
		globalThis.__SETTINGS_CACHE &&
		globalThis.__SETTINGS_CACHE.expiresAt > Date.now() &&
		globalThis.__SETTINGS_CACHE.data
	) {
		return {
			...initialProps,
			...globalThis.__SETTINGS_CACHE.data,
			baseUrl,
		};
	}

	try {
		const config = await getPublicWhitelabelingConfig();
		if (config) {
			appName = config.appName;
			appDescription = config.appDescription;
			ogImageUrl = config.ogImageUrl;
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
			appName,
			appDescription,
			ogImageUrl,
			faviconHref,
			customCss,
		},
		expiresAt: Date.now() + SETTINGS_CACHE_TTL,
	};

	return {
		...initialProps,
		appName,
		appDescription,
		ogImageUrl,
		faviconHref,
		customCss,
		baseUrl,
	};
};
