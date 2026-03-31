import {
	Activity,
	ChevronsUpDown,
	Container,
	CreditCard,
	FolderOpen,
	LogOut,
	Monitor,
	Moon,
	Palette,
	Route,
	Server,
	Sun,
	User,
} from "lucide-react";
import { useRouter } from "next/router";
import { useTheme } from "next-themes";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth-client";
import { getFallbackAvatarInitials } from "@/lib/utils";
import { api } from "@/utils/api";
import { SidebarMenuButton } from "../ui/sidebar";

const _AUTO_CHECK_UPDATES_INTERVAL_MINUTES = 7;

export const UserNav = ({ compact }: { compact?: boolean }) => {
	const router = useRouter();
	const { theme, setTheme } = useTheme();
	const { data } = api.user.get.useQuery();
	const { data: permissions } = api.user.getPermissions.useQuery();
	const { data: isCloud } = api.settings.isCloud.useQuery();

	const avatarEl = (
		<Avatar className="h-7 w-7 rounded-lg">
			<AvatarImage
				className="object-cover"
				src={data?.user?.image || ""}
				alt={data?.user?.image || ""}
			/>
			<AvatarFallback className="rounded-lg text-xs">
				{getFallbackAvatarInitials(
					`${data?.user?.firstName} ${data?.user?.lastName}`.trim(),
				)}
			</AvatarFallback>
		</Avatar>
	);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				{compact ? (
					<button type="button" className="flex items-center justify-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring">
						{avatarEl}
					</button>
				) : (
					<SidebarMenuButton
						size="lg"
						className="data-[state=open]:-accent data-[state=open]:text-sidebar-accent-foreground"
					>
						{avatarEl}
						<div className="grid flex-1 text-left text-sm leading-tight">
							<span className="truncate font-semibold">Account</span>
							<span className="truncate text-xs">{data?.user?.email}</span>
						</div>
						<ChevronsUpDown className="ml-auto size-4" />
					</SidebarMenuButton>
				)}
			</DropdownMenuTrigger>
			<DropdownMenuContent
				className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
				side="bottom"
				align="end"
				sideOffset={4}
			>
				<DropdownMenuLabel className="flex items-center gap-2 px-2 py-1.5">
					<Avatar className="h-8 w-8 rounded-lg">
						<AvatarImage
							className="object-cover"
							src={data?.user?.image || ""}
							alt={data?.user?.image || ""}
						/>
						<AvatarFallback className="rounded-lg">
							{getFallbackAvatarInitials(
								`${data?.user?.firstName} ${data?.user?.lastName}`.trim(),
							)}
						</AvatarFallback>
					</Avatar>
					<div className="flex flex-col">
						My Account
						<span className="text-xs font-normal text-muted-foreground">
							{data?.user?.email}
						</span>
					</div>
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<DropdownMenuItem
						className="cursor-pointer"
						onClick={() => {
							router.push("/dashboard/settings/profile");
						}}
					>
						<User className="mr-2 h-4 w-4" />
						Profile
					</DropdownMenuItem>
					<DropdownMenuItem
						className="cursor-pointer"
						onClick={() => {
							router.push("/dashboard/projects");
						}}
					>
						<FolderOpen className="mr-2 h-4 w-4" />
						Projects
					</DropdownMenuItem>
					{!isCloud ? (
						<>
							<DropdownMenuItem
								className="cursor-pointer"
								onClick={() => {
									router.push("/dashboard/monitoring");
								}}
							>
								<Activity className="mr-2 h-4 w-4" />
								Monitoring
							</DropdownMenuItem>
							{permissions?.traefikFiles.read && (
								<DropdownMenuItem
									className="cursor-pointer"
									onClick={() => {
										router.push("/dashboard/traefik");
									}}
								>
									<Route className="mr-2 h-4 w-4" />
									Traefik
								</DropdownMenuItem>
							)}
							{permissions?.docker.read && (
								<DropdownMenuItem
									className="cursor-pointer"
									onClick={() => {
										router.push("/dashboard/docker", undefined, {
											shallow: true,
										});
									}}
								>
									<Container className="mr-2 h-4 w-4" />
									Docker
								</DropdownMenuItem>
							)}
						</>
					) : (
						permissions?.organization.update && (
							<DropdownMenuItem
								className="cursor-pointer"
								onClick={() => {
									router.push("/dashboard/settings/servers");
								}}
							>
								<Server className="mr-2 h-4 w-4" />
								Servers
							</DropdownMenuItem>
						)
					)}
				</DropdownMenuGroup>
				{isCloud && data?.role === "owner" && (
					<DropdownMenuItem
						className="cursor-pointer"
						onClick={() => {
							router.push("/dashboard/settings/billing");
						}}
					>
						<CreditCard className="mr-2 h-4 w-4" />
						Billing
					</DropdownMenuItem>
				)}
				<DropdownMenuSeparator />
				<DropdownMenuSub>
					<DropdownMenuSubTrigger className="cursor-pointer [&>svg.ml-auto]:hidden">
						<Palette className="mr-2 h-4 w-4" />
						Theme
					</DropdownMenuSubTrigger>
					<DropdownMenuSubContent>
						<DropdownMenuItem
							className="cursor-pointer"
							onClick={() => setTheme("system")}
						>
							<Monitor className="mr-2 h-4 w-4" />
							System
						</DropdownMenuItem>
						<DropdownMenuItem
							className="cursor-pointer"
							onClick={() => setTheme("light")}
						>
							<Sun className="mr-2 h-4 w-4" />
							Light
						</DropdownMenuItem>
						<DropdownMenuItem
							className="cursor-pointer"
							onClick={() => setTheme("dark")}
						>
							<Moon className="mr-2 h-4 w-4" />
							Dark
						</DropdownMenuItem>
					</DropdownMenuSubContent>
				</DropdownMenuSub>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					className="cursor-pointer"
					onClick={async () => {
						await authClient.signOut().then(() => {
							router.push("/");
						});
						// await mutateAsync().then(() => {
						// 	router.push("/");
						// });
					}}
				>
					<LogOut className="mr-2 h-4 w-4" />
					Log out
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
};
