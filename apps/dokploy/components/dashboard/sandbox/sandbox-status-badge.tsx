import { Badge } from "@/components/ui/badge";

type SandboxStatus = "creating" | "running" | "killed" | "error";

const variants: Record<SandboxStatus, "green" | "yellow" | "blank" | "red"> = {
	running: "green",
	creating: "yellow",
	killed: "blank",
	error: "red",
};

export const SandboxStatusBadge = ({ status }: { status: SandboxStatus }) => (
	<Badge variant={variants[status]} className="capitalize">
		{status}
	</Badge>
);
