import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { format, isValid } from "date-fns";
import { MoreHorizontal } from "lucide-react";
import { DeleteTeam } from "./delete-team";
import { EditTeam } from "./edit-team";
import { TeamManagement } from "./team-management";

interface Team {
	teamId: string;
	name: string;
	description: string | null;
	createdAt: Date | null;
	updatedAt: Date | null;
	_count: {
		members: number;
	};
}

interface Props {
	teams: Team[];
}

const formatDate = (date: Date | string | null) => {
	if (!date) return "-";
	const parsedDate = new Date(date);
	return isValid(parsedDate) ? format(parsedDate, "PPp") : "-";
};

export const TeamsList = ({ teams }: Props) => {
	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Name</TableHead>
					<TableHead>Description</TableHead>
					<TableHead className="text-center">Members</TableHead>
					<TableHead className="text-center">Created</TableHead>
					<TableHead className="text-right">Actions</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{teams.map((team) => (
					<TableRow key={team.teamId}>
						<TableCell className="font-medium">{team.name}</TableCell>
						<TableCell>{team.description}</TableCell>
						<TableCell className="text-center">{team._count.members}</TableCell>
						<TableCell className="text-center">
							{formatDate(team.createdAt)}
						</TableCell>
						<TableCell className="flex justify-end">
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button variant="ghost" size="icon">
										<MoreHorizontal className="h-4 w-4" />
										<span className="sr-only">Open menu</span>
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end">
									<DropdownMenuLabel>Actions</DropdownMenuLabel>
									<EditTeam
										teamId={team.teamId}
										defaultValues={{
											teamId: team.teamId,
											name: team.name,
											description: team.description || "",
										}}
									/>
									<TeamManagement teamId={team.teamId} />
									<DeleteTeam teamId={team.teamId} />
								</DropdownMenuContent>
							</DropdownMenu>
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
};
