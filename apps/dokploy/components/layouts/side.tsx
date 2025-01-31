"use client";
import {
	Activity,
	BarChartHorizontalBigIcon,
	Bell,
	BlocksIcon,
	BookIcon,
	Boxes,
	ChevronRight,
	CircleHelp,
	CreditCard,
	Database,
	Folder,
	Forward,
	GalleryVerticalEnd,
	GitBranch,
	HeartIcon,
	KeyRound,
	type LucideIcon,
	Package,
	PieChart,
	Server,
	ShieldCheck,
	User,
	Users,
} from "lucide-react";
import { usePathname } from "next/navigation";
import type * as React from "react";
import { useEffect, useState } from "react";

import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import {
	SIDEBAR_COOKIE_NAME,
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarInset,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSub,
	SidebarMenuSubButton,
	SidebarMenuSubItem,
	SidebarProvider,
	SidebarRail,
	SidebarTrigger,
	useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import type { AppRouter } from "@/server/api/root";
import { api } from "@/utils/api";
import type { inferRouterOutputs } from "@trpc/server";
import Link from "next/link";
import { useRouter } from "next/router";
import { Logo } from "../shared/logo";
import { UpdateServerButton } from "./update-server";
import { UserNav } from "./user-nav";

// The types of the queries we are going to use
type AuthQueryOutput = inferRouterOutputs<AppRouter>["auth"]["get"];
type UserQueryOutput = inferRouterOutputs<AppRouter>["user"]["byAuthId"];

type SingleNavItem = {
	isSingle?: true;
	title: string;
	url: string;
	icon?: LucideIcon;
	isEnabled?: (opts: {
		auth?: AuthQueryOutput;
		user?: UserQueryOutput;
		isCloud: boolean;
	}) => boolean;
};

// NavItem type
// Consists of a single item or a group of items
// If `isSingle` is true or undefined, the item is a single item
// If `isSingle` is false, the item is a group of items
type NavItem =
	| SingleNavItem
	| {
			isSingle: false;
			title: string;
			icon: LucideIcon;
			items: SingleNavItem[];
			isEnabled?: (opts: {
				auth?: AuthQueryOutput;
				user?: UserQueryOutput;
				isCloud: boolean;
			}) => boolean;
	  };

// ExternalLink type
// Represents an external link item (used for the help section)
type ExternalLink = {
	name: string;
	url: string;
	icon: React.ComponentType<{ className?: string }>;
	isEnabled?: (opts: {
		auth?: AuthQueryOutput;
		user?: UserQueryOutput;
		isCloud: boolean;
	}) => boolean;
};

// Menu type
// Consists of home, settings, and help items
type Menu = {
	home: NavItem[];
	settings: NavItem[];
	help: ExternalLink[];
};

// Menu items
// Consists of unfiltered home, settings, and help items
// The items are filtered based on the user's role and permissions
// The `isEnabled` function is called to determine if the item should be displayed
const MENU: Menu = {
	home: [
		{
			isSingle: true,
			title: "Projects",
			url: "/dashboard/projects",
			icon: Folder,
		},
		{
			isSingle: true,
			title: "Monitoring",
			url: "/dashboard/monitoring",
			icon: BarChartHorizontalBigIcon,
			// Only enabled in non-cloud environments
			isEnabled: ({ auth, user, isCloud }) => !isCloud,
		},
		{
			isSingle: true,
			title: "Traefik File System",
			url: "/dashboard/traefik",
			icon: GalleryVerticalEnd,
			// Only enabled for admins and users with access to Traefik files in non-cloud environments
			isEnabled: ({ auth, user, isCloud }) =>
				!!(
					(auth?.rol === "admin" || user?.canAccessToTraefikFiles) &&
					!isCloud
				),
		},
		{
			isSingle: true,
			title: "Docker",
			url: "/dashboard/docker",
			icon: BlocksIcon,
			// Only enabled for admins and users with access to Docker in non-cloud environments
			isEnabled: ({ auth, user, isCloud }) =>
				!!((auth?.rol === "admin" || user?.canAccessToDocker) && !isCloud),
		},
		{
			isSingle: true,
			title: "Swarm",
			url: "/dashboard/swarm",
			icon: PieChart,
			// Only enabled for admins and users with access to Docker in non-cloud environments
			isEnabled: ({ auth, user, isCloud }) =>
				!!((auth?.rol === "admin" || user?.canAccessToDocker) && !isCloud),
		},
		{
			isSingle: true,
			title: "Requests",
			url: "/dashboard/requests",
			icon: Forward,
			// Only enabled for admins and users with access to Docker in non-cloud environments
			isEnabled: ({ auth, user, isCloud }) =>
				!!((auth?.rol === "admin" || user?.canAccessToDocker) && !isCloud),
		},

		// Legacy unused menu, adjusted to the new structure
		// {
		// 	isSingle: true,
		// 	title: "Projects",
		// 	url: "/dashboard/projects",
		// 	icon: Folder,
		// },
		// {
		// 	isSingle: true,
		// 	title: "Monitoring",
		// 	icon: BarChartHorizontalBigIcon,
		// 	url: "/dashboard/settings/monitoring",
		// },
		// {
		//   isSingle: false,
		//   title: "Settings",
		//   icon: Settings2,
		//   items: [
		//     {
		//       title: "Profile",
		//       url: "/dashboard/settings/profile",
		//     },
		//     {
		//       title: "Users",
		//       url: "/dashboard/settings/users",
		//     },
		//     {
		//       title: "SSH Key",
		//       url: "/dashboard/settings/ssh-keys",
		//     },
		//     {
		//       title: "Git",
		//       url: "/dashboard/settings/git-providers",
		//     },
		//   ],
		// },
		// {
		//   isSingle: false,
		//   title: "Integrations",
		//   icon: BlocksIcon,
		//   items: [
		//     {
		//       title: "S3 Destinations",
		//       url: "/dashboard/settings/destinations",
		//     },
		//     {
		//       title: "Registry",
		//       url: "/dashboard/settings/registry",
		//     },
		//     {
		//       title: "Notifications",
		//       url: "/dashboard/settings/notifications",
		//     },
		//   ],
		// },
	],

	settings: [
		{
			isSingle: true,
			title: "Web Server",
			url: "/dashboard/settings/server",
			icon: Activity,
			// Only enabled for admins in non-cloud environments
			isEnabled: ({ auth, user, isCloud }) =>
				!!(auth?.rol === "admin" && !isCloud),
		},
		{
			isSingle: true,
			title: "Profile",
			url: "/dashboard/settings/profile",
			icon: User,
		},
		{
			isSingle: true,
			title: "Remote Servers",
			url: "/dashboard/settings/servers",
			icon: Server,
			// Only enabled for admins
			isEnabled: ({ auth, user, isCloud }) => !!(auth?.rol === "admin"),
		},
		{
			isSingle: true,
			title: "Users",
			icon: Users,
			url: "/dashboard/settings/users",
			// Only enabled for admins
			isEnabled: ({ auth, user, isCloud }) => !!(auth?.rol === "admin"),
		},
		{
			isSingle: true,
			title: "SSH Keys",
			icon: KeyRound,
			url: "/dashboard/settings/ssh-keys",
			// Only enabled for admins and users with access to SSH keys
			isEnabled: ({ auth, user }) =>
				!!(auth?.rol === "admin" || user?.canAccessToSSHKeys),
		},
		{
			isSingle: true,
			title: "Git",
			url: "/dashboard/settings/git-providers",
			icon: GitBranch,
			// Only enabled for admins and users with access to Git providers
			isEnabled: ({ auth, user }) =>
				!!(auth?.rol === "admin" || user?.canAccessToGitProviders),
		},
		{
			isSingle: true,
			title: "Registry",
			url: "/dashboard/settings/registry",
			icon: Package,
			// Only enabled for admins
			isEnabled: ({ auth, user, isCloud }) => !!(auth?.rol === "admin"),
		},
		{
			isSingle: true,
			title: "S3 Destinations",
			url: "/dashboard/settings/destinations",
			icon: Database,
			// Only enabled for admins
			isEnabled: ({ auth, user, isCloud }) => !!(auth?.rol === "admin"),
		},

		{
			isSingle: true,
			title: "Certificates",
			url: "/dashboard/settings/certificates",
			icon: ShieldCheck,
			// Only enabled for admins
			isEnabled: ({ auth, user, isCloud }) => !!(auth?.rol === "admin"),
		},
		{
			isSingle: true,
			title: "Cluster",
			url: "/dashboard/settings/cluster",
			icon: Boxes,
			// Only enabled for admins in non-cloud environments
			isEnabled: ({ auth, user, isCloud }) =>
				!!(auth?.rol === "admin" && !isCloud),
		},
		{
			isSingle: true,
			title: "Notifications",
			url: "/dashboard/settings/notifications",
			icon: Bell,
			// Only enabled for admins
			isEnabled: ({ auth, user, isCloud }) => !!(auth?.rol === "admin"),
		},
		{
			isSingle: true,
			title: "Billing",
			url: "/dashboard/settings/billing",
			icon: CreditCard,
			// Only enabled for admins in cloud environments
			isEnabled: ({ auth, user, isCloud }) =>
				!!(auth?.rol === "admin" && isCloud),
		},
	],

	help: [
		{
			name: "Documentation",
			url: "https://docs.dokploy.com/docs/core",
			icon: BookIcon,
		},
		{
			name: "Support",
			url: "https://discord.gg/2tBnJ3jDJc",
			icon: CircleHelp,
		},
		{
			name: "Sponsor",
			url: "https://opencollective.com/dokploy",
			icon: ({ className }) => (
				<HeartIcon
					className={cn(
						"text-red-500 fill-red-600 animate-heartbeat",
						className,
					)}
				/>
			),
		},
	],
} as const;

/**
 * Creates a menu based on the current user's role and permissions
 * @returns a menu object with the home, settings, and help items
 */
function createMenuForAuthUser(opts: {
	auth?: AuthQueryOutput;
	user?: UserQueryOutput;
	isCloud: boolean;
}): Menu {
	return {
		// Filter the home items based on the user's role and permissions
		// Calls the `isEnabled` function if it exists to determine if the item should be displayed
		home: MENU.home.filter((item) =>
			!item.isEnabled
				? true
				: item.isEnabled({
						auth: opts.auth,
						user: opts.user,
						isCloud: opts.isCloud,
					}),
		),
		// Filter the settings items based on the user's role and permissions
		// Calls the `isEnabled` function if it exists to determine if the item should be displayed
		settings: MENU.settings.filter((item) =>
			!item.isEnabled
				? true
				: item.isEnabled({
						auth: opts.auth,
						user: opts.user,
						isCloud: opts.isCloud,
					}),
		),
		// Filter the help items based on the user's role and permissions
		// Calls the `isEnabled` function if it exists to determine if the item should be displayed
		help: MENU.help.filter((item) =>
			!item.isEnabled
				? true
				: item.isEnabled({
						auth: opts.auth,
						user: opts.user,
						isCloud: opts.isCloud,
					}),
		),
	};
}

/**
 * Determines if an item url is active based on the current pathname
 * @returns true if the item url is active, false otherwise
 */
function isActiveRoute(opts: {
	/** The url of the item. Usually obtained from `item.url` */
	itemUrl: string;
	/** The current pathname. Usually obtained from `usePathname()` */
	pathname: string;
}): boolean {
	const normalizedItemUrl = opts.itemUrl?.replace("/projects", "/project");
	const normalizedPathname = opts.pathname?.replace("/projects", "/project");

	if (!normalizedPathname) return false;

	if (normalizedPathname === normalizedItemUrl) return true;

	if (normalizedPathname.startsWith(normalizedItemUrl)) {
		const nextChar = normalizedPathname.charAt(normalizedItemUrl.length);
		return nextChar === "/";
	}

	return false;
}

/**
 * Finds the active nav item based on the current pathname
 * @returns the active nav item with `SingleNavItem` type or undefined if none is active
 */
function findActiveNavItem(
	navItems: NavItem[],
	pathname: string,
): SingleNavItem | undefined {
	const found = navItems.find((item) =>
		item.isSingle !== false
			? // The current item is single, so check if the item url is active
				isActiveRoute({ itemUrl: item.url, pathname })
			: // The current item is not single, so check if any of the sub items are active
				item.items.some((item) =>
					isActiveRoute({ itemUrl: item.url, pathname }),
				),
	);

	if (found?.isSingle !== false) {
		// The found item is single, so return it
		return found;
	}

	// The found item is not single, so find the active sub item
	return found?.items.find((item) =>
		isActiveRoute({ itemUrl: item.url, pathname }),
	);
}

interface Props {
	children: React.ReactNode;
}

function LogoWrapper() {
	return <SidebarLogo />;
}

function SidebarLogo() {
	const { state } = useSidebar();
	const { data: dokployVersion } = api.settings.getDokployVersion.useQuery();

	return (
		<Link
			href="/dashboard/projects"
			className="flex items-center gap-2 p-1 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground group-data-[collapsible=icon]/35 rounded-lg "
		>
			<div
				className={cn(
					"flex aspect-square items-center justify-center rounded-lg transition-all",
					state === "collapsed" ? "size-6" : "size-10",
				)}
			>
				<Logo
					className={cn(
						"transition-all",
						state === "collapsed" ? "size-6" : "size-10",
					)}
				/>
			</div>

			<div className="text-left text-sm leading-tight group-data-[state=open]/collapsible:rotate-90">
				<p className="truncate font-semibold">Dokploy</p>
				<p className="truncate text-xs text-muted-foreground">
					{dokployVersion}
				</p>
			</div>
		</Link>
	);
}

export default function Page({ children }: Props) {
	const [defaultOpen, setDefaultOpen] = useState<boolean | undefined>(
		undefined,
	);

	useEffect(() => {
		const cookieValue = document.cookie
			.split("; ")
			.find((row) => row.startsWith(`${SIDEBAR_COOKIE_NAME}=`))
			?.split("=")[1];

		setDefaultOpen(cookieValue === undefined ? true : cookieValue === "true");
	}, []);

	const router = useRouter();
	const pathname = usePathname();
	const currentPath = router.pathname;
	const { data: auth } = api.auth.get.useQuery();
	const { data: user } = api.user.byAuthId.useQuery(
		{
			authId: auth?.id || "",
		},
		{
			enabled: !!auth?.id && auth?.rol === "user",
		},
	);

	const includesProjects = pathname?.includes("/dashboard/project");
	const { data: isCloud, isLoading } = api.settings.isCloud.useQuery();

	const {
		home: filteredHome,
		settings: filteredSettings,
		help,
	} = createMenuForAuthUser({ auth, user, isCloud: !!isCloud });

	const activeItem = findActiveNavItem(
		[...filteredHome, ...filteredSettings],
		pathname,
	);

	// const showProjectsButton =
	//   currentPath === "/dashboard/projects" &&
	//   (auth?.rol === "admin" || user?.canCreateProjects);

	return (
		<SidebarProvider
			defaultOpen={defaultOpen}
			open={defaultOpen}
			onOpenChange={(open) => {
				setDefaultOpen(open);

				document.cookie = `${SIDEBAR_COOKIE_NAME}=${open}`;
			}}
			style={
				{
					"--sidebar-width": "19.5rem",
					"--sidebar-width-mobile": "19.5rem",
				} as React.CSSProperties
			}
		>
			<Sidebar collapsible="icon" variant="floating">
				<SidebarHeader>
					<SidebarMenuButton
						className="group-data-[collapsible=icon]:!p-0"
						size="lg"
					>
						<LogoWrapper />
					</SidebarMenuButton>
				</SidebarHeader>
				<SidebarContent>
					<SidebarGroup>
						<SidebarGroupLabel>Home</SidebarGroupLabel>
						<SidebarMenu>
							{filteredHome.map((item) => {
								const isSingle = item.isSingle !== false;
								const isActive = isSingle
									? isActiveRoute({ itemUrl: item.url, pathname })
									: item.items.some((item) =>
											isActiveRoute({ itemUrl: item.url, pathname }),
										);

								return (
									<Collapsible
										key={item.title}
										asChild
										defaultOpen={isActive}
										className="group/collapsible"
									>
										<SidebarMenuItem>
											{isSingle ? (
												<SidebarMenuButton
													asChild
													tooltip={item.title}
													className={cn(isActive && "bg-border")}
												>
													<Link
														href={item.url}
														className="flex w-full items-center gap-2"
													>
														{item.icon && (
															<item.icon
																className={cn(isActive && "text-primary")}
															/>
														)}
														<span>{item.title}</span>
													</Link>
												</SidebarMenuButton>
											) : (
												<>
													<CollapsibleTrigger asChild>
														<SidebarMenuButton
															tooltip={item.title}
															isActive={isActive}
														>
															{item.icon && <item.icon />}

															<span>{item.title}</span>
															{item.items?.length && (
																<ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
															)}
														</SidebarMenuButton>
													</CollapsibleTrigger>
													<CollapsibleContent>
														<SidebarMenuSub>
															{item.items?.map((subItem) => (
																<SidebarMenuSubItem key={subItem.title}>
																	<SidebarMenuSubButton
																		asChild
																		className={cn(isActive && "bg-border")}
																	>
																		<Link
																			href={subItem.url}
																			className="flex w-full items-center"
																		>
																			{subItem.icon && (
																				<span className="mr-2">
																					<subItem.icon
																						className={cn(
																							"h-4 w-4 text-muted-foreground",
																							isActive && "text-primary",
																						)}
																					/>
																				</span>
																			)}
																			<span>{subItem.title}</span>
																		</Link>
																	</SidebarMenuSubButton>
																</SidebarMenuSubItem>
															))}
														</SidebarMenuSub>
													</CollapsibleContent>
												</>
											)}
										</SidebarMenuItem>
									</Collapsible>
								);
							})}
						</SidebarMenu>
					</SidebarGroup>
					<SidebarGroup>
						<SidebarGroupLabel>Settings</SidebarGroupLabel>
						<SidebarMenu className="gap-2">
							{filteredSettings.map((item) => {
								const isSingle = item.isSingle !== false;
								const isActive = isSingle
									? isActiveRoute({ itemUrl: item.url, pathname })
									: item.items.some((item) =>
											isActiveRoute({ itemUrl: item.url, pathname }),
										);

								return (
									<Collapsible
										key={item.title}
										asChild
										defaultOpen={isActive}
										className="group/collapsible"
									>
										<SidebarMenuItem>
											{isSingle ? (
												<SidebarMenuButton
													asChild
													tooltip={item.title}
													className={cn(isActive && "bg-border")}
												>
													<Link
														href={item.url}
														className="flex w-full items-center gap-2"
													>
														{item.icon && (
															<item.icon
																className={cn(isActive && "text-primary")}
															/>
														)}
														<span>{item.title}</span>
													</Link>
												</SidebarMenuButton>
											) : (
												<>
													<CollapsibleTrigger asChild>
														<SidebarMenuButton
															tooltip={item.title}
															isActive={isActive}
														>
															{item.icon && <item.icon />}

															<span>{item.title}</span>
															{item.items?.length && (
																<ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
															)}
														</SidebarMenuButton>
													</CollapsibleTrigger>
													<CollapsibleContent>
														<SidebarMenuSub>
															{item.items?.map((subItem) => (
																<SidebarMenuSubItem key={subItem.title}>
																	<SidebarMenuSubButton
																		asChild
																		className={cn(isActive && "bg-border")}
																	>
																		<Link
																			href={subItem.url}
																			className="flex w-full items-center"
																		>
																			{subItem.icon && (
																				<span className="mr-2">
																					<subItem.icon
																						className={cn(
																							"h-4 w-4 text-muted-foreground",
																							isActive && "text-primary",
																						)}
																					/>
																				</span>
																			)}
																			<span>{subItem.title}</span>
																		</Link>
																	</SidebarMenuSubButton>
																</SidebarMenuSubItem>
															))}
														</SidebarMenuSub>
													</CollapsibleContent>
												</>
											)}
										</SidebarMenuItem>
									</Collapsible>
								);
							})}
						</SidebarMenu>
					</SidebarGroup>
					<SidebarGroup className="group-data-[collapsible=icon]:hidden">
						<SidebarGroupLabel>Extra</SidebarGroupLabel>
						<SidebarMenu>
							{help.map((item: ExternalLink) => (
								<SidebarMenuItem key={item.name}>
									<SidebarMenuButton asChild>
										<a
											href={item.url}
											target="_blank"
											rel="noopener noreferrer"
											className="flex w-full items-center gap-2"
										>
											<span className="mr-2">
												<item.icon className="h-4 w-4" />
											</span>
											<span>{item.name}</span>
										</a>
									</SidebarMenuButton>
								</SidebarMenuItem>
							))}
							{!isCloud && auth?.rol === "admin" && (
								<SidebarMenuItem>
									<SidebarMenuButton asChild>
										<UpdateServerButton />
									</SidebarMenuButton>
								</SidebarMenuItem>
							)}
						</SidebarMenu>
					</SidebarGroup>
				</SidebarContent>
				<SidebarFooter>
					<SidebarMenu>
						<SidebarMenuItem>
							<UserNav />
						</SidebarMenuItem>
					</SidebarMenu>
				</SidebarFooter>
				<SidebarRail />
			</Sidebar>
			<SidebarInset>
				{!includesProjects && (
					<header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
						<div className="flex items-center justify-between w-full px-4">
							<div className="flex items-center gap-2">
								<SidebarTrigger className="-ml-1" />
								<Separator orientation="vertical" className="mr-2 h-4" />
								<Breadcrumb>
									<BreadcrumbList>
										<BreadcrumbItem className="block">
											<BreadcrumbLink asChild>
												<Link
													href={activeItem?.url || "/"}
													className="flex items-center gap-1.5"
												>
													{activeItem?.title}
												</Link>
											</BreadcrumbLink>
										</BreadcrumbItem>
										<BreadcrumbSeparator className="block" />
										<BreadcrumbItem>
											<BreadcrumbPage>{activeItem?.title}</BreadcrumbPage>
										</BreadcrumbItem>
									</BreadcrumbList>
								</Breadcrumb>
							</div>
						</div>
					</header>
				)}

				<div className="flex flex-col w-full gap-4 p-4 pt-0">{children}</div>
			</SidebarInset>
		</SidebarProvider>
	);
}
