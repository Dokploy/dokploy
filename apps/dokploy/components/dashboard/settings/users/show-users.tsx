import { format } from "date-fns";
import { enUS, zhCN, zhTW } from "date-fns/locale";
import { Loader2, MoreHorizontal, Users } from "lucide-react";
import { useTranslation } from "next-i18next";
import { toast } from "sonner";
import { DialogAction } from "@/components/shared/dialog-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { authClient } from "@/lib/auth-client";
import { api } from "@/utils/api";
import { AddUserPermissions } from "./add-permissions";

export const ShowUsers = () => {
	const { t, i18n } = useTranslation("settings");
	const { data: isCloud } = api.settings.isCloud.useQuery();
	const { data, isLoading, refetch } = api.user.all.useQuery();
	const { mutateAsync } = api.user.remove.useMutation();
	const utils = api.useUtils();

	const locale =
		i18n?.language === "zh-Hans"
			? zhCN
			: i18n?.language === "zh-Hant"
				? zhTW
				: enUS;

	const roleLabels: Record<string, string> = {
		owner: t("settings.invitations.role.owner"),
		admin: t("settings.invitations.role.admin"),
		member: t("settings.invitations.role.member"),
	};

	return (
		<div className="w-full">
			<Card className="h-full bg-sidebar  p-2.5 rounded-xl  max-w-5xl mx-auto">
				<div className="rounded-xl bg-background shadow-md ">
					<CardHeader className="">
						<CardTitle className="text-xl flex flex-row gap-2">
							<Users className="size-6 text-muted-foreground self-center" />
							{t("settings.users.page.title")}
						</CardTitle>
						<CardDescription>
							{t("settings.users.page.description")}
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-2 py-8 border-t">
						{isLoading ? (
							<div className="flex flex-row gap-2 items-center justify-center text-sm text-muted-foreground min-h-[25vh]">
								<span>{t("settings.common.loading")}</span>
								<Loader2 className="animate-spin size-4" />
							</div>
						) : (
							<>
								{data?.length === 0 ? (
									<div className="flex flex-col items-center gap-3  min-h-[25vh] justify-center">
										<Users className="size-8 self-center text-muted-foreground" />
										<span className="text-base text-muted-foreground">
											{t("settings.users.page.empty")}
										</span>
									</div>
								) : (
									<div className="flex flex-col gap-4  min-h-[25vh]">
										<Table>
											<TableHeader>
												<TableRow>
													<TableHead className="w-[100px]">
														{t("settings.users.page.table.email")}
													</TableHead>
													<TableHead className="text-center">
														{t("settings.users.page.table.role")}
													</TableHead>
													<TableHead className="text-center">
														{t("settings.users.page.table.twoFactor")}
													</TableHead>

													<TableHead className="text-center">
														{t("settings.users.page.table.createdAt")}
													</TableHead>
													<TableHead className="text-right">
														{t("settings.users.page.table.actions")}
													</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{data?.map((member) => {
													return (
														<TableRow key={member.id}>
															<TableCell className="w-[100px]">
																{member.user.email}
															</TableCell>
															<TableCell className="text-center">
																<Badge
																	variant={
																		member.role === "owner"
																			? "default"
																			: "secondary"
																	}
																>
																	{roleLabels[member.role] ||
																		member.role}
																</Badge>
															</TableCell>
															<TableCell className="text-center">
																{member.user.twoFactorEnabled
																	? t("settings.users.page.twoFactor.enabled")
																	: t("settings.users.page.twoFactor.disabled")}
															</TableCell>
															<TableCell className="text-center">
																<span className="text-sm text-muted-foreground">
																	{format(new Date(member.createdAt), "PPpp", {
																		locale,
																	})}
																</span>
															</TableCell>

															<TableCell className="text-right flex justify-end">
																{member.role !== "owner" && (
																	<DropdownMenu>
																		<DropdownMenuTrigger asChild>
																			<Button
																				variant="ghost"
																				className="h-8 w-8 p-0"
																			>
																				<span className="sr-only">
																					{t("settings.users.page.actions.openMenu")}
																				</span>
																				<MoreHorizontal className="h-4 w-4" />
																			</Button>
																		</DropdownMenuTrigger>
																		<DropdownMenuContent align="end">
																			<DropdownMenuLabel>
																				{t("settings.users.page.table.actions")}
																			</DropdownMenuLabel>

																			<AddUserPermissions
																				userId={member.user.id}
																			/>

																			{!isCloud && (
																				<DialogAction
																					title={t("settings.users.page.actions.delete.title")}
																					description={t(
																						"settings.users.page.actions.delete.description",
																					)}
																					type="destructive"
																					onClick={async () => {
																						await mutateAsync({
																							userId: member.user.id,
																						})
																							.then(() => {
																								toast.success(
																									t("settings.users.page.actions.delete.success"),
																								);
																								refetch();
																							})
																							.catch(() => {
																								toast.error(
																									t("settings.users.page.actions.delete.error"),
																								);
																							});
																					}}
																				>
																					<DropdownMenuItem
																						className="w-full cursor-pointer text-red-500 hover:!text-red-600"
																						onSelect={(e) => e.preventDefault()}
																					>
																						{t("settings.users.page.actions.delete.menu")}
																					</DropdownMenuItem>
																				</DialogAction>
																			)}

																			<DialogAction
																				title={t("settings.users.page.actions.unlink.title")}
																				description={t(
																					"settings.users.page.actions.unlink.description",
																				)}
																				type="destructive"
																				onClick={async () => {
																					if (!isCloud) {
																						const orgCount =
																							await utils.user.checkUserOrganizations.fetch(
																								{
																									userId: member.user.id,
																								},
																							);

																						console.log(orgCount);

																						if (orgCount === 1) {
																							await mutateAsync({
																								userId: member.user.id,
																							})
																								.then(() => {
																									toast.success(
																										t("settings.users.page.actions.delete.success"),
																									);
																									refetch();
																								})
																								.catch(() => {
																									toast.error(
																										t("settings.users.page.actions.delete.error"),
																									);
																								});
																							return;
																						}
																					}

																					const { error } =
																						await authClient.organization.removeMember(
																							{
																								memberIdOrEmail: member.id,
																							},
																						);

																					if (!error) {
																						toast.success(
																							t("settings.users.page.actions.unlink.success"),
																						);
																						refetch();
																					} else {
																						toast.error(
																							t("settings.users.page.actions.unlink.error"),
																						);
																					}
																				}}
																			>
																				<DropdownMenuItem
																					className="w-full cursor-pointer text-red-500 hover:!text-red-600"
																					onSelect={(e) => e.preventDefault()}
																				>
																					{t("settings.users.page.actions.unlink.menu")}
																				</DropdownMenuItem>
																			</DialogAction>
																		</DropdownMenuContent>
																	</DropdownMenu>
																)}
															</TableCell>
														</TableRow>
													);
												})}
											</TableBody>
										</Table>
									</div>
								)}
							</>
						)}
					</CardContent>
				</div>
			</Card>
		</div>
	);
};
