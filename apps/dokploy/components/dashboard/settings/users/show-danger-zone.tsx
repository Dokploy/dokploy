import { 
	Card, 
	CardContent, 
	CardDescription, 
	CardHeader, 
	CardTitle 
} from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";
import { TransferOwnership } from "./transfer-ownership";
import { api } from "@/utils/api";
import { authClient } from "@/lib/auth-client";

export const ShowDangerZone = () => {
	const { data: members } = api.user.all.useQuery();
	const { data: currentUser } = authClient.useSession();

	const isCurrentUserOwner = members?.some(
		member => member.user.id === currentUser?.user?.id && member.role === "owner"
	);

	if (!isCurrentUserOwner) {
		return null;
	}

	return (
    <section className="w-full">
			<Card className="h-full bg-sidebar  p-2.5 rounded-xl  max-w-5xl mx-auto">
				<div className="rounded-xl bg-background shadow-md">
			<CardHeader>
				<CardTitle className="text-xl flex flex-row gap-2">
					<AlertTriangle className="size-6 text-muted-foreground self-center" />
					Danger Zone
				</CardTitle>
				<CardDescription>
					Irreversible and destructive actions for this organization.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="flex items-center justify-between p-4 border border-destructive/20 rounded-lg">
					<div className="space-y-1">
						<h3 className="font-medium text-sm">Transfer Ownership</h3>
						<p className="text-sm text-muted-foreground">
							Transfer ownership of this organization to another member. You will lose all owner privileges.
						</p>
					</div>
					<TransferOwnership />
				</div>
			</CardContent>
			</div>
		</Card>
    </section>
	);
};