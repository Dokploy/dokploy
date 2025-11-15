"use client";

import { InfoIcon, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/utils/api";

interface Props {
	serverId?: string;
	trigger?: React.ReactNode;
}

export const ChangeConcurrencyModal = ({ serverId, trigger }: Props) => {
	const [isOpen, setIsOpen] = useState(false);
	const [concurrency, setConcurrency] = useState<number | "">("");

	const { data, isLoading: isLoadingCurrent } =
		api.settings.getDeploymentConcurrency.useQuery(
			{ serverId },
			{
				enabled: isOpen,
				onSuccess: (data) => {
					if (concurrency === "") {
						setConcurrency(data.concurrency);
					}
				},
			},
		);

	const { mutateAsync, isLoading } =
		api.settings.setDeploymentConcurrency.useMutation();

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (
			typeof concurrency !== "number" ||
			concurrency < 1 ||
			concurrency > 20
		) {
			toast.error("Concurrency must be between 1 and 20");
			return;
		}

		try {
			const result = await mutateAsync({ concurrency, serverId });
			if (result.clearedBuilds > 0) {
				toast.warning(
					`Concurrency updated. ${result.clearedBuilds} pending build${result.clearedBuilds > 1 ? "s were" : " was"} cancelled.`,
				);
			} else {
				toast.success("Concurrency updated successfully");
			}
			setIsOpen(false);
		} catch (error) {
			toast.error("Failed to update concurrency");
		}
	};

	const serverType = serverId ? "Remote Server" : "Dokploy Server";

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				{trigger || (
					<Button variant="outline" size="sm">
						Change Concurrency
					</Button>
				)}
			</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Deployment Concurrency - {serverType}</DialogTitle>
					<DialogDescription>
						Configure how many deployments can run simultaneously on this
						server.
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={handleSubmit} className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="concurrency">Concurrency</Label>
						<Input
							id="concurrency"
							type="number"
							min={1}
							max={20}
							value={concurrency}
							onChange={(e) => {
								const value = e.target.value;
								setConcurrency(value === "" ? "" : Number.parseInt(value, 10));
							}}
							placeholder="Enter concurrency (1-20)"
							disabled={isLoading || isLoadingCurrent}
						/>
						{isLoadingCurrent && (
							<div className="flex items-center gap-2 text-sm text-muted-foreground">
								<Loader2 className="h-4 w-4 animate-spin" />
								Loading current concurrency...
							</div>
						)}
						{!isLoadingCurrent && data && (
							<p className="text-sm text-muted-foreground">
								Current: {data.concurrency}
							</p>
						)}
					</div>

					<div className="space-y-3">
						<Alert>
							<InfoIcon className="h-4 w-4" />
							<AlertDescription className="text-sm">
								<div className="space-y-1 mt-1">
									<p>
										<strong>Default:</strong> 1 deployment at a time
										(sequential)
									</p>
									<p>
										<strong>Higher values:</strong> More deployments in
										parallel, but will use more RAM and CPU resources.
									</p>
									{serverId && (
										<p className="text-muted-foreground text-xs mt-2">
											This setting applies to deployments on this remote server.
										</p>
									)}
									{!serverId && (
										<p className="text-muted-foreground text-xs mt-2">
											This setting applies to deployments on the Dokploy server.
										</p>
									)}
								</div>
							</AlertDescription>
						</Alert>
						<Alert variant="destructive">
							<InfoIcon className="h-4 w-4" />
							<AlertDescription className="text-sm font-medium">
								⚠️ <strong>Warning:</strong> Changing concurrency will cancel all
								pending builds. Currently running builds will continue, but
								queued builds will be cancelled.
							</AlertDescription>
						</Alert>
					</div>

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => setIsOpen(false)}
							disabled={isLoading}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={isLoading || isLoadingCurrent}>
							{isLoading ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									Updating...
								</>
							) : (
								"Update Concurrency"
							)}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
};
