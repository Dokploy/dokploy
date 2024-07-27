import { pageTree } from "../source";
import { DocsLayout } from "fumadocs-ui/layout";
import type { ReactNode } from "react";
import { I18nProvider } from "fumadocs-ui/i18n";
import { RootProvider } from "fumadocs-ui/provider";
import { Inter } from "next/font/google";
import { baseOptions } from "../layout.config";
import { RootToggle } from "fumadocs-ui/components/layout/root-toggle";
import "../global.css";
import {
	TerminalIcon,
	LibraryIcon,
	PlugZapIcon,
	type LucideIcon,
} from "lucide-react";
import GoogleAnalytics from "@/components/analytics/google";
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
			<GoogleAnalytics />
			<body>
				<I18nProvider
					locale={params.lang}
					translations={{
						en: {
							name: "English",
						},
						cn: {
							name: "Chinese",
							toc: "目錄",
							search: "搜尋文檔",
							lastUpdate: "最後更新於",
							searchNoResult: "沒有結果",
							previousPage: "上一頁",
							nextPage: "下一頁",
							chooseLanguage: "選擇語言",
						},
					}}
				>
					<RootProvider>
						<DocsLayout
							i18n
							tree={pageTree[params.lang]}
							nav={{
								title: params.lang === "cn" ? "目錄" : "Dokploy",
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
