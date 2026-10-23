import { z } from "zod";

export const telegramProxyUrlSchema = z
	.string()
	.trim()
	.refine(
		(value) => {
			if (!value) return true;
			try {
				const url = new URL(value);
				decodeURIComponent(url.username);
				decodeURIComponent(url.password);
				return (
					["socks5:", "socks5h:"].includes(url.protocol) &&
					!!url.hostname &&
					(!url.port || (Number(url.port) > 0 && Number(url.port) <= 65535)) &&
					(!url.pathname || url.pathname === "/") &&
					!url.search &&
					!url.hash &&
					!/\s/.test(value)
				);
			} catch {
				return false;
			}
		},
		{ message: "Enter a valid SOCKS5 proxy URL, e.g. socks5://host:1080" },
	)
	.describe(
		"Optional SOCKS5 proxy URL. Use an empty string or null to connect directly.",
	)
	.nullish();
