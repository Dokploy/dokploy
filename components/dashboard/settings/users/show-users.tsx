import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { api } from "@/utils/api";
import { CopyIcon, Users } from "lucide-react";
import { AddUser } from "./add-user";
import { DeleteUser } from "./delete-user";
import { format } from "date-fns";
import { useEffect, useState } from "react";
import { AddUserPermissions } from "./add-permissions";
import copy from "copy-to-clipboard";
import { toast } from "sonner";
import { UpdateUser } from "./update-user";

export const ShowUsers = () => {
	const { data } = api.user.all.useQuery();
	const [url, setUrl] = useState("");
	useEffect(() => {
		setUrl(document.location.origin);
	}, []);

	return (
		<div className="h-full col-span-2">
			<Card className="bg-transparent h-full border-none">
				<CardHeader>
					<CardTitle className="text-xl">Users</CardTitle>
					<CardDescription>Add, manage and delete users.</CardDescription>
				</CardHeader>
				<CardContent className="space-y-2 h-full">
					{data?.length === 0 ? (
						<div className="flex flex-col items-center gap-3">
							<Users className="size-8 self-center text-muted-foreground" />
							<span className="text-base text-muted-foreground">
								To create a user is required to add
							</span>
							<AddUser />
						</div>
					) : (
						<div className="flex flex-col gap-6">
							{data?.map((user) => {
								return (
									<div
										key={user.userId}
										className="flex gap-2 flex-col justify-start border p-4 rounded-lg"
									>
										<span className="text-sm text-muted-foreground">
											{user.auth.email}
										</span>
										{!user.isRegistered && (
											<span className="text-sm text-muted-foreground">
												Expire In{" "}
												{format(new Date(user.expirationDate), "PPpp")}
											</span>
										)}

										<span className="text-sm text-muted-foreground">
											{user.isRegistered ? "Registered" : "Not Registered"}
										</span>
										{user.auth.is2FAEnabled && (
											<span className="text-sm text-muted-foreground">
												{user.auth.is2FAEnabled
													? "2FA Enabled"
													: "2FA Not Enabled"}
											</span>
										)}

										<div className="flex flex-wrap flex-row gap-3">
											{!user.isRegistered && (
												<div className="overflow-x-auto flex flex-row gap-4 items-center">
													<div className="overflow-x-auto">
														<span className="text-sm text-muted-foreground ">
															{`${url}/invitation?token=${user.token}`}
														</span>
													</div>
													<button
														type="button"
														// className="absolute right-2 top-2"
														onClick={() => {
															copy(`${url}/invitation?token=${user.token}`);
															toast.success("Invitation Copied to clipboard");
														}}
													>
														<CopyIcon className="size-4 text-muted-foreground" />
													</button>
												</div>
											)}

											{user.isRegistered && (
												<AddUserPermissions userId={user.userId} />
											)}
											{user.isRegistered && <UpdateUser authId={user.authId} />}
											<DeleteUser authId={user.authId} />
										</div>
									</div>
								);
							})}
							<div className="flex flex-col justify-end gap-3 w-full items-end">
								<AddUser />
							</div>
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
};
