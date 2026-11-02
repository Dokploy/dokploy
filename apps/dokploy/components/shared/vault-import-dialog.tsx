import { DownloadIcon, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "@/utils/api";

interface Props {
	projectId?: string;
	environmentId?: string;
	currentEnv: string;
	onImport: (nextEnv: string) => void;
}

const normalizeSecretName = (secretName: string) => {
	const normalized = secretName
		.replace(/[^a-zA-Z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "")
		.toUpperCase();
	return /^[0-9]/.test(normalized) ? `_${normalized}` : normalized || "SECRET";
};

const parseEnvKeys = (env: string) => {
	const keys = new Set<string>();
	for (const line of env.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
		keys.add(trimmed.slice(0, trimmed.indexOf("=")).trim());
	}
	return keys;
};

const setEnvValue = (env: string, key: string, ref: string) => {
	const lines = env.split("\n");
	const line = `${key}=${ref}`;
	const index = lines.findIndex((l) => {
		const trimmed = l.trim();
		return (
			trimmed &&
			!trimmed.startsWith("#") &&
			trimmed.includes("=") &&
			trimmed.slice(0, trimmed.indexOf("=")).trim() === key
		);
	});
	if (index >= 0) {
		lines[index] = line;
		return lines.join("\n");
	}
	const withTrailingNewline = env.length > 0 && !env.endsWith("\n") ? "\n" : "";
	return `${env}${withTrailingNewline}${line}\n`;
};

export const VaultImportDialog = ({
	projectId,
	environmentId,
	currentEnv,
	onImport,
}: Props) => {
	const [isOpen, setIsOpen] = useState(false);
	const [vaultProviderId, setVaultProviderId] = useState<string | undefined>();
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [keyOverrides, setKeyOverrides] = useState<Record<string, string>>({});

	const { data: allProviders } = api.vaultProvider.all.useQuery();
	const providers = useMemo(
		() =>
			(allProviders ?? []).filter((provider) =>
				provider.assignments?.some(
					(assignment) =>
						assignment.projectId === projectId &&
						(assignment.environmentIds.length === 0 ||
							!environmentId ||
							assignment.environmentIds.includes(environmentId)),
				),
			),
		[allProviders, projectId, environmentId],
	);

	const activeProviderId = vaultProviderId ?? providers[0]?.vaultProviderId;
	const activeProvider = providers.find(
		(p) => p.vaultProviderId === activeProviderId,
	);

	const { data: secretNames, isLoading } =
		api.vaultProvider.listSecretNames.useQuery(
			{
				vaultProviderId: activeProviderId!,
				projectId: projectId!,
				environmentId,
			},
			{ enabled: isOpen && !!activeProviderId && !!projectId },
		);

	const existingKeys = useMemo(() => parseEnvKeys(currentEnv), [currentEnv]);

	const rows = useMemo(
		() =>
			(secretNames ?? []).map((secretName) => {
				const defaultKey = normalizeSecretName(secretName);
				const key = keyOverrides[secretName] ?? defaultKey;
				return {
					secretName,
					key,
					conflict: existingKeys.has(key),
				};
			}),
		[secretNames, keyOverrides, existingKeys],
	);

	const resetState = () => {
		setSelected(new Set());
		setKeyOverrides({});
	};

	const handleOpenChange = (open: boolean) => {
		setIsOpen(open);
		if (!open) {
			setVaultProviderId(undefined);
			resetState();
		}
	};

	const toggleRow = (secretName: string, checked: boolean) => {
		setSelected((prev) => {
			const next = new Set(prev);
			if (checked) next.add(secretName);
			else next.delete(secretName);
			return next;
		});
	};

	const toggleAll = () => {
		const selectableNonConflicting = rows.filter((r) => !r.conflict);
		const allSelected =
			selectableNonConflicting.length > 0 &&
			selectableNonConflicting.every((r) => selected.has(r.secretName));
		setSelected(
			allSelected
				? new Set()
				: new Set(selectableNonConflicting.map((r) => r.secretName)),
		);
	};

	const handleImport = () => {
		if (!activeProvider) return;
		let next = currentEnv;
		for (const row of rows) {
			if (!selected.has(row.secretName)) continue;
			const ref = `\${{vault.${activeProvider.name}.${row.secretName}}}`;
			next = setEnvValue(next, row.key, ref);
		}
		onImport(next);
		setIsOpen(false);
		setVaultProviderId(undefined);
		resetState();
	};

	if (!projectId || providers.length === 0) {
		return null;
	}

	return (
		<Dialog open={isOpen} onOpenChange={handleOpenChange}>
			<DialogTrigger asChild>
				<Button type="button" variant="outline" size="sm">
					<DownloadIcon className="mr-2 size-4" />
					Import from Vault
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Import secrets from vault</DialogTitle>
					<DialogDescription>
						Select the secrets to import as{" "}
						<code>{"${{vault.<provider>.<secret>}}"}</code> references. Secrets
						already defined below are skipped unless you check them explicitly.
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-2">
						<Label>Vault provider</Label>
						<Select
							value={activeProviderId}
							onValueChange={(value) => {
								setVaultProviderId(value);
								resetState();
							}}
						>
							<SelectTrigger>
								<SelectValue placeholder="Select a provider" />
							</SelectTrigger>
							<SelectContent>
								{providers.map((provider) => (
									<SelectItem
										key={provider.vaultProviderId}
										value={provider.vaultProviderId}
									>
										{provider.name} ({provider.providerType})
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{isLoading ? (
						<div className="flex items-center justify-center gap-2 py-8 text-muted-foreground text-sm">
							<Loader2 className="size-4 animate-spin" />
							Loading secrets...
						</div>
					) : rows.length === 0 ? (
						<div className="py-8 text-center text-muted-foreground text-sm">
							No secrets found for this provider.
						</div>
					) : (
						<>
							<div className="flex items-center justify-between">
								<Label className="flex items-center gap-2">
									<Checkbox
										checked={
											rows.some((r) => !r.conflict) &&
											rows
												.filter((r) => !r.conflict)
												.every((r) => selected.has(r.secretName))
										}
										onCheckedChange={toggleAll}
									/>
									Select all
								</Label>
								<span className="text-muted-foreground text-sm">
									{selected.size} selected
								</span>
							</div>
							<ScrollArea className="h-80 rounded-md border">
								<div className="flex flex-col divide-y">
									{rows.map((row) => (
										<div
											key={row.secretName}
											className="flex items-center gap-3 p-3"
										>
											<Checkbox
												checked={selected.has(row.secretName)}
												onCheckedChange={(checked) =>
													toggleRow(row.secretName, checked === true)
												}
											/>
											<div className="flex min-w-0 flex-1 flex-col gap-1">
												<span className="truncate font-mono text-muted-foreground text-xs">
													{row.secretName}
												</span>
												<Input
													value={row.key}
													onChange={(e) =>
														setKeyOverrides((prev) => ({
															...prev,
															[row.secretName]: e.target.value
																.toUpperCase()
																.replace(/[^A-Z0-9_]/g, "_"),
														}))
													}
													className="h-8 font-mono text-sm"
												/>
											</div>
											{row.conflict && (
												<Badge variant="secondary">already exists</Badge>
											)}
										</div>
									))}
								</div>
							</ScrollArea>
						</>
					)}
				</div>

				<DialogFooter>
					<Button
						type="button"
						onClick={handleImport}
						disabled={selected.size === 0}
					>
						Import {selected.size > 0 ? selected.size : ""} secret
						{selected.size === 1 ? "" : "s"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
