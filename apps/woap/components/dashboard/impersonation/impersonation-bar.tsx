"use client";

import copy from "copy-to-clipboard";
import { format } from "date-fns";
import {
	Building2,
	Calendar,
	CheckIcon,
	ChevronsUpDown,
	Copy,
	CreditCard,
	Fingerprint,
	Key,
	Server,
	Settings2,
	Shield,
	UserIcon,
	XIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Logo } from "@/components/shared/logo";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";

type User = typeof authClient.$Infer.Session.user;

export const ImpersonationBar = () => {
	const [users, setUsers] = useState<User[]>([]);
	const [selectedUser, setSelectedUser] = useState<User | null>(null);
	const [isImpersonating, setIsImpersonating] = useState(false);
	const [open, setOpen] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const [showBar, setShowBar] = useState(false);
	const { data } = api.user.get.useQuery();

	const fetchUsers = async (search?: string) => {
		try {
			const session = await authClient.getSession();
			if (session?.data?.session?.impersonatedBy) {
				return;
			}
			setIsLoading(true);
			const response = await authClient.admin.listUsers({
				query: {
					limit: 30,
					...(search && {
						searchField: "email",
						searchOperator: "contains",
						searchValue: search,
					}),
				},
			});

			const filteredUsers = response.data?.users.filter(
				// @ts-ignore
				(user) => user.allowImpersonation && data?.user?.email !== user.email,
			);

			if (!response.error) {
				// @ts-ignore
				setUsers(filteredUsers || []);
			}
		} catch (error) {
			console.error("Error fetching users:", error);
			toast.error("Error loading users");
		} finally {
			setIsLoading(false);
		}
	};

	const handleImpersonate = async () => {
		if (!selectedUser) return;

		try {
			await authClient.admin.impersonateUser({
				userId: selectedUser.id,
			});
			setIsImpersonating(true);
			setOpen(false);

			toast.success("Successfully impersonating user", {
				description: `You are now viewing as ${selectedUser.name || selectedUser.email}`,
			});
			window.location.reload();
		} catch (error) {
			console.error("Error impersonating user:", error);
			toast.error("Error impersonating user");
		}
	};

	const handleStopImpersonating = async () => {
		try {
			await authClient.admin.stopImpersonating();
			setIsImpersonating(false);
			setSelectedUser(null);
			setShowBar(false);
			toast.success("Stopped impersonating user");
			window.location.reload();
		} catch (error) {
			console.error("Error stopping impersonation:", error);
			toast.error("Error stopping impersonation");
		}
	};

	useEffect(() => {
		const checkImpersonation = async () => {
			try {
				const session = await authClient.getSession();
				if (session?.data?.session?.impersonatedBy) {
					setIsImpersonating(true);
					setShowBar(true);
					// setSelectedUser(data);
				}
			} catch (error) {
				console.error("Error checking impersonation status:", error);
			}
		};

		checkImpersonation();
		fetchUsers();
	}, []);

	return (
		<TooltipProvider>
			<>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="outline"
							size="icon"
							className={cn(
								"fixed bottom-4 right-4 z-50 rounded-full shadow-lg",
								isImpersonating &&
									!showBar &&
									"bg-red-100 hover:bg-red-200 border-red-200",
							)}
							onClick={() => setShowBar(!showBar)}
						>
							<Settings2
								className={cn(
									"h-4 w-4",
									isImpersonating && !showBar && "text-red-500",
								)}
							/>
						</Button>
					</TooltipTrigger>
					<TooltipContent>
						{isImpersonating ? "Impersonation Controls" : "User Impersonation"}
					</TooltipContent>
				</Tooltip>

				<div
					className={cn(
						"fixed bottom-0 left-0 right-0 bg-background border-t border-border p-4 flex items-center justify-center gap-4 z-40 transition-all duration-200 ease-in-out",
						showBar ? "translate-y-0" : "translate-y-full",
					)}
				>
					<div className="flex items-center gap-4 px-4 md:px-20 w-full">
						<Logo className="w-10 h-10" />
						{!isImpersonating ? (
							<div className="flex items-center gap-2 w-full">
								<Popover open={open} onOpenChange={setOpen}>
									<PopoverTrigger asChild>
										<Button
											variant="outline"
											aria-expanded={open}
											className="w-[300px] justify-between"
										>
											{selectedUser ? (
												<div className="flex items-center gap-2">
													<UserIcon className="mr-2 h-4 w-4 flex-shrink-0" />
													<span className="truncate flex flex-col items-start">
														<span className="text-sm font-medium">
															{selectedUser.name || ""}
														</span>
														<span className="text-xs text-muted-foreground">
															{selectedUser.email}
														</span>
													</span>
												</div>
											) : (
												<>
													<UserIcon className="mr-2 h-4 w-4" />
													<span>Select user to impersonate</span>
												</>
											)}
											<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
										</Button>
									</PopoverTrigger>
									<PopoverContent className="w-[300px] p-0" align="start">
										<Command>
											<CommandInput
												placeholder="Search users by email or name..."
												onValueChange={(search) => {
													fetchUsers(search);
												}}
												className="h-9"
											/>
											{isLoading ? (
												<div className="py-6 text-center text-sm">
													Loading users...
												</div>
											) : (
												<>
													<CommandEmpty>No users found.</CommandEmpty>
													<CommandList>
														<CommandGroup heading="All Users">
															{users.map((user) => (
																<CommandItem
																	key={user.id}
																	value={user.email}
																	onSelect={() => {
																		setSelectedUser(user);
																		setOpen(false);
																	}}
																>
																	<span className="flex items-center gap-2 flex-1">
																		<UserIcon className="h-4 w-4 flex-shrink-0" />
																		<span className="flex flex-col items-start">
																			<span className="text-sm font-medium">
																				{user.name || ""}
																			</span>
																			<span className="text-xs text-muted-foreground">
																				{user.email} • {user.role}
																			</span>
																		</span>
																	</span>
																	<CheckIcon
																		className={cn(
																			"ml-auto h-4 w-4",
																			selectedUser?.id === user.id
																				? "opacity-100"
																				: "opacity-0",
																		)}
																	/>
																</CommandItem>
															))}
														</CommandGroup>
													</CommandList>
												</>
											)}
										</Command>
									</PopoverContent>
								</Popover>
								<Button
									onClick={handleImpersonate}
									disabled={!selectedUser}
									variant="default"
									className="gap-2"
								>
									<Shield className="h-4 w-4" />
									Impersonate
								</Button>
							</div>
						) : (
							<div className="flex items-center gap-4 w-full flex-wrap">
								<div className="flex items-center gap-4 flex-1 flex-wrap">
									<Avatar className="h-10 w-10">
										<AvatarImage
											src={data?.user?.image || ""}
											alt={data?.user?.name || ""}
										/>
										<AvatarFallback>
											{data?.user?.name?.slice(0, 2).toUpperCase() || "U"}
										</AvatarFallback>
									</Avatar>
									<div className="flex flex-col gap-1">
										<div className="flex items-center gap-2">
											<Badge
												variant="outline"
												className="gap-1 py-1 text-yellow-500 bg-yellow-50/20"
											>
												<Shield className="h-3 w-3" />
												Impersonating
											</Badge>
											<span className="font-medium">
												{data?.user?.name || ""}
											</span>
										</div>
										<div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
											<span className="flex items-center gap-1">
												<UserIcon className="h-3 w-3" />
												{data?.user?.email} • {data?.role}
											</span>
											<span className="flex items-center gap-1">
												<Key className="h-3 w-3" />
												<span className="flex items-center gap-1">
													ID: {data?.user?.id?.slice(0, 8)}
													<Button
														variant="ghost"
														size="icon"
														className="h-4 w-4 hover:bg-muted/50"
														onClick={() => {
															if (data?.id) {
																copy(data.id);
																toast.success("ID copied to clipboard");
															}
														}}
													>
														<Copy className="h-3 w-3" />
													</Button>
												</span>
											</span>
											<span className="flex items-center gap-1">
												<Building2 className="h-3 w-3" />
												<span className="flex items-center gap-1">
													Org: {data?.organizationId?.slice(0, 8)}
													<Button
														variant="ghost"
														size="icon"
														className="h-4 w-4 hover:bg-muted/50"
														onClick={() => {
															if (data?.organizationId) {
																copy(data.organizationId);
																toast.success(
																	"Organization ID copied to clipboard",
																);
															}
														}}
													>
														<Copy className="h-3 w-3" />
													</Button>
												</span>
											</span>
											{data?.user?.stripeCustomerId && (
												<span className="flex items-center gap-1">
													<CreditCard className="h-3 w-3" />
													<span className="flex items-center gap-1">
														Customer:
														{data?.user?.stripeCustomerId?.slice(0, 8)}
														<Button
															variant="ghost"
															size="icon"
															className="h-4 w-4 hover:bg-muted/50"
															onClick={() => {
																copy(data?.user?.stripeCustomerId || "");
																toast.success(
																	"Stripe Customer ID copied to clipboard",
																);
															}}
														>
															<Copy className="h-3 w-3" />
														</Button>
													</span>
												</span>
											)}
											{data?.user?.stripeSubscriptionId && (
												<span className="flex items-center gap-1">
													<CreditCard className="h-3 w-3" />
													<span className="flex items-center gap-1">
														Sub: {data?.user?.stripeSubscriptionId?.slice(0, 8)}
														<Button
															variant="ghost"
															size="icon"
															className="h-4 w-4 hover:bg-muted/50"
															onClick={() => {
																copy(data.user.stripeSubscriptionId || "");
																toast.success(
																	"Stripe Subscription ID copied to clipboard",
																);
															}}
														>
															<Copy className="h-3 w-3" />
														</Button>
													</span>
												</span>
											)}
											{data?.user?.serversQuantity !== undefined && (
												<span className="flex items-center gap-1">
													<Server className="h-3 w-3" />
													<span>Servers: {data.user.serversQuantity}</span>
												</span>
											)}
											{data?.createdAt && (
												<span className="flex items-center gap-1">
													<Calendar className="h-3 w-3" />
													Created:{" "}
													{format(new Date(data.createdAt), "MMM d, yyyy")}
												</span>
											)}
											<Tooltip>
												<TooltipTrigger asChild>
													<span className="flex items-center gap-1 cursor-default">
														<Fingerprint
															className={cn(
																"h-3 w-3",
																data?.user?.twoFactorEnabled
																	? "text-green-500"
																	: "text-muted-foreground",
															)}
														/>
														<Badge
															variant={
																data?.user?.twoFactorEnabled
																	? "green"
																	: "secondary"
															}
															className="text-[10px] px-1 py-0"
														>
															2FA{" "}
															{data?.user?.twoFactorEnabled
																? "Enabled"
																: "Disabled"}
														</Badge>
													</span>
												</TooltipTrigger>
												<TooltipContent>
													Two-Factor Authentication Status
												</TooltipContent>
											</Tooltip>
										</div>
									</div>
								</div>
								<Button
									onClick={handleStopImpersonating}
									variant="secondary"
									className="gap-2"
									size="sm"
								>
									<XIcon className="w-4 h-4" />
									Stop Impersonating
								</Button>
							</div>
						)}
					</div>
				</div>
			</>
		</TooltipProvider>
	);
};
