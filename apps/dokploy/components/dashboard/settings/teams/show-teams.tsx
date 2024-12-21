import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { api } from "@/utils/api";
import { Users } from "lucide-react";
import { CreateTeam } from "./create-team";
import { TeamsList } from "./teams-list";

export const ShowTeams = () => {
	const { data: teams = [] } = api.team.all.useQuery();

	return (
		<div className="col-span-2">
			<Card className="bg-transparent">
				<CardHeader className="flex flex-row gap-2 justify-between w-full flex-wrap">
					<div className="flex flex-col gap-2">
						<CardTitle className="text-xl">Teams</CardTitle>
						<CardDescription>Create and manage teams</CardDescription>
					</div>

					{teams && teams.length > 0 && (
						<div className="flex flex-col gap-3 items-end">
							<CreateTeam />
						</div>
					)}
				</CardHeader>
				<CardContent className="space-y-2">
					{teams.length === 0 ? (
						<div className="flex flex-col items-center gap-3 h-full">
							<Users className="size-8 self-center text-muted-foreground" />
							<span className="text-base text-muted-foreground">
								Create your first team:
							</span>
							<CreateTeam />
						</div>
					) : (
						<TeamsList teams={teams} />
					)}
				</CardContent>
			</Card>
		</div>
	);
};
