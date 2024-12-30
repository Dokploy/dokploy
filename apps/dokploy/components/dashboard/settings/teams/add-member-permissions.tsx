import { AlertBlock } from "@/components/shared/alert-block";
import { PermissionFormFields } from "@/components/shared/permission-form-fields";
import { Button } from "@/components/ui/button";
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
import { Form } from "@/components/ui/form";
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import type { TeamRole } from "@dokploy/server/db/schema/team-schema";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { teamPermissionSchema, type TeamPermissions } from "@/components/shared/shared-permissions";

interface Props {
	teamId: string;
	userId: string;
	role: TeamRole;
}

export const AddMemberPermissions = ({ teamId, userId, role }: Props) => {
	const utils = api.useContext();
	const { data: member, refetch } = api.team.getMemberPermissions.useQuery(
		{ teamId, userId },
		{ enabled: !!teamId && !!userId },
	);

	const { mutateAsync, isError, error, isLoading } =
		api.team.updateMemberPermissions.useMutation({
			onSuccess: () => {
				utils.team.getMemberPermissions.invalidate({ teamId, userId });
				utils.team.byId.invalidate({ teamId });
			},
		});

	const form = useForm<TeamPermissions>({
		resolver: zodResolver(teamPermissionSchema),
	});

	useEffect(() => {
		if (member) {
			form.reset({
				canManageTeam: member.canManageTeam,
				canInviteMembers: member.canInviteMembers,
				canRemoveMembers: member.canRemoveMembers,
				canEditTeamSettings: member.canEditTeamSettings,
				canViewTeamResources: member.canViewTeamResources,
				canManageTeamResources: member.canManageTeamResources,
				canCreateProjects: member.canCreateProjects,
				canCreateServices: member.canCreateServices,
				canDeleteProjects: member.canDeleteProjects,
				canDeleteServices: member.canDeleteServices,
				canAccessToTraefikFiles: member.canAccessToTraefikFiles,
				canAccessToDocker: member.canAccessToDocker,
				canAccessToAPI: member.canAccessToAPI,
				canAccessToSSHKeys: member.canAccessToSSHKeys,
				canAccessToGitProviders: member.canAccessToGitProviders,
				accesedProjects: member.accesedProjects || [],
				accesedServices: member.accesedServices || [],
			});
		}
	}, [form, member]);

	const onSubmit = async (data: TeamPermissions) => {
		await mutateAsync({
			teamId,
			userId,
			...data,
			accesedServices: data.accesedServices || undefined
		})
			.then(async () => {
				toast.success("Team member permissions updated");
				refetch();
			})
			.catch(() => {
				toast.error("Error updating team member permissions");
			});
	};

	return (
		<Dialog>
			<DialogTrigger asChild>
				<DropdownMenuItem
					className="w-full cursor-pointer"
					onSelect={(e) => e.preventDefault()}
				>
					Manage Permissions
				</DropdownMenuItem>
			</DialogTrigger>
			<DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
				<DialogHeader>
					<DialogTitle>Team Member Permissions</DialogTitle>
					<DialogDescription>
						Configure permissions for this team member
					</DialogDescription>
				</DialogHeader>

				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}

				<Form {...form}>
					<form 
						id="hook-form-add-permissions"
						onSubmit={form.handleSubmit(onSubmit)} 
						className="space-y-8"
					>
						<PermissionFormFields control={form.control} showTeamFields />

						<DialogFooter>
							<Button
								isLoading={isLoading}
								form="hook-form-add-permissions"
								type="submit"
							>
								Update
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
