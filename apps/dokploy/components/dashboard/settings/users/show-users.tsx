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
import { DeleteUser } from "./delete-user";

export const ShowUsers = () => {
	const { data } = api.user.all.useQuery();
	const [url, setUrl] = useState("");
	useEffect(() => {
		setUrl(document.location.origin);
	}, []);

	return (
		<div className=" col-span-2">
			<Card className="bg-transparent  ">
				<CardHeader className="flex flex-row gap-2 justify-between w-full flex-wrap">
					<div className="flex flex-col gap-2">
						<CardTitle className="text-xl">Users</CardTitle>
						<CardDescription>Add, manage and delete users.</CardDescription>
					</div>

					{data && data.length > 0 && (
						<div className="flex flex-col gap-3 items-end">
							<AddUser />
						</div>
					)}
				</CardHeader>
				<CardContent className="space-y-2">
					{data?.length === 0 ? (
						<div className="flex flex-col items-center gap-3 h-full">
							<Users className="size-8 self-center text-muted-foreground" />
							<span className="text-base text-muted-foreground">
								To create a user, you need to add:
							</span>
							<AddUser />
						</div>
					) : (
						<div className="flex flex-col gap-6">
							<Table>
								<TableCaption>See all users</TableCaption>
								<TableHeader>
									<TableRow>
										<TableHead className="w-[100px]">Email</TableHead>
										<TableHead className="text-center">Status</TableHead>
										<TableHead className="text-center">2FA</TableHead>
										<TableHead className="text-center">Expiration</TableHead>
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
														{format(new Date(user.expirationDate), "PPpp")}
													</span>
												</TableCell>

												<TableCell className="text-right flex justify-end">
													<DropdownMenu>
														<DropdownMenuTrigger asChild>
															<Button variant="ghost" className="h-8 w-8 p-0">
																<span className="sr-only">Open menu</span>
																<MoreHorizontal className="h-4 w-4" />
															</Button>
														</DropdownMenuTrigger>
														<DropdownMenuContent align="end">
															<DropdownMenuLabel>Actions</DropdownMenuLabel>
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
																<AddUserPermissions userId={user.userId} />
															)}

															<DeleteUser authId={user.authId} />
														</DropdownMenuContent>
													</DropdownMenu>
												</TableCell>
											</TableRow>
										);
									})}
								</TableBody>
							</Table>
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
};
