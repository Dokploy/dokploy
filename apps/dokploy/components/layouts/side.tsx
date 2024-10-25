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
	SquareTerminal,
	Trash2,
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
// This is sample data.
const data = {
	user: {
		name: "shadcn",
		email: "m@example.com",
		avatar: "/avatars/shadcn.jpg",
	},
	teams: [
		{
			name: "Acme Inc",
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
	navMain: [
		{
			title: "Home",
			url: "#",
			icon: SquareTerminal,
			isActive: true,
			items: [
				{
					title: "Projects",
					url: "/dashboard/projects",
				},
				{
					title: "Monitoring",
					url: "/dashboard/monitoring",
				},
				{
					title: "File System",
					url: "/dashboard/traefik",
				},
				{
					title: "Docker",
					url: "/dashboard/docker",
				},
				{
					title: "Requests",
					url: "/dashboard/requests",
				},
			],
		},
		{
			title: "Settings",
			url: "#",
			icon: Settings2,
			items: [
				{
					title: "Profile",
					url: "/dashboard/settings/profile",
				},
				{
					title: "Users",
					url: "/dashboard/settings/users",
				},
				{
					title: "SSH Key",
					url: "/dashboard/settings/ssh-keys",
				},
				{
					title: "Git",
					url: "/dashboard/settings/git-providers",
				},
			],
		},
		{
			title: "System",
			icon: CogIcon,
			items: [
				{
					title: "General",
					url: "/dashboard/settings/server",
				},
				{
					title: "Cluster",
					url: "/dashboard/settings/cluster",
				},
				{
					title: "Servers",
					url: "/dashboard/settings/servers",
				},
			],
		},
		{
			title: "Integrations",
			icon: BlocksIcon,
			items: [
				{
					title: "S3 Destinations",
					url: "/dashboard/settings/destinations",
				},
				{
					title: "Registry",
					url: "/dashboard/settings/registry",
				},
				{
					title: "Notifications",
					url: "/dashboard/settings/notifications",
				},
			],
		},
		{
			title: "Security",
			icon: ShieldCheck,
			items: [
				{
					title: "Certificates",
					url: "/dashboard/settings/certificates",
				},
				{
					title: "Billing",
					url: "/dashboard/settings/billing",
				},
			],
		},
		{
			title: "Appearance",
			icon: Frame,
			items: [
				{
					title: "Theme",
					url: "/dashboard/settings/appearance",
				},
			],
		},
	],
	projects: [
		{
			name: "Documentation",
			url: "#",
			icon: BookIcon,
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
			<Sidebar collapsible="icon">
				<SidebarHeader>
					<SidebarMenu>
						<SidebarMenuItem>
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<SidebarMenuButton
										size="lg"
										className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
									>
										<div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
											{/* <activeTeam.logo className="size-4" /> */}
										</div>
										<div className="grid flex-1 text-left text-sm leading-tight">
											<span className="truncate font-semibold">
												{activeTeam?.name}
											</span>
											<span className="truncate text-xs">
												{activeTeam?.plan}
											</span>
										</div>
										<ChevronsUpDown className="ml-auto" />
									</SidebarMenuButton>
								</DropdownMenuTrigger>
								<DropdownMenuContent
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
								</DropdownMenuContent>
							</DropdownMenu>
						</SidebarMenuItem>
					</SidebarMenu>
				</SidebarHeader>
				<SidebarContent>
					<SidebarGroup>
						<SidebarGroupLabel>Platform</SidebarGroupLabel>
						<SidebarMenu>
							{data.navMain.map((item) => (
								<Collapsible
									key={item.title}
									asChild
									defaultOpen={item.isActive}
									className="group/collapsible"
								>
									<SidebarMenuItem>
										<CollapsibleTrigger asChild>
											<SidebarMenuButton tooltip={item.title}>
												{item.icon && <item.icon />}
												<span>{item.title}</span>
												<ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
											</SidebarMenuButton>
										</CollapsibleTrigger>
										<CollapsibleContent>
											<SidebarMenuSub>
												{item.items?.map((subItem) => (
													<SidebarMenuSubItem key={subItem.title}>
														<SidebarMenuSubButton asChild>
															<a href={subItem.url}>
																<span>{subItem.title}</span>
															</a>
														</SidebarMenuSubButton>
													</SidebarMenuSubItem>
												))}
											</SidebarMenuSub>
										</CollapsibleContent>
									</SidebarMenuItem>
								</Collapsible>
							))}
						</SidebarMenu>
					</SidebarGroup>
					<SidebarGroup className="group-data-[collapsible=icon]:hidden">
						<SidebarGroupLabel>Projects</SidebarGroupLabel>
						<SidebarMenu>
							{data.projects.map((item) => (
								<SidebarMenuItem key={item.name}>
									<SidebarMenuButton asChild>
										<a href={item.url}>
											<item.icon />
											<span>{item.name}</span>
										</a>
									</SidebarMenuButton>
									<DropdownMenu>
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
									</DropdownMenu>
								</SidebarMenuItem>
							))}
							<SidebarMenuItem>
								<SidebarMenuButton className="text-sidebar-foreground/70">
									<MoreHorizontal className="text-sidebar-foreground/70" />
									<span>More</span>
								</SidebarMenuButton>
							</SidebarMenuItem>
						</SidebarMenu>
					</SidebarGroup>
				</SidebarContent>
				<SidebarFooter>
					<SidebarMenu>
						<SidebarMenuItem>
							<DropdownMenu>
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
							</DropdownMenu>
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
