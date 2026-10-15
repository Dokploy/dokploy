import { buildAppName } from "@dokploy/server/db/schema/utils";
import type { DomainStrategy } from "./types";

const sanitizeAppNameChars = (value: string): string =>
	value.replace(/[^a-zA-Z0-9._-]/g, "-");

export const regenerateAppName = (type: string, oldAppName: string): string => {
	const safeOldAppName = sanitizeAppNameChars(oldAppName);
	const lastHyphen = safeOldAppName.lastIndexOf("-");
	const base =
		lastHyphen === -1 ? safeOldAppName : safeOldAppName.slice(0, lastHyphen);
	return buildAppName(type, base);
};

const escapeRegExp = (value: string) =>
	value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const APPNAME_CHAR_CLASS = "[a-zA-Z0-9._-]";

export const replaceAppNames = (
	text: string,
	appNameMap: Record<string, string>,
): string => {
	const keys = Object.keys(appNameMap).sort((a, b) => b.length - a.length);
	if (!text || keys.length === 0) {
		return text;
	}
	const pattern = new RegExp(
		`(?<!${APPNAME_CHAR_CLASS})(${keys.map(escapeRegExp).join("|")})`,
		"g",
	);
	return text.replace(pattern, (match) => appNameMap[match] ?? match);
};

const SSLIP_IO_IP_SUFFIX = /-(\d{1,3}(?:-\d{1,3}){3})\.sslip\.io$/;

export const rewriteSslipIoIp = (
	host: string,
	destinationIp: string | null,
): string => {
	if (!destinationIp) return host;
	if (!SSLIP_IO_IP_SUFFIX.test(host)) return host;
	const slugIp = destinationIp.replaceAll(".", "-").replaceAll(":", "-");
	return host.replace(SSLIP_IO_IP_SUFFIX, `-${slugIp}.sslip.io`);
};

export const rewriteVolumeName = (
	volumeName: string,
	appNameMap: Record<string, string>,
): { value: string; rewritten: boolean } => {
	const value = replaceAppNames(volumeName, appNameMap);
	return { value, rewritten: value !== volumeName };
};

const applyDomainStrategy = (
	host: string,
	strategy: DomainStrategy,
	sourceEnabled: boolean,
): { host: string; enabled: boolean } => {
	switch (strategy.custom) {
		case "keep":
			return { host, enabled: sourceEnabled };
		case "prefix":
			return { host: `${strategy.value}${host}`, enabled: sourceEnabled };
		case "suffix":
			return { host: `${host}${strategy.value}`, enabled: sourceEnabled };
		case "disable":
			return { host, enabled: false };
	}
};

export const finalDomainHost = (
	host: string,
	appNameMap: Record<string, string>,
	destinationIp: string | null,
	strategy: DomainStrategy,
	sourceEnabled = true,
): { host: string; enabled: boolean } =>
	applyDomainStrategy(
		rewriteSslipIoIp(replaceAppNames(host, appNameMap), destinationIp),
		strategy,
		sourceEnabled,
	);
