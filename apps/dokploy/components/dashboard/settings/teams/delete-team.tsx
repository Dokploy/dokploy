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
import { api } from "@/utils/api";
import { toast } from "sonner";

interface Props {
	teamId: string;
}

export const DeleteTeam = ({ teamId }: Props) => {
	const utils = api.useContext();
	const { mutateAsync, isLoading } = api.team.delete.useMutation({
		onSuccess: () => {
			utils.team.all.invalidate();
		},
	});

	const handleDelete = async () => {
		try {
			await mutateAsync({ teamId });
			toast.success("Team deleted successfully");
		} catch (error) {
			toast.error("Failed to delete team");
		}
	};

	return (
		<Dialog>
			<DialogTrigger asChild>
				<DropdownMenuItem
					onSelect={(e) => e.preventDefault()}
					className="text-destructive"
				>
					Delete Team
				</DropdownMenuItem>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Delete Team</DialogTitle>
					<DialogDescription>
						Are you sure you want to delete this team? This action cannot be
						undone.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button variant="outline" type="button">
						Cancel
					</Button>
					<Button
						variant="destructive"
						onClick={handleDelete}
						isLoading={isLoading}
					>
						Delete
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
