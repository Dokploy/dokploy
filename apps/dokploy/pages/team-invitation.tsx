import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { api } from "@/utils/api";
import { useRouter } from "next/router";

export default function TeamInvitation() {
	const router = useRouter();
	const { token } = router.query;

	const { data: invitation } = api.team.invitations.validateToken.useQuery(
		{ token: token as string },
		{ enabled: !!token },
	);

	const handleAcceptInvitation = async () => {
		if (!token) return;
		router.push(`/team-register?token=${token}`);
	};

	return (
		<div className="flex min-h-screen items-center justify-center">
			<Card className="w-[400px]">
				<CardHeader>
					<CardTitle>Team Invitation</CardTitle>
					<CardDescription>
						You've been invited to join {invitation?.teamName}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="space-y-4">
						{invitation?.teamDescription && (
							<div className="bg-muted p-4 rounded-lg">
								<p className="text-sm font-medium mb-1">About the team</p>
								<p className="text-sm text-muted-foreground">
									{invitation.teamDescription}
								</p>
							</div>
						)}
						<div className="flex items-center gap-2">
							<p className="text-sm">Role:</p>
							<Badge>{invitation?.role}</Badge>
						</div>
						<p className="text-sm text-muted-foreground">
							Click accept to create your account and join the team.
						</p>
						<Button onClick={handleAcceptInvitation} className="w-full">
							Accept & Register
						</Button>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
