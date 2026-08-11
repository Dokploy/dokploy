import { createFileRoute } from "@tanstack/react-router";
import { ShowApiKeys } from "@/components/dashboard/settings/api/show-api-keys";
import { LinkingAccount } from "@/components/dashboard/settings/linking-account/linking-account";
import { ProfileForm } from "@/components/dashboard/settings/profile/profile-form";
import { api } from "@/utils/api";

const Page = () => {
	const { data: permissions } = api.user.getPermissions.useQuery();
	const { data: isCloud } = api.settings.isCloud.useQuery();

	return (
		<div className="w-full">
			<div className="h-full rounded-xl max-w-5xl mx-auto flex flex-col gap-4">
				<ProfileForm />
				{isCloud && <LinkingAccount />}
				{permissions?.api.read && <ShowApiKeys />}
			</div>
		</div>
	);
};

export const Route = createFileRoute("/dashboard/settings/profile")({
	component: Page,
});
