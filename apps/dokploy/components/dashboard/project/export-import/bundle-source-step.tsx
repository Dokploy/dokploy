import { Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/utils/api";
import {
	BundleListState,
	BundleMeta,
	DestinationSelect,
} from "./destination-select";

const uploadWithProgress = (
	file: File,
	serverId: string | undefined,
	onProgress: (percent: number) => void,
): Promise<{ importId: string }> =>
	new Promise((resolve, reject) => {
		const formData = new FormData();
		formData.append("bundle", file);

		const xhr = new XMLHttpRequest();
		xhr.upload.addEventListener("progress", (event) => {
			if (event.lengthComputable) {
				onProgress(Math.round((event.loaded / event.total) * 100));
			}
		});
		xhr.addEventListener("load", () => {
			if (xhr.status >= 200 && xhr.status < 300) {
				try {
					resolve(JSON.parse(xhr.responseText));
				} catch {
					reject(new Error("Invalid response from upload"));
				}
			} else {
				try {
					const body = JSON.parse(xhr.responseText);
					reject(new Error(body.message ?? `Upload failed (${xhr.status})`));
				} catch {
					reject(new Error(`Upload failed (${xhr.status})`));
				}
			}
		});
		xhr.addEventListener("error", () => reject(new Error("Upload failed")));
		xhr.open(
			"POST",
			serverId
				? `/api/project-export-import/upload?serverId=${encodeURIComponent(serverId)}`
				: "/api/project-export-import/upload",
		);
		xhr.send(formData);
	});

interface BundleSourceStepProps {
	onSelected: (importId: string, serverId: string | undefined) => void;
	initialBundle?: { destinationId: string; key: string };
}

export const BundleSourceStep = ({
	onSelected,
	initialBundle,
}: BundleSourceStepProps) => {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const { data: isCloud } = api.settings.isCloud.useQuery();
	const { data: servers } = api.server.withSSHKey.useQuery();
	const [serverId, setServerId] = useState("");
	const needsServer = isCloud !== false && !serverId;
	const [uploadProgress, setUploadProgress] = useState(0);
	const [isUploading, setIsUploading] = useState(false);
	const [destinationId, setDestinationId] = useState(
		initialBundle?.destinationId ?? "",
	);
	const [selectedKey, setSelectedKey] = useState(initialBundle?.key ?? "");

	const bundlesQuery = api.projectExportImport.listRemoteBundles.useQuery(
		{ destinationId },
		{ enabled: !!destinationId },
	);
	const { mutateAsync: importFromDestination, isPending: isFetching } =
		api.projectExportImport.importFromDestination.useMutation({
			onError: (error) => toast.error(error.message),
		});

	const handleFileSelected = async (file: File) => {
		setIsUploading(true);
		setUploadProgress(0);
		try {
			const result = await uploadWithProgress(
				file,
				serverId || undefined,
				setUploadProgress,
			);
			onSelected(result.importId, serverId || undefined);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Upload failed");
		} finally {
			setIsUploading(false);
			if (fileInputRef.current) fileInputRef.current.value = "";
		}
	};

	const handleFromDestination = async () => {
		try {
			const result = await importFromDestination({
				destinationId,
				key: selectedKey,
				serverId: serverId || undefined,
			});
			onSelected(result.importId, serverId || undefined);
		} catch {}
	};

	return (
		<Tabs defaultValue={initialBundle ? "destination" : "upload"}>
			<div className="mb-3 grid gap-1">
				<Label className="text-xs">Server</Label>
				<Select
					value={serverId || (isCloud ? "" : "local")}
					onValueChange={(value) => setServerId(value === "local" ? "" : value)}
				>
					<SelectTrigger>
						<SelectValue placeholder="Server the bundle will be imported to" />
					</SelectTrigger>
					<SelectContent>
						{!isCloud && <SelectItem value="local">Local server</SelectItem>}
						{servers?.map((server) => (
							<SelectItem key={server.serverId} value={server.serverId}>
								{server.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<p className="text-xs text-muted-foreground">
					The bundle is unpacked and restored on this server
					{isCloud ? "; nothing is stored on Dokploy Cloud" : ""}.
				</p>
			</div>
			<TabsList>
				<TabsTrigger value="upload">Upload a file</TabsTrigger>
				<TabsTrigger value="destination">From a destination</TabsTrigger>
			</TabsList>
			<TabsContent value="upload" className="space-y-4">
				<div
					className={`flex flex-col items-center justify-center gap-2 rounded-md border border-dashed p-10 text-center ${needsServer ? "opacity-50" : "cursor-pointer"}`}
					onClick={() => !needsServer && fileInputRef.current?.click()}
				>
					<Upload className="h-8 w-8 text-muted-foreground" />
					<p className="text-sm text-muted-foreground">
						Click to select a .dokploy.tar.gz bundle
					</p>
					<input
						ref={fileInputRef}
						type="file"
						accept=".gz,.tar.gz"
						className="hidden"
						onChange={(e) => {
							const file = e.target.files?.[0];
							if (file) void handleFileSelected(file);
						}}
					/>
				</div>
				{isUploading && (
					<div className="space-y-2">
						<Progress value={uploadProgress} />
						<p className="text-sm text-muted-foreground">
							Uploading... {uploadProgress}%
						</p>
					</div>
				)}
			</TabsContent>
			<TabsContent value="destination" className="space-y-3">
				<DestinationSelect value={destinationId} onChange={setDestinationId} />
				{destinationId && (
					<div className="max-h-[200px] space-y-1 overflow-y-auto rounded-md border p-2">
						<BundleListState query={bundlesQuery} />
						{bundlesQuery.data?.map((bundle) => (
							<button
								type="button"
								key={bundle.key}
								onClick={() => setSelectedKey(bundle.key)}
								className={`flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs hover:bg-muted ${selectedKey === bundle.key ? "bg-muted" : ""}`}
							>
								<span className="font-mono truncate">
									{bundle.key.split("/").at(-1)}
								</span>
								<BundleMeta size={bundle.size} modTime={bundle.modTime} />
							</button>
						))}
					</div>
				)}
				<Button
					isLoading={isFetching}
					disabled={!destinationId || !selectedKey || needsServer}
					onClick={handleFromDestination}
				>
					Fetch bundle
				</Button>
			</TabsContent>
		</Tabs>
	);
};
