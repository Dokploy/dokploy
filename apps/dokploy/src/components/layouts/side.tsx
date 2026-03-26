"use client";
import type { inferRouterOutputs } from "@trpc/server";
import {
	Activity,
	BarChart2,
	Bell,
	BlocksIcon,
	BotIcon,
	BookOpen,
	Boxes,
	ChevronRight,
	ChevronsUpDown,
	ClipboardList,
	Clock,
	CreditCard,
	Database,
	Folder,
	FolderOpen,
	Forward,
	GalleryVerticalEnd,
	GitBranch,
	Globe,
	Key,
	KeyRound,
	Loader2,
	LogIn,
	MessageCircle,
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
import { useTranslations } from "next-intl";
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
	SidebarSeparator,
	SidebarTrigger,
	useSidebar,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import type { AppRouter } from "@/server/api/root";
import { api } from "@/utils/api";
import { AddOrganization } from "../dashboard/organization/handle-organization";
import { DialogAction } from "../shared/dialog-action";
import { Logo } from "../shared/logo";
import { Button } from "../ui/button";
import { TimeBadge } from "../ui/time-badge";
import { UpdateServerButton } from "./update-server";
import { SidebarUserCard } from "./sidebar-user-card";

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
			title: "dashboard.projects",
			url: "/dashboard/projects",
			icon: FolderOpen,
		},
		{
			isSingle: true,
			title: "dashboard.deployments",
			url: "/dashboard/deployments",
			icon: Rocket,
			isEnabled: ({ permissions }) => !!permissions?.deployment.read,
		},
		{
			isSingle: true,
			title: "dashboard.monitoring",
			url: "/dashboard/monitoring",
			icon: BarChart2,
			// Only enabled in non-cloud environments and if user has monitoring.read
			isEnabled: ({ isCloud, permissions }) =>
				!isCloud && !!permissions?.monitoring.read,
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
			title: "dashboard.settings.profile",
			url: "/dashboard/settings/profile",
			icon: User,
		},
		{
			isSingle: true,
			title: "dashboard.settings.remoteServers",
			url: "/dashboard/settings/servers",
			icon: Server,
			isEnabled: ({ permissions }) => !!permissions?.server.read,
		},
		{
			isSingle: true,
			title: "dashboard.swarm",
			url: "/dashboard/swarm",
			icon: PieChart,
			isEnabled: ({ auth }) => auth?.role === "admin" || auth?.role === "owner",
		},
		{
			isSingle: true,
			title: "dashboard.settings.git",
			url: "/dashboard/settings/git-providers",
			icon: GitBranch,
			// Only enabled for users with access to Git providers
			isEnabled: ({ permissions }) => !!permissions?.gitProviders.read,
		},
		{
			isSingle: true,
			title: "dashboard.settings.sshKeys",
			icon: Key,
			url: "/dashboard/settings/ssh-keys",
			// Only enabled for users with access to SSH keys
			isEnabled: ({ permissions }) => !!permissions?.sshKeys.read,
		},
		{
			isSingle: true,
			title: "dashboard.settings.webServer",
			url: "/dashboard/settings/server",
			icon: Globe,
			// Only enabled for admins in non-cloud environments
			isEnabled: ({ permissions, isCloud }) =>
				!!(permissions?.organization.update && !isCloud),
		},
		{
			isSingle: true,
			title: "dashboard.settings.notifications",
			url: "/dashboard/settings/notifications",
			icon: Bell,
			// Only enabled for users with access to notifications
			isEnabled: ({ permissions }) => !!permissions?.notification.read,
		},
		{
			isSingle: true,
			title: "dashboard.settings.billing",
			url: "/dashboard/settings/billing",
			icon: CreditCard,
			// Only enabled for owners in cloud environments
			isEnabled: ({ auth, isCloud }) => !!(auth?.role === "owner" && isCloud),
		},
	],

	help: [
		{
			name: "help.documentation",
			url: "https://docs.dokploy.com",
			icon: BookOpen,
		},
		{
			name: "help.support",
			url: "https://t.me/double_cumboy",
			icon: MessageCircle,
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
		if (opts.whitelabeling?.docsUrl && item.name === "help.documentation") {
			return { ...item, url: opts.whitelabeling.docsUrl };
		}
		if (opts.whitelabeling?.supportUrl && item.name === "help.support") {
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
	const t = useTranslations("sidebar");
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
										"data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground",
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
												{activeOrganization?.name ?? t("selectOrganization")}
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
									{t("organizationsHeading")}
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
																	toast.success(t("toastDefaultOrgUpdated"));
																})
																.catch((error) => {
																	toast.error(
																		error?.message || t("toastDefaultOrgError"),
																	);
																});
														}}
														title={
															isDefault
																? t("tooltipDefaultOrg")
																: t("tooltipSetAsDefault")
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
																title={t("deleteOrgTitle")}
																description={t("deleteOrgDescription")}
																type="destructive"
																onClick={async () => {
																	await deleteOrganization({
																		organizationId: org.id,
																	})
																		.then(() => {
																			refetch();
																			toast.success(t("toastOrgDeleted"));
																		})
																		.catch((error) => {
																			toast.error(
																				error?.message ||
																					t("toastOrgDeleteError"),
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

					{/* Notification Bell */}
					<SidebarMenuItem className={cn(isCollapsed && "mt-2")}>
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									className={cn(
										"relative",
										isCollapsed && "h-8 w-8 p-1.5 mx-auto",
									)}
								>
									<Bell className="size-4" />
									{invitations && invitations.length > 0 && (
										<span className="absolute -top-0 -right-0 flex size-4 items-center justify-center rounded-full bg-blue-500 text-xs text-white">
											{invitations.length}
										</span>
									)}
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent
								align="start"
								side={"right"}
								className="w-80"
							>
								<DropdownMenuLabel>{t("pendingInvitations")}</DropdownMenuLabel>
								<div className="flex flex-col gap-2">
									{invitations && invitations.length > 0 ? (
										invitations.map((invitation) => (
											<div key={invitation.id} className="flex flex-col gap-2">
												<DropdownMenuItem
													className="flex flex-col items-start gap-1 p-3"
													onSelect={(e) => e.preventDefault()}
												>
													<div className="font-medium">
														{invitation?.organization?.name}
													</div>
													<div className="text-xs text-muted-foreground">
														{t("expiresLabel")}:{" "}
														{new Date(invitation.expiresAt).toLocaleString()}
													</div>
													<div className="text-xs text-muted-foreground">
														{t("roleLabel")}: {invitation.role}
													</div>
												</DropdownMenuItem>
												<DialogAction
													title={t("acceptInvitationTitle")}
													description={t("acceptInvitationDescription")}
													type="default"
													onClick={async () => {
														const { error } =
															await authClient.organization.acceptInvitation({
																invitationId: invitation.id,
															});

														if (error) {
															toast.error(
																error.message || t("toastAcceptInviteError"),
															);
														} else {
															toast.success(t("toastAcceptInviteSuccess"));
															await refetchInvitations();
															await refetch();
														}
													}}
												>
													<Button size="sm" variant="secondary">
														{t("acceptInvitationButton")}
													</Button>
												</DialogAction>
											</div>
										))
									) : (
										<DropdownMenuItem disabled>
											{t("noPendingInvitations")}
										</DropdownMenuItem>
									)}
								</div>
							</DropdownMenuContent>
						</DropdownMenu>
					</SidebarMenuItem>
				</SidebarMenu>
			)}
		</>
	);
}

export default function Page({ children }: Props) {
	const t = useTranslations();
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
	const { data: subscription } = api.billing.getSubscription.useQuery();
	const { data: whitelabeling } = api.whitelabeling.get.useQuery(undefined, {
		staleTime: 5 * 60 * 1000,
		refetchOnWindowFocus: false,
	});

	const includesProjects = pathname?.includes("/dashboard/project");
	const { data: isCloud } = api.settings.isCloud.useQuery();
	const subscriptionPlan =
		subscription?.status === "active" ? subscription.plan : "free";
	const isFreePlan = subscriptionPlan === "free";

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
					"--sidebar-width": "19.5rem",
					"--sidebar-width-mobile": "19.5rem",
				} as React.CSSProperties
			}
		>
			<Sidebar collapsible="icon" variant="floating">
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
													tooltip={t(item.title)}
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
														<span>{t(item.title)}</span>
													</Link>
												</SidebarMenuButton>
											) : (
												<>
													<CollapsibleTrigger asChild>
														<SidebarMenuButton
															tooltip={t(item.title)}
															isActive={isActive}
														>
															{item.icon && <item.icon />}

															<span>{t(item.title)}</span>
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
																			<span>{t(subItem.title)}</span>
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
					<SidebarSeparator />
					<SidebarGroup>
						<SidebarGroupLabel>{t("common.settings")}</SidebarGroupLabel>
						<SidebarMenu className="gap-1">
							{filteredSettings.map((item) => {
								const isSingle = item.isSingle !== false;
								const itemUrl = isSingle ? item.url : null;
								const isActive = isSingle
									? isActiveRoute({ itemUrl: itemUrl ?? "", pathname })
									: item.items.some((item) =>
											isActiveRoute({ itemUrl: item.url, pathname }),
										);
								const showUpgrade =
									isFreePlan && itemUrl === "/dashboard/settings/billing";

								return (
									<Collapsible
										key={item.title}
										asChild
										defaultOpen={isActive}
										className="group/collapsible"
									>
										<SidebarMenuItem className={cn(showUpgrade && "relative")}>
											{isSingle ? (
												<>
													<SidebarMenuButton
														asChild
														tooltip={t(item.title)}
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
															<span>{t(item.title)}</span>
														</Link>
													</SidebarMenuButton>
													{showUpgrade && (
														<Link
															href="/dashboard/settings/billing"
															className="absolute right-2 top-1/2 -translate-y-1/2"
														>
															<Badge variant="green">↑ Upgrade</Badge>
														</Link>
													)}
												</>
											) : (
												<>
													<CollapsibleTrigger asChild>
														<SidebarMenuButton
															tooltip={t(item.title)}
															isActive={isActive}
														>
															{item.icon && <item.icon />}

															<span>{t(item.title)}</span>
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
																			<span>{t(subItem.title)}</span>
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
					<SidebarSeparator />
					<SidebarGroup className="group-data-[collapsible=icon]:hidden">
						<SidebarGroupLabel>{t("common.help")}</SidebarGroupLabel>
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
											<span>{t(item.name)}</span>
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
							<SidebarUserCard />
						</SidebarMenuItem>
						{whitelabeling?.footerText && (
							<div className="px-3 text-xs text-muted-foreground text-center group-data-[collapsible=icon]:hidden">
								{whitelabeling.footerText}
							</div>
						)}
						{/* {dokployVersion && (
							<div className="px-3 text-xs text-muted-foreground text-center group-data-[collapsible=icon]:hidden">
								Version {dokployVersion}
							</div>
						)} */}
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
													{activeItem ? t(activeItem.title) : null}
												</Link>
											</BreadcrumbLink>
										</BreadcrumbItem>
									</BreadcrumbList>
								</Breadcrumb>
							</div>
							{!isCloud && <TimeBadge />}
						</div>
					</header>
				)}

				<div className="flex flex-1 flex-col w-full p-4 pt-0">{children}</div>
			</SidebarInset>
		</SidebarProvider>
	);
}
