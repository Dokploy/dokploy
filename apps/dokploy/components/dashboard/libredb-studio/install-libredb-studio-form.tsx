import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { toast } from "sonner";
import {
	buildStudioDomainInput,
	findStudioForServer,
	getCustomHostError,
	getStudioInstallerNote,
	getStudioServiceHref,
	isGeneratedDomainAvailable,
	LOCAL_SERVER_VALUE,
	NO_SERVER_IP_MESSAGE,
	PLAIN_HTTP_WARNING,
	resolveSelectedServerId,
	STUDIO_ACCESS_WARNING,
	type StudioDomainKind,
} from "@/components/dashboard/libredb-studio/utils";
import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "@/utils/api";

// The dialog unmounts the form on close, so the install lives in the parent and a reopened form still shows a running install.
export const useLibreDBStudioInstall = () =>
	api.libredbStudio.install.useMutation();

export type LibreDBStudioInstall = ReturnType<typeof useLibreDBStudioInstall>;

interface Props {
	environmentId: string;
	defaultServerId?: string | null;
	active: boolean;
	install: LibreDBStudioInstall;
	onDone: () => void;
}

export const LibreDBStudioInstallForm = ({
	environmentId,
	defaultServerId,
	active,
	install,
	onDone,
}: Props) => {
	const id = useId();
	const utils = api.useUtils();
	const [serverValue, setServerValue] = useState<string | undefined>();
	const [domainKind, setDomainKind] = useState<StudioDomainKind>("generated");
	const [customHost, setCustomHost] = useState("");

	const { data: isCloud } = api.settings.isCloud.useQuery();
	const { data: auth } = api.user.get.useQuery();
	const installerNote = getStudioInstallerNote(auth?.role);
	const { data: webServerSettings } =
		api.settings.getWebServerSettings.useQuery();
	const { data: servers } = api.server.withSSHKey.useQuery(undefined, {
		enabled: active,
	});
	const showLocalOption =
		isCloud === false && !webServerSettings?.remoteServersOnly;
	const hasServers = !!servers && servers.length > 0;
	const selectedServerId = resolveSelectedServerId(
		serverValue ?? defaultServerId,
		showLocalOption,
	);

	const {
		data: studios,
		error: studiosError,
		isPending: isLoadingStudios,
	} = api.libredbStudio.byEnvironment.useQuery(
		{ environmentId },
		{ enabled: active },
	);
	const existingStudio =
		selectedServerId === undefined
			? undefined
			: findStudioForServer(studios, selectedServerId);

	const { data: serverIp } = api.domain.canGenerateTraefikMeDomains.useQuery(
		{ serverId: selectedServerId ?? "" },
		{ enabled: active && selectedServerId !== undefined },
	);
	const generatedAvailable =
		serverIp === undefined || isGeneratedDomainAvailable(serverIp);
	const effectiveDomainKind: StudioDomainKind = generatedAvailable
		? domainKind
		: "custom";
	const hostError =
		effectiveDomainKind === "custom" ? getCustomHostError(customHost) : null;

	const { mutateAsync, isPending, error, isError } = install;

	const handleInstall = () => {
		if (selectedServerId === undefined) {
			return;
		}
		const promise = mutateAsync({
			environmentId,
			serverId: selectedServerId ?? undefined,
			domain: buildStudioDomainInput(effectiveDomainKind, customHost),
		});
		toast.promise(promise, {
			loading: "Installing LibreDB Studio...",
			success: (result) => {
				utils.environment.one.invalidate({ environmentId });
				utils.libredbStudio.invalidate();
				setServerValue(undefined);
				setDomainKind("generated");
				setCustomHost("");
				onDone();
				return `LibreDB Studio installed at ${result.url}. Its first deploy is running.`;
			},
			error: (installError: Error) =>
				`LibreDB Studio could not be installed: ${installError.message}`,
		});
	};

	return (
		<>
			<div className="flex flex-col gap-4">
				{hasServers && (
					<div className="flex flex-col gap-2">
						<Label htmlFor={`${id}-server`}>Server</Label>
						<Select
							value={
								selectedServerId === undefined
									? ""
									: (selectedServerId ?? LOCAL_SERVER_VALUE)
							}
							onValueChange={setServerValue}
						>
							<SelectTrigger id={`${id}-server`}>
								<SelectValue placeholder="Select a Server" />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									{showLocalOption && (
										<SelectItem value={LOCAL_SERVER_VALUE}>
											<span className="flex items-center gap-2 justify-between w-full">
												<span>Dokploy</span>
												<span className="text-muted-foreground text-xs self-center">
													Default
												</span>
											</span>
										</SelectItem>
									)}
									{servers.map((server) => (
										<SelectItem key={server.serverId} value={server.serverId}>
											<span className="flex items-center gap-2 justify-between w-full">
												<span>{server.name}</span>
												<span className="text-muted-foreground text-xs self-center">
													{server.ipAddress}
												</span>
											</span>
										</SelectItem>
									))}
									<SelectLabel>
										Servers ({servers.length + (showLocalOption ? 1 : 0)})
									</SelectLabel>
								</SelectGroup>
							</SelectContent>
						</Select>
					</div>
				)}
				{isCloud === false && !showLocalOption && !hasServers && (
					<AlertBlock type="warning">
						This instance deploys only to remote servers. Add a remote server
						before installing LibreDB Studio.
					</AlertBlock>
				)}
				{studiosError ? (
					<AlertBlock type="error">{studiosError.message}</AlertBlock>
				) : isLoadingStudios ? (
					<div className="flex flex-row items-center gap-2 text-sm text-muted-foreground">
						<Loader2 className="size-4 animate-spin" />
						Checking for an existing Studio...
					</div>
				) : existingStudio ? (
					<AlertBlock type="info">
						LibreDB Studio is already installed for this environment on{" "}
						{existingStudio.serverName ?? "the Dokploy server"}. Open its
						service to manage it.
					</AlertBlock>
				) : (
					<div className="flex flex-col gap-3">
						<Label>Domain</Label>
						<RadioGroup
							value={effectiveDomainKind}
							onValueChange={(value) =>
								setDomainKind(value === "custom" ? "custom" : "generated")
							}
							className="gap-3"
						>
							<div className="flex flex-row items-start gap-3 rounded-lg border p-3">
								<RadioGroupItem
									value="generated"
									id={`${id}-generated`}
									disabled={!generatedAvailable}
								/>
								<div className="flex flex-col gap-1">
									<Label htmlFor={`${id}-generated`}>Generated domain</Label>
									<span className="text-sm text-muted-foreground">
										{generatedAvailable
											? "A free sslip.io address for this server, served over plain HTTP."
											: NO_SERVER_IP_MESSAGE}
									</span>
								</div>
							</div>
							<div className="flex flex-row items-start gap-3 rounded-lg border p-3">
								<RadioGroupItem value="custom" id={`${id}-custom`} />
								<div className="flex flex-col gap-1">
									<Label htmlFor={`${id}-custom`}>Custom domain</Label>
									<span className="text-sm text-muted-foreground">
										A domain that points at this server, served over HTTPS with
										a Let's Encrypt certificate.
									</span>
								</div>
							</div>
						</RadioGroup>
						{effectiveDomainKind === "generated" ? (
							<AlertBlock type="warning">{PLAIN_HTTP_WARNING}</AlertBlock>
						) : (
							<div className="flex flex-col gap-2">
								<Label htmlFor={`${id}-host`}>Host</Label>
								<Input
									id={`${id}-host`}
									placeholder="studio.example.com"
									autoComplete="off"
									value={customHost}
									onChange={(event) => setCustomHost(event.target.value)}
								/>
								{customHost !== "" && hostError && (
									<span className="text-sm text-red-600 dark:text-red-400">
										{hostError}
									</span>
								)}
							</div>
						)}
						<p className="text-sm text-muted-foreground">
							{STUDIO_ACCESS_WARNING}
						</p>
						{installerNote && (
							<p className="text-sm text-muted-foreground">{installerNote}</p>
						)}
					</div>
				)}
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}
			</div>
			<DialogFooter>
				{existingStudio ? (
					<Button asChild>
						<Link href={getStudioServiceHref(existingStudio)} onClick={onDone}>
							Open the Studio service
						</Link>
					</Button>
				) : (
					<Button
						isLoading={isPending}
						disabled={
							selectedServerId === undefined ||
							studios === undefined ||
							hostError !== null
						}
						onClick={handleInstall}
					>
						Install
					</Button>
				)}
			</DialogFooter>
		</>
	);
};
