import { format } from "date-fns";
import { Loader2, MoreHorizontal, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AlertBlock } from "@/components/shared/alert-block";
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
import { ChangeRole } from "./change-role";

export const ShowUsers = () => {
	const { t } = useTranslation();
	const { data: isCloud } = api.settings.isCloud.useQuery();
	const { data, isPending, refetch } = api.user.all.useQuery();
	const { mutateAsync, isPending: isRemoving } = api.user.remove.useMutation();
	const { data: permissions } = api.user.getPermissions.useQuery();
	const { data: hasValidLicense } =
		api.licenseKey.haveValidLicenseKey.useQuery();

	const utils = api.useUtils();
	const { data: session } = api.user.session.useQuery();

	const FREE_ROLES = ["owner", "admin", "member"];
	const membersWithCustomRoles = data?.filter(
		(member) => !FREE_ROLES.includes(member.role),
	);
	const hasCustomRolesWithoutLicense =
		!hasValidLicense && (membersWithCustomRoles?.length ?? 0) > 0;

	return (
		<div className="w-full">
			<Card className="h-full bg-sidebar  p-2.5 rounded-xl  max-w-5xl mx-auto">
				<div className="rounded-xl bg-background shadow-md ">
					<CardHeader className="">
						<CardTitle className="text-xl flex flex-row gap-2">
							<Users className="size-6 text-muted-foreground self-center" />
							{t("settings.users.title")}
						</CardTitle>
						<CardDescription>{t("settings.users.description")}</CardDescription>
					</CardHeader>
					<CardContent className="space-y-2 py-8 border-t">
						{isPending ? (
							<div className="flex flex-row gap-2 items-center justify-center text-sm text-muted-foreground min-h-[25vh]">
								<span>{t("settings.users.loading")}</span>
								<Loader2 className="animate-spin size-4" />
							</div>
						) : (
							<>
								{data?.length === 0 ? (
									<div className="flex flex-col items-center gap-3  min-h-[25vh] justify-center">
										<Users className="size-8 self-center text-muted-foreground" />
										<span className="text-base text-muted-foreground">
											{t("settings.users.inviteUsersToAccount")}
										</span>
									</div>
								) : (
									<div className="flex flex-col gap-4  min-h-[25vh]">
										{hasCustomRolesWithoutLicense && (
											<AlertBlock type="warning">
												{t("settings.users.customRolesWarning", {
													count: membersWithCustomRoles?.length ?? 0,
												})}
											</AlertBlock>
										)}
										<Table>
											<TableHeader>
												<TableRow>
													<TableHead className="w-[100px]">
														{t("settings.users.email")}
													</TableHead>
													<TableHead className="text-center">
														{t("settings.users.role")}
													</TableHead>
													<TableHead className="text-center">
														{t("settings.users.status")}
													</TableHead>
													<TableHead className="text-center">2FA</TableHead>

													<TableHead className="text-center">
														{t("settings.users.createdAt")}
													</TableHead>
													<TableHead className="text-right">
														{t("settings.users.actions")}
													</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{data?.map((member) => {
													const currentUserRole = data?.find(
														(m) => m.user.id === session?.user?.id,
													)?.role;

													// Owner never has "Edit Permissions" (they're absolute owner)
													// Other users can edit permissions if target is not themselves and target is a member/custom role
													const isStaticAdminOrOwner =
														member.role === "owner" || member.role === "admin";
													const canEditPermissions =
														!isStaticAdminOrOwner &&
														member.user.id !== session?.user?.id;

													// Can change role based on hierarchy:
													// - Owner: Can change anyone's role (except themselves and other owners)
													// - Admin: Can only change member/custom roles (not other admins or owners)
													// - Owner role is nontransferable
													const canChangeRole =
														member.role !== "owner" &&
														member.user.id !== session?.user?.id &&
														(currentUserRole === "owner" ||
															(currentUserRole === "admin" &&
																member.role !== "admin"));

													const canDeleteMember =
														permissions?.member.delete ?? false;

													// Self-hosted: "Delete User" removes the user entirely
													// Cloud: "Unlink User" removes from the organization only
													const canRemove =
														member.role !== "owner" &&
														member.user.id !== session?.user?.id &&
														(currentUserRole === "owner" ||
															(currentUserRole === "admin" &&
																member.role !== "admin") ||
															(canDeleteMember && !isStaticAdminOrOwner));

													const canDelete = canRemove && !isCloud;
													const canUnlink = canRemove && !!isCloud;

													const hasAnyAction =
														canEditPermissions ||
														canChangeRole ||
														canDelete ||
														canUnlink;

													return (
														<TableRow key={member.id}>
															<TableCell className="w-[100px]">
																{member.user.email}
																{member.user.id === session?.user?.id && (
																	<span className="text-muted-foreground ml-1">
																		{t("settings.users.youLabel")}
																	</span>
																)}
															</TableCell>
															<TableCell className="text-center">
																<Badge
																	variant={
																		member.role === "owner"
																			? "default"
																			: "secondary"
																	}
																>
																	{member.role}
																</Badge>
															</TableCell>
															<TableCell className="text-center">
																<Badge
																	variant={
																		member.user.banned
																			? "destructive"
																			: "outline"
																	}
																>
																	{member.user.banned
																		? t("settings.users.deactivated")
																		: t("settings.users.active")}
																</Badge>
															</TableCell>
															<TableCell className="text-center">
																{member.user.twoFactorEnabled
																	? t("settings.users.enabled")
																	: t("settings.users.disabled")}
															</TableCell>
															<TableCell className="text-center">
																<span className="text-sm text-muted-foreground">
																	{format(new Date(member.createdAt), "PPpp")}
																</span>
															</TableCell>

															<TableCell className="text-right flex justify-end">
																{hasAnyAction ? (
																	<DropdownMenu>
																		<DropdownMenuTrigger asChild>
																			<Button
																				variant="ghost"
																				className="h-8 w-8 p-0"
																			>
																				<span className="sr-only">
																					{t("settings.users.openMenu")}
																				</span>
																				<MoreHorizontal className="h-4 w-4" />
																			</Button>
																		</DropdownMenuTrigger>
																		<DropdownMenuContent align="end">
																			<DropdownMenuLabel>
																				{t("settings.users.actions")}
																			</DropdownMenuLabel>

																			{canChangeRole && (
																				<ChangeRole
																					memberId={member.id}
																					currentRole={member.role}
																					userEmail={member.user.email}
																				/>
																			)}

																			{canEditPermissions && (
																				<AddUserPermissions
																					userId={member.user.id}
																					role={member.role}
																				/>
																			)}

																			{canDelete && (
																				<DialogAction
																					title={t("settings.users.deleteUser")}
																					description={t(
																						"settings.users.deleteUserConfirm",
																					)}
																					type="destructive"
																					disabled={isRemoving}
																					onClick={async () => {
																						await mutateAsync({
																							userId: member.user.id,
																						})
																							.then(() => {
																								toast.success(
																									t(
																										"settings.users.userDeleted",
																									),
																								);
																								refetch();
																							})
																							.catch((err) => {
																								toast.error(
																									err?.message ||
																										t(
																											"settings.users.deleteUserError",
																										),
																								);
																							});
																					}}
																				>
																					<DropdownMenuItem
																						className="w-full cursor-pointer text-red-500 hover:text-red-600!"
																						onSelect={(e) => e.preventDefault()}
																					>
																						{t("settings.users.deleteUser")}
																					</DropdownMenuItem>
																				</DialogAction>
																			)}

																			{canUnlink && (
																				<DialogAction
																					title={t("settings.users.unlinkUser")}
																					description={t(
																						"settings.users.unlinkUserConfirm",
																					)}
																					type="destructive"
																					disabled={isRemoving}
																					onClick={async () => {
																						if (!isCloud) {
																							const orgCount =
																								await utils.user.checkUserOrganizations.fetch(
																									{
																										userId: member.user.id,
																									},
																								);

																							if (orgCount === 1) {
																								await mutateAsync({
																									userId: member.user.id,
																								})
																									.then(() => {
																										toast.success(
																											t(
																												"settings.users.userDeleted",
																											),
																										);
																										refetch();
																									})
																									.catch(() => {
																										toast.error(
																											t(
																												"settings.users.deleteUserError",
																											),
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
																								t(
																									"settings.users.userUnlinked",
																								),
																							);
																							refetch();
																						} else {
																							toast.error(
																								t(
																									"settings.users.unlinkUserError",
																								),
																							);
																						}
																					}}
																				>
																					<DropdownMenuItem
																						className="w-full cursor-pointer text-red-500 hover:text-red-600!"
																						onSelect={(e) => e.preventDefault()}
																					>
																						{t("settings.users.unlinkUser")}
																					</DropdownMenuItem>
																				</DialogAction>
																			)}
																		</DropdownMenuContent>
																	</DropdownMenu>
																) : (
																	<Button
																		variant="ghost"
																		className="h-8 w-8 p-0"
																		disabled
																	>
																		<span className="sr-only">
																			{t("settings.users.noActions")}
																		</span>
																		<MoreHorizontal className="h-4 w-4 text-muted-foreground" />
																	</Button>
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
