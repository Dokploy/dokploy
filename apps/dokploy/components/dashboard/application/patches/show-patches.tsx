import { AlertCircle, ChevronRight, File, Folder, Loader2, Power, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { api } from "@/utils/api";
import type { RouterOutputs } from "@/utils/api";
import { PatchEditor } from "./patch-editor";

interface Props {
	applicationId?: string;
	composeId?: string;
}

type Patch = RouterOutputs["patch"]["byApplicationId"][number];

export const ShowPatches = ({ applicationId, composeId }: Props) => {
	const [selectedFile, setSelectedFile] = useState<string | null>(null);
	const [repoPath, setRepoPath] = useState<string | null>(null);
	const [isLoadingRepo, setIsLoadingRepo] = useState(false);

	const utils = api.useUtils();

	// Fetch patches
	// Fetch patches
	const { data: appPatches, isLoading: isAppPatchesLoading } =
		api.patch.byApplicationId.useQuery(
			{ applicationId: applicationId! },
			{ enabled: !!applicationId },
		);

	const { data: composePatches, isLoading: isComposePatchesLoading } =
		api.patch.byComposeId.useQuery(
			{ composeId: composeId! },
			{ enabled: !!composeId },
		);

	const patches = applicationId ? appPatches : composePatches;
	const isPatchesLoading = applicationId
		? isAppPatchesLoading
		: isComposePatchesLoading;

	// Mutations
	const deletePatch = api.patch.delete.useMutation({
		onSuccess: () => {
			toast.success("Patch deleted");
			if (applicationId) {
				utils.patch.byApplicationId.invalidate({ applicationId });
			} else if (composeId) {
				utils.patch.byComposeId.invalidate({ composeId });
			}
		},
		onError: () => {
			toast.error("Failed to delete patch");
		},
	});

	const togglePatch = api.patch.toggleEnabled.useMutation({
		onSuccess: () => {
			toast.success("Patch updated");
			if (applicationId) {
				utils.patch.byApplicationId.invalidate({ applicationId });
			} else if (composeId) {
				utils.patch.byComposeId.invalidate({ composeId });
			}
		},
		onError: () => {
			toast.error("Failed to update patch");
		},
	});

	const ensureRepo = api.patch.ensureRepo.useMutation();

	const handleOpenEditor = async () => {
		setIsLoadingRepo(true);
		const toastId = toast.loading("Syncing repository...");
		ensureRepo.mutate(
			{ applicationId, composeId },
			{
				onSuccess: (path) => {
					setRepoPath(path);
					setIsLoadingRepo(false);
					toast.dismiss(toastId);
				},
				onError: () => {
					setIsLoadingRepo(false);
					toast.dismiss(toastId);
					toast.error("Failed to load repository");
				},
			},
		);
	};

	const handleDeletePatch = (patchId: string) => {
		deletePatch.mutate({ patchId });
	};

	const handleTogglePatch = (patchId: string, enabled: boolean) => {
		togglePatch.mutate({ patchId, enabled });
	};

	const handleCloseEditor = () => {
		setSelectedFile(null);
		setRepoPath(null);
		if (applicationId) {
			utils.patch.byApplicationId.invalidate({ applicationId });
		} else if (composeId) {
			utils.patch.byComposeId.invalidate({ composeId });
		}
	};

	if (repoPath) {
		return (
			<PatchEditor
				applicationId={applicationId}
				composeId={composeId}
				repoPath={repoPath}
				onClose={handleCloseEditor}
			/>
		);
	}

	return (
		<Card className="bg-background">
			<CardHeader className="flex flex-row items-center justify-between">
				<div>
					<CardTitle>Patches</CardTitle>
					<CardDescription>
						Apply code patches to your repository during build. Patches are applied after
						cloning the repository and before building.
					</CardDescription>
				</div>
				<Button onClick={handleOpenEditor} disabled={isLoadingRepo}>
					{isLoadingRepo && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
					Create Patch
				</Button>
			</CardHeader>
			<CardContent>
				{isPatchesLoading ? (
					<div className="flex items-center justify-center py-8">
						<Loader2 className="h-6 w-6 animate-spin" />
					</div>
				) : !patches || patches.length === 0 ? (
					<Alert>
						<AlertCircle className="h-4 w-4" />
						<AlertTitle>No patches</AlertTitle>
						<AlertDescription>
							No patches have been created for this application yet. Click "Create Patch"
							to add modifications to your code during build.
						</AlertDescription>
					</Alert>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>File Path</TableHead>
								<TableHead className="w-[100px]">Enabled</TableHead>
								<TableHead className="w-[80px]">Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{patches.map((patch: Patch) => (
								<TableRow key={patch.patchId}>
									<TableCell className="font-mono text-sm">
										<div className="flex items-center gap-2">
											<File className="h-4 w-4 text-muted-foreground" />
											{patch.filePath}
										</div>
									</TableCell>
									<TableCell>
										<Switch
											checked={patch.enabled}
											onCheckedChange={(checked) =>
												handleTogglePatch(patch.patchId, checked)
											}
										/>
									</TableCell>
									<TableCell>
										<Button
											variant="ghost"
											size="icon"
											onClick={() => handleDeletePatch(patch.patchId)}
										>
											<Trash2 className="h-4 w-4 text-destructive" />
										</Button>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
			</CardContent>
		</Card>
	);
};
