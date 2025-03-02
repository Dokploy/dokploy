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
	TableCaption,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { api } from "@/utils/api";
import copy from "copy-to-clipboard";
import { format } from "date-fns";
import { MoreHorizontal, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AddUserPermissions } from "./add-permissions";
import { AddUser } from "./add-user";

import { DialogAction } from "@/components/shared/dialog-action";
import { Loader2 } from "lucide-react";

export const ShowUsers = () => {
	const { data, isLoading, refetch } = api.user.all.useQuery();
	const { mutateAsync, isLoading: isRemoving } =
		api.admin.removeUser.useMutation();

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
										<AddUser />
									</div>
								) : (
									<div className="flex flex-col gap-4  min-h-[25vh]">
										<Table>
											<TableCaption>See all users</TableCaption>
											<TableHeader>
												<TableRow>
													<TableHead className="w-[100px]">Email</TableHead>
													<TableHead className="text-center">Status</TableHead>
													<TableHead className="text-center">2FA</TableHead>
													<TableHead className="text-center">
														Expiration
													</TableHead>
													<TableHead className="text-right">Actions</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{data?.map((user) => {
													return (
														<TableRow key={user.userId}>
															<TableCell className="w-[100px]">
																{user.auth.email}
															</TableCell>
															<TableCell className="text-center">
																<Badge
																	variant={
																		user.isRegistered ? "default" : "secondary"
																	}
																>
																	{user.isRegistered
																		? "Registered"
																		: "Not Registered"}
																</Badge>
															</TableCell>
															<TableCell className="text-center">
																{user.auth.is2FAEnabled
																	? "2FA Enabled"
																	: "2FA Not Enabled"}
															</TableCell>
															<TableCell className="text-right">
																<span className="text-sm text-muted-foreground">
																	{format(
																		new Date(user.expirationDate),
																		"PPpp",
																	)}
																</span>
															</TableCell>

															<TableCell className="text-right flex justify-end">
																<DropdownMenu>
																	<DropdownMenuTrigger asChild>
																		<Button
																			variant="ghost"
																			className="h-8 w-8 p-0"
																		>
																			<span className="sr-only">Open menu</span>
																			<MoreHorizontal className="h-4 w-4" />
																		</Button>
																	</DropdownMenuTrigger>
																	<DropdownMenuContent align="end">
																		<DropdownMenuLabel>
																			Actions
																		</DropdownMenuLabel>
																		{!user.isRegistered && (
																			<DropdownMenuItem
																				className="w-full cursor-pointer"
																				onSelect={(e) => {
																					copy(
																						`${origin}/invitation?token=${user.token}`,
																					);
																					toast.success(
																						"Invitation Copied to clipboard",
																					);
																				}}
																			>
																				Copy Invitation
																			</DropdownMenuItem>
																		)}

																		{user.isRegistered && (
																			<AddUserPermissions
																				userId={user.userId}
																			/>
																		)}

																		<DialogAction
																			title="Delete User"
																			description="Are you sure you want to delete this user?"
																			type="destructive"
																			onClick={async () => {
																				await mutateAsync({
																					authId: user.authId,
																				})
																					.then(() => {
																						toast.success(
																							"User deleted successfully",
																						);
																						refetch();
																					})
																					.catch(() => {
																						toast.error(
																							"Error deleting destination",
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
																	</DropdownMenuContent>
																</DropdownMenu>
															</TableCell>
														</TableRow>
													);
												})}
											</TableBody>
										</Table>

										<div className="flex flex-row gap-2 flex-wrap w-full justify-end mr-4">
											<AddUser />
										</div>
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
