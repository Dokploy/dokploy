"use client";
import type { inferRouterOutputs } from "@trpc/server";
import {
	Activity,
	BarChartHorizontalBigIcon,
	Bell,
	BlocksIcon,
	BookIcon,
	BotIcon,
	Boxes,
	ChevronRight,
	ChevronsUpDown,
	CircleHelp,
	ClipboardList,
	Clock,
	CreditCard,
	Database,
	Folder,
	Forward,
	GalleryVerticalEnd,
	GitBranch,
	Key,
	KeyRound,
	Loader2,
	LogIn,
	type LucideIcon,
	Package,
	Palette,
	PieChart,
	Rocket,
	Server,
	ShieldCheck,
	Star,
	Tags,
	Trash2,
	User,
	Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
} from "@/components/ui/breadcrumb";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import type { AppRouter } from "@/server/api/root";
import { api } from "@/utils/api";
import { AddOrganization } from "../dashboard/organization/handle-organization";
import { DialogAction } from "../shared/dialog-action";
import { Logo } from "../shared/logo";
import { Button } from "../ui/button";
import { TimeBadge } from "../ui/time-badge";
import { NotificationBell } from "./notification-bell";
import { UpdateServerButton } from "./update-server";
import { UserNav } from "./user-nav";

// The types of the queries we are going to use
type AuthQueryOutput = inferRouterOutputs<AppRouter>["user"]["get"];
type PermissionsOutput =
	inferRouterOutputs<AppRouter>["user"]["getPermissions"];

type EnabledOpts = {
	auth?: AuthQueryOutput;
	permissions?: PermissionsOutput;
	isCloud: boolean;
};

type SingleNavItem = {
	isSingle?: true;
	title: string;
	url: string;
	icon?: LucideIcon;
	isEnabled?: (opts: EnabledOpts) => boolean;
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
			isEnabled?: (opts: EnabledOpts) => boolean;
	  };

// ExternalLink type
// Represents an external link item (used for the help section)
type ExternalLink = {
	name: string;
	url: string;
	icon: React.ComponentType<{ className?: string }>;
	isEnabled?: (opts: EnabledOpts) => boolean;
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
			title: "Deployments",
			url: "/dashboard/deployments",
			icon: Rocket,
			isEnabled: ({ permissions }) => !!permissions?.deployment.read,
		},
		{
			isSingle: true,
			title: "Monitoring",
			url: "/dashboard/monitoring",
			icon: BarChartHorizontalBigIcon,
			// Only enabled in non-cloud environments and if user has monitoring.read
			isEnabled: ({ isCloud, permissions }) =>
				!isCloud && !!permissions?.monitoring.read,
		},
		{
			isSingle: true,
			title: "Schedules",
			url: "/dashboard/schedules",
			icon: Clock,
			// Only enabled in non-cloud environments
			isEnabled: ({ isCloud, permissions }) =>
				!isCloud && !!permissions?.organization.update,
		},
		{
			isSingle: true,
			title: "Traefik File System",
			url: "/dashboard/traefik",
			icon: GalleryVerticalEnd,
			// Only enabled for users with access to Traefik files in non-cloud environments
			isEnabled: ({ permissions, isCloud }) =>
				!!(permissions?.traefikFiles.read && !isCloud),
		},
		{
			isSingle: true,
			title: "Docker",
			url: "/dashboard/docker",
			icon: BlocksIcon,
			// Only enabled for users with access to Docker in non-cloud environments
			isEnabled: ({ permissions, isCloud }) =>
				!!(permissions?.docker.read && !isCloud),
		},
		{
			isSingle: true,
			title: "Swarm",
			url: "/dashboard/swarm",
			icon: PieChart,
			// Only enabled for users with access to Docker in non-cloud environments
			isEnabled: ({ permissions, isCloud }) =>
				!!(permissions?.docker.read && !isCloud),
		},
		{
			isSingle: true,
			title: "Requests",
			url: "/dashboard/requests",
			icon: Forward,
			// Only enabled for users with access to Docker in non-cloud environments
			isEnabled: ({ permissions, isCloud }) =>
				!!(permissions?.docker.read && !isCloud),
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
			isEnabled: ({ permissions, isCloud }) =>
				!!(permissions?.organization.update && !isCloud),
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
			isEnabled: ({ permissions }) => !!permissions?.server.read,
		},
		{
			isSingle: true,
			title: "Users",
			icon: Users,
			url: "/dashboard/settings/users",
			// Only enabled for users with member.read permission
			isEnabled: ({ permissions }) => !!permissions?.member.read,
		},
		{
			isSingle: true,
			title: "Audit Logs",
			icon: ClipboardList,
			url: "/dashboard/settings/audit-logs",
			isEnabled: ({ permissions }) => !!permissions?.auditLog.read,
		},
		{
			isSingle: true,
			title: "SSH Keys",
			icon: KeyRound,
			url: "/dashboard/settings/ssh-keys",
			// Only enabled for users with access to SSH keys
			isEnabled: ({ permissions }) => !!permissions?.sshKeys.read,
		},
		{
			title: "AI",
			icon: BotIcon,
			url: "/dashboard/settings/ai",
			isSingle: true,
			isEnabled: ({ permissions }) => !!permissions?.organization.update,
		},
		{
			isSingle: true,
			title: "Tags",
			url: "/dashboard/settings/tags",
			icon: Tags,
			isEnabled: ({ permissions }) => !!permissions?.tag.read,
		},
		{
			isSingle: true,
			title: "Git",
			url: "/dashboard/settings/git-providers",
			icon: GitBranch,
			// Only enabled for users with access to Git providers
			isEnabled: ({ permissions }) => !!permissions?.gitProviders.read,
		},
		{
			isSingle: true,
			title: "Registry",
			url: "/dashboard/settings/registry",
			icon: Package,
			isEnabled: ({ permissions }) => !!permissions?.registry.read,
		},
		{
			isSingle: true,
			title: "S3 Destinations",
			url: "/dashboard/settings/destinations",
			icon: Database,
			isEnabled: ({ permissions }) => !!permissions?.destination.read,
		},

		{
			isSingle: true,
			title: "Certificates",
			url: "/dashboard/settings/certificates",
			icon: ShieldCheck,
			isEnabled: ({ permissions }) => !!permissions?.certificate.read,
		},
		{
			isSingle: true,
			title: "Cluster",
			url: "/dashboard/settings/cluster",
			icon: Boxes,
			// Only enabled for admins in non-cloud environments
			isEnabled: ({ permissions, isCloud }) =>
				!!(permissions?.organization.update && !isCloud),
		},
		{
			isSingle: true,
			title: "Notifications",
			url: "/dashboard/settings/notifications",
			icon: Bell,
			// Only enabled for users with access to notifications
			isEnabled: ({ permissions }) => !!permissions?.notification.read,
		},
		{
			isSingle: true,
			title: "Billing",
			url: "/dashboard/settings/billing",
			icon: CreditCard,
			// Only enabled for owners in cloud environments
			isEnabled: ({ auth, isCloud }) => !!(auth?.role === "owner" && isCloud),
		},
		{
			isSingle: true,
			title: "License",
			url: "/dashboard/settings/license",
			icon: Key,
			// Only enabled for owners
			isEnabled: ({ auth }) => !!(auth?.role === "owner"),
		},
		{
			isSingle: true,
			title: "SSO",
			url: "/dashboard/settings/sso",
			icon: LogIn,
			// Enabled for admins in both cloud and self-hosted (enterprise)
			isEnabled: ({ permissions }) => !!permissions?.organization.update,
		},
		{
			isSingle: true,
			title: "Whitelabeling",
			url: "/dashboard/settings/whitelabeling",
			icon: Palette,
			// Only enabled for owners in non-cloud environments (enterprise)
			isEnabled: ({ auth, isCloud }) => !!(auth?.role === "owner" && !isCloud),
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
	],
} as const;

/**
 * Creates a menu based on the current user's role and permissions
 * @returns a menu object with the home, settings, and help items
 */
function createMenuForAuthUser(opts: {
	auth?: AuthQueryOutput;
	permissions?: PermissionsOutput;
	isCloud: boolean;
	whitelabeling?: {
		docsUrl?: string | null;
		supportUrl?: string | null;
	} | null;
}): Menu {
	const filterEnabled = <
		T extends {
			isEnabled?: (o: EnabledOpts) => boolean;
		},
	>(
		items: readonly T[],
	): T[] =>
		items.filter((item) =>
			!item.isEnabled
				? true
				: item.isEnabled({
						auth: opts.auth,
						permissions: opts.permissions,
						isCloud: opts.isCloud,
					}),
		) as T[];

	// Apply whitelabeling URL overrides to help items
	const helpItems = filterEnabled(MENU.help).map((item) => {
		if (opts.whitelabeling?.docsUrl && item.name === "Documentation") {
			return { ...item, url: opts.whitelabeling.docsUrl };
		}
		if (opts.whitelabeling?.supportUrl && item.name === "Support") {
			return { ...item, url: opts.whitelabeling.supportUrl };
		}
		return item;
	});

	return {
		home: filterEnabled(MENU.home),
		settings: filterEnabled(MENU.settings),
		help: helpItems,
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
	const { data: isCloud } = api.settings.isCloud.useQuery();
	const { data: user } = api.user.get.useQuery();
	const { data: session } = api.user.session.useQuery();
	const {
		data: organizations,
		refetch,
		isLoading,
	} = api.organization.all.useQuery();
	const { mutateAsync: deleteOrganization, isPending: isRemoving } =
		api.organization.delete.useMutation();
	const { mutateAsync: setDefaultOrganization, isPending: isSettingDefault } =
		api.organization.setDefault.useMutation();
	const { isMobile } = useSidebar();
	const isCollapsed = state === "collapsed" && !isMobile;
	const { data: activeOrganization } = api.organization.active.useQuery();

	const { data: invitations, refetch: refetchInvitations } =
		api.user.getInvitations.useQuery();

	const [_activeTeam, setActiveTeam] = useState<
		typeof activeOrganization | null
	>(null);

	useEffect(() => {
		if (activeOrganization) {
			setActiveTeam(activeOrganization);
		}
	}, [activeOrganization]);

	return (
		<>
			{isLoading ? (
				<div className="flex flex-row gap-2 items-center justify-center text-sm text-muted-foreground min-h-[5vh] pt-4">
					<Loader2 className="animate-spin size-4" />
				</div>
			) : (
				<SidebarMenu
					className={cn(
						"flex gap-2",
						isCollapsed ? "flex-col" : "flex-row justify-between items-center",
					)}
				>
					{/* Organization Logo and Selector */}
					<SidebarMenuItem className={"w-full"}>
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<SidebarMenuButton
									size={isCollapsed ? "sm" : "lg"}
									className={cn(
										"data-[state=open]:-accent data-[state=open]:text-sidebar-accent-foreground",
										isCollapsed &&
											"flex justify-center items-center p-2 h-10 w-10 mx-auto",
									)}
								>
									<div
										className={cn(
											"flex items-center gap-2",
											isCollapsed && "justify-center",
										)}
									>
										<div
											className={cn(
												"flex items-center justify-center rounded-sm border",
												"size-6",
											)}
										>
											<Logo
												className={cn(
													"transition-all",
													isCollapsed ? "size-4" : "size-5",
												)}
												logoUrl={activeOrganization?.logo || undefined}
											/>
										</div>
										<div
											className={cn(
												"flex flex-col items-start",
												isCollapsed && "hidden",
											)}
										>
											<p className="text-sm font-medium leading-none">
												{activeOrganization?.name ?? "Select Organization"}
											</p>
										</div>
									</div>
									<ChevronsUpDown
										className={cn("ml-auto", isCollapsed && "hidden")}
									/>
								</SidebarMenuButton>
							</DropdownMenuTrigger>
							<DropdownMenuContent
								className="rounded-lg max-h-[min(70vh,28rem)] flex flex-col"
								align="start"
								side={isMobile ? "bottom" : "right"}
								sideOffset={4}
							>
								<DropdownMenuLabel className="text-xs text-muted-foreground shrink-0">
									Organizations
								</DropdownMenuLabel>
								<div className="overflow-y-auto overflow-x-hidden min-h-0 -mx-1 px-1">
									{organizations?.map((org) => {
										const isDefault = org.members?.[0]?.isDefault ?? false;
										return (
											<div
												className="flex flex-row justify-between"
												key={org.name}
											>
												<DropdownMenuItem
													onClick={async () => {
														await authClient.organization.setActive({
															organizationId: org.id,
														});
														window.location.reload();
													}}
													className="w-full gap-2 p-2"
												>
													<div className="flex flex-col gap-1">
														<div className="flex items-center gap-2">
															{org.name}
														</div>
													</div>
													<div className="flex size-6 items-center justify-center rounded-sm border">
														<Logo
															className={cn(
																"transition-all",
																state === "collapsed" ? "size-6" : "size-10",
															)}
															logoUrl={org.logo ?? undefined}
														/>
													</div>
												</DropdownMenuItem>

												<div className="flex items-center gap-2">
													<Button
														variant="ghost"
														size="icon"
														className={cn(
															"group",
															isDefault
																? "hover:bg-yellow-500/10"
																: "hover:bg-blue-500/10",
														)}
														isLoading={isSettingDefault && !isDefault}
														disabled={isDefault}
														onClick={async (e) => {
															if (isDefault) return;
															e.stopPropagation();
															await setDefaultOrganization({
																organizationId: org.id,
															})
																.then(() => {
																	refetch();
																	toast.success("Default organization updated");
																})
																.catch((error) => {
																	toast.error(
																		error?.message ||
																			"Error setting default organization",
																	);
																});
														}}
														title={
															isDefault
																? "Default organization"
																: "Set as default"
														}
													>
														{isDefault ? (
															<Star
																fill="#eab308"
																stroke="#eab308"
																className="size-4 text-yellow-500"
															/>
														) : (
															<Star
																fill="none"
																stroke="currentColor"
																className="size-4 text-gray-400 group-hover:text-blue-500 transition-colors"
															/>
														)}
													</Button>
													{org.ownerId === session?.user?.id && (
														<>
															<AddOrganization organizationId={org.id} />
															<DialogAction
																title="Delete Organization"
																description="Are you sure you want to delete this organization?"
																type="destructive"
																onClick={async () => {
																	await deleteOrganization({
																		organizationId: org.id,
																	})
																		.then(() => {
																			refetch();
																			toast.success(
																				"Organization deleted successfully",
																			);
																		})
																		.catch((error) => {
																			toast.error(
																				error?.message ||
																					"Error deleting organization",
																			);
																		});
																}}
															>
																<Button
																	variant="ghost"
																	size="icon"
																	className="group hover:bg-red-500/10"
																	isLoading={isRemoving}
																>
																	<Trash2 className="size-4 text-primary group-hover:text-red-500" />
																</Button>
															</DialogAction>
														</>
													)}
												</div>
											</div>
										);
									})}
								</div>
								{(user?.role === "owner" ||
									user?.role === "admin" ||
									isCloud) && (
									<>
										<DropdownMenuSeparator />
										<AddOrganization />
									</>
								)}
							</DropdownMenuContent>
						</DropdownMenu>
					</SidebarMenuItem>
				</SidebarMenu>
			)}
		</>
	);
}

export default function Page({ children }: Props) {
	const [defaultOpen, setDefaultOpen] = useState<boolean | undefined>(
		undefined,
	);
	const [isLoaded, setIsLoaded] = useState(false);

	useEffect(() => {
		const cookieValue = document.cookie
			.split("; ")
			.find((row) => row.startsWith(`${SIDEBAR_COOKIE_NAME}=`))
			?.split("=")[1];

		setDefaultOpen(cookieValue === undefined ? true : cookieValue === "true");
		setIsLoaded(true);
	}, []);

	const pathname = usePathname();
	const { data: auth } = api.user.get.useQuery();
	const { data: permissions } = api.user.getPermissions.useQuery();
	const { data: dokployVersion } = api.settings.getDokployVersion.useQuery();
	const { data: whitelabeling } = api.whitelabeling.get.useQuery(undefined, {
		staleTime: 5 * 60 * 1000,
		refetchOnWindowFocus: false,
	});

	const hasOwnBreadcrumb =
		pathname?.includes("/dashboard/project") ||
		pathname?.includes("/dashboard/deployments") ||
		pathname?.includes("/dashboard/monitoring") ||
		pathname?.includes("/dashboard/schedules") ||
		pathname?.includes("/dashboard/traefik") ||
		pathname?.includes("/dashboard/docker") ||
		pathname?.includes("/dashboard/swarm") ||
		pathname?.includes("/dashboard/requests");
	const { data: isCloud } = api.settings.isCloud.useQuery();

	const {
		home: filteredHome,
		settings: filteredSettings,
		help,
	} = createMenuForAuthUser({
		auth,
		permissions,
		isCloud: !!isCloud,
		whitelabeling,
	});

	const activeItem = findActiveNavItem(
		[...filteredHome, ...filteredSettings],
		pathname,
	);

	if (!isLoaded) {
		return <div className="w-full h-screen bg-background" />; // Placeholder mientras se carga
	}

	return (
		<SidebarProvider
			defaultOpen={defaultOpen}
			open={defaultOpen}
			onOpenChange={(open) => {
				setDefaultOpen(open);

				// biome-ignore lint/suspicious/noDocumentCookie: this sets the cookie to keep the sidebar state.
				document.cookie = `${SIDEBAR_COOKIE_NAME}=${open}`;
			}}
			style={
				{
					"--sidebar-width": "16rem",
					"--sidebar-width-mobile": "18rem",
				} as React.CSSProperties
			}
		>
			<Sidebar collapsible="icon" variant="sidebar">
				<SidebarHeader>
					{/* <SidebarMenuButton
						className="group-data-[collapsible=icon]:!p-0"
						size="lg"
					> */}
					<LogoWrapper />
					{/* </SidebarMenuButton> */}
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
						<SidebarMenu className="gap-1">
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
						</SidebarMenu>
					</SidebarGroup>
				</SidebarContent>
				<SidebarFooter>
					<SidebarMenu className="flex flex-col gap-2">
						{!isCloud && permissions?.organization.update && (
							<SidebarMenuItem>
								<UpdateServerButton />
							</SidebarMenuItem>
						)}
						<SidebarMenuItem>
							<UserNav />
						</SidebarMenuItem>
						{whitelabeling?.footerText && (
							<div className="px-3 text-xs text-muted-foreground text-center group-data-[collapsible=icon]:hidden">
								{whitelabeling.footerText}
							</div>
						)}
						{dokployVersion && (
							<div className="px-3 text-xs text-muted-foreground text-center group-data-[collapsible=icon]:hidden">
								Version {dokployVersion}
							</div>
						)}
					</SidebarMenu>
				</SidebarFooter>
				<SidebarRail />
			</Sidebar>
			<SidebarInset>
				{!hasOwnBreadcrumb && (
					<header className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-2 border-b bg-background/90 backdrop-blur px-4">
						<SidebarTrigger className="-ml-1" />
						<Separator orientation="vertical" className="mr-2 h-4" />
						<div className="flex items-center gap-1.5 overflow-hidden whitespace-nowrap text-sm">
							<Breadcrumb>
								<BreadcrumbList>
									<BreadcrumbItem className="block">
										<BreadcrumbLink asChild>
											<Link
												href={activeItem?.url || "/"}
												className="flex items-center gap-1.5 font-medium"
											>
												{activeItem?.title}
											</Link>
										</BreadcrumbLink>
									</BreadcrumbItem>
								</BreadcrumbList>
							</Breadcrumb>
						</div>
						<div className="ml-auto flex items-center gap-2">
							{!isCloud && <TimeBadge />}
							<NotificationBell />
						</div>
					</header>
				)}

				<main
					className={cn(
						"flex-1 overflow-y-auto px-4 pb-6",
						!hasOwnBreadcrumb && "pt-6",
					)}
				>
					{children}
				</main>
			</SidebarInset>
		</SidebarProvider>
	);
}
