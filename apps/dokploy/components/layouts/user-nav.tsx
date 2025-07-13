import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { authClient } from "@/lib/auth-client";
import { Languages } from "@/lib/languages";
import { api } from "@/utils/api";
import useLocale from "@/utils/hooks/use-locale";
import { ChevronsUpDown } from "lucide-react";
import { useRouter } from "next/router";
import { ModeToggle } from "../ui/modeToggle";
import { SidebarMenuButton } from "../ui/sidebar";
import { Permissions } from "../dashboard/shared/Permissions";
import { PERMISSIONS } from "@dokploy/server/lib/permissions";

const _AUTO_CHECK_UPDATES_INTERVAL_MINUTES = 7;

export const UserNav = () => {
	const router = useRouter();
	const { data } = api.user.get.useQuery();
	const { data: isCloud } = api.settings.isCloud.useQuery();

	const { locale, setLocale } = useLocale();
	// const { mutateAsync } = api.auth.logout.useMutation();

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<SidebarMenuButton
					size="lg"
					className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
				>
					<Avatar className="h-8 w-8 rounded-lg">
						<AvatarImage
							src={data?.user?.image || ""}
							alt={data?.user?.image || ""}
						/>
						<AvatarFallback className="rounded-lg">CN</AvatarFallback>
					</Avatar>
					<div className="grid flex-1 text-left text-sm leading-tight">
						<span className="truncate font-semibold">Account</span>
						<span className="truncate text-xs">{data?.user?.email}</span>
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
							{data?.user?.email}
						</span>
					</DropdownMenuLabel>
					<ModeToggle />
				</div>
				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<DropdownMenuItem
						className="cursor-pointer"
						onClick={() => {
							router.push("/dashboard/settings/profile");
						}}
					>
						Profile
					</DropdownMenuItem>
					<DropdownMenuItem
						className="cursor-pointer"
						onClick={() => {
							router.push("/dashboard/projects");
						}}
					>
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
								Monitoring
							</DropdownMenuItem>
							<Permissions permissions={[PERMISSIONS.TRAEFIK.ACCESS.name]}>
								<DropdownMenuItem
									className="cursor-pointer"
									onClick={() => {
										router.push("/dashboard/traefik");
									}}
								>
									Traefik
								</DropdownMenuItem>
							</Permissions>

							<Permissions permissions={[PERMISSIONS.DOCKER.VIEW.name]}>
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
							</Permissions>
						</>
					) : (
						<>
							{data?.role?.name === "owner" && (
								<DropdownMenuItem
									className="cursor-pointer"
									onClick={() => {
										router.push("/dashboard/settings/servers");
									}}
								>
									Servers
								</DropdownMenuItem>
							)}
						</>
					)}
				</DropdownMenuGroup>
				{isCloud && data?.role?.name === "owner" && (
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
							await authClient.signOut().then(() => {
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
