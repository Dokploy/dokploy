import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { useTranslation } from "next-i18next";
import { useRouter } from "next/router";

export const AcceptInvitation = () => {
	const { t } = useTranslation("accept-invitation");
	const { query } = useRouter();

	const invitationId = query["accept-invitation"];

	// const { data: organization } = api.organization.getById.useQuery({
	//     id: id as string
	// })

	return (
		<div>
			<Button
				onClick={async () => {
					const result = await authClient.organization.acceptInvitation({
						invitationId: invitationId as string,
					});
					console.log(result);
				}}
			>
				{t("acceptInvitation.acceptInvitation")}
			</Button>
		</div>
	);
};

export default AcceptInvitation;
