import { RootToggle } from "fumadocs-ui/components/layout/root-toggle";
import { I18nProvider } from "fumadocs-ui/i18n";
import { DocsLayout } from "fumadocs-ui/layout";
import { RootProvider } from "fumadocs-ui/provider";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import { baseOptions } from "../layout.config";
import { pageTree } from "../source";
import "../global.css";
import GoogleAnalytics from "@/components/analytics/google";
import {
	LibraryIcon,
	type LucideIcon,
	PlugZapIcon,
	TerminalIcon,
} from "lucide-react";
const inter = Inter({
	subsets: ["latin"],
});

interface Mode {
	param: string;
	name: string;
	package: string;
	description: string;
	icon: LucideIcon;
}

const modes: Mode[] = [
	{
		param: "core/get-started/introduction",
		name: "Core",
		package: "Dokploy",
		description: "The core",
		icon: LibraryIcon,
	},
	{
		param: "cli",
		name: "CLI",
		package: "fumadocs-ui",
		description: "Interactive CLI",
		icon: TerminalIcon,
	},
	{
		param: "api",
		name: "API",
		package: "fumadocs-mdx",
		description: "API Documentation",
		icon: PlugZapIcon,
	},
];

export default function Layout({
	params,
	children,
}: {
	params: { lang: string };
	children: ReactNode;
}) {
	return (
		<html
			lang={params.lang}
			className={inter.className}
			suppressHydrationWarning
		>
			<head>
				<script
					defer
					src="https://umami.dokploy.com/script.js"
					data-website-id="6ad2aa56-6d38-4f39-97a8-1a8fcdda8d51"
				/>
			</head>
			<GoogleAnalytics />
			<body>
				<I18nProvider
					locale={params.lang}
					translations={{
						en: {
							name: "English",
						},
						cn: {
							name: "中文",
							toc: "目录",
							search: "搜索文档",
							lastUpdate: "最后更新于",
							searchNoResult: "没有结果",
							previousPage: "上一页",
							nextPage: "下一页",
							chooseLanguage: "选择语言",
						},
					}}
				>
					<RootProvider>
						<DocsLayout
							i18n
							tree={pageTree[params.lang]}
							nav={{
								title: params.lang === "cn" ? "目录" : "Dokploy",
								url: `/${params.lang}`,
								transparentMode: "none",
							}}
							sidebar={{
								// defaultOpenLevel: 0,

								banner: (
									<RootToggle
										options={modes.map((mode) => {
											return {
												url: `/${params.lang}/docs/${mode.param}`,
												icon: (
													<mode.icon
														className="size-9 shrink-0 rounded-md bg-gradient-to-t from-background/80 p-1.5"
														style={{
															backgroundColor: `hsl(var(--${mode.param}-color)/.3)`,
															color: `hsl(var(--${mode.param}-color))`,
														}}
													/>
												),
												title: mode.name,
												description: mode.description,
											};
										})}
									/>
								),
							}}
							{...baseOptions}
						>
							{children}
						</DocsLayout>
					</RootProvider>
				</I18nProvider>
			</body>
		</html>
	);
}
