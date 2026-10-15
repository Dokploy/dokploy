type SourceVersions = {
	dokployVersion: string;
	releaseTag?: string;
	isCloud?: boolean;
	traefikVersion?: string;
	dockerVersions?: Record<string, string>;
};

type DestinationVersions = {
	dokployVersion: string;
	releaseTag: string;
	isCloud: boolean;
	traefikVersion: string;
};

const kindLabel = (isCloud: boolean | undefined) =>
	isCloud === undefined ? "unknown" : isCloud ? "Dokploy Cloud" : "Self-hosted";

const dockerLabel = (versions: Record<string, string> | undefined) => {
	if (!versions) return "unknown";
	const distinct = [...new Set(Object.values(versions))];
	return distinct.length > 0 ? distinct.join(", ") : "unknown";
};

export const VersionsTable = ({
	versions,
}: {
	versions: { source: SourceVersions; destination: DestinationVersions };
}) => {
	const { source, destination } = versions;
	const rows: [string, string, string][] = [
		["Dokploy", source.dokployVersion, destination.dokployVersion],
		["Release tag", source.releaseTag ?? "unknown", destination.releaseTag],
		["Instance", kindLabel(source.isCloud), kindLabel(destination.isCloud)],
		["Traefik", source.traefikVersion ?? "unknown", destination.traefikVersion],
		["Docker (source servers)", dockerLabel(source.dockerVersions), "n/a"],
	];
	return (
		<div className="rounded-md border">
			<table className="w-full text-xs">
				<thead className="text-muted-foreground">
					<tr className="border-b">
						<th className="px-2 py-1 text-left font-medium" />
						<th className="px-2 py-1 text-left font-medium">Bundle source</th>
						<th className="px-2 py-1 text-left font-medium">This instance</th>
					</tr>
				</thead>
				<tbody>
					{rows.map(([label, from, to]) => (
						<tr key={label} className="border-b last:border-0">
							<td className="px-2 py-1 text-muted-foreground">{label}</td>
							<td className="px-2 py-1 font-mono">{from}</td>
							<td
								className={`px-2 py-1 font-mono ${to !== "n/a" && from !== to ? "text-yellow-600 dark:text-yellow-400" : ""}`}
							>
								{to}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
};
