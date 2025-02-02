import { createContext, useContext, useState } from "react";

interface TeamContextType {
	currentTeamId: string | null;
	setCurrentTeamId: (teamId: string) => void;
	currentTeamRole: string | null;
}

const TeamContext = createContext<TeamContextType | undefined>(undefined);

export function TeamProvider({ children }: { children: React.ReactNode }) {
	const [currentTeamId, setCurrentTeamId] = useState<string | null>(null);
	const [currentTeamRole, setCurrentTeamRole] = useState<string | null>(null);

	return (
		<TeamContext.Provider
			value={{ currentTeamId, setCurrentTeamId, currentTeamRole }}
		>
			{children}
		</TeamContext.Provider>
	);
}

export function useTeam() {
	const context = useContext(TeamContext);
	if (context === undefined) {
		throw new Error("useTeam must be used within a TeamProvider");
	}
	return context;
}
