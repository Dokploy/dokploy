import { getLanguages, getPage } from "@/app/source";
import type { Metadata } from "next";
import { DocsPage, DocsBody } from "fumadocs-ui/page";
import { notFound, permanentRedirect } from "next/navigation";
import { baseUrl, url } from "@/utils/metadata";

export default async function Page({
	params,
}: {
	params: { lang: string; slug?: string[] };
}) {
	const page = getPage(params.slug, params.lang);

	if (page == null) {
		permanentRedirect("/docs/core/get-started/introduction");
	}

	const MDX = page.data.exports.default;

	return (
		<DocsPage toc={page.data.exports.toc}>
			<DocsBody>
				<h1>{page.data.title}</h1>
				<MDX />
			</DocsBody>
		</DocsPage>
	);
}

export async function generateStaticParams() {
	return getLanguages().flatMap(({ language, pages }) =>
		pages.map((page) => ({
			lang: language,
			slug: page.slugs,
		})),
	);
}

export function generateMetadata({
	params,
}: {
	params: { lang: string; slug?: string[] };
}) {
	const page = getPage(params.slug, params.lang);
	if (page == null) {
		permanentRedirect("/docs/core/get-started/introduction");
	}
	return {
		title: page.data.title,

		description: page.data.description,
		robots: "index,follow",
		alternates: {
			canonical: new URL(`${baseUrl}${page.url}`).toString(),
			languages: {
				zh: `${baseUrl}/cn${page.url.replace("/cn", "")}`,
				en: `${baseUrl}/en${page.url.replace("/en", "")}`,
			},
		},
		openGraph: {
			title: page.data.title,
			description: page.data.description,
			url: new URL(`${baseUrl}`).toString(),
			images: [
				{
					url: new URL(
						`${baseUrl}/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Flogo.7cfd81d9.png&w=828&q=75`,
					).toString(),
					width: 1200,
					height: 630,
					alt: page.data.title,
				},
			],
		},
		twitter: {
			card: "summary_large_image",
			creator: "@siumauricio",
			title: page.data.title,
			description: page.data.description,
			images: [
				{
					url: new URL(
						`${baseUrl}/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Flogo.7cfd81d9.png&w=828&q=75`,
					).toString(),
					width: 1200,
					height: 630,
					alt: page.data.title,
				},
			],
		},
		applicationName: "Dokploy Docs",
		keywords: [
			"dokploy",
			"vps",
			"open source",
			"cloud",
			"self hosting",
			"free",
		],
		icons: {
			icon: "/icon.svg",
		},
	} satisfies Metadata;
}
