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
	Building2,
	ChevronDown,
	ChevronRight,
	ChevronsUpDown,
	CircleHelp,
	ClipboardList,
	Clock,
	CreditCard,
	Folder,
	Forward,
	GalleryVerticalEnd,
	GitBranch,
	Globe,
	HardDrive,
	House,
	Key,
	KeyRound,
	LayoutGrid,
	Loader2,
	LogIn,
	type LucideIcon,
	Package,
	Palette,
	Search,
	Server,
	ShieldCheck,
	Smartphone,
	Star,
	Tags,
	Trash2,
	User,
	Users,
	Vault,
	X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import {
	SIDEBAR_COOKIE_NAME,
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarHeader,
	SidebarInput,
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
// `quick` renders unlabeled at the top, the rest as labeled, collapsible
// sections.
type Menu = {
	quick: NavItem[];
	platform: NavItem[];
	settings: NavItem[];
	help: ExternalLink[];
};

const NAV_ROW =
	"h-9 gap-2.5 rounded-lg px-2.5 text-sm data-active:ring-1 data-active:ring-sidebar-border data-active:ring-inset";
const NAV_ICON = "text-sidebar-foreground/60";
const SECTION_LABEL =
	"flex h-7 w-full items-center gap-1 rounded-md px-1.5 text-[11px] font-semibold tracking-wider text-sidebar-foreground/50 uppercase transition-colors hover:text-sidebar-foreground/80 group-data-[collapsible=icon]:hidden";

// Menu items
// The items are filtered based on the user's role and permissions
// The `isEnabled` function is called to determine if the item should be displayed
const MENU: Menu = {
	quick: [
		{
			isSingle: true,
			title: "Home",
			url: "/dashboard/home",
			icon: House,
		},
		{
			isSingle: true,
			title: "Projects",
			url: "/dashboard/projects",
			icon: Folder,
		},
		{
			isSingle: true,
			title: "Overview",
			url: "/dashboard/overview",
			icon: LayoutGrid,
			// Only enabled for users with access to services
			isEnabled: ({ permissions }) => !!permissions?.service.read,
		},
	],

	platform: [
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
			isEnabled: ({ permissions }) => !!permissions?.organization.update,
		},
		{
			isSingle: true,
			title: "Traefik File System",
			url: "/dashboard/traefik",
			icon: GalleryVerticalEnd,
			// Only enabled for users with access to Traefik files
			isEnabled: ({ permissions }) => !!permissions?.traefikFiles.read,
		},
		{
			isSingle: true,
			title: "Docker",
			url: "/dashboard/docker",
			icon: BlocksIcon,
			// Only enabled for users with access to Docker
			isEnabled: ({ permissions }) => !!permissions?.docker.read,
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
	],

	// Settings are grouped by concern so the section stays scannable: the flat
	// list had grown to 21 entries with no hierarchy.
	settings: [
		{
			isSingle: false,
			title: "Account",
			icon: User,
			items: [
				{
					title: "Profile",
					url: "/dashboard/settings/profile",
					icon: User,
				},
				{
					title: "Sessions",
					url: "/dashboard/settings/sessions",
					icon: Smartphone,
				},
			],
		},
		{
			isSingle: false,
			title: "Infrastructure",
			icon: Server,
			items: [
				{
					title: "Web Server",
					url: "/dashboard/settings/server",
					icon: Activity,
					// Only enabled for admins in non-cloud environments
					isEnabled: ({ permissions, isCloud }) =>
						!!(permissions?.organization.update && !isCloud),
				},
				{
					title: "Remote Servers",
					url: "/dashboard/settings/servers",
					icon: Server,
					isEnabled: ({ permissions }) => !!permissions?.server.read,
				},
				{
					title: "Deployments",
					url: "/dashboard/settings/deployments",
					icon: Boxes,
					isEnabled: ({ permissions, isCloud }) =>
						!!(permissions?.server.read && !isCloud),
				},
				{
					title: "Certificates",
					url: "/dashboard/settings/certificates",
					icon: ShieldCheck,
					isEnabled: ({ permissions }) => !!permissions?.certificate.read,
				},
			],
		},
		{
			isSingle: false,
			title: "Credentials",
			icon: KeyRound,
			items: [
				{
					title: "SSH Keys",
					url: "/dashboard/settings/ssh-keys",
					icon: KeyRound,
					// Only enabled for users with access to SSH keys
					isEnabled: ({ permissions }) => !!permissions?.sshKeys.read,
				},
				{
					title: "Secrets",
					url: "/dashboard/settings/secrets",
					icon: Vault,
					isEnabled: ({ permissions }) => !!permissions?.vaultProvider.create,
				},
			],
		},
		{
			isSingle: false,
			title: "Integrations",
			icon: BlocksIcon,
			items: [
				{
					title: "Git",
					url: "/dashboard/settings/git-providers",
					icon: GitBranch,
					// Only enabled for users with access to Git providers
					isEnabled: ({ permissions }) => !!permissions?.gitProviders.read,
				},
				{
					title: "Registry",
					url: "/dashboard/settings/registry",
					icon: Package,
					isEnabled: ({ permissions }) => !!permissions?.registry.read,
				},
				{
					title: "S3 Destinations",
					url: "/dashboard/settings/destinations",
					icon: HardDrive,
					isEnabled: ({ permissions }) => !!permissions?.destination.read,
				},
				{
					title: "DNS Providers",
					url: "/dashboard/settings/dns",
					icon: Globe,
					isEnabled: ({ permissions }) => !!permissions?.dnsProvider.read,
				},
				{
					title: "Notifications",
					url: "/dashboard/settings/notifications",
					icon: Bell,
					// Only enabled for users with access to notifications
					isEnabled: ({ permissions }) => !!permissions?.notification.read,
				},
				{
					title: "AI",
					url: "/dashboard/settings/ai",
					icon: BotIcon,
					isEnabled: ({ permissions }) => !!permissions?.organization.update,
				},
			],
		},
		{
			isSingle: false,
			title: "Organization",
			icon: Building2,
			items: [
				{
					title: "Users",
					url: "/dashboard/settings/users",
					icon: Users,
					// Only enabled for users with member.read permission
					isEnabled: ({ permissions }) => !!permissions?.member.read,
				},
				{
					title: "Audit Logs",
					url: "/dashboard/settings/audit-logs",
					icon: ClipboardList,
					isEnabled: ({ permissions }) => !!permissions?.auditLog.read,
				},
				{
					title: "Tags",
					url: "/dashboard/settings/tags",
					icon: Tags,
					isEnabled: ({ permissions }) => !!permissions?.tag.read,
				},
				{
					title: "SSO",
					url: "/dashboard/settings/sso",
					icon: LogIn,
					// Enabled for admins in both cloud and self-hosted (enterprise)
					isEnabled: ({ permissions }) => !!permissions?.organization.update,
				},
				{
					title: "Whitelabeling",
					url: "/dashboard/settings/whitelabeling",
					icon: Palette,
					// Only enabled for owners in non-cloud environments (enterprise)
					isEnabled: ({ auth, isCloud }) =>
						!!(auth?.role === "owner" && !isCloud),
				},
				{
					title: "Billing",
					url: "/dashboard/settings/billing",
					icon: CreditCard,
					// Only enabled for owners in cloud environments
					isEnabled: ({ auth, isCloud }) =>
						!!(auth?.role === "owner" && isCloud),
				},
				{
					title: "License",
					url: "/dashboard/settings/license",
					icon: Key,
					// Only enabled for owners
					isEnabled: ({ auth }) => !!(auth?.role === "owner"),
				},
			],
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

	// Groups are filtered recursively, then dropped when every child is denied,
	// so a group never renders as an empty expandable row.
	const filterNavItems = (items: readonly NavItem[]): NavItem[] =>
		filterEnabled(items).reduce<NavItem[]>((acc, item) => {
			if (item.isSingle !== false) {
				acc.push(item);
				return acc;
			}

			const subItems = filterEnabled(item.items);
			if (subItems.length) {
				acc.push({ ...item, items: subItems });
			}
			return acc;
		}, []);

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
		quick: filterNavItems(MENU.quick),
		platform: filterNavItems(MENU.platform),
		settings: filterNavItems(MENU.settings),
		help: helpItems,
	};
}

/**
 * Determines if an item url is active based on the current pathname
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
 * @returns the active item along with the title of its group, if it has one
 */
function findActiveNavItem(
	navItems: NavItem[],
	pathname: string,
): { item: SingleNavItem; groupTitle?: string } | undefined {
	for (const navItem of navItems) {
		if (navItem.isSingle !== false) {
			if (isActiveRoute({ itemUrl: navItem.url, pathname })) {
				return { item: navItem };
			}
			continue;
		}

		const subItem = navItem.items.find((item) =>
			isActiveRoute({ itemUrl: item.url, pathname }),
		);

		if (subItem) {
			return { item: subItem, groupTitle: navItem.title };
		}
	}

	return undefined;
}

/**
 * Narrows the nav tree down to the items matching a search query.
 * A group matches either by its own title (keeping all its children) or by any
 * of its children.
 */
function searchNavItems(items: NavItem[], query: string): NavItem[] {
	const needle = query.trim().toLowerCase();
	if (!needle) return items;

	const matches = (title: string) => title.toLowerCase().includes(needle);

	return items.reduce<NavItem[]>((acc, item) => {
		if (item.isSingle !== false) {
			if (matches(item.title)) {
				acc.push(item);
			}
			return acc;
		}

		if (matches(item.title)) {
			acc.push(item);
			return acc;
		}

		const subItems = item.items.filter((subItem) => matches(subItem.title));
		if (subItems.length) {
			acc.push({ ...item, items: subItems });
		}
		return acc;
	}, []);
}

function searchExternalLinks(
	items: ExternalLink[],
	query: string,
): ExternalLink[] {
	const needle = query.trim().toLowerCase();
	if (!needle) return items;

	return items.filter((item) => item.name.toLowerCase().includes(needle));
}

/** True while the sidebar is showing icons only. */
function useIsIconMode() {
	const { state, isMobile } = useSidebar();
	return state === "collapsed" && !isMobile;
}

/** A single destination row, or an expandable group of destinations. */
function NavEntry({
	item,
	pathname,
	forceOpen,
}: {
	item: NavItem;
	pathname: string;
	forceOpen?: boolean;
}) {
	const isIconMode = useIsIconMode();

	if (item.isSingle !== false) {
		const isActive = isActiveRoute({ itemUrl: item.url, pathname });

		return (
			<SidebarMenuItem>
				<SidebarMenuButton
					asChild
					isActive={isActive}
					tooltip={item.title}
					className={NAV_ROW}
				>
					<Link href={item.url}>
						{item.icon && (
							<item.icon className={cn(NAV_ICON, isActive && "text-primary")} />
						)}
						<span className={cn(isActive && "font-medium")}>{item.title}</span>
					</Link>
				</SidebarMenuButton>
			</SidebarMenuItem>
		);
	}

	const isActive = item.items.some((subItem) =>
		isActiveRoute({ itemUrl: subItem.url, pathname }),
	);

	// `SidebarMenuSub` is hidden in icon mode, so the children need somewhere
	// else to go or the group becomes a dead end.
	if (isIconMode) {
		return (
			<SidebarMenuItem>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<SidebarMenuButton isActive={isActive} className={NAV_ROW}>
							<item.icon className={cn(NAV_ICON, isActive && "text-primary")} />
							<span>{item.title}</span>
						</SidebarMenuButton>
					</DropdownMenuTrigger>
					<DropdownMenuContent side="right" align="start" className="w-56">
						<DropdownMenuLabel>{item.title}</DropdownMenuLabel>
						{item.items.map((subItem) => {
							const isSubActive = isActiveRoute({
								itemUrl: subItem.url,
								pathname,
							});

							return (
								<DropdownMenuItem key={subItem.title} asChild>
									<Link
										href={subItem.url}
										className={cn(
											"flex items-center gap-2",
											isSubActive && "font-medium text-primary",
										)}
									>
										{subItem.icon && <subItem.icon className="size-4" />}
										<span>{subItem.title}</span>
									</Link>
								</DropdownMenuItem>
							);
						})}
					</DropdownMenuContent>
				</DropdownMenu>
			</SidebarMenuItem>
		);
	}

	return (
		<Collapsible
			asChild
			defaultOpen={isActive}
			open={forceOpen || undefined}
			className="group/collapsible"
		>
			<SidebarMenuItem>
				<CollapsibleTrigger asChild>
					<SidebarMenuButton isActive={isActive} className={NAV_ROW}>
						<item.icon className={cn(NAV_ICON, isActive && "text-primary")} />
						<span className={cn(isActive && "font-medium")}>{item.title}</span>
						<ChevronRight className="ml-auto size-3.5! text-sidebar-foreground/40 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
					</SidebarMenuButton>
				</CollapsibleTrigger>
				<CollapsibleContent>
					<SidebarMenuSub className="mx-0 border-none px-0 pl-6">
						{item.items.map((subItem) => {
							const isSubActive = isActiveRoute({
								itemUrl: subItem.url,
								pathname,
							});

							return (
								<SidebarMenuSubItem key={subItem.title}>
									<SidebarMenuSubButton
										asChild
										isActive={isSubActive}
										className="h-8 gap-2.5 rounded-lg px-2.5 data-active:ring-1 data-active:ring-sidebar-border data-active:ring-inset"
									>
										<Link href={subItem.url}>
											{subItem.icon && (
												<subItem.icon
													className={cn(
														"text-sidebar-foreground/60!",
														isSubActive && "text-primary!",
													)}
												/>
											)}
											<span className={cn(isSubActive && "font-medium")}>
												{subItem.title}
											</span>
										</Link>
									</SidebarMenuSubButton>
								</SidebarMenuSubItem>
							);
						})}
					</SidebarMenuSub>
				</CollapsibleContent>
			</SidebarMenuItem>
		</Collapsible>
	);
}

/** A labeled, collapsible block of nav entries. */
function NavSection({
	label,
	forceOpen,
	children,
}: {
	label: string;
	forceOpen?: boolean;
	children: React.ReactNode;
}) {
	const isIconMode = useIsIconMode();

	return (
		<Collapsible
			defaultOpen
			// A section the user collapsed would otherwise unmount its rows, leaving
			// nothing but a hidden label once the sidebar shrinks to icons.
			open={forceOpen || isIconMode || undefined}
			className="group/section"
		>
			<SidebarGroup className="gap-1 px-2 py-2">
				<CollapsibleTrigger className={SECTION_LABEL}>
					<ChevronDown className="size-3.5 shrink-0 transition-transform duration-200 group-data-[state=closed]/section:-rotate-90" />
					{label}
				</CollapsibleTrigger>
				<CollapsibleContent>
					<SidebarMenu className="gap-0.5">{children}</SidebarMenu>
				</CollapsibleContent>
			</SidebarGroup>
		</Collapsible>
	);
}

function OrganizationSwitcher() {
	const { isMobile } = useSidebar();
	const isIconMode = useIsIconMode();
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
	const { data: activeOrganization } = api.organization.active.useQuery();
	const { data: haveValidLicense } =
		api.licenseKey.haveValidLicenseKey.useQuery();

	const [organizationSelectorOpen, setOrganizationSelectorOpen] =
		useState(false);

	if (isLoading) {
		return (
			<div className="flex h-9 flex-1 items-center justify-center text-muted-foreground">
				<Loader2 className="size-4 animate-spin" />
			</div>
		);
	}

	return (
		<Popover
			open={organizationSelectorOpen}
			onOpenChange={setOrganizationSelectorOpen}
		>
			<PopoverTrigger asChild>
				<button
					type="button"
					aria-label={activeOrganization?.name ?? "Select organization"}
					className={cn(
						"flex min-w-0 items-center gap-2 rounded-lg text-left transition-colors hover:bg-sidebar-accent data-[state=open]:bg-sidebar-accent",
						isIconMode ? "size-8 justify-center" : "h-9 flex-1 px-1.5",
					)}
				>
					<div className="flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-background">
						<Logo
							className="size-4"
							logoUrl={activeOrganization?.logo || undefined}
						/>
					</div>
					{!isIconMode && (
						<>
							<span className="truncate text-sm font-semibold">
								{activeOrganization?.name ?? "Select Organization"}
							</span>
							{haveValidLicense && (
								<Badge variant="blue" className="shrink-0">
									Enterprise
								</Badge>
							)}
							<ChevronsUpDown className="ml-auto size-3.5 shrink-0 text-sidebar-foreground/50" />
						</>
					)}
				</button>
			</PopoverTrigger>
			<PopoverContent
				className="w-96 p-0"
				align="start"
				side={isMobile ? "bottom" : "right"}
				sideOffset={4}
			>
				<Command>
					<CommandInput placeholder="Search organizations..." className="h-9" />
					<CommandList className="max-h-[min(60vh,24rem)]">
						<CommandEmpty>No organizations found.</CommandEmpty>
						<CommandGroup heading="Organizations">
							{organizations?.map((org) => {
								const isDefault = org.members?.[0]?.isDefault ?? false;
								return (
									<CommandItem
										key={org.id}
										value={org.name}
										onSelect={async () => {
											setOrganizationSelectorOpen(false);
											await authClient.organization.setActive({
												organizationId: org.id,
											});
											window.location.reload();
										}}
										className="flex items-center justify-between gap-1"
									>
										<div className="flex min-w-0 flex-1 items-center gap-2">
											<div className="flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-sm border">
												<Logo
													className="size-4"
													logoUrl={org.logo ?? undefined}
												/>
											</div>
											<span className="truncate">{org.name}</span>
										</div>

										<div
											className="flex shrink-0 items-center gap-2"
											onClick={(e) => e.stopPropagation()}
											onKeyDown={(e) => e.stopPropagation()}
										>
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
													isDefault ? "Default organization" : "Set as default"
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
														className="size-4 text-gray-400 transition-colors group-hover:text-blue-500"
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
									</CommandItem>
								);
							})}
						</CommandGroup>
					</CommandList>
					{(user?.role === "owner" || user?.role === "admin" || isCloud) && (
						<div className="border-t p-1">
							<AddOrganization />
						</div>
					)}
				</Command>
			</PopoverContent>
		</Popover>
	);
}

function InvitationsBell() {
	const { isMobile } = useSidebar();
	const isIconMode = useIsIconMode();
	const { data: invitations, refetch: refetchInvitations } =
		api.user.getInvitations.useQuery();
	const { refetch: refetchOrganizations } = api.organization.all.useQuery();

	const pendingCount = invitations?.length ?? 0;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					aria-label={
						pendingCount > 0
							? `${pendingCount} pending invitations`
							: "Pending invitations"
					}
					className={cn(
						"relative flex shrink-0 items-center justify-center rounded-lg text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground data-[state=open]:bg-sidebar-accent",
						isIconMode ? "size-8" : "size-9",
					)}
				>
					<Bell className="size-4" />
					{pendingCount > 0 && (
						<span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-blue-500 text-[10px] font-medium text-white">
							{pendingCount}
						</span>
					)}
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align={isMobile ? "center" : "start"}
				side={isMobile ? "bottom" : "right"}
				className="w-80"
			>
				<DropdownMenuLabel>Pending Invitations</DropdownMenuLabel>
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
										Expires: {new Date(invitation.expiresAt).toLocaleString()}
									</div>
									<div className="text-xs text-muted-foreground">
										Role: {invitation.role}
									</div>
								</DropdownMenuItem>
								<DialogAction
									title="Accept Invitation"
									description="Are you sure you want to accept this invitation?"
									type="default"
									onClick={async () => {
										const { error } =
											await authClient.organization.acceptInvitation({
												invitationId: invitation.id,
											});

										if (error) {
											toast.error(
												error.message || "Error accepting invitation",
											);
										} else {
											toast.success("Invitation accepted successfully");
											await refetchInvitations();
											await refetchOrganizations();
										}
									}}
								>
									<Button size="sm" variant="secondary">
										Accept Invitation
									</Button>
								</DialogAction>
							</div>
						))
					) : (
						<DropdownMenuItem disabled>No pending invitations</DropdownMenuItem>
					)}
				</div>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

/**
 * Organization switcher, invitations, collapse control and the nav filter.
 * Collapses from two rows into a single centered icon column.
 */
function SidebarNavHeader({
	search,
	onSearchChange,
	focusRequested,
	onFocusHandled,
	onExpand,
}: {
	search: string;
	onSearchChange: (value: string) => void;
	focusRequested: boolean;
	onFocusHandled: () => void;
	onExpand: () => void;
}) {
	const isIconMode = useIsIconMode();
	const inputRef = useRef<HTMLInputElement>(null);

	// The input is display:none while collapsed, so focusing has to wait for the
	// expanded render.
	useEffect(() => {
		if (focusRequested && !isIconMode) {
			inputRef.current?.focus();
			onFocusHandled();
		}
	}, [focusRequested, isIconMode, onFocusHandled]);

	return (
		<SidebarHeader className="gap-0 p-0">
			{/* h-14 plus a bottom border mirrors the content header, so the two
			    rules meet at the same y offset. */}
			<div
				className={cn(
					"flex h-14 shrink-0 items-center border-b border-sidebar-border px-2",
					isIconMode ? "justify-center" : "gap-1",
				)}
			>
				<OrganizationSwitcher />
				{!isIconMode && <InvitationsBell />}
			</div>

			{isIconMode ? (
				<SidebarMenu className="gap-1 p-2">
					<SidebarMenuItem className="flex justify-center">
						<InvitationsBell />
					</SidebarMenuItem>
					<SidebarMenuItem>
						<SidebarMenuButton
							tooltip="Search"
							className={NAV_ROW}
							onClick={onExpand}
						>
							<Search className={NAV_ICON} />
							<span>Search</span>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			) : (
				<div className="relative m-2">
					<Search className="pointer-events-none absolute top-1/2 left-2.5 z-10 size-3.5 -translate-y-1/2 text-sidebar-foreground/40" />
					<SidebarInput
						ref={inputRef}
						value={search}
						onChange={(event) => onSearchChange(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Escape") {
								onSearchChange("");
								event.currentTarget.blur();
							}
						}}
						placeholder="Search"
						aria-label="Search navigation"
						className="h-9 rounded-lg border-transparent bg-sidebar-accent/60 pr-8 pl-8"
					/>
					{search ? (
						<Button
							type="button"
							variant="ghost"
							size="icon-xs"
							aria-label="Clear search"
							className="absolute top-1/2 right-1 z-10 -translate-y-1/2 text-sidebar-foreground/50"
							onClick={() => {
								onSearchChange("");
								inputRef.current?.focus();
							}}
						>
							<X className="size-3.5" />
						</Button>
					) : (
						<kbd className="pointer-events-none absolute top-1/2 right-2.5 z-10 -translate-y-1/2 text-xs text-sidebar-foreground/40">
							/
						</kbd>
					)}
				</div>
			)}
		</SidebarHeader>
	);
}

function MobileCloser() {
	const pathname = usePathname();
	const { setOpenMobile, isMobile } = useSidebar();

	useEffect(() => {
		if (isMobile) {
			setOpenMobile(false);
		}
	}, [pathname, isMobile, setOpenMobile]);

	return null;
}

interface Props {
	children: React.ReactNode;
}

export default function Page({ children }: Props) {
	const [defaultOpen, setDefaultOpen] = useState<boolean | undefined>(
		undefined,
	);
	const [isLoaded, setIsLoaded] = useState(false);
	const [search, setSearch] = useState("");
	const [focusSearchRequested, setFocusSearchRequested] = useState(false);

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

	const includesProjects = pathname?.includes("/dashboard/project");
	const { data: isCloud } = api.settings.isCloud.useQuery();

	const { quick, platform, settings, help } = createMenuForAuthUser({
		auth,
		permissions,
		isCloud: !!isCloud,
		whitelabeling,
	});

	const activeItem = findActiveNavItem(
		[...quick, ...platform, ...settings],
		pathname,
	);

	const isSearching = search.trim().length > 0;
	const visibleQuick = searchNavItems(quick, search);
	const visiblePlatform = searchNavItems(platform, search);
	const visibleSettings = searchNavItems(settings, search);
	const visibleHelp = searchExternalLinks(help, search);
	const hasResults =
		visibleQuick.length > 0 ||
		visiblePlatform.length > 0 ||
		visibleSettings.length > 0 ||
		visibleHelp.length > 0;

	const requestSearchFocus = useCallback(() => {
		setDefaultOpen(true);
		setFocusSearchRequested(true);
	}, []);

	const handleFocusHandled = useCallback(
		() => setFocusSearchRequested(false),
		[],
	);

	// "/" is the shortcut advertised next to the search field.
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "/" || event.metaKey || event.ctrlKey) return;

			const target = event.target as HTMLElement | null;
			if (
				target?.isContentEditable ||
				["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "")
			) {
				return;
			}

			event.preventDefault();
			requestSearchFocus();
		};

		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [requestSearchFocus]);

	if (!isLoaded) {
		return <div className="h-screen w-full bg-background" />;
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
					"--sidebar-width": "17.5rem",
					"--sidebar-width-mobile": "19.5rem",
				} as React.CSSProperties
			}
		>
			<MobileCloser />
			<Sidebar collapsible="icon" variant="sidebar">
				<SidebarNavHeader
					search={search}
					onSearchChange={setSearch}
					focusRequested={focusSearchRequested}
					onFocusHandled={handleFocusHandled}
					onExpand={requestSearchFocus}
				/>

				<SidebarContent className="gap-0">
					{visibleQuick.length > 0 && (
						<SidebarGroup className="gap-1 border-b border-sidebar-border px-2 py-2">
							<SidebarMenu className="gap-0.5">
								{visibleQuick.map((item) => (
									<NavEntry
										key={item.title}
										item={item}
										pathname={pathname}
										forceOpen={isSearching}
									/>
								))}
							</SidebarMenu>
						</SidebarGroup>
					)}

					{visiblePlatform.length > 0 && (
						<div className="border-b border-sidebar-border">
							<NavSection label="Platform" forceOpen={isSearching}>
								{visiblePlatform.map((item) => (
									<NavEntry
										key={item.title}
										item={item}
										pathname={pathname}
										forceOpen={isSearching}
									/>
								))}
							</NavSection>
						</div>
					)}

					{visibleSettings.length > 0 && (
						<div className="border-b border-sidebar-border">
							<NavSection label="Settings" forceOpen={isSearching}>
								{visibleSettings.map((item) => (
									<NavEntry
										key={item.title}
										item={item}
										pathname={pathname}
										forceOpen={isSearching}
									/>
								))}
							</NavSection>
						</div>
					)}

					{visibleHelp.length > 0 && (
						<NavSection label="Help" forceOpen={isSearching}>
							{visibleHelp.map((item) => (
								<SidebarMenuItem key={item.name}>
									<SidebarMenuButton
										asChild
										tooltip={item.name}
										className={NAV_ROW}
									>
										<a
											href={item.url}
											target="_blank"
											rel="noopener noreferrer"
										>
											<item.icon className={NAV_ICON} />
											<span>{item.name}</span>
										</a>
									</SidebarMenuButton>
								</SidebarMenuItem>
							))}
						</NavSection>
					)}

					{isSearching && !hasResults && (
						<div className="px-4 py-6 text-center text-sm text-sidebar-foreground/60 group-data-[collapsible=icon]:hidden">
							No matches for “{search.trim()}”
						</div>
					)}
				</SidebarContent>

				<SidebarFooter className="gap-2 border-t border-sidebar-border p-2">
					{!isCloud && permissions?.organization.update && (
						<SidebarMenu>
							<SidebarMenuItem>
								<UpdateServerButton />
							</SidebarMenuItem>
						</SidebarMenu>
					)}
					{(whitelabeling?.footerText || dokployVersion) && (
						<div className="flex flex-col items-center gap-0.5 text-[11px] text-sidebar-foreground/40 group-data-[collapsible=icon]:hidden">
							{whitelabeling?.footerText && (
								<span>{whitelabeling.footerText}</span>
							)}
							{dokployVersion && <span>Version {dokployVersion}</span>}
						</div>
					)}
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
					<header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 backdrop-blur-sm transition-[width,height] ease-linear">
						<div className="flex w-full items-center justify-between gap-2 px-4">
							<div className="flex min-w-0 items-center gap-2">
								<SidebarTrigger className="-ml-1" />
								<Separator orientation="vertical" className="mr-1 h-4" />
								<Breadcrumb>
									<BreadcrumbList>
										{activeItem?.groupTitle && (
											<>
												<BreadcrumbItem className="hidden sm:block">
													{activeItem.groupTitle}
												</BreadcrumbItem>
												<BreadcrumbSeparator className="hidden sm:block" />
											</>
										)}
										<BreadcrumbItem>
											<BreadcrumbPage className="truncate font-medium">
												{activeItem?.item.title}
											</BreadcrumbPage>
										</BreadcrumbItem>
									</BreadcrumbList>
								</Breadcrumb>
							</div>
							<div className="flex shrink-0 items-center gap-2">
								{!isCloud && <TimeBadge />}
								<UserNav compact />
							</div>
						</div>
					</header>
				)}

				<div className="flex w-full flex-col p-4">{children}</div>
			</SidebarInset>
		</SidebarProvider>
	);
}
