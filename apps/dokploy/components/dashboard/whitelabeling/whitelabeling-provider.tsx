"use client";

import Head from "next/head";
import { api } from "@/utils/api";

// Strips well-known CSS injection vectors. Only org owners can write
// customCss, but defense-in-depth keeps a compromised owner account from
// trivially exfiltrating data via url()/@import or running expression().
function sanitizeCustomCss(css: string): string {
	return css
		.replace(/<\/style\s*>/gi, "")
		.replace(/@import\b[^;]*;?/gi, "")
		.replace(/expression\s*\(/gi, "")
		.replace(/url\s*\(\s*["']?\s*(?:javascript|data|vbscript):[^)]*\)/gi, "");
}

export function WhitelabelingProvider() {
	const { data: config } = api.whitelabeling.getPublic.useQuery(undefined, {
		staleTime: 5 * 60 * 1000,
		refetchOnWindowFocus: false,
	});

	if (!config) return null;

	return (
		<>
			<Head>
				{config.metaTitle && <title>{config.metaTitle}</title>}
				{config.faviconUrl && <link rel="icon" href={config.faviconUrl} />}
			</Head>

			{config.customCss && (
				<style
					id="whitelabeling-styles"
					// biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized
					dangerouslySetInnerHTML={{
						__html: sanitizeCustomCss(config.customCss),
					}}
				/>
			)}
		</>
	);
}
