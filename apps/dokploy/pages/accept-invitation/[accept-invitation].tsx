import { useRouter } from "next/router";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export const AcceptInvitation = () => {
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
				Accept Invitation
			</Button>
		</div>
	);
};

export default AcceptInvitation;
