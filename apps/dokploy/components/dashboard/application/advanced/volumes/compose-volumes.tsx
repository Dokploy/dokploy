interface ComposeVolumesProps {
	composeVolumes: Record<
		string,
		{
			config: any;
			usage: Array<{ service: string; mountPath: string }>;
			hostPath?: string;
			isBindMount?: boolean;
		}
	>;
}

/**
 * Generates a display string for the mount path of a volume.
 */
const getMountPathDisplay = (
	volumeName: string,
	volumeData: any,
): string => {
	const hasUsage = volumeData?.usage && volumeData.usage.length > 0;

	if (!hasUsage) {
		return volumeData?.isBindMount ? volumeData.hostPath : volumeName;
	}

	return volumeData.usage
		.map((usage: { service: string; mountPath: string }) => {
			const source = volumeData?.isBindMount
				? volumeData.hostPath
				: volumeName;
			return `${source}:${usage.mountPath}`;
		})
		.join(", ");
};

/**
 * Retrieves the driver value from the volume configuration.
 */
const getDriverValue = (volumeData: any): string => {
	const hasValidConfig =
		typeof volumeData?.config === "object" && volumeData?.config !== null;
	return hasValidConfig ? volumeData.config.driver || "default" : "default";
};

/**
 * Retrieves the external value from the volume configuration.
 */
const getExternalValue = (volumeData: any): string => {
	const hasValidConfig =
		typeof volumeData?.config === "object" && volumeData?.config !== null;
	return hasValidConfig && volumeData.config.external ? "Yes" : "No";
};

/**
 * Component to display individual volume fields.
 */
const VolumeField = ({
	label,
	value,
	breakText = false,
}: { label: string; value: string; breakText?: boolean }) => (
	<div className="flex flex-col gap-1 min-w-0">
		<span className="font-medium">{label}</span>
		<span
			className={`text-sm text-muted-foreground ${breakText ? "break-all" : ""}`}
		>
			{value}
		</span>
	</div>
);

/**
 * Component to display compose volumes information.
 */
export const ComposeVolumes = ({ composeVolumes }: ComposeVolumesProps) => {
	if (!composeVolumes || Object.keys(composeVolumes).length === 0) {
		return null;
	}

	return (
		<div className="space-y-4">
			<div>
				<h3 className="text-lg font-semibold">Compose Volumes</h3>
				<p className="text-sm text-muted-foreground">
					Volumes defined in the docker-compose.yml file of the service
				</p>
			</div>
			<div className="flex flex-col gap-6">
				{Object.entries(composeVolumes).map(
					([volumeName, volumeData]: [string, any]) => {
						const isBindMount = volumeData?.isBindMount;
						const mountPath = getMountPathDisplay(volumeName, volumeData);
						const type = isBindMount ? "Bind Mount" : "Volume";

						return (
							<div key={volumeName} className="border rounded-lg p-4">
								<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-[2fr_1fr_1fr_1fr] gap-4 sm:gap-8">
									<VolumeField
										label="Mount Path"
										value={mountPath}
										breakText={true}
									/>
									<VolumeField label="Type" value={type} />

									{isBindMount ? (
										<>
											<VolumeField label="-" value="-" />
											<VolumeField label="-" value="-" />
										</>
									) : (
										<>
											<VolumeField
												label="Driver"
												value={getDriverValue(volumeData)}
											/>
											<VolumeField
												label="External"
												value={getExternalValue(volumeData)}
											/>
										</>
									)}
								</div>
							</div>
						);
					},
				)}
			</div>
		</div>
	);
};
