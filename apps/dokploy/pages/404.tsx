import type { GetStaticProps } from "next";
import Head from "next/head";
import Link from "next/link";
import { useTranslation } from "next-i18next";
import { Logo } from "@/components/shared/logo";
import { buttonVariants } from "@/components/ui/button";
import { serverSideTranslations } from "@/utils/i18n";

export default function NotFoundPage() {
	const { t } = useTranslation("common");

	return (
		<div className="h-screen">
			<Head>
				<title>{t("error.pageNotFoundTitle")}</title>
			</Head>
			<div className="max-w-[50rem] flex flex-col mx-auto size-full">
				<header className="mb-auto flex justify-center z-50 w-full py-4">
					<nav className="px-4 sm:px-6 lg:px-8" aria-label="Global">
						<Link
							href="https://dokploy.com"
							target="_blank"
							className="flex flex-row items-center gap-2"
						>
							<Logo />
							<span className="font-medium text-sm">Dokploy</span>
						</Link>
					</nav>
				</header>
				<main id="content">
					<div className="text-center py-10 px-4 sm:px-6 lg:px-8">
						<h1 className="block text-7xl font-bold text-primary sm:text-9xl">
							404
						</h1>
						<h2 className="mt-3 text-2xl font-semibold text-foreground">
							{t("error.pageNotFoundHeading")}
						</h2>
						<p className="mt-3 text-muted-foreground">
							{t("error.pageNotFoundMessage")}
						</p>

						<div className="mt-5 flex flex-col justify-center items-center gap-2 sm:flex-row sm:gap-3">
							<Link
								href="/dashboard/projects"
								className={buttonVariants({
									variant: "secondary",
									className: "flex flex-row gap-2",
								})}
							>
								<svg
									className="flex-shrink-0 size-4"
									xmlns="http://www.w3.org/2000/svg"
									width="24"
									height="24"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
								>
									<path d="m15 18-6-6 6-6" />
								</svg>
								{t("error.goToHomepage")}
							</Link>
						</div>
					</div>
				</main>

				<footer className="mt-auto text-center py-5">
					<div className="max-w-[85rem] mx-auto px-4 sm:px-6 lg:px-8">
						<p className="text-sm text-gray-500">
							<Link
								href="https://github.com/Dokploy/dokploy/issues"
								target="_blank"
								className="underline hover:text-primary transition-colors"
							>
								{t("error.submitLoginIssueOnGithub")}
							</Link>
						</p>
					</div>
				</footer>
			</div>
		</div>
	);
}

export const getStaticProps: GetStaticProps = async ({ locale }) => {
	return {
		props: {
			...(await serverSideTranslations(locale ?? "en", ["common"])),
		},
	};
};
