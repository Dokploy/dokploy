import { format } from "date-fns";
import { Loader2, MoreHorizontal, PlusIcon, UsersRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { Input } from "@/components/ui/input";
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
import { authClient } from "@/lib/auth-client";
import { api } from "@/utils/api";

type Team = {
	id: string;
	name: string;
	organizationId: string;
	createdAt: Date;
	updatedAt?: Date;
};

type TeamMember = {
	id: string;
	teamId: string;
	userId: string;
	createdAt: Date;
};

type TeamActionResult = {
	error?: {
		message?: string;
	} | null;
};

export const ShowTeams = () => {
	const { data: members } = api.user.all.useQuery();
	const { data: permissions } = api.user.getPermissions.useQuery();
	const [teams, setTeams] = useState<Team[]>([]);
	const [teamMembers, setTeamMembers] = useState<Record<string, TeamMember[]>>(
		{},
	);
	const [newTeamName, setNewTeamName] = useState("");
	const [selectedUsers, setSelectedUsers] = useState<Record<string, string>>(
		{},
	);
	const [renamingTeams, setRenamingTeams] = useState<Record<string, string>>(
		{},
	);
	const [isPending, setIsPending] = useState(true);
	const [isSaving, setIsSaving] = useState(false);

	const canCreateTeams = permissions?.team.create ?? false;
	const canUpdateTeams = permissions?.team.update ?? false;
	const canDeleteTeams = permissions?.team.delete ?? false;
	const canUseTeamActions = canUpdateTeams || canDeleteTeams;

	const membersByUserId = useMemo(() => {
		return new Map(members?.map((member) => [member.user.id, member]) ?? []);
	}, [members]);

	const loadTeams = useCallback(async () => {
		setIsPending(true);
		try {
			const teamsResult = await authClient.organization.listTeams({
				query: {},
			});

			if (teamsResult.error) {
				toast.error(teamsResult.error.message || "Error loading teams");
				return;
			}

			const nextTeams = (teamsResult.data ?? []) as Team[];
			const nextTeamMembers = await Promise.all(
				nextTeams.map(async (team) => {
					const result = await authClient.organization.listTeamMembers({
						query: { teamId: team.id },
					});
					if (result.error) {
						return [team.id, [] as TeamMember[]] as const;
					}
					return [team.id, (result.data ?? []) as TeamMember[]] as const;
				}),
			);

			setTeams(nextTeams);
			setTeamMembers(Object.fromEntries(nextTeamMembers));
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Error loading team members",
			);
		} finally {
			setIsPending(false);
		}
	}, []);

	useEffect(() => {
		loadTeams();
	}, [loadTeams]);

	const runTeamAction = async ({
		action,
		errorMessage,
		onSuccess,
		successMessage,
	}: {
		action: () => Promise<TeamActionResult>;
		errorMessage: string;
		onSuccess?: () => void;
		successMessage: string;
	}) => {
		setIsSaving(true);
		try {
			const result = await action();
			if (result.error) {
				toast.error(result.error.message || errorMessage);
				return;
			}
			toast.success(successMessage);
			onSuccess?.();
			await loadTeams();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : errorMessage);
		} finally {
			setIsSaving(false);
		}
	};

	const createTeam = async () => {
		const name = newTeamName.trim();
		if (!name) {
			toast.error("Team name is required");
			return;
		}

		await runTeamAction({
			action: () => authClient.organization.createTeam({ name }),
			errorMessage: "Error creating team",
			onSuccess: () => setNewTeamName(""),
			successMessage: "Team created",
		});
	};

	const renameTeam = async (team: Team) => {
		const name = renamingTeams[team.id]?.trim();
		if (!name || name === team.name) {
			return;
		}

		await runTeamAction({
			action: () =>
				authClient.organization.updateTeam({
					teamId: team.id,
					data: { name },
				}),
			errorMessage: "Error updating team",
			onSuccess: () =>
				setRenamingTeams((current) => {
					const { [team.id]: _, ...nextRenamingTeams } = current;
					return nextRenamingTeams;
				}),
			successMessage: "Team updated",
		});
	};

	const removeTeam = async (teamId: string) => {
		await runTeamAction({
			action: () => authClient.organization.removeTeam({ teamId }),
			errorMessage: "Error deleting team",
			successMessage: "Team deleted",
		});
	};

	const addMember = async (teamId: string) => {
		const userId = selectedUsers[teamId];
		if (!userId) {
			toast.error("Select a user");
			return;
		}

		await runTeamAction({
			action: () =>
				authClient.organization.addTeamMember({
					teamId,
					userId,
				}),
			errorMessage: "Error adding team member",
			onSuccess: () =>
				setSelectedUsers((selected) => ({ ...selected, [teamId]: "" })),
			successMessage: "Team member added",
		});
	};

	const removeMember = async (teamId: string, userId: string) => {
		await runTeamAction({
			action: () =>
				authClient.organization.removeTeamMember({
					teamId,
					userId,
				}),
			errorMessage: "Error removing team member",
			successMessage: "Team member removed",
		});
	};

	return (
		<div className="w-full">
			<Card className="h-full bg-sidebar p-2.5 rounded-xl max-w-5xl mx-auto">
				<div className="rounded-xl bg-background shadow-md">
					<CardHeader>
						<CardTitle className="text-xl flex flex-row gap-2">
							<UsersRound className="size-6 text-muted-foreground self-center" />
							Teams
						</CardTitle>
						<CardDescription>
							Group organization members into teams.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4 py-8 border-t">
						{canCreateTeams && (
							<div className="flex flex-col sm:flex-row gap-2">
								<Input
									value={newTeamName}
									onChange={(event) => setNewTeamName(event.target.value)}
									placeholder="Team name"
									onKeyDown={(event) => {
										if (event.key === "Enter") {
											createTeam();
										}
									}}
								/>
								<Button onClick={createTeam} disabled={isSaving}>
									<PlusIcon className="h-4 w-4" />
									Create Team
								</Button>
							</div>
						)}

						{isPending ? (
							<div className="flex flex-row gap-2 items-center justify-center text-sm text-muted-foreground min-h-[25vh]">
								<span>Loading...</span>
								<Loader2 className="animate-spin size-4" />
							</div>
						) : teams.length === 0 ? (
							<div className="flex flex-col items-center gap-3 min-h-[25vh] justify-center">
								<UsersRound className="size-8 self-center text-muted-foreground" />
								<span className="text-base text-muted-foreground">
									Create a team to group users
								</span>
							</div>
						) : (
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Name</TableHead>
										<TableHead>Members</TableHead>
										<TableHead className="text-center">Created At</TableHead>
										{canUseTeamActions && (
											<TableHead className="text-right">Actions</TableHead>
										)}
									</TableRow>
								</TableHeader>
								<TableBody>
									{teams.map((team) => {
										const currentMembers = teamMembers[team.id] ?? [];
										const currentMemberIds = new Set(
											currentMembers.map((member) => member.userId),
										);
										const availableMembers =
											members?.filter(
												(member) => !currentMemberIds.has(member.user.id),
											) ?? [];

										return (
											<TableRow key={team.id}>
												<TableCell>
													<div className="flex flex-col gap-2">
														<Input
															value={renamingTeams[team.id] ?? team.name}
															disabled={!canUpdateTeams || isSaving}
															onChange={(event) =>
																setRenamingTeams((current) => ({
																	...current,
																	[team.id]: event.target.value,
																}))
															}
															onBlur={() => renameTeam(team)}
														/>
													</div>
												</TableCell>
												<TableCell>
													<div className="flex flex-col gap-2">
														<div className="flex flex-row flex-wrap gap-2">
															{currentMembers.length === 0 ? (
																<span className="text-sm text-muted-foreground">
																	No members
																</span>
															) : (
																currentMembers.map((teamMember) => {
																	const member = membersByUserId.get(
																		teamMember.userId,
																	);
																	return (
																		<Badge
																			key={teamMember.id}
																			variant="secondary"
																			className="gap-2"
																		>
																			{member?.user.email ?? teamMember.userId}
																			{canUpdateTeams && (
																				<button
																					type="button"
																					className="text-muted-foreground hover:text-foreground"
																					onClick={() =>
																						removeMember(
																							team.id,
																							teamMember.userId,
																						)
																					}
																				>
																					Remove
																				</button>
																			)}
																		</Badge>
																	);
																})
															)}
														</div>
														{canUpdateTeams && availableMembers.length > 0 && (
															<div className="flex flex-col sm:flex-row gap-2">
																<Select
																	value={selectedUsers[team.id] ?? ""}
																	onValueChange={(value) =>
																		setSelectedUsers((selected) => ({
																			...selected,
																			[team.id]: value,
																		}))
																	}
																>
																	<SelectTrigger>
																		<SelectValue placeholder="Select user" />
																	</SelectTrigger>
																	<SelectContent>
																		{availableMembers.map((member) => (
																			<SelectItem
																				key={member.id}
																				value={member.user.id}
																			>
																				{member.user.email}
																			</SelectItem>
																		))}
																	</SelectContent>
																</Select>
																<Button
																	variant="secondary"
																	onClick={() => addMember(team.id)}
																	disabled={isSaving}
																>
																	Add
																</Button>
															</div>
														)}
													</div>
												</TableCell>
												<TableCell className="text-center">
													<span className="text-sm text-muted-foreground">
														{format(new Date(team.createdAt), "PPpp")}
													</span>
												</TableCell>
												{canUseTeamActions && (
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
																{canUpdateTeams && (
																	<DropdownMenuItem
																		className="w-full cursor-pointer"
																		onSelect={() => renameTeam(team)}
																	>
																		Save Name
																	</DropdownMenuItem>
																)}
																{canDeleteTeams && (
																	<DialogAction
																		title="Delete Team"
																		description="Are you sure you want to delete this team?"
																		type="destructive"
																		onClick={() => removeTeam(team.id)}
																	>
																		<DropdownMenuItem
																			className="w-full cursor-pointer text-red-500 hover:!text-red-600"
																			onSelect={(event) =>
																				event.preventDefault()
																			}
																		>
																			Delete Team
																		</DropdownMenuItem>
																	</DialogAction>
																)}
															</DropdownMenuContent>
														</DropdownMenu>
													</TableCell>
												)}
											</TableRow>
										);
									})}
								</TableBody>
							</Table>
						)}
					</CardContent>
				</div>
			</Card>
		</div>
	);
};
