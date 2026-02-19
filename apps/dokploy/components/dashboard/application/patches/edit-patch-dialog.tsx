import { Loader2, Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CodeEditor } from "@/components/shared/code-editor";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { api } from "@/utils/api";

interface Props {
	patchId: string;
	entityId: string;
	type: "application" | "compose";
	onSuccess?: () => void;
}

export const EditPatchDialog = ({
	patchId,
	entityId,
	type,
	onSuccess,
}: Props) => {
	const { data: patch, isLoading: isPatchLoading } = api.patch.one.useQuery(
		{ patchId },
		{ enabled: !!patchId },
	);
	const [content, setContent] = useState("");

	useEffect(() => {
		if (patch) {
			setContent(patch.content);
		}
	}, [patch]);

	const utils = api.useUtils();
	const updatePatch = api.patch.update.useMutation();

	const handleSave = () => {
		updatePatch
			.mutateAsync({ patchId, content })
			.then(() => {
				toast.success("Patch saved");
				utils.patch.byEntityId.invalidate({ id: entityId, type });
				onSuccess?.();
			})
			.catch((err) => {
				toast.error(err.message);
			});
	};

	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button variant="ghost" size="icon" title="Edit patch">
					<Pencil className="h-4 w-4" />
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-4xl max-h-[85vh] flex flex-col p-0">
				<DialogHeader className="px-6 pt-6 pb-4">
					<DialogTitle>Edit Patch</DialogTitle>
					<DialogDescription>
						{patch ? `Editing: ${patch.filePath}` : "Loading patch..."}
					</DialogDescription>
				</DialogHeader>
				{isPatchLoading ? (
					<div className="flex flex-1 items-center justify-center px-6 py-12">
						<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
					</div>
				) : (
					<div className="flex-1 min-h-0 px-6 overflow-hidden flex flex-col">
						<CodeEditor
							value={content}
							onChange={(value) => setContent(value ?? "")}
							className="h-[400px] w-full"
							wrapperClassName="h-[400px]"
							lineWrapping
						/>
					</div>
				)}
				<DialogFooter className="px-6 ">
					<DialogClose asChild>
						<Button variant="outline">Cancel</Button>
					</DialogClose>
					<Button onClick={handleSave} isLoading={updatePatch.isLoading}>
						{updatePatch.isPending && (
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
						)}
						Save
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
