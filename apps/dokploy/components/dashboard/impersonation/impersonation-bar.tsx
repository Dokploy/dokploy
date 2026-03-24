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
import { useTranslations } from "next-intl";
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
import { useWhitelabeling } from "@/utils/hooks/use-whitelabeling";

type User = typeof authClient.$Infer.Session.user;

export const ImpersonationBar = () => {
	const t = useTranslations("impersonationBar");
	const { config: whitelabeling } = useWhitelabeling();
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
		} catch {
			toast.error(t("toastLoadUsersError"));
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

			toast.success(t("toastImpersonateSuccess"), {
				description: t("toastImpersonateSuccessDesc", {
					name:
						`${selectedUser.name} ${selectedUser.lastName}`.trim() ||
						selectedUser.email,
				}),
			});
			window.location.reload();
		} catch {
			toast.error(t("toastImpersonateError"));
		}
	};

	const handleStopImpersonating = async () => {
		try {
			await authClient.admin.stopImpersonating();
			setIsImpersonating(false);
			setSelectedUser(null);
			setShowBar(false);
			toast.success(t("toastStopSuccess"));
			window.location.reload();
		} catch {
			toast.error(t("toastStopError"));
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
			} catch {
				// Session check failed silently
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
						{isImpersonating ? t("tooltipControls") : t("tooltipUserImpersonation")}
					</TooltipContent>
				</Tooltip>

				<div
					className={cn(
						"fixed bottom-0 left-0 right-0 bg-background border-t border-border p-4 flex items-center justify-center gap-4 z-40 transition-all duration-200 ease-in-out",
						showBar ? "translate-y-0" : "translate-y-full",
					)}
				>
					<div className="flex items-center gap-4 px-4 md:px-20 w-full">
						<Logo
							className="w-10 h-10"
							logoUrl={whitelabeling?.logoUrl || undefined}
						/>
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
															{`${selectedUser.name} ${selectedUser.lastName}`.trim() ||
																""}
														</span>
														<span className="text-xs text-muted-foreground">
															{selectedUser.email}
														</span>
													</span>
												</div>
											) : (
												<>
													<UserIcon className="mr-2 h-4 w-4" />
													<span>{t("selectUserPlaceholder")}</span>
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
													{t("loadingUsers")}
												</div>
											) : (
												<>
													<CommandEmpty>{t("noUsersFound")}</CommandEmpty>
													<CommandList>
														<CommandGroup heading={t("commandHeading")}>
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
																				{`${user.name} ${user.lastName}`.trim() ||
																					""}
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
									{t("impersonate")}
								</Button>
							</div>
						) : (
							<div className="flex items-center gap-4 w-full flex-wrap">
								<div className="flex items-center gap-4 flex-1 flex-wrap">
									<Avatar className="h-10 w-10">
										<AvatarImage
											className="object-cover"
											src={data?.user?.image || ""}
											alt={
												`${data?.user?.firstName} ${data?.user?.lastName}`.trim() ||
												""
											}
										/>
										<AvatarFallback>
											{`${data?.user?.firstName?.[0] || ""}${data?.user?.lastName?.[0] || ""}`.toUpperCase() ||
												"U"}
										</AvatarFallback>
									</Avatar>
									<div className="flex flex-col gap-1">
										<div className="flex items-center gap-2">
											<Badge
												variant="outline"
												className="gap-1 py-1 text-yellow-500 bg-yellow-50/20"
											>
												<Shield className="h-3 w-3" />
												{t("badgeImpersonating")}
											</Badge>
											<span className="font-medium">
												{`${data?.user?.firstName} ${data?.user?.lastName}`.trim() ||
													""}
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
													{t("idPrefix")} {data?.user?.id?.slice(0, 8)}
													<Button
														variant="ghost"
														size="icon"
														className="h-4 w-4 hover:bg-muted/50"
														onClick={() => {
															if (data?.id) {
																copy(data.id);
																toast.success(t("toastIdCopied"));
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
													{t("orgPrefix")} {data?.organizationId?.slice(0, 8)}
													<Button
														variant="ghost"
														size="icon"
														className="h-4 w-4 hover:bg-muted/50"
														onClick={() => {
															if (data?.organizationId) {
																copy(data.organizationId);
																toast.success(t("toastOrgIdCopied"));
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
														{t("customerPrefix")}
														{data?.user?.stripeCustomerId?.slice(0, 8)}
														<Button
															variant="ghost"
															size="icon"
															className="h-4 w-4 hover:bg-muted/50"
															onClick={() => {
																copy(data?.user?.stripeCustomerId || "");
																toast.success(t("toastStripeCustomerCopied"));
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
														{t("subPrefix")}{" "}
														{data?.user?.stripeSubscriptionId?.slice(0, 8)}
														<Button
															variant="ghost"
															size="icon"
															className="h-4 w-4 hover:bg-muted/50"
															onClick={() => {
																copy(data.user.stripeSubscriptionId || "");
																toast.success(t("toastStripeSubCopied"));
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
													<span>
														{t("serversLabel", {
															count: data.user.serversQuantity,
														})}
													</span>
												</span>
											)}
											{data?.createdAt && (
												<span className="flex items-center gap-1">
													<Calendar className="h-3 w-3" />
													{t("createdLabel", {
														date: format(new Date(data.createdAt), "MMM d, yyyy"),
													})}
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
															{t("twoFaBadge", {
																state: data?.user?.twoFactorEnabled
																	? t("twoFaEnabled")
																	: t("twoFaDisabled"),
															})}
														</Badge>
													</span>
												</TooltipTrigger>
												<TooltipContent>{t("twoFaTooltip")}</TooltipContent>
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
									{t("stopImpersonating")}
								</Button>
							</div>
						)}
					</div>
				</div>
			</>
		</TooltipProvider>
	);
};
