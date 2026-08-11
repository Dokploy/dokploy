import { createFileRoute } from "@tanstack/react-router";
import { ShowInvitations } from "@/components/dashboard/settings/users/show-invitations";
import { ShowUsers } from "@/components/dashboard/settings/users/show-users";
import { ManageCustomRoles } from "@/components/proprietary/roles/manage-custom-roles";
import { api } from "@/utils/api";

const Page = () => {
	const { data: auth } = api.user.get.useQuery();
	const { data: permissions } = api.user.getPermissions.useQuery();
	const isOwnerOrAdmin = auth?.role === "owner" || auth?.role === "admin";
	const canCreateMembers = permissions?.member.create ?? false;

	return (
		<div className="flex flex-col gap-4 w-full">
			<ShowUsers />
			{canCreateMembers && <ShowInvitations />}
			{isOwnerOrAdmin && <ManageCustomRoles />}
		</div>
	);
};

export const Route = createFileRoute("/dashboard/settings/users")({
	component: Page,
});
