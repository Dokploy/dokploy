"use client";

import Head from "next/head";
import { api } from "@/utils/api";

/** When whitelabel is configured (non-cloud), overrides document title, favicon, and optional custom CSS. */
export function WhitelabelHead() {
	const { data: whitelabel } = api.whitelabel.get.useQuery();

	// Always render so we can override favicon (same key as _app default replaces it)
	return (
		<Head>
			{whitelabel?.appName && <title>{whitelabel.appName}</title>}
			{whitelabel?.faviconUrl ? (
				<link rel="icon" href={whitelabel.faviconUrl} key="favicon" />
			) : (
				<link rel="icon" href="/icon.svg" key="favicon" />
			)}
			{whitelabel?.customCss?.trim() && (
				<style
					id="whitelabel-custom-css"
					dangerouslySetInnerHTML={{ __html: whitelabel.customCss.trim() }}
				/>
			)}
		</Head>
	);
}
