"use client";

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
} from "@/components/ui/select";
import { Link, useRouter } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { Popover, Transition } from "@headlessui/react";
import { HeartIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Fragment, type JSX, type SVGProps } from "react";
import { Container } from "./Container";
import { NavLink } from "./NavLink";
import { trackGAEvent } from "./analitycs";
import { Logo } from "./shared/Logo";
import { Button, buttonVariants } from "./ui/button";

function MobileNavLink({
	href,
	children,
	target,
}: {
	href: string;
	children: React.ReactNode;
	target?: string;
}) {
	return (
		<Popover.Button
			onClick={() => {
				trackGAEvent({
					action: "Nav Link Clicked",
					category: "Navigation",
					label: href,
				});
			}}
			as={Link}
			href={href}
			target={target}
			className="block w-full p-2"
		>
			{children}
		</Popover.Button>
	);
}

function MobileNavIcon({ open }: { open: boolean }) {
	return (
		<svg
			aria-hidden="true"
			className="h-3.5 w-3.5 overflow-visible stroke-muted-foreground"
			fill="none"
			strokeWidth={2}
			strokeLinecap="round"
		>
			<path
				d="M0 1H14M0 7H14M0 13H14"
				className={cn("origin-center transition", open && "scale-90 opacity-0")}
			/>
			<path
				d="M2 2L12 12M12 2L2 12"
				className={cn(
					"origin-center transition",
					!open && "scale-90 opacity-0",
				)}
			/>
		</svg>
	);
}

const I18nIcon = (props: JSX.IntrinsicAttributes & SVGProps<SVGSVGElement>) => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width={24}
		height={24}
		fill="currentColor"
		stroke="currentColor"
		strokeWidth={0}
		viewBox="0 0 512 512"
		{...props}
	>
		<path
			stroke="none"
			d="m478.33 433.6-90-218a22 22 0 0 0-40.67 0l-90 218a22 22 0 1 0 40.67 16.79L316.66 406h102.67l18.33 44.39A22 22 0 0 0 458 464a22 22 0 0 0 20.32-30.4zM334.83 362 368 281.65 401.17 362zm-66.99-19.08a22 22 0 0 0-4.89-30.7c-.2-.15-15-11.13-36.49-34.73 39.65-53.68 62.11-114.75 71.27-143.49H330a22 22 0 0 0 0-44H214V70a22 22 0 0 0-44 0v20H54a22 22 0 0 0 0 44h197.25c-9.52 26.95-27.05 69.5-53.79 108.36-31.41-41.68-43.08-68.65-43.17-68.87a22 22 0 0 0-40.58 17c.58 1.38 14.55 34.23 52.86 83.93.92 1.19 1.83 2.35 2.74 3.51-39.24 44.35-77.74 71.86-93.85 80.74a22 22 0 1 0 21.07 38.63c2.16-1.18 48.6-26.89 101.63-85.59 22.52 24.08 38 35.44 38.93 36.1a22 22 0 0 0 30.75-4.9z"
		/>
	</svg>
);

function MobileNavigation() {
	const t = useTranslations("HomePage");
	const linkT = useTranslations("Link");
	return (
		<Popover>
			<Popover.Button
				className="relative z-10 flex h-8 w-8 items-center justify-center ui-not-focus-visible:outline-none"
				aria-label="Toggle Navigation"
			>
				{({ open }) => <MobileNavIcon open={open} />}
			</Popover.Button>
			<Transition.Root>
				<Transition.Child
					as={Fragment as any}
					enter="duration-150 ease-out"
					enterFrom="opacity-0"
					enterTo="opacity-100"
					leave="duration-150 ease-in"
					leaveFrom="opacity-100"
					leaveTo="opacity-0"
				>
					<Popover.Overlay className="fixed inset-0 bg-background/50" />
				</Transition.Child>

				<Transition.Child
					as={Fragment as any}
					enter="duration-150 ease-out"
					enterFrom="opacity-0 scale-95"
					enterTo="opacity-100 scale-100"
					leave="duration-100 ease-in"
					leaveFrom="opacity-100 scale-100"
					leaveTo="opacity-0 scale-95"
				>
					<Popover.Panel
						as="div"
						className="absolute inset-x-0 top-full mt-4 flex origin-top flex-col rounded-2xl border border-border bg-background p-4 text-lg tracking-tight  text-primary shadow-xl ring-1 ring-border/5"
					>
						<MobileNavLink href="/#features">
							{t("navigation.features")}
						</MobileNavLink>
						{/* <MobileNavLink href="/#testimonials">Testimonials</MobileNavLink> */}
						<MobileNavLink href="/#faqs">{t("navigation.faqs")}</MobileNavLink>
						<MobileNavLink href={linkT("docs.intro")} target="_blank">
							{t("navigation.docs")}
						</MobileNavLink>
					</Popover.Panel>
				</Transition.Child>
			</Transition.Root>
		</Popover>
	);
}

export function Header() {
	const router = useRouter();
	const locale = useLocale();
	const t = useTranslations("HomePage");
	const linkT = useTranslations("Link");

	return (
		<header className="bg-background py-10">
			<Container>
				<nav className="relative z-50 flex justify-between">
					<div className="flex items-center md:gap-x-12">
						<Link href="/" aria-label="Home">
							<Logo className="h-10 w-auto" />
						</Link>
						<div className="hidden md:flex md:gap-x-6">
							<NavLink href="/#features">{t("navigation.features")}</NavLink>
							{/* <NavLink href="/#testimonials">Testimonials</NavLink> */}
							<NavLink href="/#faqs">{t("navigation.faqs")}</NavLink>
							<NavLink href={linkT("docs.intro")} target="_blank">
								{t("navigation.docs")}
							</NavLink>
						</div>
					</div>
					<div className="flex items-center gap-x-2 md:gap-x-5">
						<Select
							onValueChange={(locale) => {
								router.replace("/", {
									locale: locale as "en" | "zh-Hans",
								});
							}}
							value={locale}
						>
							<SelectTrigger
								className={buttonVariants({
									variant: "outline",
									className:
										" flex items-center gap-2 !rounded-full visited:outline-none focus-within:outline-none focus:outline-none",
								})}
							>
								<I18nIcon width={20} height={20} />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="en">{t("navigation.i18nEn")}</SelectItem>
								<SelectItem value="zh-Hans">
									{t("navigation.i18nZh-Hans")}
								</SelectItem>
							</SelectContent>
						</Select>

						<Link
							className={buttonVariants({
								variant: "outline",
								className: " flex items-center gap-2 !rounded-full",
							})}
							href="https://opencollective.com/dokploy"
							target="_blank"
						>
							<span className="text-sm font-semibold">
								{t("navigation.support")}{" "}
							</span>
							<HeartIcon className="animate-heartbeat size-4 fill-red-600 text-red-500 " />
						</Link>
						<Button
							className="rounded-full bg-[#5965F2] hover:bg-[#4A55E0]"
							asChild
						>
							<Link
								href="https://discord.gg/2tBnJ3jDJc"
								aria-label="Dokploy on GitHub"
								target="_blank"
								className="flex flex-row items-center gap-2 text-white"
							>
								<svg
									role="img"
									className="h-6 w-6 fill-white"
									viewBox="0 0 24 24"
									xmlns="http://www.w3.org/2000/svg"
								>
									<path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
								</svg>
								{t("navigation.discord")}
							</Link>
						</Button>
						<div className="-mr-1 md:hidden">
							<MobileNavigation />
						</div>
					</div>
				</nav>
			</Container>
		</header>
	);
}
