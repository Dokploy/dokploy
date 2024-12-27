import { Logo } from "@/components/shared/logo";
import { buttonVariants } from "@/components/ui/button";
import type { NextPageContext } from "next";
import Link from "next/link";

interface Props {
	statusCode: number;
	error?: Error;
}

export default function Custom404({ statusCode, error }: Props) {
	const displayStatusCode = statusCode || 400;
	return (
		<div className="h-screen">
			<div className="mx-auto flex size-full max-w-[50rem] flex-col">
				<header className="z-50 mb-auto flex w-full justify-center py-4">
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
					<div className="px-4 py-10 text-center sm:px-6 lg:px-8">
						<h1 className="block font-bold text-7xl text-primary sm:text-9xl">
							{displayStatusCode}
						</h1>
						{/* <AlertBlock className="max-w-xs mx-auto">
							<p className="text-muted-foreground">
								Oops, something went wrong.
							</p>
							<p className="text-muted-foreground">
								Sorry, we couldn't find your page.
							</p>
						</AlertBlock> */}
						<p className="mt-3 text-muted-foreground">
							{statusCode === 404
								? "Sorry, we couldn't find your page."
								: "Oops, something went wrong."}
						</p>
						{error && (
							<div className="mt-3 text-red-500">
								<p>{error.message}</p>
							</div>
						)}

						<div className="mt-5 flex flex-col items-center justify-center gap-2 sm:flex-row sm:gap-3">
							<Link
								href="/dashboard/projects"
								className={buttonVariants({
									variant: "secondary",
									className: "flex flex-row gap-2",
								})}
							>
								<svg
									className="size-4 flex-shrink-0"
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
								Go to homepage
							</Link>
						</div>
					</div>
				</main>

				<footer className="mt-auto py-5 text-center">
					<div className="mx-auto max-w-[85rem] px-4 sm:px-6 lg:px-8">
						<p className="text-gray-500 text-sm">
							Submit Log in issue on Github
						</p>
					</div>
				</footer>
			</div>
		</div>
	);
}

// @ts-ignore
Error.getInitialProps = ({ res, err, ...rest }: NextPageContext) => {
	const statusCode = res ? res.statusCode : err ? err.statusCode : 404;
	return { statusCode, error: err };
};
