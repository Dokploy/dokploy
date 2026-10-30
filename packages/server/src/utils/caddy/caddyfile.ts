import { createPrivateKey, X509Certificate } from "node:crypto";

// The stock image, pinned: the renderer is tested against this version.
export const CADDY_IMAGE = "caddy:2.11.4";

export interface CaddyRoute {
	host: string;
	https: boolean;
	// No certificate provider was chosen. Traefik then answers with its
	// self-signed certificate while it has no other, and Caddy with one from
	// its own authority.
	selfSigned?: boolean;
	// Traefik's PathPrefix; null for the whole host.
	path: string | null;
	// Resolved by the caller, because applications and compose services decide
	// these differently.
	stripPrefix: string | null;
	addPrefix: string | null;
	uniqueConfigKey: number;
	// Why the domain needs Traefik, when it depends on something only Traefik
	// can enforce. The route then answers 503 with that sentence instead of
	// being served without it.
	unsupported?: string;
	upstreams: string[];
	users: { username: string; hash: string }[];
	redirects: {
		regex: string;
		replacement: string;
		permanent: boolean;
		uniqueConfigKey: number;
	}[];
}

export interface CaddyState {
	email?: string | null;
	certificates: {
		certFile: string;
		keyFile: string;
		certificateData: string;
		privateKey: string;
	}[];
	routes: CaddyRoute[];
}

// Inside backticks nothing can end the token or add a directive. `{$VAR}` is
// the one thing Caddy still expands there, at parse time.
const writable = (value: string) =>
	!value.includes("`") && !value.includes("{$");

const quote = (value: string) => {
	if (!writable(value)) throw new Error("unsupported characters");
	return `\`${value}\``;
};

// Caddy would otherwise evaluate {env.*} and {file.*} at request time.
const escapePlaceholders = (value: string) => value.replaceAll("{", "\\{");

const regexLiteral = (value: string) =>
	value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// For the replacement of a `uri path_regexp`, where Go expands `$1`.
const replacementLiteral = (value: string) =>
	escapePlaceholders(value.replaceAll("$", "$$$$"));

const HOST = /^[a-z0-9_-]+(\.[a-z0-9_-]+)*$/i;
const UPSTREAM = /^[a-z0-9][a-z0-9_.-]*:\d{1,5}$/i;
const EMAIL = /^[\w.+-]+@[\w.-]+$/;
const REFUSED = "respond `This domain has a setting Caddy cannot use` 503";

const toPunycode = (host: string) => {
	try {
		return new URL(`http://${host}`).hostname;
	} catch {
		return host;
	}
};

const block = (head: string, lines: string[]) => [
	`${head ? `${head} ` : ""}{`,
	...lines.map((line) => `\t${line}`),
	"}",
];

// Traefik's redirectRegex rewrites the full URL with Go's ReplaceAllString and
// redirects only when the result differs, keeping the method on anything but
// GET. The first matcher is the pattern as written, so its groups keep their
// numbers and a reference to one it does not have is empty, as in Go. The
// second captures what the match leaves on either side. The template follows
// Go's Expand, and `@changed` covers the identity case: the stock "redirect to
// www" preset also matches URLs that are already www.
// Only the first match is replaced, which is the same for anchored patterns.
const redirectLines = (redirect: CaddyRoute["redirects"][number]) => {
	const name = `redirect_${redirect.uniqueConfigKey}`;
	const target = redirect.replacement.replace(
		/\$\$|\$\{(\w+)\}|\$(\w+)|\{/g,
		(match, braced, bare) => {
			if (match === "$$") return "$";
			if (match === "{") return "\\{";
			return `{re.${name}.${braced ?? bare}}`;
		},
	);
	return [
		`@${name} vars_regexp ${name} dokploy_url ${quote(redirect.regex)}`,
		...block(`route @${name}`, [
			`@around vars_regexp ${name}_around dokploy_url ${quote(`^(?P<dokploy_before>.*?)(?:${redirect.regex})(?P<dokploy_after>.*)$`)}`,
			...block("route @around", [
				`vars dokploy_target ${quote(`{re.${name}_around.dokploy_before}${target}{re.${name}_around.dokploy_after}`)}`,
				"@changed not vars dokploy_target {vars.dokploy_url}",
				`redir @changed {vars.dokploy_target} {dokploy_${redirect.permanent ? "permanent" : "temporary"}}`,
			]),
		]),
	];
};

const routeLines = (route: CaddyRoute) => {
	if (route.unsupported) return [`respond ${quote(route.unsupported)} 503`];
	if (
		!route.upstreams.length ||
		!route.upstreams.every((upstream) => UPSTREAM.test(upstream))
	) {
		throw new Error("unsupported upstream");
	}
	const lines: string[] = [];
	if (route.stripPrefix) {
		const prefix = regexLiteral(route.stripPrefix);
		const glued = `@glued_${route.uniqueConfigKey}`;
		lines.push(
			// On a "/api" route Traefik's StripPrefix turns "/apifoo" into
			// "/foo". Caddy's would leave "foo", so the slash goes in first.
			`${glued} path_regexp ${quote(`^${prefix}[^/]`)}`,
			`uri ${glued} path_regexp ${quote(`^${prefix}`)} ${quote(`${replacementLiteral(route.stripPrefix)}/`)}`,
			`uri strip_prefix ${quote(escapePlaceholders(route.stripPrefix))}`,
			`request_header X-Forwarded-Prefix ${quote(escapePlaceholders(route.stripPrefix))}`,
		);
	}
	if (route.addPrefix) {
		// Not `rewrite`, which would decode an encoded slash in the rest of
		// the path.
		lines.push(
			`uri path_regexp ^ ${quote(replacementLiteral(route.addPrefix))}`,
		);
	}
	if (route.redirects.length) {
		lines.push(
			"vars dokploy_url {scheme}://{hostport}{uri}",
			...block("map {method} {dokploy_permanent} {dokploy_temporary}", [
				"GET 301 302",
				"default 308 307",
			]),
			...route.redirects.flatMap(redirectLines),
		);
	}
	if (route.users.length) {
		lines.push(
			...block(
				"basic_auth",
				route.users.map(
					(user) =>
						`${quote(escapePlaceholders(user.username))} ${quote(user.hash)}`,
				),
			),
			"request_header -Authorization",
		);
	}
	const proxy = block(`reverse_proxy ${route.upstreams.join(" ")}`, [
		// Traefik overwrites these two. Caddy would pass on whatever the
		// client sent, to applications that trust them.
		"header_up X-Real-IP {client_ip}",
		"header_up X-Forwarded-Port {http.request.local.port}",
		// Without this, Caddy closes every proxied WebSocket each time its
		// configuration is reloaded, which is on every domain change.
		"stream_close_delay 24h",
	]);
	// Caddy sorts directives by its own order. `route` keeps this one (strip,
	// add, redirect, auth, proxy), which is the order Traefik runs the
	// equivalent middlewares in.
	return lines.length ? block("route", [...lines, ...proxy]) : proxy;
};

interface Handle {
	path: string | null;
	order: number;
	lines: string[];
}

const renderSite = (address: string, handles: Handle[], tls: string[] = []) => {
	const sorted = [...handles].sort(
		(a, b) =>
			(b.path?.length ?? 0) - (a.path?.length ?? 0) || a.order - b.order,
	);
	const [only] = sorted;
	if (only && sorted.length === 1 && !only.path) {
		return block(address, [...tls, ...only.lines]);
	}
	const lines = sorted.flatMap(({ path, order, lines }) =>
		path
			? [
					// Caddy's own `path` matcher ignores case. Traefik's PathPrefix
					// does not, and two routes that differ only by case can carry
					// different protections.
					`@path_${order} path_regexp ${quote(`^${regexLiteral(path)}`)}`,
					...block(`handle @path_${order}`, lines),
				]
			: block("handle", lines),
	);
	// Traefik answers 404 for a path no router claims. Caddy would answer an
	// empty 200.
	if (sorted.every(({ path }) => path)) {
		lines.push(...block("handle", ["respond 404"]));
	}
	// `route` keeps the handles in this order, longest path first.
	return block(address, [...tls, ...block("route", lines)]);
};

/**
 * Renders the Caddyfile for one server from its database state. Pure: every
 * value is quoted, escaped or matched against a strict pattern, and a route
 * that cannot be written safely answers 503 in its own place instead of
 * falling through to a less specific one. Those routes are returned as
 * `refused`, and the hosts that answer over HTTPS only once Caddy has obtained
 * a certificate for them as `automatic`.
 */
export const renderCaddyfile = ({
	email,
	certificates,
	routes,
}: CaddyState) => {
	const usable = certificates.flatMap((certificate) => {
		try {
			const x509 = new X509Certificate(certificate.certificateData);
			// Caddy expands placeholders in both paths when it loads the pair.
			const tls = `tls ${quote(escapePlaceholders(certificate.certFile))} ${quote(escapePlaceholders(certificate.keyFile))}`;
			return x509.checkPrivateKey(createPrivateKey(certificate.privateKey))
				? [{ x509, tls }]
				: [];
		} catch {
			return [];
		}
	});
	const tlsLine = (host: string) => {
		const match = usable.find(({ x509 }) => x509.checkHost(host));
		return match ? [match.tls] : [];
	};

	const https = new Map<string, Handle[]>();
	const http = new Map<string, Handle[]>();
	const selfSigned = new Set<string>();
	const unwritable = new Set<string>();
	const refused: CaddyRoute[] = [];
	for (const route of routes) {
		const host = toPunycode(route.host);
		// A host that is not a hostname cannot match any request, so leaving
		// it out exposes nothing.
		if (!HOST.test(host)) {
			refused.push(route);
			continue;
		}
		const sites = route.https ? https : http;
		if (route.https && route.selfSigned) selfSigned.add(host);
		const path = route.path && route.path !== "/" ? route.path : null;
		let lines = [REFUSED];
		try {
			lines = routeLines(route);
		} catch {
			refused.push(route);
		}
		if (path && !writable(path)) {
			// Without a matcher the route cannot hold its place among the
			// others, so the whole host is refused instead of letting its
			// requests reach another route.
			unwritable.add(`${route.https}${host}`);
			if (!refused.includes(route)) refused.push(route);
		}
		sites.set(host, [
			...(sites.get(host) ?? []),
			{ path, order: route.uniqueConfigKey, lines },
		]);
	}
	for (const [sites, scheme] of [
		[https, true],
		[http, false],
	] as const) {
		for (const host of sites.keys()) {
			if (unwritable.has(`${scheme}${host}`)) {
				sites.set(host, [{ path: null, order: 0, lines: [REFUSED] }]);
			}
		}
	}
	// Caddy redirects HTTP to HTTPS on its own only for hosts without an HTTP
	// site of their own, so a host that mixes both gets them spelled out.
	for (const [host, handles] of http) {
		for (const { path, order } of https.get(host) ?? []) {
			handles.push({ path, order, lines: ["redir https://{host}{uri} 308"] });
		}
	}

	const automatic: string[] = [];
	const caddyfile = [
		"# Generated by Dokploy from the database. Edits here are overwritten.",
		"# Your own configuration belongs in global/*.caddy and sites/*.caddy.",
		...block("", [
			...(email && EMAIL.test(email) ? [`email ${email}`] : []),
			"import global/*.caddy",
			// The last value wins, so a file in global/ cannot open the admin
			// endpoint to the rest of the Docker network.
			"admin localhost:2019",
		]),
		"import sites/*.caddy",
		...[...https.keys()].sort().flatMap((host) => {
			const tls = tlsLine(host);
			if (!tls.length && selfSigned.has(host)) {
				// Let's Encrypt first, as Traefik's default resolver would, so a
				// certificate carried over from it stays in use.
				tls.push(...block("tls", ["issuer acme", "issuer internal"]));
			} else if (!tls.length) {
				automatic.push(host);
			}
			// With its scheme, because a bare address can be read as a
			// directive: a host named "import" would break the whole file.
			return renderSite(`https://${host}`, https.get(host) ?? [], tls);
		}),
		...[...http.keys()]
			.sort()
			.flatMap((host) => renderSite(`http://${host}`, http.get(host) ?? [])),
		// Traefik answers 404 for a host it does not know. Caddy would answer
		// an empty 200.
		...block("http://", ["respond 404"]),
		"",
	].join("\n");

	return { caddyfile, refused, automatic };
};
