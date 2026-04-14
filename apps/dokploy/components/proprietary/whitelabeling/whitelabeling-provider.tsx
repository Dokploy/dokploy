"use client";

import Head from "next/head";
import { useTheme } from "next-themes";
import { api } from "@/utils/api";

export function WhitelabelingProvider() {
	const { resolvedTheme } = useTheme();
	const { data: config } = api.whitelabeling.getPublic.useQuery(undefined, {
		staleTime: 5 * 60 * 1000,
		refetchOnWindowFocus: false,
	});

	const faviconHref = config?.faviconUrl
		?? (resolvedTheme === "dark" ? "/icon-dark.svg"
		: resolvedTheme === "light" ? "/icon-light.svg"
		: "/icon.svg");

	if (!config) return null;

	return (
		<>
			<Head>
				{config.metaTitle && <title>{config.metaTitle}</title>}
				<link rel="icon" href={faviconHref} key="app-favicon" />
			</Head>

			{config.customCss && (
				<style
					id="whitelabeling-styles"
					dangerouslySetInnerHTML={{
						__html: config.customCss,
					}}
				/>
			)}
		</>
	);
}
