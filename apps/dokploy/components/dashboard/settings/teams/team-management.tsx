import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/utils/api";
import {
	type AssignableTeamRole,
	teamRoles,
} from "@dokploy/server/db/schema/team-schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { formatDistanceToNow } from "date-fns";
import { LinkIcon, MoreHorizontal, PlusIcon, UsersIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AddMemberPermissions } from "./add-member-permissions";

interface Props {
	teamId: string;
}

const OWNER_ROLE = "OWNER" as AssignableTeamRole;

const inviteTeamMember = z.object({
	email: z
		.string()
		.min(1, "Email is required")
		.email({ message: "Invalid email" }),
	role: z.enum(["ADMIN", "MEMBER", "GUEST"]),
});

type InviteTeamMember = z.infer<typeof inviteTeamMember>;

const generateInviteSchema = z.object({
	expirationDays: z
		.number({
			required_error: "Expiration days is required",
		})
		.min(1, "Must be at least 1 day")
		.max(30, "Cannot exceed 30 days"),
	role: z.enum(["ADMIN", "MEMBER", "GUEST"]),
	isMultiUser: z.boolean(),
});

type GenerateInvite = z.infer<typeof generateInviteSchema>;

export const TeamManagement = ({ teamId }: Props) => {
	const [isOpen, setIsOpen] = useState(false);
	const utils = api.useContext();
	const { data: team, refetch } = api.team.byId.useQuery({ teamId });
	const { mutateAsync: updateRole, isLoading: isUpdating } =
		api.team.updateMember.useMutation({
			onSuccess: () => {
				utils.team.byId.invalidate({ teamId });
			},
		});

	const { data: invitations, refetch: refetchInvitations } =
		api.team.invitations.listByTeam.useQuery({ teamId });

	const { mutateAsync: createInvitation } =
		api.team.invitations.inviteMember.useMutation({
			onSuccess: () => {
				refetchInvitations();
				setShowInviteDialog(false);
				form.reset();
				toast.success("Invitation sent successfully");
			},
			onError: () => {
				toast.error("Failed to send invitation");
			},
		});

	const { mutateAsync: revokeInvitation } =
		api.team.invitations.revokeInvitation.useMutation({
			onSuccess: () => {
				refetchInvitations();
			},
		});

	const { mutateAsync: generateInvite } =
		api.team.invitations.generateInvite.useMutation({
			onSuccess: (data) => {
				setGeneratedInvite(data);
				setShowGenerateDialog(false);
				generateForm.reset();
				refetchInvitations();
				toast.success("Invitation link generated successfully");
			},
			onError: () => {
				toast.error("Failed to generate invitation");
			},
		});

	const { mutateAsync: deleteUser, isLoading: isDeleting } =
		api.team.users.delete.useMutation({
			onSuccess: () => {
				utils.team.byId.invalidate({ teamId });
				toast.success("User deleted successfully");
			},
			onError: (error) => {
				toast.error(error.message || "Failed to delete user");
			},
		});

	const [email, setEmail] = useState("");
	const [selectedRole, setSelectedRole] = useState<AssignableTeamRole>("GUEST");
	const [linkRole, setLinkRole] = useState<AssignableTeamRole>("GUEST");
	const [generatedLink, setGeneratedLink] = useState<string | null>(null);
	const [isGeneratingLink, setIsGeneratingLink] = useState(false);
	const [showInviteDialog, setShowInviteDialog] = useState(false);
	const [showGenerateDialog, setShowGenerateDialog] = useState(false);
	const [showDeleteUserDialog, setShowDeleteUserDialog] = useState(false);
	const [userToDelete, setUserToDelete] = useState<{
		id: string;
		email: string;
	} | null>(null);
	const [generatedInvite, setGeneratedInvite] = useState<{
		id: string;
		token: string;
		inviteLink: string;
	} | null>(null);
	const [selectedInvites, setSelectedInvites] = useState<string[]>([]);

	const form = useForm<InviteTeamMember>({
		defaultValues: {
			email: "",
			role: "GUEST",
		},
		resolver: zodResolver(inviteTeamMember),
	});

	const generateForm = useForm<GenerateInvite>({
		defaultValues: {
			expirationDays: 7,
			role: "GUEST",
			isMultiUser: false,
		},
		resolver: zodResolver(generateInviteSchema),
	});

	useEffect(() => {
		form.reset();
	}, [form, form.formState.isSubmitSuccessful]);

	const handleUpdateRole = async (userId: string, role: AssignableTeamRole) => {
		try {
			await updateRole({ teamId, userId, role });
			toast.success("Member role updated successfully");
			refetch();
		} catch (error) {
			toast.error("Failed to update member role");
		}
	};

	const handleRevokeInvitation = async (invitationId: string) => {
		try {
			await revokeInvitation({ invitationId });
			toast.success("Invitation revoked successfully");
		} catch (error) {
			toast.error("Failed to revoke invitation");
		}
	};

	const handleGenerateInvite = async (data: GenerateInvite) => {
		const expirationDate = new Date();
		expirationDate.setDate(expirationDate.getDate() + data.expirationDays);

		await generateInvite({
			teamId,
			expirationDate,
			role: data.role,
		});
	};

	const handleBulkDelete = async () => {
		try {
			await Promise.all(
				selectedInvites.map((id) => revokeInvitation({ invitationId: id })),
			);
			toast.success("Selected invitations deleted");
			setSelectedInvites([]);
		} catch (error) {
			toast.error("Failed to delete some invitations");
		}
	};

	const handleDeleteUser = async (userId: string) => {
		try {
			await deleteUser({ userId });
			setShowDeleteUserDialog(false);
			setUserToDelete(null);
		} catch (error) {
			toast.error("Failed to delete user");
		}
	};

	return (
		<>
			<Dialog open={isOpen} onOpenChange={setIsOpen}>
				<DialogTrigger asChild>
					<DropdownMenuItem
						className="w-full cursor-pointer"
						onSelect={(e) => e.preventDefault()}
					>
						Manage Team
					</DropdownMenuItem>
				</DialogTrigger>

				<DialogContent className="sm:max-w-4xl overflow-y-auto max-h-screen">
					<DialogHeader>
						<div className="flex flex-col gap-1.5">
							<DialogTitle className="flex items-center gap-2">
								<UsersIcon className="size-5" /> Team Management
							</DialogTitle>
							<p className="text-muted-foreground text-sm">
								Manage team members and invitation links
							</p>
						</div>
					</DialogHeader>

					<Tabs defaultValue="invitations" className="w-full">
						<TabsList className="grid w-full grid-cols-2">
							<TabsTrigger value="members" className="flex items-center gap-2">
								<UsersIcon className="size-4" /> Members
							</TabsTrigger>
							<TabsTrigger
								value="invitations"
								className="flex items-center gap-2"
							>
								<LinkIcon className="size-4" /> Invitation Links
							</TabsTrigger>
						</TabsList>

						<TabsContent value="members" className="mt-4">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead className="w-[100px]">Email</TableHead>
										<TableHead className="text-center">Team Role</TableHead>
										<TableHead className="text-center">User Status</TableHead>
										<TableHead className="text-center">2FA</TableHead>
										<TableHead className="text-right">Actions</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{team?.members
										?.filter((member) => member.user)
										?.map((member) => (
											<TableRow key={member.userId}>
												<TableCell>{member.user?.email}</TableCell>
												<TableCell className="text-center">
													<div className="flex justify-center">
														<Select
															value={member.role}
															onValueChange={(value: AssignableTeamRole) =>
																handleUpdateRole(member.userId, value)
															}
															disabled={
																isUpdating || member.role === OWNER_ROLE
															}
														>
															<SelectTrigger className="w-fit min-w-[100px] bg-muted">
																<SelectValue />
															</SelectTrigger>
															<SelectContent>
																{teamRoles.map((role) => (
																	<SelectItem key={role} value={role}>
																		{role}
																	</SelectItem>
																))}
															</SelectContent>
														</Select>
													</div>
												</TableCell>
												<TableCell className="text-center">
													<Badge
														variant={
															member.user?.isRegistered
																? "default"
																: "secondary"
														}
													>
														{member.user?.isRegistered
															? "Registered"
															: "Not Registered"}
													</Badge>
												</TableCell>
												<TableCell className="text-center">
													<Badge
														variant={
															member.user?.auth?.is2FAEnabled
																? "default"
																: "outline"
														}
													>
														{member.user?.auth?.is2FAEnabled
															? "2FA Enabled"
															: "2FA Disabled"}
													</Badge>
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
															<DropdownMenuLabel>
																Team Actions
															</DropdownMenuLabel>
															{member.role === OWNER_ROLE ? (
																<>
																	<DropdownMenuItem
																		className="cursor-pointer"
																		onSelect={(e) => {
																			e.preventDefault();
																			toast.info(
																				"Transfer ownership coming soon",
																			);
																		}}
																	>
																		Transfer Ownership
																	</DropdownMenuItem>
																	<DropdownMenuItem
																		className="cursor-pointer"
																		onSelect={(e) => {
																			e.preventDefault();
																			toast.info("Activity log coming soon");
																		}}
																	>
																		View Activity Log
																	</DropdownMenuItem>
																</>
															) : (
																<>
																	<AddMemberPermissions
																		teamId={teamId}
																		userId={member.userId}
																	/>
																	<DropdownMenuItem
																		className="text-destructive cursor-pointer"
																		onSelect={(e) => {
																			e.preventDefault();
																			setUserToDelete({
																				id: member.userId,
																				email: member.user?.email || "",
																			});
																			setShowDeleteUserDialog(true);
																		}}
																		disabled={isDeleting}
																	>
																		Delete User
																	</DropdownMenuItem>
																</>
															)}
														</DropdownMenuContent>
													</DropdownMenu>
												</TableCell>
											</TableRow>
										))}

									{!team?.members?.length && (
										<TableRow>
											<TableCell
												colSpan={5}
												className="text-center text-muted-foreground"
											>
												No team members
											</TableCell>
										</TableRow>
									)}
								</TableBody>
							</Table>
						</TabsContent>

						<TabsContent value="invitations" className="mt-4">
							<div className="flex flex-col gap-8">
								{/* Generated Links Section */}
								<div className="space-y-4">
									<div className="flex justify-between items-center">
										<h3 className="text-lg font-medium">Generated Links</h3>
										<div className="flex gap-2">
											{selectedInvites.length > 0 && (
												<Button
													variant="destructive"
													onClick={handleBulkDelete}
												>
													Delete Selected ({selectedInvites.length})
												</Button>
											)}
											<Button onClick={() => setShowGenerateDialog(true)}>
												<PlusIcon className="h-4 w-4 mr-2" /> Invite Link
											</Button>
										</div>
									</div>

									<Table>
										<TableHeader>
											<TableRow>
												<TableHead>
													<div className="flex items-center gap-2">
														<input
															type="checkbox"
															className="rounded"
															checked={
																invitations?.filter(
																	(inv) => inv.type === "LINK",
																).length === selectedInvites.length
															}
															onChange={(e) => {
																if (e.target.checked) {
																	setSelectedInvites(
																		invitations
																			?.filter((inv) => inv.type === "LINK")
																			.map((inv) => inv.id) || [],
																	);
																} else {
																	setSelectedInvites([]);
																}
															}}
														/>
														Invitation Token
													</div>
												</TableHead>
												<TableHead>Creator</TableHead>
												<TableHead className="text-center">
													Expiration
												</TableHead>
												<TableHead className="text-end">Actions</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{invitations
												?.filter((inv) => inv.type === "LINK")
												.map((invitation) => {
													const isExpired =
														new Date() > new Date(invitation.expiresAt);
													const expirationStatus = isExpired ? (
														<Badge variant="destructive">Expired</Badge>
													) : (
														<Badge variant="default">
															{formatDistanceToNow(
																new Date(invitation.expiresAt),
																{
																	addSuffix: true,
																},
															)}
														</Badge>
													);

													return (
														<TableRow key={invitation.id}>
															<TableCell>
																<div className="flex items-center gap-2">
																	<input
																		type="checkbox"
																		className="rounded"
																		checked={selectedInvites.includes(
																			invitation.id,
																		)}
																		onChange={(e) => {
																			if (e.target.checked) {
																				setSelectedInvites([
																					...selectedInvites,
																					invitation.id,
																				]);
																			} else {
																				setSelectedInvites(
																					selectedInvites.filter(
																						(id) => id !== invitation.id,
																					),
																				);
																			}
																		}}
																	/>
																	<code className="px-2 py-1 rounded bg-muted text-sm">
																		{invitation.token}
																	</code>
																</div>
															</TableCell>
															<TableCell>admin</TableCell>
															<TableCell className="text-center">
																{expirationStatus}
															</TableCell>
															<TableCell className="text-right flex justify-end">
																<DropdownMenu>
																	<DropdownMenuTrigger asChild>
																		<Button
																			variant="ghost"
																			className="h-8 w-8 p-0"
																			disabled={isExpired}
																		>
																			<span className="sr-only">Open menu</span>
																			<MoreHorizontal className="h-4 w-4" />
																		</Button>
																	</DropdownMenuTrigger>
																	<DropdownMenuContent align="end">
																		<DropdownMenuItem
																			onClick={() => {
																				navigator.clipboard.writeText(
																					invitation.inviteLink,
																				);
																				toast.success("Invitation link copied");
																			}}
																			disabled={isExpired}
																		>
																			Copy Link
																		</DropdownMenuItem>
																		<DropdownMenuItem
																			className="text-destructive"
																			onClick={() =>
																				handleRevokeInvitation(invitation.id)
																			}
																		>
																			Delete
																		</DropdownMenuItem>
																	</DropdownMenuContent>
																</DropdownMenu>
															</TableCell>
														</TableRow>
													);
												})}
											{!invitations?.filter((inv) => inv.type === "LINK")
												.length && (
												<TableRow>
													<TableCell
														colSpan={4}
														className="text-center text-muted-foreground"
													>
														No generated links found
													</TableCell>
												</TableRow>
											)}
										</TableBody>
									</Table>
								</div>
							</div>
						</TabsContent>
					</Tabs>
				</DialogContent>
			</Dialog>

			{/* Delete User Confirmation Dialog */}
			<Dialog
				open={showDeleteUserDialog}
				onOpenChange={setShowDeleteUserDialog}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Delete User</DialogTitle>
						<DialogDescription className="space-y-3">
							<p>Are you absolutely sure?</p>
							<p>
								This action cannot be undone. This will permanently delete the
								user
								<span className="font-medium"> {userToDelete?.email}</span> and
								remove all their data from the system.
							</p>
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => {
								setShowDeleteUserDialog(false);
								setUserToDelete(null);
							}}
						>
							Cancel
						</Button>
						<Button
							variant="destructive"
							onClick={() => userToDelete && handleDeleteUser(userToDelete.id)}
							disabled={isDeleting}
						>
							{isDeleting ? "Deleting..." : "Delete User"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Generate Invite Dialog */}
			<Dialog open={showGenerateDialog} onOpenChange={setShowGenerateDialog}>
				<DialogContent className="sm:max-w-auto">
					<DialogHeader>
						<DialogTitle>New invite</DialogTitle>
						<DialogDescription>
							After the expiration, an invite will no longer be valid and the
							recipient of the invite won't be able to create an account.
						</DialogDescription>
					</DialogHeader>

					<Form {...generateForm}>
						<form
							onSubmit={generateForm.handleSubmit(handleGenerateInvite)}
							className="space-y-4"
						>
							<FormField
								control={generateForm.control}
								name="expirationDays"
								render={({ field }) => (
									<FormItem>
										<div className="flex items-center gap-4">
											<FormLabel className="min-w-20">
												Expiration <span className="text-destructive">*</span>
											</FormLabel>
											<FormControl>
												<Input
													type="number"
													min={1}
													max={30}
													className="w-[120px]"
													{...field}
													onChange={(e) =>
														field.onChange(Number(e.target.value))
													}
												/>
											</FormControl>
										</div>
										<FormDescription>
											Enter the number of days until this invite expires (1-30
											days)
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={generateForm.control}
								name="role"
								render={({ field }) => (
									<FormItem className="space-y-3">
										<FormLabel>Role</FormLabel>
										<FormControl>
											<RadioGroup
												onValueChange={field.onChange}
												defaultValue={field.value}
												className="flex flex-row gap-4"
											>
												<div className="flex items-center space-x-2">
													<RadioGroupItem value="ADMIN" id="admin" />
													<Label htmlFor="admin">Admin</Label>
												</div>
												<div className="flex items-center space-x-2">
													<RadioGroupItem value="MEMBER" id="member" />
													<Label htmlFor="member">Member</Label>
												</div>
												<div className="flex items-center space-x-2">
													<RadioGroupItem value="GUEST" id="guest" />
													<Label htmlFor="guest">Guest</Label>
												</div>
											</RadioGroup>
										</FormControl>
										<FormDescription>
											Select the role for the new team member
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>
							{/* Multi-User Invite Link */}
							<FormField
								control={generateForm.control}
								name="isMultiUser"
								render={({ field }) => (
									<FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-4">
										<FormControl>
											<Checkbox
												checked={field.value}
												onCheckedChange={field.onChange}
												onClick={() => {
													if (!field.value) {
														toast.info("Multi-user invites coming soon!");
													}
												}}
											/>
										</FormControl>
										<div className="space-y-1 leading-none">
											<FormLabel>Allow multiple users</FormLabel>
											<FormDescription>
												Enable this to allow multiple users to join using this
												invite link (Coming Soon)
											</FormDescription>
										</div>
									</FormItem>
								)}
							/>

							<DialogFooter>
								<Button
									variant="outline"
									type="button"
									onClick={() => setShowGenerateDialog(false)}
								>
									Cancel
								</Button>
								<Button type="submit">Create</Button>
							</DialogFooter>
						</form>
					</Form>
				</DialogContent>
			</Dialog>
		</>
	);
};
