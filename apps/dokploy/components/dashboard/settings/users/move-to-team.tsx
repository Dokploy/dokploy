import { useState } from "react";
import { toast } from "sonner";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { api } from "@/utils/api";

interface MoveToTeamProps {
	memberId: string;
	userEmail: string;
	currentTeamId?: string | null;
}

export const MoveToTeam = ({ memberId, userEmail, currentTeamId }: MoveToTeamProps) => {
	const [open, setOpen] = useState(false);
	const [selectedTeam, setSelectedTeam] = useState<string>(currentTeamId ?? "none");
	const utils = api.useUtils();

	const { mutateAsync: moveMember, isPending } =
		api.organization.moveMemberToTeam.useMutation();

	const onSubmit = async () => {
		try {
			await moveMember({
				memberId,
				teamId: selectedTeam === "none" ? null : selectedTeam,
			});
			toast.success("Member moved successfully");
			await utils.user.all.invalidate();
			setOpen(false);
		} catch (err) {
			const message = err instanceof Error ? err.message : "Failed to move member";
			toast.error(message);
		}
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="ghost" className="w-full justify-start px-2 py-1.5 text-sm">
					Move to Team
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Move Member to Team</DialogTitle>
					<DialogDescription>
						Assign <span className="font-medium">{userEmail}</span> to a team.
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-3 py-2">
					<Label>Team</Label>
					<Select value={selectedTeam} onValueChange={setSelectedTeam}>
						<SelectTrigger>
							<SelectValue placeholder="Select a team" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="none">No team</SelectItem>
						</SelectContent>
					</Select>
					<p className="text-xs text-muted-foreground">
						Teams are managed via the better-auth organization plugin. Create teams
						from your organization settings.
					</p>
				</div>

				<DialogFooter>
					<Button variant="outline" onClick={() => setOpen(false)}>
						Cancel
					</Button>
					<Button isLoading={isPending} onClick={onSubmit}>
						Save
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
