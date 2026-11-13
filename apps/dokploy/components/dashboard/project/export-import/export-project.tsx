import { Download } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { api } from "@/utils/api";
import { isPassphraseValid, PassphraseFields } from "./passphrase-fields";

type ServiceRow = { name: string } & Record<string, unknown>;

export type ProjectEnvironment = {
	environmentId: string;
	name: string;
	applications: ServiceRow[];
	compose: ServiceRow[];
	postgres: ServiceRow[];
	mysql: ServiceRow[];
	mariadb: ServiceRow[];
	mongo: ServiceRow[];
	redis: ServiceRow[];
	libsql: ServiceRow[];
};

const SERVICE_KINDS = [
	["applications", "applicationId", "application"],
	["compose", "composeId", "compose"],
	["postgres", "postgresId", "postgres"],
	["mysql", "mysqlId", "mysql"],
	["mariadb", "mariadbId", "mariadb"],
	["mongo", "mongoId", "mongo"],
	["redis", "redisId", "redis"],
	["libsql", "libsqlId", "libsql"],
] as const;

const servicesOf = (env: ProjectEnvironment) =>
	SERVICE_KINDS.flatMap(([key, idField, label]) =>
		env[key].map((service) => ({
			id: service[idField] as string,
			name: service.name,
			label,
		})),
	).sort((a, b) => a.name.localeCompare(b.name));

const downloadFile = (filename: string, content: string) => {
	const url = URL.createObjectURL(
		new Blob([content], { type: "application/json" }),
	);
	const link = document.createElement("a");
	link.href = url;
	link.download = filename;
	link.click();
	URL.revokeObjectURL(url);
};

interface ExportProjectProps {
	projectId: string;
	environments: ProjectEnvironment[];
}

export const ExportProject = ({
	projectId,
	environments,
}: ExportProjectProps) => {
	const [open, setOpen] = useState(false);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [passphrase, setPassphrase] = useState("");
	const [passphraseConfirm, setPassphraseConfirm] = useState("");
	const { mutateAsync, isPending } =
		api.projectExportImport.export.useMutation();

	const allIds = environments.flatMap((env) =>
		servicesOf(env).map((service) => service.id),
	);

	const handleOpenChange = (next: boolean) => {
		setOpen(next);
		if (next) {
			setSelected(new Set(allIds));
			setPassphrase("");
			setPassphraseConfirm("");
		}
	};

	const toggle = (ids: string[], checked: boolean) => {
		const next = new Set(selected);
		for (const id of ids) {
			if (checked) next.add(id);
			else next.delete(id);
		}
		setSelected(next);
	};

	const handleExport = async () => {
		try {
			const { filename, content } = await mutateAsync({
				projectId,
				serviceIds: [...selected],
				passphrase,
			});
			downloadFile(filename, content);
			toast.success("Project exported");
			setOpen(false);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Export failed");
		}
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogTrigger asChild>
				<DropdownMenuItem
					className="w-full cursor-pointer space-x-3"
					onSelect={(e) => e.preventDefault()}
				>
					<Download className="size-4" />
					<span>Export project</span>
				</DropdownMenuItem>
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Export project</DialogTitle>
					<DialogDescription>
						Download the configuration of the selected services as an encrypted
						file you can import into another Dokploy instance.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-3 max-h-[40vh] overflow-y-auto">
					{environments.map((env) => {
						const services = servicesOf(env);
						const ids = services.map((service) => service.id);
						return (
							<div
								key={env.environmentId}
								className="rounded-md border p-3 space-y-2"
							>
								<div className="flex items-center gap-2">
									<Checkbox
										id={`export-env-${env.environmentId}`}
										checked={
											ids.length > 0 && ids.every((id) => selected.has(id))
										}
										onCheckedChange={(checked) => toggle(ids, checked === true)}
									/>
									<Label htmlFor={`export-env-${env.environmentId}`}>
										{env.name}
									</Label>
								</div>
								{services.map((service) => (
									<div
										key={service.id}
										className="ml-6 flex items-center gap-2"
									>
										<Checkbox
											id={`export-service-${service.id}`}
											checked={selected.has(service.id)}
											onCheckedChange={(checked) =>
												toggle([service.id], checked === true)
											}
										/>
										<Label
											htmlFor={`export-service-${service.id}`}
											className="font-normal"
										>
											{service.name}
											<span className="ml-1 text-xs text-muted-foreground">
												({service.label})
											</span>
										</Label>
									</div>
								))}
							</div>
						);
					})}
				</div>

				<AlertBlock type="info">
					Environment variables and credentials are included, encrypted with the
					passphrase. Data in volumes and databases, backups, deployments, and
					resources shared across projects (servers, registries, git providers,
					destinations) are not.
				</AlertBlock>

				<PassphraseFields
					value={passphrase}
					confirm={passphraseConfirm}
					onValueChange={setPassphrase}
					onConfirmChange={setPassphraseConfirm}
				/>

				<DialogFooter>
					<Button
						isLoading={isPending}
						disabled={
							selected.size === 0 ||
							!isPassphraseValid(passphrase, passphraseConfirm)
						}
						onClick={handleExport}
					>
						Export
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
