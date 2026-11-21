import { Loader2, Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "@/utils/api";
import { PatchDiffEditor, type PatchViewMode } from "./patch-diff-editor";

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
	const { data: patch, isPending: isPatchLoading } = api.patch.one.useQuery(
		{ patchId },
		{ enabled: !!patchId },
	);
	const [content, setContent] = useState("");
	const [viewMode, setViewMode] = useState<PatchViewMode>("editor");
	const { data: patchFile, isPending: isPatchFileLoading } =
		api.patch.readRepoFile.useQuery(
			{
				id: entityId,
				type,
				filePath: patch?.filePath || "",
			},
			{ enabled: !!patch?.filePath },
		);

	useEffect(() => {
		if (patchFile) {
			setContent(patchFile.patchedContent);
		}
	}, [patchFile]);

	useEffect(() => {
		setViewMode("editor");
	}, [patchId]);

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
					<div className="flex items-center justify-between gap-4">
						<DialogTitle>Edit Patch</DialogTitle>
						<Select
							value={viewMode}
							onValueChange={(value) => setViewMode(value as PatchViewMode)}
						>
							<SelectTrigger className="w-[170px]">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="editor">Editor</SelectItem>
								<SelectItem value="diff">Diff mode</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<DialogDescription>
						{patch ? `Editing: ${patch.filePath}` : "Loading patch..."}
					</DialogDescription>
				</DialogHeader>
				{isPatchLoading || isPatchFileLoading ? (
					<div className="flex flex-1 items-center justify-center px-6 py-12">
						<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
					</div>
				) : patch && patchFile ? (
					<div className="flex-1 min-h-0 px-6 overflow-hidden flex flex-col">
						<PatchDiffEditor
							filePath={patch.filePath}
							originalContent={patchFile.originalContent}
							value={content}
							onChange={setContent}
							patchType={patch.type}
							mode={viewMode}
							className="h-[400px]"
						/>
					</div>
				) : null}
				<DialogFooter className="px-6 ">
					<DialogClose asChild>
						<Button variant="outline">Cancel</Button>
					</DialogClose>
					<Button onClick={handleSave} isLoading={updatePatch.isPending}>
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
