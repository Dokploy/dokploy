export type PreviewDomainContext = {
	appName: string;
	branch: string;
	pr: string;
	hash: string;
};

const MAX_LABEL_LENGTH = 63;

const slugifyLabel = (value: string) =>
	value
		.toLowerCase()
		.replace(/[^a-z0-9-]+/g, "-")
		.replace(/-{2,}/g, "-")
		.replace(/^-+|-+$/g, "");

const capLabel = (label: string) =>
	label.length <= MAX_LABEL_LENGTH
		? label
		: label.slice(0, MAX_LABEL_LENGTH).replace(/-+$/, "");

const substitute = (template: string, vars: Record<string, string>): string =>
	template.replace(/\{(\w+)\}/g, (match, key) => {
		const lower = key.toLowerCase();
		return Object.hasOwn(vars, lower) ? (vars[lower] ?? "") : match;
	});

const assertNoUnresolvedTokens = (resolved: string, template: string) => {
	const leftover = resolved.match(/\{\w+\}/g);
	if (leftover?.length) {
		throw new Error(
			`Unknown variable${leftover.length > 1 ? "s" : ""} in preview template "${template}": ${leftover.join(", ")}. Supported: {appname}, {branch}, {pr}, {hash}.`,
		);
	}
};

export const resolvePreviewDomainTemplate = (
	template: string,
	context: PreviewDomainContext,
): string => {
	const substituted = substitute(template, {
		appname: slugifyLabel(context.appName),
		branch: slugifyLabel(context.branch),
		pr: slugifyLabel(context.pr),
		hash: slugifyLabel(context.hash),
	});
	assertNoUnresolvedTokens(substituted, template);

	return substituted
		.split(".")
		.map((label) => capLabel(slugifyLabel(label)))
		.filter(Boolean)
		.join(".");
};

export const resolvePreviewPathTemplate = (
	template: string,
	context: PreviewDomainContext,
): string => {
	const substituted = substitute(template, {
		appname: slugifyLabel(context.appName),
		branch: slugifyLabel(context.branch),
		pr: context.pr,
		hash: context.hash,
	});
	assertNoUnresolvedTokens(substituted, template);
	return substituted;
};

export const isPreviewTemplateMode = (template: string) =>
	!template.includes("*") && template.includes("{");

export const DYNAMIC_DNS_SUFFIXES = [
	".traefik.me",
	".nip.io",
	".sslip.io",
	".backname.io",
] as const;

export const detectDynamicDnsSuffix = (host: string): string | undefined =>
	DYNAMIC_DNS_SUFFIXES.find((s) => host.endsWith(s));

export const isDynamicDnsHost = (host: string): boolean =>
	detectDynamicDnsSuffix(host) !== undefined;

export const injectDynamicDnsIp = (host: string, slugIp: string): string => {
	const suffix = detectDynamicDnsSuffix(host);
	if (!suffix || !slugIp) return host;
	const base = host.slice(0, -suffix.length);
	return base ? `${base}.${slugIp}${suffix}` : `${slugIp}${suffix}`;
};

export const resolveWildcardDomain = (
	baseDomain: string,
	appName: string,
	slugIp: string,
): string => {
	if (baseDomain.includes("{")) {
		throw new Error(
			`Preview domain "${baseDomain}" mixes wildcard "*" with {variables}. Use one or the other.`,
		);
	}
	const suffix = detectDynamicDnsSuffix(baseDomain);
	if (suffix && slugIp) {
		const label = `${appName}-${slugIp}`;
		return baseDomain.replace("*", label);
	}
	const host = baseDomain.replace("*", appName);
	return injectDynamicDnsIp(host, slugIp);
};
