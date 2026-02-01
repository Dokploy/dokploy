import fs from "node:fs";
import path from "node:path";
import { paths } from "@dokploy/server/constants";
import { parse, stringify } from "yaml";
import { encodeBase64 } from "../utils/docker/utils";
import { execAsyncRemote } from "../utils/process/execAsync";

export const TRAEFIK_PAGE_STATUSES = ["401", "404", "503"] as const;
export type TraefikPageStatus = (typeof TRAEFIK_PAGE_STATUSES)[number];

export type TraefikPageAction = {
	label: string;
	href: string;
};

export type TraefikPageConfig = {
	enabled: boolean;
	mode: "builder" | "custom";
	title: string;
	subtitle: string;
	message: string;
	hint: string;
	primaryAction: TraefikPageAction;
	secondaryAction: TraefikPageAction;
	showRequestId: boolean;
	showTimestamp: boolean;
	showHost: boolean;
	showPath: boolean;
	customHtml: string;
	customCss: string;
};

export type TraefikPagesTheme = {
	brandName: string;
	logoUrl: string;
	fontFamily: string;
	fontUrl: string;
	palette: {
		background: string;
		surface: string;
		card: string;
		text: string;
		muted: string;
		accent: string;
		border: string;
	};
	gradient: {
		enabled: boolean;
		from: string;
		via: string;
		to: string;
		angle: number;
	};
	layout: {
		alignment: "center" | "left";
		maxWidth: number;
		padding: number;
		card: boolean;
		glass: boolean;
	};
	buttons: {
		radius: number;
		primaryBackground: string;
		primaryText: string;
		secondaryBackground: string;
		secondaryText: string;
		secondaryBorder: string;
	};
	effects: {
		glow: boolean;
		grid: boolean;
		noise: boolean;
	};
};

export type TraefikPagesConfig = {
	version: 1;
	enabled: boolean;
	entryPoints: string[];
	updatedAt: string;
	updatedBy?: {
		id: string;
		email?: string;
		name?: string;
	};
	theme: TraefikPagesTheme;
	pages: Record<TraefikPageStatus, TraefikPageConfig>;
};

export type TraefikPageRenderContext = {
	status: TraefikPageStatus;
	requestId?: string;
	timestamp: string;
	host?: string;
	path?: string;
	method?: string;
	protocol?: string;
};

export type TraefikPagesApplyResult = {
	needsReload: boolean;
	warnings: string[];
};

const STATUS_LABELS: Record<TraefikPageStatus, string> = {
	"401": "Unauthorized",
	"404": "Not Found",
	"503": "Service Unavailable",
};

const DEFAULT_CONFIG: TraefikPagesConfig = {
	version: 1,
	enabled: true,
	entryPoints: ["web", "websecure"],
	updatedAt: new Date().toISOString(),
	theme: {
		brandName: "Dokploy",
		logoUrl: "",
		fontFamily:
			"Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
		fontUrl:
			"https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap",
		palette: {
			background: "#0b0f1c",
			surface: "#0f172a",
			card: "#111827",
			text: "#f8fafc",
			muted: "#94a3b8",
			accent: "#22d3ee",
			border: "#334155",
		},
		gradient: {
			enabled: true,
			from: "#0f172a",
			via: "#111827",
			to: "#020617",
			angle: 145,
		},
		layout: {
			alignment: "center",
			maxWidth: 960,
			padding: 48,
			card: true,
			glass: true,
		},
		buttons: {
			radius: 12,
			primaryBackground: "#38bdf8",
			primaryText: "#0b0f1c",
			secondaryBackground: "transparent",
			secondaryText: "#e2e8f0",
			secondaryBorder: "#64748b",
		},
		effects: {
			glow: true,
			grid: true,
			noise: true,
		},
	},
	pages: {
		"401": {
			enabled: true,
			mode: "builder",
			title: "Access denied",
			subtitle: "401 Unauthorized",
			message:
				"You do not have permission to access this resource. Authenticate and try again.",
			hint: "If you believe this is a mistake, contact your administrator.",
			primaryAction: {
				label: "Sign in",
				href: "/",
			},
			secondaryAction: {
				label: "Status page",
				href: "",
			},
			showRequestId: true,
			showTimestamp: true,
			showHost: true,
			showPath: false,
			customHtml: "",
			customCss: "",
		},
		"404": {
			enabled: true,
			mode: "builder",
			title: "Page not found",
			subtitle: "404 Not Found",
			message:
				"We could not locate the page you requested. Check the URL or return to the dashboard.",
			hint: "If this endpoint should exist, verify your routing rules.",
			primaryAction: {
				label: "Go back home",
				href: "/",
			},
			secondaryAction: {
				label: "Status page",
				href: "",
			},
			showRequestId: true,
			showTimestamp: true,
			showHost: true,
			showPath: true,
			customHtml: "",
			customCss: "",
		},
		"503": {
			enabled: true,
			mode: "builder",
			title: "Service temporarily unavailable",
			subtitle: "503 Service Unavailable",
			message:
				"Our edge is up, but the upstream service is not responding. Please try again shortly.",
			hint: "We are already investigating. Check your status page for updates.",
			primaryAction: {
				label: "Retry",
				href: "/",
			},
			secondaryAction: {
				label: "Status page",
				href: "",
			},
			showRequestId: true,
			showTimestamp: true,
			showHost: true,
			showPath: true,
			customHtml: "",
			customCss: "",
		},
	},
};

const cloneConfig = () =>
	JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as TraefikPagesConfig;

const resolveTraefikPagesPaths = (serverId?: string) => {
	const { MAIN_TRAEFIK_PATH, DYNAMIC_TRAEFIK_PATH, TRAEFIK_PAGES_PATH } = paths(
		!!serverId,
	);
	return {
		pagesPath: TRAEFIK_PAGES_PATH,
		historyPath: path.join(TRAEFIK_PAGES_PATH, "history"),
		configPath: path.join(TRAEFIK_PAGES_PATH, "pages.json"),
		dynamicConfigPath: path.join(DYNAMIC_TRAEFIK_PATH, "traefik-pages.yml"),
		mainConfigPath: path.join(MAIN_TRAEFIK_PATH, "traefik.yml"),
	};
};

const ensureDirectories = async (serverId?: string) => {
	const { pagesPath, historyPath } = resolveTraefikPagesPaths(serverId);
	if (serverId) {
		await execAsyncRemote(
			serverId,
			`mkdir -p "${pagesPath}" "${historyPath}"`,
		);
		return;
	}
	fs.mkdirSync(pagesPath, { recursive: true });
	fs.mkdirSync(historyPath, { recursive: true });
};

const mergePageConfig = (
	base: TraefikPageConfig,
	override?: Partial<TraefikPageConfig>,
): TraefikPageConfig => ({
	...base,
	...override,
	primaryAction: {
		...base.primaryAction,
		...(override?.primaryAction ?? {}),
	},
	secondaryAction: {
		...base.secondaryAction,
		...(override?.secondaryAction ?? {}),
	},
});

const mergeThemeConfig = (
	base: TraefikPagesTheme,
	override?: Partial<TraefikPagesTheme>,
): TraefikPagesTheme => ({
	...base,
	...override,
	palette: {
		...base.palette,
		...(override?.palette ?? {}),
	},
	gradient: {
		...base.gradient,
		...(override?.gradient ?? {}),
	},
	layout: {
		...base.layout,
		...(override?.layout ?? {}),
	},
	buttons: {
		...base.buttons,
		...(override?.buttons ?? {}),
	},
	effects: {
		...base.effects,
		...(override?.effects ?? {}),
	},
});

const mergeTraefikPagesConfig = (
	base: TraefikPagesConfig,
	override?: Partial<TraefikPagesConfig>,
): TraefikPagesConfig => {
	const merged: TraefikPagesConfig = {
		...base,
		...override,
		entryPoints:
			override?.entryPoints && override.entryPoints.length > 0
				? override.entryPoints
				: base.entryPoints,
		theme: mergeThemeConfig(base.theme, override?.theme),
		pages: {
			"401": mergePageConfig(base.pages["401"], override?.pages?.["401"]),
			"404": mergePageConfig(base.pages["404"], override?.pages?.["404"]),
			"503": mergePageConfig(base.pages["503"], override?.pages?.["503"]),
		},
	};
	return merged;
};

const readRemoteFile = async (serverId: string, targetPath: string) => {
	const { stdout } = await execAsyncRemote(
		serverId,
		`cat "${targetPath}" 2>/dev/null || true`,
	);
	return stdout || "";
};

const writeRemoteFile = async (
	serverId: string,
	targetPath: string,
	content: string,
) => {
	const encoded = encodeBase64(content);
	await execAsyncRemote(
		serverId,
		`echo "${encoded}" | base64 -d > "${targetPath}"`,
	);
};

const removeRemoteFile = async (serverId: string, targetPath: string) => {
	await execAsyncRemote(serverId, `rm -f "${targetPath}"`);
};

const createHistorySnapshot = async (serverId?: string) => {
	const { configPath, historyPath } = resolveTraefikPagesPaths(serverId);
	const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
	const snapshotPath = path.join(historyPath, `pages-${timestamp}.json`);

	if (serverId) {
		await execAsyncRemote(
			serverId,
			`if [ -f "${configPath}" ]; then cp "${configPath}" "${snapshotPath}"; fi`,
		);
		return;
	}

	if (!fs.existsSync(configPath)) {
		return;
	}
	fs.copyFileSync(configPath, snapshotPath);

	// Keep the last 20 snapshots locally.
	const entries = fs
		.readdirSync(historyPath)
		.map((file) => ({
			file,
			mtime: fs.statSync(path.join(historyPath, file)).mtimeMs,
		}))
		.sort((a, b) => b.mtime - a.mtime);

	for (const entry of entries.slice(20)) {
		fs.rmSync(path.join(historyPath, entry.file), { force: true });
	}
};

export const getDefaultTraefikPagesConfig = () => cloneConfig();

export const readTraefikPagesConfig = async (
	serverId?: string,
): Promise<TraefikPagesConfig> => {
	const defaults = getDefaultTraefikPagesConfig();
	const { configPath } = resolveTraefikPagesPaths(serverId);

	await ensureDirectories(serverId);

	let raw = "";
	try {
		if (serverId) {
			raw = await readRemoteFile(serverId, configPath);
		} else if (fs.existsSync(configPath)) {
			raw = fs.readFileSync(configPath, "utf8");
		}
	} catch (error) {
		console.error("Error reading Traefik pages config:", error);
	}

	if (!raw) {
		await writeTraefikPagesConfig(defaults, serverId, false);
		return defaults;
	}

	try {
		const parsed = JSON.parse(raw) as Partial<TraefikPagesConfig>;
		return mergeTraefikPagesConfig(defaults, parsed);
	} catch (error) {
		console.error("Invalid Traefik pages config, restoring defaults:", error);
		await writeTraefikPagesConfig(defaults, serverId, false);
		return defaults;
	}
};

export const writeTraefikPagesConfig = async (
	config: TraefikPagesConfig,
	serverId?: string,
	createSnapshot = true,
) => {
	const { configPath } = resolveTraefikPagesPaths(serverId);
	await ensureDirectories(serverId);
	if (createSnapshot) {
		await createHistorySnapshot(serverId);
	}

	const payload = JSON.stringify(config, null, 2);
	if (serverId) {
		await writeRemoteFile(serverId, configPath, payload);
		return;
	}
	fs.writeFileSync(configPath, payload, "utf8");
};

const buildTraefikPagesDynamicConfig = (config: TraefikPagesConfig) => {
	if (!config.enabled) return null;
	const statusCodes = TRAEFIK_PAGE_STATUSES.filter(
		(status) => config.pages[status]?.enabled !== false,
	);
	if (statusCodes.length === 0) return null;

	const serviceUrl = `http://dokploy:${process.env.PORT || 3000}`;
	const fileConfig = {
		http: {
			middlewares: {
				"traefik-pages": {
					errors: {
						status: statusCodes,
						service: "dokploy-error-pages",
						query: "/api/traefik-pages/{status}",
					},
				},
			},
			services: {
				"dokploy-error-pages": {
					loadBalancer: {
						servers: [{ url: serviceUrl }],
						passHostHeader: true,
					},
				},
			},
		},
	};

	return stringify(fileConfig);
};

const updateEntryPoints = async (
	config: TraefikPagesConfig,
	serverId?: string,
): Promise<TraefikPagesApplyResult> => {
	const { mainConfigPath } = resolveTraefikPagesPaths(serverId);
	const warnings: string[] = [];

	let raw = "";
	try {
		if (serverId) {
			raw = await readRemoteFile(serverId, mainConfigPath);
		} else if (fs.existsSync(mainConfigPath)) {
			raw = fs.readFileSync(mainConfigPath, "utf8");
		}
	} catch (error) {
		console.error("Error reading Traefik main config:", error);
	}

	if (!raw) {
		return {
			needsReload: false,
			warnings: ["Main Traefik config not found."],
		};
	}

	const parsed = parse(raw) as Record<string, any>;
	if (!parsed || typeof parsed !== "object") {
		return {
			needsReload: false,
			warnings: ["Unable to parse Traefik main config."],
		};
	}

	type EntryPointHttp = {
		middlewares?: string[] | string;
		[key: string]: any;
	};
	type EntryPointConfig = {
		http?: EntryPointHttp;
		[key: string]: any;
	};

	const entryPoints = parsed.entryPoints as
		| Record<string, EntryPointConfig>
		| undefined;
	if (!entryPoints || typeof entryPoints !== "object") {
		return {
			needsReload: false,
			warnings: ["No entryPoints defined in Traefik config."],
		};
	}

	const middlewareName = "traefik-pages@file";
	const selectedEntryPoints = new Set(config.entryPoints || []);
	let changed = false;

	for (const [name, entryPoint] of Object.entries(entryPoints)) {
		const applyMiddleware = config.enabled && selectedEntryPoints.has(name);
		const http = (entryPoint.http ?? {}) as EntryPointHttp;
		const currentMiddlewares = Array.isArray(http.middlewares)
			? [...http.middlewares]
			: typeof http.middlewares === "string"
				? [http.middlewares]
				: [];

		const hasMiddleware = currentMiddlewares.includes(middlewareName);
		if (applyMiddleware && !hasMiddleware) {
			currentMiddlewares.push(middlewareName);
			changed = true;
		}
		if (!applyMiddleware && hasMiddleware) {
			const filtered = currentMiddlewares.filter(
				(item) => item !== middlewareName,
			);
			currentMiddlewares.length = 0;
			currentMiddlewares.push(...filtered);
			changed = true;
		}

		if (currentMiddlewares.length > 0) {
			http.middlewares = currentMiddlewares;
			entryPoint.http = http;
		} else if (http.middlewares) {
			delete http.middlewares;
			if (Object.keys(http).length === 0) {
				delete entryPoint.http;
			} else {
				entryPoint.http = http;
			}
			changed = true;
		}
		entryPoints[name] = entryPoint;
	}

	for (const entryPoint of selectedEntryPoints) {
		if (!entryPoints[entryPoint]) {
			warnings.push(
				`EntryPoint "${entryPoint}" not found in Traefik config.`,
			);
		}
	}

	if (!changed) {
		return { needsReload: false, warnings };
	}

	const updated = stringify({
		...parsed,
		entryPoints,
	});

	if (serverId) {
		await writeRemoteFile(serverId, mainConfigPath, updated);
	} else {
		fs.writeFileSync(mainConfigPath, updated, "utf8");
	}

	return {
		needsReload: true,
		warnings,
	};
};

export const applyTraefikPagesConfig = async ({
	config,
	serverId,
}: {
	config: TraefikPagesConfig;
	serverId?: string;
}): Promise<TraefikPagesApplyResult> => {
	await ensureDirectories(serverId);

	const payload: TraefikPagesConfig = {
		...config,
		updatedAt: new Date().toISOString(),
	};

	await writeTraefikPagesConfig(payload, serverId);

	const { dynamicConfigPath } = resolveTraefikPagesPaths(serverId);
	const dynamicConfig = buildTraefikPagesDynamicConfig(payload);

	if (dynamicConfig) {
		if (serverId) {
			await writeRemoteFile(serverId, dynamicConfigPath, dynamicConfig);
		} else {
			fs.writeFileSync(dynamicConfigPath, dynamicConfig, "utf8");
		}
	} else if (serverId) {
		await removeRemoteFile(serverId, dynamicConfigPath);
	} else if (fs.existsSync(dynamicConfigPath)) {
		fs.rmSync(dynamicConfigPath, { force: true });
	}

	return updateEntryPoints(payload, serverId);
};

const escapeHtml = (value: string) =>
	value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");

const applyTokens = (template: string, tokens: Record<string, string>) =>
	template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_match, key) => {
		const value = tokens[key];
		return value === undefined ? "" : value;
	});

const buildBaseStyles = (theme: TraefikPagesTheme) => {
	const fontImport = theme.fontUrl
		? `@import url('${theme.fontUrl}');`
		: "";
	const gradient = theme.gradient.enabled
		? `linear-gradient(${theme.gradient.angle}deg, ${theme.gradient.from}, ${theme.gradient.via}, ${theme.gradient.to})`
		: theme.palette.background;
	const alignment =
		theme.layout.alignment === "left" ? "flex-start" : "center";
	const cardBackground = theme.layout.glass
		? "rgba(15, 23, 42, 0.68)"
		: theme.palette.card;

	return `
		${fontImport}
		:root {
			--bg: ${theme.palette.background};
			--surface: ${theme.palette.surface};
			--card: ${theme.palette.card};
			--text: ${theme.palette.text};
			--muted: ${theme.palette.muted};
			--accent: ${theme.palette.accent};
			--border: ${theme.palette.border};
			--primary-bg: ${theme.buttons.primaryBackground};
			--primary-text: ${theme.buttons.primaryText};
			--secondary-bg: ${theme.buttons.secondaryBackground};
			--secondary-text: ${theme.buttons.secondaryText};
			--secondary-border: ${theme.buttons.secondaryBorder};
			--radius: ${theme.buttons.radius}px;
			--card-radius: ${theme.layout.card ? "20px" : "0"};
			--max-width: ${theme.layout.maxWidth}px;
			--padding: ${theme.layout.padding}px;
			--font-family: ${theme.fontFamily};
		}
		* { box-sizing: border-box; }
		body {
			margin: 0;
			min-height: 100vh;
			background: ${gradient};
			color: var(--text);
			font-family: var(--font-family);
			display: flex;
			justify-content: center;
			align-items: ${alignment};
		}
		main {
			width: min(100%, var(--max-width));
			padding: clamp(24px, 4vw, var(--padding));
		}
		.page-shell {
			position: relative;
			border-radius: var(--card-radius);
			padding: clamp(24px, 4vw, 48px);
			background: ${theme.layout.card ? cardBackground : "transparent"};
			border: ${theme.layout.card ? "1px solid var(--border)" : "none"};
			box-shadow: ${
				theme.layout.card
					? "0 24px 80px rgba(2, 6, 23, 0.35)"
					: "none"
			};
			backdrop-filter: ${theme.layout.glass ? "blur(18px)" : "none"};
		}
		.brand {
			display: flex;
			gap: 14px;
			align-items: center;
			margin-bottom: 24px;
		}
		.brand img {
			height: 40px;
			width: 40px;
			border-radius: 12px;
		}
		.brand span {
			font-weight: 600;
			font-size: 18px;
		}
		.status {
			display: inline-flex;
			gap: 12px;
			align-items: baseline;
			margin-bottom: 20px;
		}
		.status-code {
			font-size: clamp(36px, 5vw, 56px);
			font-weight: 700;
		}
		.status-text {
			color: var(--muted);
			font-size: 15px;
			text-transform: uppercase;
			letter-spacing: 0.18em;
		}
		h1 {
			font-size: clamp(26px, 4vw, 38px);
			margin: 0 0 12px 0;
		}
		p {
			margin: 0 0 10px 0;
			color: var(--muted);
			line-height: 1.6;
		}
		.actions {
			display: flex;
			flex-wrap: wrap;
			gap: 12px;
			margin-top: 24px;
		}
		.button {
			padding: 12px 18px;
			border-radius: var(--radius);
			border: 1px solid transparent;
			text-decoration: none;
			font-weight: 600;
			font-size: 14px;
			display: inline-flex;
			align-items: center;
			justify-content: center;
		}
		.button.primary {
			background: var(--primary-bg);
			color: var(--primary-text);
		}
		.button.secondary {
			background: var(--secondary-bg);
			color: var(--secondary-text);
			border-color: var(--secondary-border);
		}
		.meta {
			display: grid;
			grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
			gap: 12px 18px;
			margin-top: 26px;
			font-size: 12px;
			color: var(--muted);
		}
		.meta span {
			display: block;
			font-weight: 600;
			color: var(--text);
		}
		${theme.effects.grid ? ".grid-overlay { position: fixed; inset: 0; background-image: linear-gradient(rgba(148,163,184,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.07) 1px, transparent 1px); background-size: 64px 64px; pointer-events: none; }" : ""}
		${theme.effects.glow ? ".glow { position: fixed; width: 520px; height: 520px; background: radial-gradient(circle at center, rgba(34,211,238,0.18), transparent 65%); top: -120px; right: -120px; pointer-events: none; }" : ""}
		${theme.effects.noise ? ".noise { position: fixed; inset: 0; background-image: url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"240\" height=\"240\" viewBox=\"0 0 240 240\"><filter id=\"n\"><feTurbulence type=\"fractalNoise\" baseFrequency=\"0.8\" numOctaves=\"3\" stitchTiles=\"stitch\"/></filter><rect width=\"240\" height=\"240\" filter=\"url(%23n)\" opacity=\"0.08\"/></svg>'); pointer-events: none; }" : ""}
	`;
};

export const renderTraefikErrorPage = (
	config: TraefikPagesConfig,
	status: TraefikPageStatus,
	context: TraefikPageRenderContext,
) => {
	const page = config.pages[status] ?? config.pages["503"];
	const statusLabel = STATUS_LABELS[status] ?? "Error";
	const title = page.title || statusLabel;
	const subtitle = page.subtitle || statusLabel;
	const message = page.message || "";
	const hint = page.hint || "";
	const tokens = {
		status,
		status_text: statusLabel,
		title,
		subtitle,
		message,
		hint,
		brand: config.theme.brandName,
		request_id: context.requestId || "n/a",
		timestamp: context.timestamp,
		host: context.host || "unknown",
		path: context.path || "unknown",
		method: context.method || "GET",
		protocol: context.protocol || "https",
	};

	const baseStyles = buildBaseStyles(config.theme);

	if (page.mode === "custom" && page.customHtml.trim().length > 0) {
		const customHtml = applyTokens(page.customHtml, tokens);
		const customCss = applyTokens(page.customCss || "", tokens);
		const styleBlock = `<style>${baseStyles}\n${customCss}</style>`;
		const isFullDoc =
			/<html[\s>]/i.test(customHtml) || /<!doctype/i.test(customHtml);

		if (isFullDoc) {
			if (/<\/head>/i.test(customHtml)) {
				return customHtml.replace(/<\/head>/i, `${styleBlock}</head>`);
			}
			return `${styleBlock}${customHtml}`;
		}

		return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>${styleBlock}</head><body>${customHtml}</body></html>`;
	}

	const brandLogo = config.theme.logoUrl
		? `<img src="${escapeHtml(config.theme.logoUrl)}" alt="${escapeHtml(
				config.theme.brandName,
			)}"/>`
		: "";

	const primaryAction =
		page.primaryAction?.label && page.primaryAction?.href
			? `<a class="button primary" href="${escapeHtml(
					page.primaryAction.href,
				)}">${escapeHtml(page.primaryAction.label)}</a>`
			: "";

	const secondaryAction =
		page.secondaryAction?.label && page.secondaryAction?.href
			? `<a class="button secondary" href="${escapeHtml(
					page.secondaryAction.href,
				)}">${escapeHtml(page.secondaryAction.label)}</a>`
			: "";

	const metaItems = [
		page.showRequestId
			? `<div><span>Request ID</span>${escapeHtml(
					context.requestId || "n/a",
				)}</div>`
			: "",
		page.showTimestamp
			? `<div><span>Timestamp</span>${escapeHtml(context.timestamp)}</div>`
			: "",
		page.showHost
			? `<div><span>Host</span>${escapeHtml(context.host || "unknown")}</div>`
			: "",
		page.showPath
			? `<div><span>Path</span>${escapeHtml(context.path || "unknown")}</div>`
			: "",
	]
		.filter(Boolean)
		.join("");

	return `<!doctype html>
<html>
	<head>
		<meta charset="utf-8"/>
		<meta name="viewport" content="width=device-width, initial-scale=1"/>
		<title>${escapeHtml(statusLabel)} | ${escapeHtml(
			config.theme.brandName,
		)}</title>
		${config.theme.fontUrl ? `<link rel="stylesheet" href="${escapeHtml(config.theme.fontUrl)}">` : ""}
		<style>${baseStyles}</style>
	</head>
	<body>
		${config.theme.effects.grid ? '<div class="grid-overlay"></div>' : ""}
		${config.theme.effects.glow ? '<div class="glow"></div>' : ""}
		${config.theme.effects.noise ? '<div class="noise"></div>' : ""}
		<main>
			<section class="page-shell">
				<div class="brand">
					${brandLogo}
					<span>${escapeHtml(config.theme.brandName)}</span>
				</div>
				<div class="status">
					<div class="status-code">${escapeHtml(status)}</div>
					<div class="status-text">${escapeHtml(statusLabel)}</div>
				</div>
				<h1>${escapeHtml(title)}</h1>
				<p>${escapeHtml(message)}</p>
				${hint ? `<p>${escapeHtml(hint)}</p>` : ""}
				<div class="actions">
					${primaryAction}
					${secondaryAction}
				</div>
				${metaItems ? `<div class="meta">${metaItems}</div>` : ""}
			</section>
		</main>
	</body>
</html>`;
};
