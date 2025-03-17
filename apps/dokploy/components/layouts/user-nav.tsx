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
import { useTranslation } from "next-i18next";

const _AUTO_CHECK_UPDATES_INTERVAL_MINUTES = 7;

export const UserNav = () => {
	const router = useRouter();
	const { t } = useTranslation("common");
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
						<span className="truncate font-semibold">
							{t("common.account")}
						</span>
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
						{t("common.account.mine")}
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
						{t("common.side.profile")}
					</DropdownMenuItem>
					<DropdownMenuItem
						className="cursor-pointer"
						onClick={() => {
							router.push("/dashboard/projects");
						}}
					>
						{t("common.side.projects")}
					</DropdownMenuItem>
					{!isCloud ? (
						<>
							<DropdownMenuItem
								className="cursor-pointer"
								onClick={() => {
									router.push("/dashboard/monitoring");
								}}
							>
								{t("common.side.monitoring")}
							</DropdownMenuItem>
							{(data?.role === "owner" || data?.canAccessToTraefikFiles) && (
								<DropdownMenuItem
									className="cursor-pointer"
									onClick={() => {
										router.push("/dashboard/traefik");
									}}
								>
									{t("common.side.traefik")}
								</DropdownMenuItem>
							)}
							{(data?.role === "owner" || data?.canAccessToDocker) && (
								<DropdownMenuItem
									className="cursor-pointer"
									onClick={() => {
										router.push("/dashboard/docker", undefined, {
											shallow: true,
										});
									}}
								>
									{t("common.side.docker")}
								</DropdownMenuItem>
							)}

							{data?.role === "owner" && (
								<DropdownMenuItem
									className="cursor-pointer"
									onClick={() => {
										router.push("/dashboard/settings");
									}}
								>
									{t("common.side.settings")}
								</DropdownMenuItem>
							)}
						</>
					) : (
						<>
							{data?.role === "owner" && (
								<DropdownMenuItem
									className="cursor-pointer"
									onClick={() => {
										router.push("/dashboard/settings/servers");
									}}
								>
									{t("common.side.remote-servers")}
								</DropdownMenuItem>
							)}

							{data?.role === "owner" && (
								<DropdownMenuItem
									className="cursor-pointer"
									onClick={() => {
										router.push("/dashboard/settings");
									}}
								>
									{t("common.side.settings")}
								</DropdownMenuItem>
							)}
						</>
					)}
				</DropdownMenuGroup>
				{isCloud && data?.role === "owner" && (
					<DropdownMenuItem
						className="cursor-pointer"
						onClick={() => {
							router.push("/dashboard/settings/billing");
						}}
					>
						{t("common.side.billing")}
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
							// await mutateAsync().then(() => {
							// 	router.push("/");
							// });
						}}
					>
						{t("common.account.logout")}
					</DropdownMenuItem>
					<div className="w-32">
						<Select
							onValueChange={setLocale}
							defaultValue={locale}
							value={locale}
						>
							<SelectTrigger>
								<SelectValue placeholder={t("common.account.selectLanguage")} />
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
