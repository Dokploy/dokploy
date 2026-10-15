import { Badge } from "@/components/ui/badge";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { CollapsibleSection } from "./collapsible-section";

type Requirement = {
	kind: string;
	originalId: string | null;
	usedBy: { serviceName: string; environmentId: string }[];
	[key: string]: unknown;
};

type ProposedResolution = {
	status: "resolved" | "mappable" | "createable" | "missing";
	targetId?: string;
	candidates?: { id: string; name: string }[];
};

export type ResolutionChoice = {
	requirementKey: string;
	action: "reuse" | "create" | "skip";
	targetId?: string;
};

interface ResolutionStepProps {
	requirements: Requirement[];
	resolutions: Record<string, ProposedResolution>;
	choices: Record<string, ResolutionChoice>;
	onChange: (key: string, choice: ResolutionChoice) => void;
}

const requirementKey = (requirement: Requirement): string =>
	`${requirement.kind}:${requirement.originalId ?? "null"}`;

const requirementLabel = (requirement: Requirement): string => {
	switch (requirement.kind) {
		case "vault":
			return `Vault "${requirement.providerName}"`;
		case "gitProvider":
			return `${requirement.providerType} git provider`;
		case "destination":
			return `Destination "${requirement.bucket}"`;
		case "registry":
			return `Registry "${requirement.registryUrl}"`;
		case "sshKey":
			return "SSH key";
		case "network":
			return `Network "${requirement.name}"`;
		case "certificate":
			return "Custom certificate";
		case "server":
			return "Server";
		default:
			return requirement.kind;
	}
};

const statusBadge = (status: ProposedResolution["status"]) => {
	switch (status) {
		case "resolved":
			return <Badge variant="green">resolved</Badge>;
		case "mappable":
			return <Badge variant="secondary">needs mapping</Badge>;
		case "createable":
			return <Badge variant="blue">will be created</Badge>;
		case "missing":
			return <Badge variant="destructive">missing</Badge>;
	}
};

const defaultChoiceFor = (
	key: string,
	proposed: ProposedResolution | undefined,
): ResolutionChoice => {
	if (!proposed) return { requirementKey: key, action: "skip" };
	if (proposed.status === "resolved") {
		return {
			requirementKey: key,
			action: "reuse",
			targetId: proposed.targetId,
		};
	}
	if (proposed.status === "createable") {
		return { requirementKey: key, action: "create" };
	}
	return { requirementKey: key, action: "skip" };
};

export const defaultResolutionChoices = (
	requirements: Requirement[],
	resolutions: Record<string, ProposedResolution>,
): Record<string, ResolutionChoice> => {
	const choices: Record<string, ResolutionChoice> = {};
	for (const requirement of requirements) {
		const key = requirementKey(requirement);
		choices[key] = defaultChoiceFor(key, resolutions[key]);
	}
	return choices;
};

const RequirementRow = ({
	requirement,
	proposed,
	choice,
	onChange,
}: {
	requirement: Requirement;
	proposed: ProposedResolution | undefined;
	choice: ResolutionChoice;
	onChange: (choice: ResolutionChoice) => void;
}) => {
	const key = requirementKey(requirement);
	const candidates = proposed?.candidates ?? [];

	return (
		<div className="rounded-md border p-3 space-y-2">
			<div className="flex items-center justify-between gap-2 flex-wrap">
				<div className="flex items-center gap-2">
					<span className="text-sm font-medium">
						{requirementLabel(requirement)}
					</span>
					{proposed && statusBadge(proposed.status)}
				</div>

				{candidates.length > 0 && (
					<Select
						value={
							choice.action === "skip" ? "__skip__" : (choice.targetId ?? "")
						}
						onValueChange={(value) => {
							if (value === "__skip__") {
								onChange({ requirementKey: key, action: "skip" });
								return;
							}
							onChange({
								requirementKey: key,
								action: "reuse",
								targetId: value,
							});
						}}
					>
						<SelectTrigger className="w-[220px]">
							<SelectValue placeholder="Map to..." />
						</SelectTrigger>
						<SelectContent>
							{candidates.map((candidate) => (
								<SelectItem key={candidate.id} value={candidate.id}>
									{candidate.name}
								</SelectItem>
							))}
							<SelectItem value="__skip__">Skip (don't map)</SelectItem>
						</SelectContent>
					</Select>
				)}

				{candidates.length === 0 && proposed?.status === "createable" && (
					<Select
						value={choice.action}
						onValueChange={(value) =>
							onChange({
								requirementKey: key,
								action: value as "create" | "skip",
							})
						}
					>
						<SelectTrigger className="w-[220px]">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="create">Create from bundle</SelectItem>
							<SelectItem value="skip">Skip</SelectItem>
						</SelectContent>
					</Select>
				)}

				{candidates.length === 0 && proposed?.status === "missing" && (
					<span className="text-xs text-muted-foreground">
						Nothing to map: services using it won't deploy
					</span>
				)}
			</div>

			{requirement.usedBy.length > 0 && (
				<CollapsibleSection
					triggerClassName="flex items-center gap-1 text-xs text-muted-foreground"
					contentClassName="pl-4 pt-1 space-y-0.5"
					title={`Used by ${requirement.usedBy.length} service${requirement.usedBy.length === 1 ? "" : "s"}`}
				>
					{requirement.usedBy.map((usedBy, index) => (
						<p key={index} className="text-xs text-muted-foreground">
							{usedBy.serviceName}
						</p>
					))}
				</CollapsibleSection>
			)}
		</div>
	);
};

export const ResolutionStep = ({
	requirements,
	resolutions,
	choices,
	onChange,
}: ResolutionStepProps) => {
	if (requirements.length === 0) {
		return (
			<p className="text-sm text-muted-foreground">
				This bundle has no external dependencies to resolve.
			</p>
		);
	}

	return (
		<div className="space-y-3 max-h-[45vh] overflow-y-auto">
			{requirements.map((requirement) => {
				const key = requirementKey(requirement);
				return (
					<RequirementRow
						key={key}
						requirement={requirement}
						proposed={resolutions[key]}
						choice={choices[key] ?? defaultChoiceFor(key, resolutions[key])}
						onChange={(choice) => onChange(key, choice)}
					/>
				);
			})}
		</div>
	);
};
