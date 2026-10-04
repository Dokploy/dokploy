import { Loader2 } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useId, useState } from "react";
import { toast } from "sonner";
import {
	buildStudioDomainInput,
	findStudioForServer,
	getCustomHostError,
	getStudioServiceHref,
	isGeneratedDomainAvailable,
	LOCAL_SERVER_VALUE,
	NO_SERVER_IP_MESSAGE,
	PLAIN_HTTP_WARNING,
	resolveSelectedServerId,
	STUDIO_ACCESS_WARNING,
	type StudioDomainKind,
} from "@/components/dashboard/libredb-studio/utils";
import { LibreDBStudioIcon } from "@/components/icons/data-tools-icons";
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

interface Props {
	environmentId: string;
	defaultServerId?: string | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	children?: ReactNode;
}

export const InstallLibreDBStudioDialog = ({
	environmentId,
	defaultServerId,
	open,
	onOpenChange,
	children,
}: Props) => {
	const id = useId();
	const utils = api.useUtils();
	const [serverValue, setServerValue] = useState<string | undefined>();
	const [domainKind, setDomainKind] = useState<StudioDomainKind>("generated");
	const [customHost, setCustomHost] = useState("");

	const { data: isCloud } = api.settings.isCloud.useQuery();
	const { data: webServerSettings } =
		api.settings.getWebServerSettings.useQuery();
	const { data: servers } = api.server.withSSHKey.useQuery(undefined, {
		enabled: open,
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
		{ enabled: open },
	);
	const existingStudio =
		selectedServerId === undefined
			? undefined
			: findStudioForServer(studios, selectedServerId);

	const { data: serverIp } = api.domain.canGenerateTraefikMeDomains.useQuery(
		{ serverId: selectedServerId ?? "" },
		{ enabled: open && selectedServerId !== undefined },
	);
	const generatedAvailable =
		serverIp === undefined || isGeneratedDomainAvailable(serverIp);
	const effectiveDomainKind: StudioDomainKind = generatedAvailable
		? domainKind
		: "custom";
	const hostError =
		effectiveDomainKind === "custom" ? getCustomHostError(customHost) : null;

	const { mutateAsync, isPending, error, isError } =
		api.libredbStudio.install.useMutation();

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
				onOpenChange(false);
				return `LibreDB Studio installed at ${result.url}. Its first deploy is running.`;
			},
			error: (installError: Error) =>
				`LibreDB Studio could not be installed: ${installError.message}`,
		});
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			{children && <DialogTrigger asChild>{children}</DialogTrigger>}
			<DialogContent className="sm:max-w-xl">
				<DialogHeader>
					<DialogTitle className="flex flex-row items-center gap-2">
						<LibreDBStudioIcon className="size-5" />
						LibreDB Studio
					</DialogTitle>
					<DialogDescription>
						Install LibreDB Studio for this environment. It connects to the
						databases of this environment that run on the selected server, and
						Dokploy keeps those connections up to date.
					</DialogDescription>
				</DialogHeader>
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
											A domain that points at this server, served over HTTPS
											with a Let's Encrypt certificate.
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
						</div>
					)}
					{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}
				</div>
				<DialogFooter>
					{existingStudio ? (
						<Button asChild>
							<Link
								href={getStudioServiceHref(existingStudio)}
								onClick={() => onOpenChange(false)}
							>
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
			</DialogContent>
		</Dialog>
	);
};
