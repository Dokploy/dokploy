import { Upload } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AlertBlock } from "@/components/shared/alert-block";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api, type RouterOutputs } from "@/utils/api";
import {
	AutofillDecoy,
	MIN_PASSPHRASE_LENGTH,
	PassphraseField,
} from "./passphrase-fields";

type Preview = RouterOutputs["projectExportImport"]["importPreview"];

const LOCAL_SERVER = "local";

export const ImportProject = () => {
	const { t } = useTranslation();
	const utils = api.useUtils();
	const [open, setOpen] = useState(false);
	const [bundle, setBundle] = useState<string | null>(null);
	const [passphrase, setPassphrase] = useState("");
	const [preview, setPreview] = useState<Preview | null>(null);
	const [serverId, setServerId] = useState("");
	const { data: isCloud } = api.settings.isCloud.useQuery();
	const { data: servers } = api.server.withSSHKey.useQuery(undefined, {
		enabled: open,
	});
	const previewMutation = api.projectExportImport.importPreview.useMutation();
	const importMutation = api.projectExportImport.import.useMutation();

	const reset = () => {
		setBundle(null);
		setPassphrase("");
		setPreview(null);
		setServerId(isCloud ? "" : LOCAL_SERVER);
	};

	const handleOpenChange = (next: boolean) => {
		if (importMutation.isPending) return;
		setOpen(next);
		if (next) reset();
	};

	const handleFile = async (file: File | undefined) => {
		setPreview(null);
		setBundle(file ? await file.text() : null);
	};

	const handlePreview = async () => {
		if (!bundle) return;
		try {
			const result = await previewMutation.mutateAsync({ bundle, passphrase });
			setPreview(result);
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: t("project.importProject.invalidBundle"),
			);
		}
	};

	const handleImport = async () => {
		if (!bundle) return;
		try {
			const result = await importMutation.mutateAsync({
				bundle,
				passphrase,
				serverId: serverId === LOCAL_SERVER ? undefined : serverId,
			});
			await utils.project.all.invalidate();
			toast.success(
				t("project.importProject.imported", { name: result.projectName }),
			);
			setOpen(false);
			for (const warning of result.warnings) toast.warning(warning);
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: t("project.importProject.failed"),
			);
		}
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogTrigger asChild>
				<Button variant="outline">
					<Upload className="mr-2 h-4 w-4" />
					{t("project.importProject.menuLabel")}
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>{t("project.importProject.title")}</DialogTitle>
					<DialogDescription>
						{t("project.importProject.description")}
					</DialogDescription>
				</DialogHeader>

				{!preview ? (
					<div className="space-y-4">
						<div className="grid gap-2">
							<Label htmlFor="bundle-file">
								{t("project.importProject.exportFile")}
							</Label>
							<Input
								id="bundle-file"
								type="file"
								accept=".dokploy"
								onChange={(e) => void handleFile(e.target.files?.[0])}
							/>
						</div>
						<AutofillDecoy />
						<PassphraseField
							id="import-passphrase"
							label={t("project.passphrase.label")}
							value={passphrase}
							onChange={setPassphrase}
						/>
					</div>
				) : (
					<div className="space-y-4">
						<div className="grid gap-2">
							<Label>{t("project.importProject.server")}</Label>
							<Select value={serverId} onValueChange={setServerId}>
								<SelectTrigger>
									<SelectValue
										placeholder={t("project.importProject.serverPlaceholder")}
									/>
								</SelectTrigger>
								<SelectContent>
									{!isCloud && (
										<SelectItem value={LOCAL_SERVER}>
											{t("project.importProject.dokployServer")}
										</SelectItem>
									)}
									{servers?.map((server) => (
										<SelectItem key={server.serverId} value={server.serverId}>
											{server.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-2 rounded-md border p-3 text-sm">
							{preview.environments.map((env) => (
								<div key={env.name}>
									<p className="font-medium">{env.name}</p>
									<ul className="ml-4 text-muted-foreground">
										{env.services.map((service) => (
											<li key={`${service.type}-${service.name}`}>
												{service.name} ({service.type})
											</li>
										))}
									</ul>
								</div>
							))}
						</div>
						{preview.warnings.length > 0 && (
							<AlertBlock type="warning">
								<ul className="list-disc space-y-1 pl-4">
									{preview.warnings.map((warning) => (
										<li key={warning}>{warning}</li>
									))}
								</ul>
							</AlertBlock>
						)}
					</div>
				)}

				<DialogFooter>
					{!preview ? (
						<Button
							isLoading={previewMutation.isPending}
							disabled={!bundle || passphrase.length < MIN_PASSPHRASE_LENGTH}
							onClick={handlePreview}
						>
							{t("project.importProject.continue")}
						</Button>
					) : (
						<>
							<Button
								variant="outline"
								disabled={importMutation.isPending}
								onClick={() => setPreview(null)}
							>
								{t("project.form.back")}
							</Button>
							<Button
								isLoading={importMutation.isPending}
								disabled={!serverId}
								onClick={handleImport}
							>
								{t("project.importProject.action")}
							</Button>
						</>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
