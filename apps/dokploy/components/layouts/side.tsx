"use client";

import {
	AudioWaveform,
	BadgeCheck,
	Bell,
	BlocksIcon,
	BookIcon,
	BookOpen,
	Bot,
	ChevronRight,
	ChevronsUpDown,
	CogIcon,
	Command,
	CreditCard,
	Folder,
	Forward,
	Frame,
	GalleryVerticalEnd,
	LogOut,
	MoreHorizontal,
	PieChart,
	Plus,
	Settings2,
	ShieldCheck,
	Sparkles,
	Trash2,
	User,
	Users,
	KeyRound,
	GitBranch,
	Server,
	Package,
	Database,
	Settings,
	BarChartHorizontalBigIcon,
	Heart,
	type LucideIcon,
	Activity,
} from "lucide-react";
import * as React from "react";
import { usePathname } from "next/navigation";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
	SidebarMenuAction,
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
import { Logo } from "../shared/logo";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api } from "@/utils/api";
import { useRouter } from "next/router";
import { AddProject } from "@/components/dashboard/projects/add";
import { ModeToggle } from "@/components/ui/modeToggle";
import { Languages } from "@/lib/languages";
import useLocale from "@/utils/hooks/use-locale";
import { useTranslation } from "next-i18next";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
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
	icon: LucideIcon;
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
			title: "File System",
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
		// },
		// {
		// 	title: "Appearance",
		// 	icon: Frame,
		// 	items: [
		// 		{
		// 			title: "Theme",
		// 			url: "/dashboard/settings/appearance",
		// 		},
		// 	],
		// },
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
			title: "Notifications",
			url: "/dashboard/settings/notifications",
			icon: Bell,
			isSingle: true,
			isActive: false,
		},
		// {
		// 	title: "Billing",
		// 	url: "/dashboard/settings/billing",
		// 	icon: CreditCard,
		// },

		// {
		// 	title: "Appearance",
		// 	url: "/dashboard/settings/appearance",
		// 	icon: Frame,
		// },
	] as NavItem[],
	projects: [
		{
			name: "Documentation",
			url: "https://docs.dokploy.com/docs/core",
			icon: BookIcon,
		},
		{
			name: "Support",
			url: "https://opencollective.com/dokploy",
			icon: Heart,
		},
		// {
		// 	name: "Sales & Marketing",
		// 	url: "#",
		// 	icon: PieChart,
		// },
		// {
		// 	name: "Travel",
		// 	url: "#",
		// 	icon: Map,
		// },
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
	return (
		<Link
			href="/dashboard/projects"
			className=" flex items-center gap-2 p-1 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground group-data-[collapsible=icon]/35 rounded-lg "
		>
			<div
				className={cn(
					"flex aspect-square items-center justify-center rounded-lg ",
					state === "collapsed" ? "size-6" : "size-10",
				)}
			>
				<Logo className={state === "collapsed" ? "size-6" : "size-10"} />
			</div>

			{state === "expanded" && (
				<div className="flex flex-col gap-1 text-left text-sm leading-tight group-data-[state=open]/collapsible:rotate-90">
					<span className="truncate font-semibold">Dokploy</span>
					<span className="truncate text-xs">v0.16.0</span>
				</div>
			)}
		</Link>
	);
}

export default function Page({ children }: Props) {
	const [activeTeam, setActiveTeam] = React.useState(data.teams[0]);
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
	const isActiveRoute = (itemUrl: string) => {
		// Normalizar las rutas para manejar el caso projects vs project
		const normalizedItemUrl = itemUrl.replace("/projects", "/project");
		const normalizedPathname = pathname?.replace("/projects", "/project");

		if (!normalizedPathname) return false;

		// Si las rutas son exactamente iguales
		if (normalizedPathname === normalizedItemUrl) return true;

		// Si la ruta actual es más larga, asegurarse que después del itemUrl viene un "/"
		if (normalizedPathname.startsWith(normalizedItemUrl)) {
			const nextChar = normalizedPathname.charAt(normalizedItemUrl.length);
			return nextChar === "/";
		}

		return false;
	};

	data.home = data.home.map((item) => ({
		...item,
		isActive: isActiveRoute(item.url),
	}));

	data.settings = data.settings.map((item) => ({
		...item,
		isActive: isActiveRoute(item.url),
	}));

	const activeItem =
		data.home.find((item) => item.isActive) ||
		data.settings.find((item) => item.isActive);

	const showProjectsButton =
		currentPath === "/dashboard/projects" &&
		(auth?.rol === "admin" || user?.canCreateProjects);

	const { data: dokployVersion } = api.settings.getDokployVersion.useQuery();

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
					<SidebarMenu>
						<SidebarMenuItem>
							<LogoWrapper />
						</SidebarMenuItem>
					</SidebarMenu>
				</SidebarHeader>
				<SidebarContent>
					<SidebarGroup>
						<SidebarGroupLabel>Home</SidebarGroupLabel>
						<SidebarMenu>
							{data.home.map((item) => (
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
							{data.settings.map((item) => (
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
							{data.projects.map((item) => (
								<SidebarMenuItem key={item.name}>
									<SidebarMenuButton asChild>
										<Link href={item.url}>
											<item.icon />
											<span>{item.name}</span>
										</Link>
									</SidebarMenuButton>
								</SidebarMenuItem>
							))}
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
				<div className="flex flex-1 flex-col gap-4 p-4 pt-0">{children}</div>
			</SidebarInset>
		</SidebarProvider>
	);
}

const AUTO_CHECK_UPDATES_INTERVAL_MINUTES = 7;

export const UserNav = () => {
	const [isUpdateAvailable, setIsUpdateAvailable] = useState<boolean>(false);
	const router = useRouter();
	const { data } = api.auth.get.useQuery();
	const { data: isCloud } = api.settings.isCloud.useQuery();
	const { data: user } = api.user.byAuthId.useQuery(
		{
			authId: data?.id || "",
		},
		{
			enabled: !!data?.id && data?.rol === "user",
		},
	);
	const { locale, setLocale } = useLocale();
	const { t } = useTranslation("settings");
	const { mutateAsync } = api.auth.logout.useMutation();
	const { mutateAsync: getUpdateData } =
		api.settings.getUpdateData.useMutation();

	const checkUpdatesIntervalRef = useRef<null | NodeJS.Timeout>(null);

	useEffect(() => {
		// Handling of automatic check for server updates
		if (isCloud) {
			return;
		}

		if (!localStorage.getItem("enableAutoCheckUpdates")) {
			// Enable auto update checking by default if user didn't change it
			localStorage.setItem("enableAutoCheckUpdates", "true");
		}

		const clearUpdatesInterval = () => {
			if (checkUpdatesIntervalRef.current) {
				clearInterval(checkUpdatesIntervalRef.current);
			}
		};

		const checkUpdates = async () => {
			try {
				if (localStorage.getItem("enableAutoCheckUpdates") !== "true") {
					return;
				}

				const { updateAvailable } = await getUpdateData();

				if (updateAvailable) {
					// Stop interval when update is available
					clearUpdatesInterval();
					setIsUpdateAvailable(true);
				}
			} catch (error) {
				console.error("Error auto-checking for updates:", error);
			}
		};

		checkUpdatesIntervalRef.current = setInterval(
			checkUpdates,
			AUTO_CHECK_UPDATES_INTERVAL_MINUTES * 60000,
		);

		// Also check for updates on initial page load
		checkUpdates();

		return () => {
			clearUpdatesInterval();
		};
	}, []);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<SidebarMenuButton
					size="lg"
					className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
				>
					<Avatar className="h-8 w-8 rounded-lg">
						<AvatarImage src={data?.image || ""} alt={data?.image || ""} />
						<AvatarFallback className="rounded-lg">CN</AvatarFallback>
					</Avatar>
					<div className="grid flex-1 text-left text-sm leading-tight">
						<span className="truncate font-semibold">Account</span>
						<span className="truncate text-xs">{data?.email}</span>
					</div>
					<ChevronsUpDown className="ml-auto size-4" />
				</SidebarMenuButton>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
				side="bottom"
				align="end"
				sideOffset={4}
			>
				<div className="flex items-center justify-between px-2 py-1.5">
					<DropdownMenuLabel className="flex flex-col">
						My Account
						<span className="text-xs font-normal text-muted-foreground">
							{data?.email}
						</span>
					</DropdownMenuLabel>
					<ModeToggle />
				</div>
				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<DropdownMenuItem
						className="cursor-pointer"
						onClick={() => {
							router.push("/dashboard/projects");
						}}
					>
						Projects
					</DropdownMenuItem>
					<DropdownMenuItem
						className="cursor-pointer"
						onClick={() => {
							router.push("/dashboard/monitoring");
						}}
					>
						Monitoring
					</DropdownMenuItem>
					{(data?.rol === "admin" || user?.canAccessToTraefikFiles) && (
						<DropdownMenuItem
							className="cursor-pointer"
							onClick={() => {
								router.push("/dashboard/traefik");
							}}
						>
							Traefik
						</DropdownMenuItem>
					)}
					{(data?.rol === "admin" || user?.canAccessToDocker) && (
						<DropdownMenuItem
							className="cursor-pointer"
							onClick={() => {
								router.push("/dashboard/docker", undefined, {
									shallow: true,
								});
							}}
						>
							Docker
						</DropdownMenuItem>
					)}

					<DropdownMenuItem
						className="cursor-pointer"
						onClick={() => {
							router.push("/dashboard/settings/server");
						}}
					>
						Settings
					</DropdownMenuItem>
				</DropdownMenuGroup>
				{isCloud && data?.rol === "admin" && (
					<DropdownMenuItem
						className="cursor-pointer"
						onClick={() => {
							router.push("/dashboard/settings/billing");
						}}
					>
						Billing
					</DropdownMenuItem>
				)}
				<DropdownMenuSeparator />
				<div className="flex items-center justify-between px-2 py-1.5">
					<DropdownMenuItem
						className="cursor-pointer"
						onClick={async () => {
							await mutateAsync().then(() => {
								router.push("/");
							});
						}}
					>
						Log out
					</DropdownMenuItem>
					<div className="w-32">
						<Select
							onValueChange={setLocale}
							defaultValue={locale}
							value={locale}
						>
							<SelectTrigger>
								<SelectValue placeholder="Select Language" />
							</SelectTrigger>
							<SelectContent>
								{Object.values(Languages).map((language) => (
									<SelectItem key={language.code} value={language.code}>
										{language.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</div>
			</DropdownMenuContent>
		</DropdownMenu>
	);
};
