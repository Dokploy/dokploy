import type { ServiceVolume } from "@dokploy/server";
import { PenBoxIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/utils/api";

interface Props {
	composeId: string;
	volume: ServiceVolume;
	refetch: () => void;
}

export const UpdateComposeVolume = ({ composeId, volume, refetch }: Props) => {
	const [isOpen, setIsOpen] = useState(false);
	const [source, setSource] = useState(volume.source);
	const [target, setTarget] = useState(volume.target);

	const { mutateAsync: removeVolume } =
		api.compose.removeComposeVolume.useMutation();
	const { mutateAsync: addVolume, isLoading } =
		api.compose.addComposeVolume.useMutation();

	const onSubmit = async () => {
		if (!source.trim() || !target.trim()) {
			toast.error("Source and target are required");
			return;
		}
		const original = { source: volume.source, target: volume.target };
		try {
			await removeVolume({ composeId, serviceName: volume.serviceName, target: volume.target });
			await addVolume({ composeId, serviceName: volume.serviceName, source, target });
			toast.success("Volume updated successfully");
			setIsOpen(false);
			refetch();
		} catch {
			// Attempt rollback if remove succeeded but add failed
			try {
				await addVolume({ composeId, serviceName: volume.serviceName, source: original.source, target: original.target });
			} catch {}
			toast.error("Error updating volume");
		}
	};

	return (
		<Dialog
			open={isOpen}
			onOpenChange={(open) => {
				setIsOpen(open);
				if (open) {
					setSource(volume.source);
					setTarget(volume.target);
				}
			}}
		>
			<DialogTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="group hover:bg-blue-500/10"
				>
					<PenBoxIcon className="size-3.5 text-primary group-hover:text-blue-500" />
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Edit Volume — {volume.serviceName}</DialogTitle>
				</DialogHeader>
				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-2">
						<Label>Source</Label>
						<Input value={source} onChange={(e) => setSource(e.target.value)} />
					</div>
					<div className="flex flex-col gap-2">
						<Label>Target</Label>
						<Input value={target} onChange={(e) => setTarget(e.target.value)} />
					</div>
				</div>
				<DialogFooter>
					<Button onClick={onSubmit} isLoading={isLoading} disabled={!source.trim() || !target.trim()}>
						Update
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
