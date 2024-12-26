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
	House,
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
} from "lucide-react";
import * as React from "react";

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
} from "@/components/ui/sidebar";
import { Logo } from "../shared/logo";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api } from "@/utils/api";
import { useRouter } from "next/router";
// This is sample data.
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
		},
		{
			title: "Monitoring",
			url: "/dashboard/monitoring",
			icon: BarChartHorizontalBigIcon,
			isSingle: true,
		},
		{
			title: "File System",
			url: "/dashboard/traefik",
			icon: GalleryVerticalEnd,
			isSingle: true,
		},
		{
			title: "Docker",
			url: "/dashboard/docker",
			icon: BlocksIcon,
			isSingle: true,
		},
		{
			title: "Swarm",
			url: "/dashboard/swarm",
			icon: PieChart,
			isSingle: true,
		},
		{
			title: "Requests",
			url: "/dashboard/requests",
			icon: Forward,
			isSingle: true,
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
	],
	settings: [
		{
			title: "Profile",
			url: "/dashboard/settings/profile",
			icon: User,
			isSingle: true,
		},
		{
			title: "Servers",
			url: "/dashboard/settings/servers",
			icon: Server,
			isSingle: true,
		},
		{
			title: "Users",
			icon: Users,
			url: "/dashboard/settings/users",
			isSingle: true,
		},
		{
			title: "SSH Keys",
			icon: KeyRound,
			url: "/dashboard/settings/ssh-keys",
			isSingle: true,
		},

		{
			title: "Git",
			url: "/dashboard/settings/git-providers",
			icon: GitBranch,
			isSingle: true,
		},
		{
			title: "Registry",
			url: "/dashboard/settings/registry",
			icon: Package,
			isSingle: true,
		},
		{
			title: "S3 Destinations",
			url: "/dashboard/settings/destinations",
			icon: Database,
			isSingle: true,
		},

		{
			title: "Certificates",
			url: "/dashboard/settings/certificates",
			icon: ShieldCheck,
			isSingle: true,
		},
		{
			title: "Notifications",
			url: "/dashboard/settings/notifications",
			icon: Bell,
			isSingle: true,
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
	],
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
	],
};

interface Props {
	children: React.ReactNode;
}
export default function Page({ children }: Props) {
	const [activeTeam, setActiveTeam] = React.useState(data.teams[0]);

	return (
		<SidebarProvider>
			<Sidebar collapsible="icon" variant="inset">
				<SidebarHeader>
					<SidebarMenu>
						<SidebarMenuItem>
							<DropdownMenu>
								<DropdownMenuTrigger asChild className="">
									<SidebarMenuButton
										size="lg"
										className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground "
									>
										<div className="flex aspect-square size-8 items-center justify-center rounded-lg ">
											<Logo />
											{/* <activeTeam.logo className="size-4" /> */}
										</div>
										<div className="grid flex-1 text-left text-sm leading-tight">
											<span className="truncate font-semibold">
												{activeTeam?.name}
											</span>
											<span className="truncate text-xs">v0.16.0</span>
										</div>
										{/* <ChevronsUpDown className="ml-auto" /> */}
									</SidebarMenuButton>
								</DropdownMenuTrigger>
								{/* <DropdownMenuContent
									className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
									align="start"
									side="bottom"
									sideOffset={4}
								>
									<DropdownMenuLabel className="text-xs text-muted-foreground">
										Teams
									</DropdownMenuLabel>
									{data.teams.map((team, index) => (
										<DropdownMenuItem
											key={team.name}
											onClick={() => setActiveTeam(team)}
											className="gap-2 p-2"
										>
											<div className="flex size-6 items-center justify-center rounded-sm border">
												<team.logo className="size-4 shrink-0" />
											</div>
											{team.name}
											<DropdownMenuShortcut>⌘{index + 1}</DropdownMenuShortcut>
										</DropdownMenuItem>
									))}
									<DropdownMenuSeparator />
									<DropdownMenuItem className="gap-2 p-2">
										<div className="flex size-6 items-center justify-center rounded-md border bg-background">
											<Plus className="size-4" />
										</div>
										<div className="font-medium text-muted-foreground">
											Add team
										</div>
									</DropdownMenuItem>
								</DropdownMenuContent> */}
							</DropdownMenu>
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
											<SidebarMenuButton asChild tooltip={item.title}>
												<Link href={item.url}>
													<item.icon />
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
																<SidebarMenuSubButton asChild>
																	<Link href={subItem.url}>
																		{subItem.icon && (
																			<span className="mr-2">
																				<subItem.icon className="h-4 w-4 text-muted-foreground" />
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
						<SidebarMenu>
							{data.settings.map((item) => (
								<Collapsible
									key={item.title}
									asChild
									defaultOpen={item.isActive}
									className="group/collapsible"
								>
									<SidebarMenuItem>
										{item.isSingle ? (
											<SidebarMenuButton asChild tooltip={item.title}>
												<Link href={item.url}>
													<item.icon />
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
																<SidebarMenuSubButton asChild>
																	<Link href={subItem.url}>
																		{subItem.icon && (
																			<span className="mr-2">
																				<subItem.icon className="h-4 w-4 text-muted-foreground" />
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
									{/* <DropdownMenu>
										<DropdownMenuTrigger asChild>
											<SidebarMenuAction showOnHover>
												<MoreHorizontal />
												<span className="sr-only">More</span>
											</SidebarMenuAction>
										</DropdownMenuTrigger>
										<DropdownMenuContent
											className="w-48 rounded-lg"
											side="bottom"
											align="end"
										>
											<DropdownMenuItem>
												<Folder className="text-muted-foreground" />
												<span>View Project</span>
											</DropdownMenuItem>
											<DropdownMenuItem>
												<Forward className="text-muted-foreground" />
												<span>Share Project</span>
											</DropdownMenuItem>
											<DropdownMenuSeparator />
											<DropdownMenuItem>
												<Trash2 className="text-muted-foreground" />
												<span>Delete Project</span>
											</DropdownMenuItem>
										</DropdownMenuContent>
									</DropdownMenu> */}
								</SidebarMenuItem>
							))}
							{/* <SidebarMenuItem>
								<SidebarMenuButton className="text-sidebar-foreground/70">
									<MoreHorizontal className="text-sidebar-foreground/70" />
									<span>More</span>
								</SidebarMenuButton>
							</SidebarMenuItem> */}
						</SidebarMenu>
					</SidebarGroup>
				</SidebarContent>
				<SidebarFooter>
					<SidebarMenu>
						<SidebarMenuItem>
							<UserNav />
							{/* <DropdownMenu>
								<DropdownMenuTrigger asChild>
									<SidebarMenuButton
										size="lg"
										className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
									>
										<Avatar className="h-8 w-8 rounded-lg">
											<AvatarImage
												src={data.user.avatar}
												alt={data.user.name}
											/>
											<AvatarFallback className="rounded-lg">CN</AvatarFallback>
										</Avatar>
										<div className="grid flex-1 text-left text-sm leading-tight">
											<span className="truncate font-semibold">
												{data.user.name}
											</span>
											<span className="truncate text-xs">
												{data.user.email}
											</span>
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
									<DropdownMenuLabel className="p-0 font-normal">
										<div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
											<Avatar className="h-8 w-8 rounded-lg">
												<AvatarImage
													src={data.user.avatar}
													alt={data.user.name}
												/>
												<AvatarFallback className="rounded-lg">
													CN
												</AvatarFallback>
											</Avatar>
											<div className="grid flex-1 text-left text-sm leading-tight">
												<span className="truncate font-semibold">
													{data.user.name}
												</span>
												<span className="truncate text-xs">
													{data.user.email}
												</span>
											</div>
										</div>
									</DropdownMenuLabel>
									<DropdownMenuSeparator />
									<DropdownMenuGroup>
										<DropdownMenuItem>
											<Sparkles />
											Upgrade to Pro
										</DropdownMenuItem>
									</DropdownMenuGroup>
									<DropdownMenuSeparator />
									<DropdownMenuGroup>
										<DropdownMenuItem>
											<BadgeCheck />
											Account
										</DropdownMenuItem>
										<DropdownMenuItem>
											<CreditCard />
											Billing
										</DropdownMenuItem>
										<DropdownMenuItem>
											<Bell />
											Notifications
										</DropdownMenuItem>
									</DropdownMenuGroup>
									<DropdownMenuSeparator />
									<DropdownMenuItem>
										<LogOut />
										Log out
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu> */}
						</SidebarMenuItem>
					</SidebarMenu>
				</SidebarFooter>
				<SidebarRail />
			</Sidebar>
			<SidebarInset>
				<header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
					<div className="flex items-center gap-2 px-4">
						<SidebarTrigger className="-ml-1" />
						<Separator orientation="vertical" className="mr-2 h-4" />
						<Breadcrumb>
							<BreadcrumbList>
								<BreadcrumbItem className="hidden md:block">
									<BreadcrumbLink href="#">
										Building Your Application
									</BreadcrumbLink>
								</BreadcrumbItem>
								<BreadcrumbSeparator className="hidden md:block" />
								<BreadcrumbItem>
									<BreadcrumbPage>Data Fetching</BreadcrumbPage>
								</BreadcrumbItem>
							</BreadcrumbList>
						</Breadcrumb>
					</div>
				</header>
				<div className="flex flex-1 flex-col gap-4 p-4 pt-0">
					{/* <div className="grid auto-rows-min gap-4 md:grid-cols-3">
						<div className="aspect-video rounded-xl bg-muted/50" />
						<div className="aspect-video rounded-xl bg-muted/50" />
						<div className="aspect-video rounded-xl bg-muted/50" />
					</div> */}
					{children}
					{/* <div className="min-h-[100vh] flex-1 rounded-xl bg-muted/50 md:min-h-min" /> */}
				</div>
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
						<AvatarImage src={data?.image || ""} alt={data?.image} />
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
				<DropdownMenuLabel className="flex flex-col">
					My Account
					<span className="text-xs font-normal text-muted-foreground">
						{data?.email}
					</span>
				</DropdownMenuLabel>
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
			</DropdownMenuContent>
		</DropdownMenu>
	);
};
