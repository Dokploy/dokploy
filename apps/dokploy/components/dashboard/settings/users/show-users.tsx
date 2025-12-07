import { format } from "date-fns";
import { Loader2, MoreHorizontal, Users } from "lucide-react";
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
	const { data: isCloud } = api.settings.isCloud.useQuery();
	const { data, isLoading, refetch } = api.user.all.useQuery();
	const { mutateAsync } = api.user.remove.useMutation();
	const { mutateAsync: removeMember } =
		api.organization.removeMember.useMutation();
	const utils = api.useUtils();
	const { data: session } = authClient.useSession();

	return (
		<div className="w-full">
			<Card className="h-full bg-sidebar  p-2.5 rounded-xl  max-w-5xl mx-auto">
				<div className="rounded-xl bg-background shadow-md ">
					<CardHeader className="">
						<CardTitle className="text-xl flex flex-row gap-2">
							<Users className="size-6 text-muted-foreground self-center" />
							Users
						</CardTitle>
						<CardDescription>
							Add your users to your Dokploy account.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-2 py-8 border-t">
						{isLoading ? (
							<div className="flex flex-row gap-2 items-center justify-center text-sm text-muted-foreground min-h-[25vh]">
								<span>Loading...</span>
								<Loader2 className="animate-spin size-4" />
							</div>
						) : (
							<>
								{data?.length === 0 ? (
									<div className="flex flex-col items-center gap-3  min-h-[25vh] justify-center">
										<Users className="size-8 self-center text-muted-foreground" />
										<span className="text-base text-muted-foreground">
											Invite users to your Dokploy account
										</span>
									</div>
								) : (
									<div className="flex flex-col gap-4  min-h-[25vh]">
										<Table>
											<TableHeader>
												<TableRow>
													<TableHead className="w-[100px]">Email</TableHead>
													<TableHead className="text-center">Role</TableHead>
													<TableHead className="text-center">2FA</TableHead>

													<TableHead className="text-center">
														Created At
													</TableHead>
													<TableHead className="text-right">Actions</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{data?.map((member) => {
													const canEditPermissions = member.role === "member";
													const canDelete =
														member.role !== "owner" &&
														!isCloud &&
														member.user.id !== session?.user?.id;
													const canUnlink =
														member.role !== "owner" &&
														!(
															member.role === "admin" &&
															member.user.id === session?.user?.id
														);

													const hasAnyAction =
														canEditPermissions || canDelete || canUnlink;

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
																	{member.role}
																</Badge>
															</TableCell>
															<TableCell className="text-center">
																{member.user.twoFactorEnabled
																	? "Enabled"
																	: "Disabled"}
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
																					Open menu
																				</span>
																				<MoreHorizontal className="h-4 w-4" />
																			</Button>
																		</DropdownMenuTrigger>
																		<DropdownMenuContent align="end">
																			<DropdownMenuLabel>
																				Actions
																			</DropdownMenuLabel>

																			{canEditPermissions && (
																				<AddUserPermissions
																					userId={member.user.id}
																				/>
																			)}

																			{canDelete && (
																				<DialogAction
																					title="Delete User"
																					description="Are you sure you want to delete this user?"
																					type="destructive"
																					onClick={async () => {
																						await mutateAsync({
																							userId: member.user.id,
																						})
																							.then(() => {
																								toast.success(
																									"User deleted successfully",
																								);
																								refetch();
																							})
																							.catch((err) => {
																								toast.error(
																									err?.message ||
																										"Error deleting user",
																								);
																							});
																					}}
																				>
																					<DropdownMenuItem
																						className="w-full cursor-pointer text-red-500 hover:!text-red-600"
																						onSelect={(e) => e.preventDefault()}
																					>
																						Delete User
																					</DropdownMenuItem>
																				</DialogAction>
																			)}

																			{canUnlink && (
																				<DialogAction
																					title="Unlink User"
																					description="Are you sure you want to unlink this user?"
																					type="destructive"
																					onClick={async () => {
																						try {
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
																									});
																									toast.success(
																										"User deleted successfully",
																									);
																									refetch();
																									return;
																								}
																							}
																							await removeMember({
																								memberId: member.id,
																							});
																							toast.success(
																								"User unlinked successfully",
																							);
																							refetch();
																						} catch (error: any) {
																							toast.error(
																								error?.message ||
																									"Error unlinking user",
																							);
																						}
																					}}
																				>
																					<DropdownMenuItem
																						className="w-full cursor-pointer text-red-500 hover:!text-red-600"
																						onSelect={(e) => e.preventDefault()}
																					>
																						Unlink User
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
																			No actions available
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
