import type { NextPageContext } from "next";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Logo } from "@/components/shared/logo";
import { buttonVariants } from "@/components/ui/button";
import { useWhitelabelingPublic } from "@/utils/hooks/use-whitelabeling";

interface Props {
	statusCode: number;
	error?: Error;
}

export default function Custom404({ statusCode, error }: Props) {
	const displayStatusCode = statusCode || 400;
	const { config: whitelabeling } = useWhitelabelingPublic();
	const t = useTranslations();
	const appName = whitelabeling?.appName || "Dokploy";
	const logoUrl = whitelabeling?.logoUrl || undefined;
	const errorTitle = whitelabeling?.errorPageTitle;
	const errorDescription = whitelabeling?.errorPageDescription;

	return (
		<div className="h-screen">
			<div className="max-w-[50rem] flex flex-col mx-auto size-full">
				<header className="mb-auto flex justify-center z-50 w-full py-4">
					<nav
						className="px-4 sm:px-6 lg:px-8"
						aria-label={t("errorPage.ariaGlobal")}
					>
						<Link href="/" className="flex flex-row items-center gap-2">
							<Logo logoUrl={logoUrl} />
							<span className="font-medium text-sm">{appName}</span>
						</Link>
					</nav>
				</header>
				<main id="content">
					<div className="text-center py-10 px-4 sm:px-6 lg:px-8">
						<h1 className="block text-7xl font-bold text-primary sm:text-9xl">
							{displayStatusCode}
						</h1>
						<p className="mt-3 text-muted-foreground">
							{errorTitle
								? errorTitle
								: statusCode === 404
									? t("errorPage.notFound")
									: t("errorPage.generic")}
						</p>
						{errorDescription && (
							<p className="mt-2 text-muted-foreground text-sm">
								{errorDescription}
							</p>
						)}
						{error && (
							<div className="mt-3 text-red-500">
								<p>{error.message}</p>
							</div>
						)}

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
								{t("errorPage.goHome")}
							</Link>
						</div>
					</div>
				</main>

				<footer className="mt-auto text-center py-5">
					<div className="max-w-[85rem] mx-auto px-4 sm:px-6 lg:px-8">
						<p className="text-sm text-gray-500">
							{whitelabeling?.footerText ? (
								whitelabeling.footerText
							) : (
								<Link
									href="https://github.com/Dokploy/dokploy/issues"
									target="_blank"
									className="underline hover:text-primary transition-colors"
								>
									{t("errorPage.submitLogInIssueOnGithub")}
								</Link>
							)}
						</p>
					</div>
				</footer>
			</div>
		</div>
	);
}

// @ts-ignore
Error.getInitialProps = ({ res, err }: NextPageContext) => {
	const statusCode = res ? res.statusCode : err ? err.statusCode : 404;
	return { statusCode, error: err };
};
