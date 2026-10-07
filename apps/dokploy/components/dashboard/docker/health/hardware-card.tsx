import { Cpu } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { RouterOutputs } from "@/utils/api";

type Props = {
	readonly hardware?: RouterOutputs["docker"]["getServerHardware"];
	readonly isFetching: boolean;
	readonly hasError: boolean;
	readonly serverId?: string;
};

export const HardwareCard = ({
	hardware,
	isFetching,
	hasError,
	serverId,
}: Props) => (
	<Card className="p-4 min-w-0" aria-busy={isFetching}>
		<h4 className="flex items-center gap-2 text-sm font-medium mb-2">
			<Cpu className="size-4 text-muted-foreground" aria-hidden="true" />
			Architecture &amp; NVIDIA GPUs
		</h4>
		{isFetching && !hardware ? (
			<p role="status" className="text-sm text-muted-foreground">
				Checking hardware…
			</p>
		) : (
			<>
				{(hasError || hardware?.error) && (
					<p role="alert" className="text-sm text-destructive mb-2">
						{hasError
							? "Could not refresh hardware. Re-check to try again."
							: "Some hardware details could not be read. Available results are shown below."}
					</p>
				)}
				<p className="text-sm break-words">
					Architecture: {hardware?.architecture ?? "Unknown"}
				</p>
				{hardware?.gpu.detection === "available" ? (
					hardware.gpu.devices.length === 0 ? (
						<p className="text-sm text-muted-foreground mt-2">
							No NVIDIA GPUs reported.
						</p>
					) : (
						<ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-3">
							{hardware.gpu.devices.map((device) => (
								<li
									key={device.index}
									className="min-w-0 space-y-1 text-sm break-words"
								>
									<p className="font-medium">
										GPU {device.index}: {device.name}
									</p>
									<p>
										VRAM: {device.memoryFreeMiB ?? "Unknown"} MiB free /{" "}
										{device.memoryTotalMiB ?? "Unknown"} MiB total
									</p>
									<p className="text-muted-foreground">
										Driver: {device.driverVersion ?? "Unknown"}
									</p>
									<p className="text-muted-foreground">
										Compute capability: {device.computeCapability ?? "Unknown"}
									</p>
								</li>
							))}
						</ul>
					)
				) : (
					<p className="text-sm text-muted-foreground mt-2">
						{hardware?.gpu.unavailableReason === "nvidia-smi-not-found"
							? serverId
								? "NVIDIA detection unavailable: nvidia-smi was not found on this server."
								: "NVIDIA detection unavailable: nvidia-smi is not accessible inside the Dokploy container."
							: "NVIDIA detection unavailable. This does not confirm that no GPU is installed."}
					</p>
				)}
				{!serverId && (
					<p className="text-xs text-muted-foreground mt-3">
						Architecture comes from Docker Engine. GPU details reflect devices
						visible inside the Dokploy container.
					</p>
				)}
				{hardware && (
					<p className="text-xs text-muted-foreground mt-3">
						Checked {new Date(hardware.checkedAt).toLocaleString()}
						{isFetching ? " · Refreshing…" : ""}
					</p>
				)}
			</>
		)}
	</Card>
);
