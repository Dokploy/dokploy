"use client";

import {
	Activity,
	AudioWaveform,
	BarChartHorizontalBigIcon,
	Bell,
	BlocksIcon,
	BookIcon,
	Boxes,
	ChevronRight,
	CircleHelp,
	Command,
	CreditCard,
	Database,
	Folder,
	Forward,
	GalleryVerticalEnd,
	GitBranch,
	HeartIcon,
	KeyRound,
	BotIcon,
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
import { api } from "@/utils/api";
import Link from "next/link";
import { useRouter } from "next/router";
import { Logo } from "../shared/logo";
import { UpdateServerButton } from "./update-server";
import { UserNav } from "./user-nav";
// This is sample data.
interface NavItem {
	title: string;
	url: string;
	icon: LucideIcon;
	isSingle: boolean;
	isActive: boolean;
	items?: {
		title: string;
		url: string;
		icon?: LucideIcon;
	}[];
}

interface ExternalLink {
	name: string;
	url: string;
	icon: React.ComponentType<{ className?: string }>;
}

const data = {
	user: {
		name: "shadcn",
		email: "m@example.com",
		avatar: "/avatars/shadcn.jpg",
	},
	teams: [
		{
			name: "Dokploy",
			logo: Logo,
			plan: "Enterprise",
		},
		{
			name: "Acme Corp.",
			logo: AudioWaveform,
			plan: "Startup",
		},
		{
			name: "Evil Corp.",
			logo: Command,
			plan: "Free",
		},
	],
	home: [
		{
			title: "Projects",
			url: "/dashboard/projects",
			icon: Folder,
			isSingle: true,
			isActive: false,
		},
		{
			title: "Monitoring",
			url: "/dashboard/monitoring",
			icon: BarChartHorizontalBigIcon,
			isSingle: true,
			isActive: false,
		},
		{
			title: "Traefik File System",
			url: "/dashboard/traefik",
			icon: GalleryVerticalEnd,
			isSingle: true,
			isActive: false,
		},
		{
			title: "Docker",
			url: "/dashboard/docker",
			icon: BlocksIcon,
			isSingle: true,
			isActive: false,
		},
		{
			title: "Swarm",
			url: "/dashboard/swarm",
			icon: PieChart,
			isSingle: true,
			isActive: false,
		},
		{
			title: "Requests",
			url: "/dashboard/requests",
			icon: Forward,
			isSingle: true,
			isActive: false,
		},

		// {
		// 	title: "Projects",
		// 	url: "/dashboard/projects",
		// 	icon: Folder,
		// 	isSingle: true,
		// },
		// {
		// 	title: "Monitoring",
		// 	icon: BarChartHorizontalBigIcon,
		// 	url: "/dashboard/settings/monitoring",
		// 	isSingle: true,
		// },

		// {
		// 	title: "Settings",
		// 	url: "#",
		// 	icon: Settings2,
		// 	isActive: true,
		// 	items: [
		// 		{
		// 			title: "Profile",
		// 			url: "/dashboard/settings/profile",
		// 		},
		// 		{
		// 			title: "Users",
		// 			url: "/dashboard/settings/users",
		// 		},
		// 		{
		// 			title: "SSH Key",
		// 			url: "/dashboard/settings/ssh-keys",
		// 		},
		// 		{
		// 			title: "Git",
		// 			url: "/dashboard/settings/git-providers",
		// 		},
		// 	],
		// },

		// {
		// 	title: "Integrations",
		// 	icon: BlocksIcon,
		// 	items: [
		// 		{
		// 			title: "S3 Destinations",
		// 			url: "/dashboard/settings/destinations",
		// 		},
		// 		{
		// 			title: "Registry",
		// 			url: "/dashboard/settings/registry",
		// 		},
		// 		{
		// 			title: "Notifications",
		// 			url: "/dashboard/settings/notifications",
		// 		},
		// 	],
	] as NavItem[],
	settings: [
		{
			title: "Server",
			url: "/dashboard/settings/server",
			icon: Activity,
			isSingle: true,
			isActive: false,
		},
		{
			title: "Profile",
			url: "/dashboard/settings/profile",
			icon: User,
			isSingle: true,
			isActive: false,
		},
		{
			title: "Servers",
			url: "/dashboard/settings/servers",
			icon: Server,
			isSingle: true,
			isActive: false,
		},
		{
			title: "Users",
			icon: Users,
			url: "/dashboard/settings/users",
			isSingle: true,
			isActive: false,
		},
		{
			title: "SSH Keys",
			icon: KeyRound,
			url: "/dashboard/settings/ssh-keys",
			isSingle: true,
			isActive: false,
		},
		{
			title: "AI",
			icon: BotIcon,
			url: "/dashboard/settings/ai",
			isSingle: true,
			isActive: false,
		},
		{
			title: "Git",
			url: "/dashboard/settings/git-providers",
			icon: GitBranch,
			isSingle: true,
			isActive: false,
		},
		{
			title: "Registry",
			url: "/dashboard/settings/registry",
			icon: Package,
			isSingle: true,
			isActive: false,
		},
		{
			title: "S3 Destinations",
			url: "/dashboard/settings/destinations",
			icon: Database,
			isSingle: true,
			isActive: false,
		},

		{
			title: "Certificates",
			url: "/dashboard/settings/certificates",
			icon: ShieldCheck,
			isSingle: true,
			isActive: false,
		},
		{
			title: "Cluster",
			url: "/dashboard/settings/cluster",
			icon: Boxes,
			isSingle: true,
			isActive: false,
		},
		{
			title: "Notifications",
			url: "/dashboard/settings/notifications",
			icon: Bell,
			isSingle: true,
			isActive: false,
		},
		{
			title: "Billing",
			url: "/dashboard/settings/billing",
			icon: CreditCard,
			isSingle: true,
			isActive: false,
		},
	] as NavItem[],
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
	] as ExternalLink[],
};

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
	const isActiveRoute = (itemUrl: string) => {
		const normalizedItemUrl = itemUrl?.replace("/projects", "/project");
		const normalizedPathname = pathname?.replace("/projects", "/project");

		if (!normalizedPathname) return false;

		if (normalizedPathname === normalizedItemUrl) return true;

		if (normalizedPathname.startsWith(normalizedItemUrl)) {
			const nextChar = normalizedPathname.charAt(normalizedItemUrl.length);
			return nextChar === "/";
		}

		return false;
	};

	let filteredHome = isCloud
		? data.home.filter(
				(item) =>
					![
						"/dashboard/monitoring",
						"/dashboard/traefik",
						"/dashboard/docker",
						"/dashboard/swarm",
						"/dashboard/requests",
					].includes(item.url),
			)
		: data.home;

	let filteredSettings = isCloud
		? data.settings.filter(
				(item) =>
					![
						"/dashboard/settings/server",
						"/dashboard/settings/cluster",
					].includes(item.url),
			)
		: data.settings.filter(
				(item) => !["/dashboard/settings/billing"].includes(item.url),
			);

	filteredHome = filteredHome.map((item) => ({
		...item,
		isActive: isActiveRoute(item.url),
	}));

	filteredSettings = filteredSettings.map((item) => ({
		...item,
		isActive: isActiveRoute(item.url),
	}));

	const activeItem =
		filteredHome.find((item) => item.isActive) ||
		filteredSettings.find((item) => item.isActive);

	const showProjectsButton =
		currentPath === "/dashboard/projects" &&
		(auth?.rol === "admin" || user?.canCreateProjects);

	return (
		<SidebarProvider
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
							{filteredHome.map((item) => (
								<Collapsible
									key={item.title}
									asChild
									defaultOpen={item.isActive}
									className="group/collapsible"
								>
									<SidebarMenuItem>
										{item.isSingle ? (
											<SidebarMenuButton
												asChild
												tooltip={item.title}
												className={cn(isActiveRoute(item.url) && "bg-border")}
											>
												<Link
													href={item.url}
													className="flex w-full items-center gap-2"
												>
													<item.icon
														className={cn(
															isActiveRoute(item.url) && "text-primary",
														)}
													/>
													<span>{item.title}</span>
												</Link>
											</SidebarMenuButton>
										) : (
											<>
												<CollapsibleTrigger asChild>
													<SidebarMenuButton
														tooltip={item.title}
														isActive={item.isActive}
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
																	className={cn(
																		isActiveRoute(subItem.url) && "bg-border",
																	)}
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
																						isActiveRoute(subItem.url) &&
																							"text-primary",
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
							))}
						</SidebarMenu>
					</SidebarGroup>
					<SidebarGroup>
						<SidebarGroupLabel>Settings</SidebarGroupLabel>
						<SidebarMenu className="gap-2">
							{filteredSettings.map((item) => (
								<Collapsible
									key={item.title}
									asChild
									defaultOpen={item.isActive}
									className="group/collapsible"
								>
									<SidebarMenuItem>
										{item.isSingle ? (
											<SidebarMenuButton
												asChild
												tooltip={item.title}
												className={cn(isActiveRoute(item.url) && "bg-border")}
											>
												<Link
													href={item.url}
													className="flex w-full items-center gap-2"
												>
													<item.icon
														className={cn(
															isActiveRoute(item.url) && "text-primary",
														)}
													/>
													<span>{item.title}</span>
												</Link>
											</SidebarMenuButton>
										) : (
											<>
												<CollapsibleTrigger asChild>
													<SidebarMenuButton
														tooltip={item.title}
														isActive={item.isActive}
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
																	className={cn(
																		isActiveRoute(subItem.url) && "bg-border",
																	)}
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
																						isActiveRoute(subItem.url) &&
																							"text-primary",
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
							))}
						</SidebarMenu>
					</SidebarGroup>
					<SidebarGroup className="group-data-[collapsible=icon]:hidden">
						<SidebarGroupLabel>Extra</SidebarGroupLabel>
						<SidebarMenu>
							{data.help.map((item: ExternalLink) => (
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
							{!isCloud && (
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
										<BreadcrumbItem className="hidden md:block">
											<BreadcrumbLink asChild>
												<Link
													href={activeItem?.url || "/"}
													className="flex items-center gap-1.5"
												>
													{activeItem?.title}
												</Link>
											</BreadcrumbLink>
										</BreadcrumbItem>
										<BreadcrumbSeparator className="hidden md:block" />
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
