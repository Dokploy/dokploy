import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api, type RouterOutputs } from "@/utils/api";

type Team = RouterOutputs["organization"]["teams"][number];
type Member = RouterOutputs["user"]["all"][number];
type Server = RouterOutputs["server"]["allForPermissions"][number];

const permissionFields = [
	["canCreateProjects", "Create projects"],
	["canDeleteProjects", "Delete projects"],
	["canCreateServices", "Create services"],
	["canDeleteServices", "Delete services"],
	["canCreateEnvironments", "Create environments"],
	["canDeleteEnvironments", "Delete environments"],
	["canManageDeployments", "Start / stop deployments"],
] as const;

export const ManageTeams = ({ isOwner }: { isOwner: boolean }) => {
	const utils = api.useUtils();
	const { data: teams = [] } = api.organization.teams.useQuery();
	const { data: members = [] } = api.user.all.useQuery();
	const { data: servers = [] } = api.server.allForPermissions.useQuery();
	const [newName, setNewName] = useState("");
	const [newDescription, setNewDescription] = useState("");
	const [newLimit, setNewLimit] = useState(50);
	const [ownerCandidate, setOwnerCandidate] = useState("");

	const createTeam = api.organization.createTeam.useMutation();
	const updateTeam = api.organization.updateTeam.useMutation();
	const deleteTeam = api.organization.deleteTeam.useMutation();
	const moveMember = api.organization.moveMemberToTeam.useMutation();
	const transferOwnership = api.organization.transferOwnership.useMutation();

	const refresh = async () => {
		await Promise.all([
			utils.organization.teams.invalidate(),
			utils.user.all.invalidate(),
			utils.organization.active.invalidate(),
		]);
	};

	const submitCreate = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!newName.trim()) return;
		try {
			await createTeam.mutateAsync({
				name: newName.trim(),
				description: newDescription.trim() || undefined,
				maxMembers: newLimit,
			});
			setNewName("");
			setNewDescription("");
			setNewLimit(50);
			await refresh();
			toast.success("Team created");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Failed to create team");
		}
	};

	const saveTeam = async (
		event: React.FormEvent<HTMLFormElement>,
		team: Team,
	) => {
		event.preventDefault();
		const form = new FormData(event.currentTarget);
		try {
			await updateTeam.mutateAsync({
				teamId: team.id,
				name: String(form.get("name") ?? team.name),
				description: String(form.get("description") ?? "") || null,
				maxMembers: Number(form.get("maxMembers") ?? team.maxMembers),
				accessedServers: servers
					.filter((server) => form.get(`server:${server.serverId}`) === "on")
					.map((server) => server.serverId),
				...Object.fromEntries(
					permissionFields.map(([key]) => [key, form.get(key) === "on"]),
				),
			});
			await refresh();
			toast.success(`${team.name} updated`);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Failed to update team");
		}
	};

	const removeTeam = async (team: Team) => {
		try {
			await deleteTeam.mutateAsync({ teamId: team.id });
			await refresh();
			toast.success(`${team.name} deleted`);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Failed to delete team");
		}
	};

	const setMemberTeam = async (member: Member, teamId: string) => {
		try {
			await moveMember.mutateAsync({
				memberId: member.id,
				teamId: teamId === "__none__" ? null : teamId,
			});
			await refresh();
			toast.success("Member team updated");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Failed to move member");
		}
	};

	const currentTeamFor = (member: Member) =>
		teams.find((team) =>
			team.members.some((membership) => membership.userId === member.user.id),
		)?.id ?? "__none__";

	const doTransfer = async () => {
		if (!ownerCandidate) return;
		try {
			await transferOwnership.mutateAsync({ memberId: ownerCandidate });
			setOwnerCandidate("");
			await refresh();
			toast.success("Organization ownership transferred");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to transfer ownership",
			);
		}
	};

	return (
		<Card className="bg-sidebar p-2.5 rounded-xl">
			<div className="rounded-xl bg-background shadow-md">
				<CardHeader>
					<CardTitle>Teams & Ownership</CardTitle>
					<CardDescription>
						Group members, grant team-wide access, assign remote servers, and
						transfer organization ownership.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-6 border-t py-6">
					<form
						onSubmit={submitCreate}
						className="grid gap-3 rounded-lg border p-4 md:grid-cols-[1fr_2fr_120px_auto]"
					>
						<Input
							value={newName}
							onChange={(event) => setNewName(event.target.value)}
							placeholder="Team name"
							required
						/>
						<Input
							value={newDescription}
							onChange={(event) => setNewDescription(event.target.value)}
							placeholder="Team description"
						/>
						<Input
							type="number"
							min={1}
							max={500}
							value={newLimit}
							onChange={(event) => setNewLimit(Number(event.target.value))}
							aria-label="Team member limit"
						/>
						<Button type="submit" isLoading={createTeam.isPending}>
							Create team
						</Button>
					</form>

					<div className="space-y-4">
						{teams.length === 0 && (
							<p className="text-sm text-muted-foreground">
								No teams yet. Create one to group permissions and server access.
							</p>
						)}
						{teams.map((team) => (
							<form
								key={team.id}
								onSubmit={(event) => saveTeam(event, team)}
								className="space-y-4 rounded-lg border p-4"
							>
								<div className="grid gap-3 md:grid-cols-[1fr_2fr_120px]">
									<Input name="name" defaultValue={team.name} required />
									<Input
										name="description"
										defaultValue={team.description ?? ""}
										placeholder="Description"
									/>
									<Input
										name="maxMembers"
										type="number"
										min={Math.max(1, team.memberCount)}
										max={500}
										defaultValue={team.maxMembers}
										aria-label="Team member limit"
									/>
								</div>
								<p className="text-xs text-muted-foreground">
									{team.memberCount}/{team.maxMembers} members
								</p>

								<div>
									<p className="mb-2 text-sm font-medium">Team permissions</p>
									<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
										{permissionFields.map(([key, label]) => (
											<label
												key={key}
												className="flex items-center gap-2 rounded-md border p-2 text-sm"
											>
												<input
													type="checkbox"
													name={key}
													defaultChecked={Boolean(team[key])}
												/>
												{label}
											</label>
										))}
									</div>
								</div>

								<div>
									<p className="mb-2 text-sm font-medium">Remote servers</p>
									<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
										{servers.map((server: Server) => (
											<label
												key={server.serverId}
												className="flex items-center gap-2 rounded-md border p-2 text-sm"
											>
												<input
													type="checkbox"
													name={`server:${server.serverId}`}
													defaultChecked={team.accessedServers.includes(
														server.serverId,
													)}
												/>
												{server.name}
											</label>
										))}
										{servers.length === 0 && (
											<span className="text-sm text-muted-foreground">
												No remote servers available.
											</span>
										)}
									</div>
								</div>

								<div className="flex justify-end gap-2">
									<Button
										type="button"
										variant="destructive"
										onClick={() => removeTeam(team)}
										isLoading={deleteTeam.isPending}
									>
										Delete
									</Button>
									<Button type="submit" isLoading={updateTeam.isPending}>
										Save team
									</Button>
								</div>
							</form>
						))}
					</div>

					<div className="space-y-3 rounded-lg border p-4">
						<h3 className="font-medium">Member teams</h3>
						<p className="text-sm text-muted-foreground">
							Moving a member replaces their existing organization team membership.
						</p>
						{members
							.filter((member) => member.role !== "owner")
							.map((member) => (
								<div
									key={member.id}
									className="grid items-center gap-2 md:grid-cols-[1fr_240px]"
								>
									<span className="text-sm">{member.user.email}</span>
									<select
										className="h-9 rounded-md border bg-background px-3 text-sm"
										value={currentTeamFor(member)}
										onChange={(event) =>
											setMemberTeam(member, event.target.value)
										}
									>
										<option value="__none__">No team</option>
										{teams.map((team) => (
											<option key={team.id} value={team.id}>
												{team.name}
											</option>
										))}
									</select>
								</div>
							))}
					</div>

					{isOwner && (
						<div className="space-y-3 rounded-lg border p-4">
							<h3 className="font-medium">Transfer ownership</h3>
							<p className="text-sm text-muted-foreground">
								The selected member becomes owner; you become an administrator.
							</p>
							<div className="flex gap-2">
								<select
									className="h-9 flex-1 rounded-md border bg-background px-3 text-sm"
									value={ownerCandidate}
									onChange={(event) => setOwnerCandidate(event.target.value)}
								>
									<option value="">Select a member</option>
									{members
										.filter((member) => member.role !== "owner")
										.map((member) => (
											<option key={member.id} value={member.id}>
												{member.user.email} ({member.role})
											</option>
										))}
								</select>
								<Button
									type="button"
									onClick={doTransfer}
									disabled={!ownerCandidate}
									isLoading={transferOwnership.isPending}
								>
									Transfer ownership
								</Button>
							</div>
						</div>
					)}
				</CardContent>
			</div>
		</Card>
	);
};
