import { Info } from "lucide-react";
import type { ReactNode } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";

type ServiceRow = {
	name: string;
	applicationStatus?: string | null;
	composeStatus?: string | null;
};

export type ProjectEnvironment = {
	environmentId: string;
	name: string;
	applications: (ServiceRow & {
		applicationId: string;
		sourceType?: string | null;
	})[];
	compose: (ServiceRow & { composeId: string })[];
	postgres: (ServiceRow & { postgresId: string })[];
	mysql: (ServiceRow & { mysqlId: string })[];
	mariadb: (ServiceRow & { mariadbId: string })[];
	mongo: (ServiceRow & { mongoId: string })[];
	redis: (ServiceRow & { redisId: string })[];
	libsql: (ServiceRow & { libsqlId: string })[];
};

const SERVICE_KIND_FIELDS = [
	{ key: "applications", idField: "applicationId" },
	{ key: "compose", idField: "composeId" },
	{ key: "postgres", idField: "postgresId" },
	{ key: "mysql", idField: "mysqlId" },
	{ key: "mariadb", idField: "mariadbId" },
	{ key: "mongo", idField: "mongoId" },
	{ key: "redis", idField: "redisId" },
	{ key: "libsql", idField: "libsqlId" },
] as const;

export type SharedResourceKind =
	| "destination"
	| "registry"
	| "sshKey"
	| "network"
	| "certificate"
	| "vaultProvider"
	| "dnsProvider";

const SHARED_KINDS: SharedResourceKind[] = [
	"destination",
	"registry",
	"sshKey",
	"network",
	"certificate",
	"vaultProvider",
	"dnsProvider",
];

const SHARED_KIND_LABELS: Record<SharedResourceKind, string> = {
	destination: "Destination",
	registry: "Registry",
	sshKey: "SSH Key",
	network: "Network",
	certificate: "Certificate",
	vaultProvider: "Vault Provider",
	dnsProvider: "DNS Provider",
};

const SHARED_MODE_TOOLTIPS = {
	value:
		"Copies the resource itself (including its credentials) into the bundle, so importing it recreates a standalone copy even into an instance that doesn't already have a matching one.",
	reference:
		"Only records that this project depends on the resource, without copying its credentials. On import it's matched by name to one already in the destination instead of being duplicated.",
};

const DUMP_MODE_TOOLTIPS: Record<ScopeFormState["dumps"]["mode"], string> = {
	none: "Exports only the service configuration, no data. Databases start empty after import.",
	embed:
		"Dumps each database right now and stores the dump inside the export file. Simple and self-contained, but large databases can make the bundle very large.",
	referenceLastBackup:
		"Doesn't include any data in the bundle. Instead it references the most recent successful scheduled backup at its destination and downloads it from there on import, requiring that destination to still be resolvable and a completed backup to exist.",
};

const DUMP_MODES = [
	["none", "None (config only)"],
	["embed", "Embed in bundle"],
	["referenceLastBackup", "Reference last backup"],
] as const;

const InfoTooltip = ({ tooltip }: { tooltip: string }) => (
	<Tooltip>
		<TooltipTrigger asChild>
			<Info className="size-3 text-muted-foreground" />
		</TooltipTrigger>
		<TooltipContent side="top" className="max-w-64">
			{tooltip}
		</TooltipContent>
	</Tooltip>
);

const HelpLabel = ({
	width,
	tooltip,
	children,
}: {
	width: number;
	tooltip: string;
	children: ReactNode;
}) => (
	<div className="flex items-center gap-1" style={{ width }}>
		<Label className="text-xs text-muted-foreground">{children}</Label>
		<InfoTooltip tooltip={tooltip} />
	</div>
);

export type ScopeFormState = {
	environmentIds: string[];
	serviceIds: string[];
	includeEnvSecrets: boolean;
	shared: Partial<Record<SharedResourceKind, "value" | "reference">>;
	files: {
		applicationSources: boolean;
		composeFiles: boolean;
		traefikRaw: boolean;
		customCertificates: boolean;
	};
	dumps: { mode: "embed" | "referenceLastBackup" | "none" };
};

export const allServiceIdsOf = (env: ProjectEnvironment): string[] =>
	SERVICE_KIND_FIELDS.flatMap(({ key, idField }) =>
		(env[key] as Record<string, unknown>[]).map(
			(service) => service[idField] as string,
		),
	);

const sortedServicesOf = (env: ProjectEnvironment) =>
	SERVICE_KIND_FIELDS.flatMap(({ key, idField }) =>
		(env[key] as Record<string, unknown>[]).map((service) => ({
			id: service[idField] as string,
			name: (service.name as string) || (service[idField] as string),
			kind: key,
			stopped: (service.applicationStatus ?? service.composeStatus) === "idle",
		})),
	).sort((a, b) => a.name.localeCompare(b.name));

export const hasDropSourceInScope = (
	environments: ProjectEnvironment[],
	serviceIds: string[],
): boolean =>
	environments.some((env) =>
		env.applications.some(
			(app) =>
				app.sourceType === "drop" && serviceIds.includes(app.applicationId),
		),
	);

export const defaultScopeFormState = (
	environments: ProjectEnvironment[],
): ScopeFormState => ({
	environmentIds: environments.map((env) => env.environmentId),
	serviceIds: environments.flatMap(allServiceIdsOf),
	includeEnvSecrets: true,
	shared: {
		destination: "value",
		registry: "value",
		sshKey: "value",
		network: "value",
		certificate: "value",
		dnsProvider: "value",
		vaultProvider: "reference",
	},
	files: {
		applicationSources: true,
		composeFiles: true,
		traefikRaw: true,
		customCertificates: true,
	},
	dumps: { mode: "none" },
});

interface ScopeFormProps {
	section: "selection" | "options";
	environments: ProjectEnvironment[];
	value: ScopeFormState;
	onChange: (next: ScopeFormState) => void;
}

export const ScopeForm = ({
	section,
	environments,
	value,
	onChange,
}: ScopeFormProps) => {
	if (section === "selection") {
		return (
			<div className="space-y-4 max-h-[50vh] overflow-y-auto">
				{environments.map((env) => {
					const envServiceIds = allServiceIdsOf(env);
					const envChecked = value.environmentIds.includes(env.environmentId);
					return (
						<div
							key={env.environmentId}
							className="rounded-md border p-3 space-y-2"
						>
							<div className="flex items-start gap-2">
								<Checkbox
									className="mt-0.5"
									checked={envChecked}
									onCheckedChange={(checked) => {
										const isChecked = checked === true;
										onChange({
											...value,
											environmentIds: isChecked
												? [...value.environmentIds, env.environmentId]
												: value.environmentIds.filter(
														(id) => id !== env.environmentId,
													),
											serviceIds: isChecked
												? Array.from(
														new Set([...value.serviceIds, ...envServiceIds]),
													)
												: value.serviceIds.filter(
														(id) => !envServiceIds.includes(id),
													),
										});
									}}
								/>
								<span className="font-medium">{env.name}</span>
								<span className="text-xs text-muted-foreground">
									({envServiceIds.length} service
									{envServiceIds.length === 1 ? "" : "s"})
								</span>
							</div>
							{envChecked && (
								<div className="ml-6 space-y-1">
									{sortedServicesOf(env).map(({ id, name, kind, stopped }) => {
										const checked = value.serviceIds.includes(id);
										return (
											<div key={id} className="flex items-start gap-2">
												<Checkbox
													className="mt-0.5"
													checked={checked}
													onCheckedChange={(next) => {
														const isChecked = next === true;
														onChange({
															...value,
															serviceIds: isChecked
																? [...value.serviceIds, id]
																: value.serviceIds.filter(
																		(existing) => existing !== id,
																	),
														});
													}}
												/>
												<span className="text-sm">{name}</span>
												<span className="text-xs text-muted-foreground">
													({kind}
													{stopped ? ", stopped" : ""})
												</span>
											</div>
										);
									})}
								</div>
							)}
						</div>
					);
				})}
			</div>
		);
	}

	const dropForced = hasDropSourceInScope(environments, value.serviceIds);

	return (
		<div className="space-y-6">
			<div className="flex items-start gap-2">
				<Checkbox
					className="mt-0.5"
					checked={value.includeEnvSecrets}
					onCheckedChange={(checked) =>
						onChange({ ...value, includeEnvSecrets: checked === true })
					}
				/>
				<Label>
					Include environment variable values (encrypted with the passphrase)
				</Label>
			</div>

			<div className="space-y-2">
				<Label>Shared resources</Label>
				<div className="space-y-1">
					<div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-1">
						<span />
						<div className="flex gap-4">
							<HelpLabel width={76} tooltip={SHARED_MODE_TOOLTIPS.value}>
								Value
							</HelpLabel>
							<HelpLabel width={90} tooltip={SHARED_MODE_TOOLTIPS.reference}>
								Reference
							</HelpLabel>
						</div>
					</div>
					{SHARED_KINDS.map((kind) => (
						<div
							key={kind}
							className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md px-1 py-1"
						>
							<span className="text-sm">{SHARED_KIND_LABELS[kind]}</span>
							<RadioGroup
								value={value.shared[kind] ?? "reference"}
								onValueChange={(next) =>
									onChange({
										...value,
										shared: {
											...value.shared,
											[kind]: next as "value" | "reference",
										},
									})
								}
								className="flex gap-4"
							>
								<div className="flex w-[76px] items-center">
									<RadioGroupItem
										value="value"
										id={`${kind}-value`}
										aria-label={`${SHARED_KIND_LABELS[kind]}: ${SHARED_MODE_TOOLTIPS.value}`}
									/>
								</div>
								<div className="flex w-[90px] items-center">
									<RadioGroupItem
										value="reference"
										id={`${kind}-reference`}
										aria-label={`${SHARED_KIND_LABELS[kind]}: ${SHARED_MODE_TOOLTIPS.reference}`}
									/>
								</div>
							</RadioGroup>
						</div>
					))}
				</div>
			</div>

			<div className="space-y-2">
				<Label>Files</Label>
				{(
					[
						["applicationSources", "Application sources"],
						["composeFiles", "Compose files"],
						["traefikRaw", "Traefik dynamic config"],
						["customCertificates", "Custom certificates"],
					] as const
				).map(([key, label]) => {
					const forced = key === "applicationSources" && dropForced;
					return (
						<div key={key} className="flex items-start gap-2">
							<Checkbox
								className="mt-0.5"
								checked={forced || value.files[key]}
								disabled={forced}
								onCheckedChange={(checked) =>
									onChange({
										...value,
										files: { ...value.files, [key]: checked === true },
									})
								}
							/>
							<Label className="text-sm">{label}</Label>
							{forced && (
								<InfoTooltip tooltip="Required: at least one selected application was uploaded as a zip (drop source), so its code only exists in these files." />
							)}
						</div>
					);
				})}
			</div>

			<div className="space-y-2">
				<Label>Database dumps</Label>
				<RadioGroup
					value={value.dumps.mode}
					onValueChange={(next) =>
						onChange({
							...value,
							dumps: { mode: next as ScopeFormState["dumps"]["mode"] },
						})
					}
					className="space-y-1"
				>
					{DUMP_MODES.map(([mode, label]) => (
						<div key={mode} className="flex items-center gap-2">
							<RadioGroupItem value={mode} id={`dumps-${mode}`} />
							<Label htmlFor={`dumps-${mode}`} className="text-sm">
								{label}
							</Label>
							<InfoTooltip tooltip={DUMP_MODE_TOOLTIPS[mode]} />
						</div>
					))}
				</RadioGroup>
			</div>
		</div>
	);
};
