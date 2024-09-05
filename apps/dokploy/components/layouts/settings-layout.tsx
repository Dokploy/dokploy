interface Props {
	children: React.ReactNode;
}

export const SettingsLayout = ({ children }: Props) => {
	const { data } = api.auth.get.useQuery();
	const { data: user } = api.user.byAuthId.useQuery(
		{
			authId: data?.id || "",
		},
		{
			enabled: !!data?.id && data?.rol === "user",
		},
	);
	return (
		<div className="flex flex-row gap-4 my-8 w-full flex-wrap md:flex-nowrap">
			<div className="md:max-w-[18rem] w-full">
				<Nav
					links={[
						...(data?.rol === "admin"
							? [
									{
										title: "Server",
										icon: Activity,
										href: "/dashboard/settings/server",
									},
								]
							: []),

						{
							title: "Profile",
							icon: User2,
							href: "/dashboard/settings/profile",
						},
						{
							title: "Appearance",
							label: "",
							icon: Route,
							href: "/dashboard/settings/appearance",
						},

						...(data?.rol === "admin"
							? [
									{
										title: "S3 Destinations",
										label: "",
										icon: Database,
										href: "/dashboard/settings/destinations",
									},
									{
										title: "Certificates",
										label: "",
										icon: ShieldCheck,
										href: "/dashboard/settings/certificates",
									},
									{
										title: "SSH Keys",
										label: "",
										icon: KeyRound,
										href: "/dashboard/settings/ssh-keys",
									},
									{
										title: "Git ",
										label: "",
										icon: GitBranch,
										href: "/dashboard/settings/git-providers",
									},
									{
										title: "Users",
										label: "",
										icon: Users,
										href: "/dashboard/settings/users",
									},
									{
										title: "Cluster",
										label: "",
										icon: Server,
										href: "/dashboard/settings/cluster",
									},
									{
										title: "Notifications",
										label: "",
										icon: Bell,
										href: "/dashboard/settings/notifications",
									},
									{
										title: "License",
										label: "",
										icon: KeyIcon,
										href: "/dashboard/settings/license",
									},
								]
							: []),
						...(user?.canAccessToSSHKeys
							? [
									{
										title: "SSH Keys",
										label: "",
										icon: KeyRound,
										href: "/dashboard/settings/ssh-keys",
									},
								]
							: []),
						...(user?.canAccessToGitProviders
							? [
									{
										title: "Git",
										label: "",
										icon: GitBranch,
										href: "/dashboard/settings/git-providers",
									},
								]
							: []),
					]}
				/>
			</div>

			{children}
		</div>
	);
};

import {
	Activity,
	Bell,
	Database,
	KeyIcon,
	GitBranch,
	KeyRound,
	type LucideIcon,
	Route,
	Server,
	ShieldCheck,
	User2,
	Users,
} from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";
import { useRouter } from "next/router";

interface NavProps {
	links: {
		title: string;
		label?: string;
		icon: LucideIcon;
		href: string;
	}[];
}

export const Nav = ({ links }: NavProps) => {
	const router = useRouter();
	return (
		<div className="group flex  flex-col gap-4 py-2 data-[collapsed=true]:py-2 ">
			<nav className="grid gap-1 px-2 group-[[data-collapsed=true]]:justify-center group-[[data-collapsed=true]]:px-2">
				{links.map((link, index) => {
					const isActive = router.pathname === link.href;
					return (
						<Link
							key={index}
							href={link.href}
							className={cn(
								buttonVariants({ variant: "ghost", size: "sm" }),
								isActive &&
									"dark:bg-muted dark:text-white dark:hover:bg-muted dark:hover:text-white bg-muted",
								"justify-start",
							)}
						>
							<link.icon className="mr-2 h-4 w-4" />
							{link.title}
							{link.label && (
								<span
									className={cn(
										"ml-auto",
										isActive && "text-background dark:text-white",
									)}
								>
									{link.label}
								</span>
							)}
						</Link>
					);
				})}
				{/* {!isCollapsed ? (
					<Accordion collapsible type="single" className="">
						<AccordionItem value="follow-up" className="">
							<AccordionTrigger
								className={cn(
									buttonVariants({ variant: "ghost", size: "icon" }),
									"hover:no-underline py-0 text-start justify-start  flex items-center gap-2 px-3 mb-2",
								)}
							>
								<div className="flex flex-row items-center gap-2 justify-between w-full">
									<div className="flex flex-row gap-2 items-center">
										<Settings className="h-4 w-4" />
										<span className=" dark:hover:text-white">Settings</span>
									</div>
								</div>
								<ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200" />
							</AccordionTrigger>
							<AccordionContent className="ml-9">
								<Link
									className={cn(
										buttonVariants({ variant: "ghost", size: "icon" }),
										"hover:no-underline w-full text-start justify-start px-2 gap-2",
									)}
									href="/dashboard/settings"
								>
									<User2 className="h-4 w-4" />
									Account
								</Link>
								<Link
									className={cn(
										buttonVariants({ variant: "ghost", size: "icon" }),
										"hover:no-underline w-full text-start justify-start px-2 gap-2",
									)}
									href="/dashboard/server"
								>
									<Computer className="h-4 w-4" />
									Server
								</Link>
								<Link
									className={cn(
										buttonVariants({ variant: "ghost", size: "icon" }),
										"hover:no-underline w-full text-start justify-start px-2 gap-2",
									)}
									href="/dashboard/users"
								>
									<Users className="h-4 w-4" />
									Users
								</Link>
							</AccordionContent>
						</AccordionItem>
					</Accordion>
				) : (
					<>
						{[
							{
								title: "Account",
								icon: User2,
								label: "",
								href: "/dashboard/server",
							},
							{
								title: "Server",
								icon: Computer,
								label: "",
								href: "/dashboard/users",
							},
							{
								title: "Users",
								icon: Users,
								label: "",
								href: "/dashboard/traefik",
							},
						].map((link, index) => {
							const isActive = router.pathname === link.href;
							return (
								<Tooltip key={index} delayDuration={0}>
									<TooltipTrigger asChild>
										<Link
											href={link.href}
											className={cn(
												buttonVariants({ variant: "ghost", size: "icon" }),
												"h-9 w-9",
												isActive &&
													"dark:bg-muted dark:text-muted-foreground dark:hover:bg-muted dark:hover:text-white",
											)}
										>
											<link.icon className="h-4 w-4" />
											<span className="sr-only">{link.title}</span>
										</Link>
									</TooltipTrigger>
									<TooltipContent
										side="right"
										className="flex items-center gap-4"
									>
										{link.title}
										{link.label && (
											<span className="ml-auto text-muted-foreground">
												{link.label}
											</span>
										)}
									</TooltipContent>
								</Tooltip>
							);
						})}
					</>
				)} */}
			</nav>
		</div>
	);
};
