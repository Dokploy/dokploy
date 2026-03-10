"use client";

import Head from "next/head";
import { api } from "@/utils/api";

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
					dangerouslySetInnerHTML={{
						__html: config.customCss,
					}}
				/>
			)}
		</>
	);
}
