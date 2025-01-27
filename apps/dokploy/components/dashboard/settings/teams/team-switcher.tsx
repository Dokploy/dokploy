import { useTeam } from "@/components/dashboard/settings/teams/team-context";
import { Button } from "@/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { api } from "@/utils/api";
import { Check, ChevronsUpDown, Users } from "lucide-react";
import { useState } from "react";

export function TeamSwitcher() {
	const [open, setOpen] = useState(false);
	const { data: teams = [] } = api.team.all.useQuery();
	const { currentTeamId, setCurrentTeamId, currentTeamRole } = useTeam();

	const selectedTeam =
		teams.find((team) => team.teamId === currentTeamId) || teams[0];

	// Set initial team if none selected
	if (!currentTeamId && teams.length > 0 && teams[0]?.teamId) {
		setCurrentTeamId(teams[0].teamId);
	}

	const handleTeamSelect = (teamId: string) => {
		setOpen(false);
		setCurrentTeamId(teamId);
	};

	if (!teams.length) return null;

	return (
		<div className="flex items-center gap-2">
			<Label className="text-sm font-medium leading-none">Current Team</Label>
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<Button
						variant="outline"
						aria-expanded={open}
						aria-label="Select a team"
						className="w-[200px] justify-between"
					>
						<Users className="mr-2 h-4 w-4" />
						<div className="flex flex-col items-start">
							<span>{selectedTeam?.name || "Select team"}</span>
							{currentTeamRole && (
								<span className="text-xs text-muted-foreground">
									{currentTeamRole}
								</span>
							)}
						</div>
						<ChevronsUpDown className="ml-auto h-4 w-4 shrink-0 opacity-50" />
					</Button>
				</PopoverTrigger>
				<PopoverContent className="w-[200px] p-0">
					<Command>
						<CommandList>
							<CommandInput placeholder="Search team..." />
							<CommandEmpty>No team found.</CommandEmpty>
							<CommandGroup heading="Teams">
								{teams.map((team) => (
									<CommandItem
										key={team.teamId}
										onSelect={() => handleTeamSelect(team.teamId)}
										className="text-sm"
									>
										<Users className="mr-2 h-4 w-4" />
										<div className="flex flex-col">
											<span>{team.name}</span>
											<span className="text-xs text-muted-foreground">
												{team.role}
											</span>
										</div>
										{team.teamId === selectedTeam?.teamId && (
											<Check className="ml-auto h-4 w-4" />
										)}
									</CommandItem>
								))}
							</CommandGroup>
						</CommandList>
					</Command>
				</PopoverContent>
			</Popover>
		</div>
	);
}
