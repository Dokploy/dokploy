import { Bell } from "lucide-react";
import { toast } from "sonner";
import { DialogAction } from "@/components/shared/dialog-action";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth-client";
import { api } from "@/utils/api";

export function NotificationBell() {
	const { data: invitations, refetch: refetchInvitations } =
		api.user.listInvitations.useQuery();
	const { refetch } = api.user.get.useQuery();

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="outline"
					size="icon"
					className="relative h-8 w-8 rounded-lg"
				>
					<Bell className="size-4" />
					{invitations && invitations.length > 0 && (
						<span className="absolute -top-0 -right-0 flex size-4 items-center justify-center rounded-full bg-blue-500 text-xs text-white">
							{invitations.length}
						</span>
					)}
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-80">
				<DropdownMenuLabel>Pending Invitations</DropdownMenuLabel>
				<div className="flex flex-col gap-2">
					{invitations && invitations.length > 0 ? (
						invitations.map((invitation) => (
							<div key={invitation.id} className="flex flex-col gap-2">
								<DropdownMenuItem
									className="flex flex-col items-start gap-1 p-3"
									onSelect={(e) => e.preventDefault()}
								>
									<div className="font-medium">
										{invitation?.organization?.name}
									</div>
									<div className="text-xs text-muted-foreground">
										Expires: {new Date(invitation.expiresAt).toLocaleString()}
									</div>
									<div className="text-xs text-muted-foreground">
										Role: {invitation.role}
									</div>
								</DropdownMenuItem>
								<DialogAction
									title="Accept Invitation"
									description="Are you sure you want to accept this invitation?"
									type="default"
									onClick={async () => {
										const { error } =
											await authClient.organization.acceptInvitation({
												invitationId: invitation.id,
											});

										if (error) {
											toast.error(
												error.message || "Error accepting invitation",
											);
										} else {
											toast.success("Invitation accepted successfully");
											await refetchInvitations();
											await refetch();
										}
									}}
								>
									<Button size="sm" variant="secondary">
										Accept Invitation
									</Button>
								</DialogAction>
							</div>
						))
					) : (
						<DropdownMenuItem disabled>No pending invitations</DropdownMenuItem>
					)}
				</div>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
