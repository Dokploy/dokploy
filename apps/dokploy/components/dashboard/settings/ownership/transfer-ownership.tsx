import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import copy from "copy-to-clipboard";
import { CheckIcon, ChevronsUpDown, Crown } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AlertBlock } from "@/components/shared/alert-block";
import { DialogAction } from "@/components/shared/dialog-action";
import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { api, type RouterOutputs } from "@/utils/api";
import { OrganizationsDialog } from "./organizations-dialog";

const transferOwnershipSchema = z.object({
	email: z.string().min(1, "Select the new owner"),
});

type TransferOwnership = z.infer<typeof transferOwnershipSchema>;
type Recipient = RouterOutputs["ownershipTransfer"]["recipients"][number];

const nameOf = (recipient: Recipient) =>
	[recipient.firstName, recipient.lastName].filter(Boolean).join(" ");

export const TransferOwnership = () => {
	const utils = api.useUtils();
	const { data: status } = api.ownershipTransfer.status.useQuery();
	const { data: hasPassword } = api.user.hasPassword.useQuery();
	const { mutateAsync: createTransfer, isPending: isCreating } =
		api.ownershipTransfer.create.useMutation();
	const { mutateAsync: cancelTransfer, isPending: isCanceling } =
		api.ownershipTransfer.cancel.useMutation();
	const { data: recipients, isLoading: isLoadingRecipients } =
		api.ownershipTransfer.recipients.useQuery(undefined, {
			enabled: !!status?.isInstanceOwner && !status.pending,
		});
	const [pickerOpen, setPickerOpen] = useState(false);
	const [confirmOpen, setConfirmOpen] = useState(false);
	const [recipient, setRecipient] = useState<Recipient | null>(null);
	const [password, setPassword] = useState("");
	const [confirmError, setConfirmError] = useState<string | null>(null);

	const form = useForm<TransferOwnership>({
		defaultValues: { email: "" },
		resolver: zodResolver(transferOwnershipSchema),
	});

	if (!status?.isInstanceOwner || hasPassword === undefined) {
		return null;
	}

	const pending = status.pending;
	const organizationCount = status.ownedOrganizations.length;
	const transferLink = `${window.location.origin}/ownership-transfer`;

	const recipientName = recipient ? nameOf(recipient) : "";

	const closeConfirm = () => {
		setConfirmOpen(false);
		setPassword("");
		setConfirmError(null);
	};

	const onSubmit = (values: TransferOwnership) => {
		const selected = recipients?.find((user) => user.email === values.email);
		if (!selected) {
			form.setError("email", { message: "Select the new owner" });
			return;
		}
		setRecipient(selected);
		setConfirmOpen(true);
	};

	const onConfirm = async () => {
		if (!recipient) return;
		setConfirmError(null);
		await createTransfer({ email: recipient.email, password })
			.then(async () => {
				closeConfirm();
				form.reset();
				toast.success("Ownership transfer invitation created");
				copy(transferLink);
				toast.success("Invitation link copied to clipboard");
				await utils.ownershipTransfer.status.invalidate();
			})
			.catch((error) => {
				setPassword("");
				setConfirmError(error?.message || "Error creating ownership transfer");
			});
	};

	return (
		<div className="w-full">
			<Card className="h-full bg-sidebar p-2.5 rounded-xl max-w-5xl mx-auto">
				<div className="rounded-xl bg-background shadow-md">
					<CardHeader>
						<CardTitle className="text-xl flex flex-row gap-2">
							<Crown className="size-6 text-muted-foreground self-center" />
							Instance Ownership
						</CardTitle>
						<CardDescription>
							Transfer ownership of this Dokploy instance and every organization
							you own to another user. You will stay in those organizations as a
							member.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-6 py-6 border-t">
						<p className="text-sm font-medium">
							{organizationCount === 0
								? "You don't own any organizations, so only instance ownership will be transferred."
								: organizationCount === 1
									? "The organization you own will be transferred."
									: `All ${organizationCount} organizations you own will be transferred.`}{" "}
							<OrganizationsDialog organizations={status.ownedOrganizations} />
						</p>

						{pending ? (
							<div className="flex flex-col gap-4">
								<AlertBlock type="info">
									Waiting for{" "}
									<strong className="break-words">
										{pending.toUser.email}
									</strong>{" "}
									to accept. The invitation expires on{" "}
									{new Date(pending.expiresAt).toLocaleString()}.
								</AlertBlock>
								<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
									<Button
										className="w-full sm:w-auto"
										variant="secondary"
										onClick={() => {
											copy(transferLink);
											toast.success("Invitation link copied to clipboard");
										}}
									>
										Copy Invitation Link
									</Button>
									<DialogAction
										title="Cancel Ownership Transfer"
										description={`The invitation for ${pending.toUser.email} will stop working.`}
										type="destructive"
										onClick={async () => {
											await cancelTransfer()
												.then(async () => {
													toast.success("Ownership transfer canceled");
													await utils.ownershipTransfer.status.invalidate();
												})
												.catch((error) => {
													toast.error(
														error?.message ||
															"Error canceling ownership transfer",
													);
												});
										}}
									>
										<Button
											className="w-full sm:w-auto"
											variant="destructive"
											isLoading={isCanceling}
										>
											Cancel Transfer
										</Button>
									</DialogAction>
								</div>
							</div>
						) : !hasPassword ? (
							<AlertBlock type="warning">
								Your account has no password, so ownership can't be transferred
								from here. Someone with access to the server can run{" "}
								<code>pnpm run transfer-ownership &lt;email&gt;</code> inside
								the Dokploy container instead.
							</AlertBlock>
						) : (
							<Form {...form}>
								<form
									onSubmit={form.handleSubmit(onSubmit)}
									className="flex flex-col gap-4"
								>
									<FormField
										control={form.control}
										name="email"
										render={({ field }) => {
											const selected = recipients?.find(
												(user) => user.email === field.value,
											);
											return (
												<FormItem className="flex flex-col">
													<FormLabel>New owner</FormLabel>
													<Popover
														open={pickerOpen}
														onOpenChange={setPickerOpen}
													>
														<PopoverTrigger asChild>
															<FormControl>
																<Button
																	variant="outline"
																	className={cn(
																		"w-full justify-between",
																		!selected && "text-muted-foreground",
																	)}
																>
																	<span className="truncate">
																		{isLoadingRecipients
																			? "Loading..."
																			: selected
																				? nameOf(selected)
																					? `${nameOf(selected)} (${selected.email})`
																					: selected.email
																				: "Select a user"}
																	</span>
																	<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
																</Button>
															</FormControl>
														</PopoverTrigger>
														<PopoverContent
															className="w-[var(--radix-popover-trigger-width)] p-0"
															align="start"
														>
															<Command>
																<CommandInput
																	placeholder="Search by name or email..."
																	className="h-9"
																/>
																<CommandList className="max-h-42">
																	<CommandEmpty>No users found.</CommandEmpty>
																	<CommandGroup>
																		{recipients?.map((user) => (
																			<CommandItem
																				key={user.id}
																				value={`${nameOf(user)} ${user.email}`}
																				onSelect={() => {
																					field.onChange(user.email);
																					setPickerOpen(false);
																				}}
																			>
																				<span className="flex min-w-0 items-center gap-2">
																					<span className="truncate">
																						{nameOf(user) || user.email}
																					</span>
																					{nameOf(user) && (
																						<span className="truncate text-xs text-muted-foreground">
																							{user.email}
																						</span>
																					)}
																				</span>
																				<CheckIcon
																					className={cn(
																						"ml-auto h-4 w-4",
																						user.email === field.value
																							? "opacity-100"
																							: "opacity-0",
																					)}
																				/>
																			</CommandItem>
																		))}
																	</CommandGroup>
																</CommandList>
															</Command>
														</PopoverContent>
													</Popover>
													<FormDescription>
														The user will get a pending invitation and you can
														share the link with them.
													</FormDescription>
													<FormMessage />
												</FormItem>
											);
										}}
									/>
									<div className="flex justify-end">
										<Button
											type="submit"
											className="w-full sm:w-auto"
											disabled={!form.watch("email")}
										>
											Transfer Ownership
										</Button>
									</div>
								</form>
							</Form>
						)}
					</CardContent>
				</div>
			</Card>

			<AlertDialog
				open={confirmOpen}
				onOpenChange={(next) => {
					if (!next && !isCreating) closeConfirm();
				}}
			>
				<AlertDialogContent>
					<form
						onSubmit={(event) => {
							event.preventDefault();
							void onConfirm();
						}}
						className="grid gap-4"
					>
						<AlertDialogHeader>
							<AlertDialogTitle>Confirm ownership transfer</AlertDialogTitle>
							<AlertDialogDescription>
								Enter your password to send the invitation to{" "}
								<strong className="break-words text-foreground">
									{recipientName
										? `${recipientName} (${recipient?.email})`
										: recipient?.email}
								</strong>
								. Once they accept, they become the instance owner
								{organizationCount === 0
									? ""
									: organizationCount === 1
										? " and own your organization, and you become a member there"
										: ` and own all ${organizationCount} of your organizations, and you become a member in them`}
								. You can't undo this yourself.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<div className="flex flex-col gap-2">
							<Label htmlFor="transfer-ownership-password">Your password</Label>
							<Input
								id="transfer-ownership-password"
								type="password"
								autoComplete="current-password"
								autoFocus
								value={password}
								onChange={(event) => setPassword(event.target.value)}
								aria-invalid={!!confirmError}
								aria-describedby={
									confirmError ? "transfer-ownership-error" : undefined
								}
							/>
							{confirmError && (
								<p
									id="transfer-ownership-error"
									role="alert"
									className="text-sm text-destructive"
								>
									{confirmError}
								</p>
							)}
						</div>
						<AlertDialogFooter>
							<AlertDialogCancel type="button" disabled={isCreating}>
								Cancel
							</AlertDialogCancel>
							<Button
								type="submit"
								variant="destructive"
								isLoading={isCreating}
								disabled={!password}
							>
								Transfer Ownership
							</Button>
						</AlertDialogFooter>
					</form>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
};
