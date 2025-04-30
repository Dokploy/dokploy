import { DialogAction } from "@/components/shared/dialog-action";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/utils/api";
import {
	ExternalLink,
	GlobeIcon,
	PenBoxIcon,
	Trash2,
	InfoIcon,
	Server,
	CheckCircle2,
	XCircle,
	Loader2,
	RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { AddDomainCompose } from "./add-domain";
import { Badge } from "@/components/ui/badge";
import { DnsHelperModal } from "./dns-helper-modal";
import { useState } from "react";

interface Props {
	composeId: string;
}

export type ValidationState = {
	isLoading: boolean;
	isValid?: boolean;
	error?: string;
	resolvedIp?: string;
	message?: string;
};

export type ValidationStates = {
	[key: string]: ValidationState;
};

export const ShowDomainsCompose = ({ composeId }: Props) => {
	const [validationStates, setValidationStates] = useState<ValidationStates>(
		{},
	);

	const { data: ip } = api.settings.getIp.useQuery();

	const { data, refetch } = api.domain.byComposeId.useQuery(
		{
			composeId,
		},
		{
			enabled: !!composeId,
		},
	);

	const { data: compose } = api.compose.one.useQuery(
		{
			composeId,
		},
		{
			enabled: !!composeId,
		},
	);

	const { mutateAsync: validateDomain } =
		api.domain.validateDomain.useMutation();
	const { mutateAsync: deleteDomain, isLoading: isRemoving } =
		api.domain.delete.useMutation();

	const handleValidateDomain = async (host: string) => {
		setValidationStates((prev) => ({
			...prev,
			[host]: { isLoading: true },
		}));

		try {
			const result = await validateDomain({
				domain: host,
				serverIp:
					compose?.server?.ipAddress?.toString() || ip?.toString() || "",
			});

			setValidationStates((prev) => ({
				...prev,
				[host]: {
					isLoading: false,
					isValid: result.isValid,
					error: result.error,
					resolvedIp: result.resolvedIp,
					message: result.error && result.isValid ? result.error : undefined,
				},
			}));
		} catch (err) {
			const error = err as Error;
			setValidationStates((prev) => ({
				...prev,
				[host]: {
					isLoading: false,
					isValid: false,
					error: error.message || "Failed to validate domain",
				},
			}));
		}
	};

	return (
		<div className="flex w-full flex-col gap-5">
			<Card className="bg-background">
				<CardHeader className="flex flex-row items-center flex-wrap gap-4 justify-between">
					<div className="flex flex-col gap-1">
						<CardTitle className="text-xl">Domains</CardTitle>
						<CardDescription>
							Domains are used to access to the application
						</CardDescription>
					</div>

					<div className="flex flex-row gap-4 flex-wrap">
						{data && data?.length > 0 && (
							<AddDomainCompose composeId={composeId}>
								<Button>
									<GlobeIcon className="size-4 mr-2" /> Add Domain
								</Button>
							</AddDomainCompose>
						)}
					</div>
				</CardHeader>
				<CardContent>
					{data?.length === 0 ? (
						<div className="flex w-full flex-col items-center justify-center gap-3 py-8">
							<GlobeIcon className="size-8 text-muted-foreground" />
							<span className="text-base text-muted-foreground text-center">
								To access to the application it is required to set at least 1
								domain
							</span>
							<div className="flex flex-row gap-4 flex-wrap">
								<AddDomainCompose composeId={composeId}>
									<Button>
										<GlobeIcon className="size-4 mr-2" /> Add Domain
									</Button>
								</AddDomainCompose>
							</div>
						</div>
					) : (
						<div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
							{data?.map((item) => {
								const validationState = validationStates[item.host];
								return (
									<Card
										key={item.domainId}
										className="relative overflow-hidden border bg-card transition-all hover:shadow-md bg-transparent"
									>
										<CardContent className="p-6">
											<div className="flex flex-col gap-4">
												{/* Service & Domain Info */}
												<div className="flex items-start justify-between">
													<div className="flex flex-col gap-2">
														<Badge variant="outline" className="w-fit">
															<Server className="size-3 mr-1" />
															{item.serviceName}
														</Badge>
														<Link
															className="flex items-center gap-2 text-base font-medium hover:underline"
															target="_blank"
															href={`${item.https ? "https" : "http"}://${item.host}${item.path}`}
														>
															{item.host}
															<ExternalLink className="size-4" />
														</Link>
													</div>
													<div className="flex gap-2">
														{!item.host.includes("traefik.me") && (
															<DnsHelperModal
																domain={{
																	host: item.host,
																	https: item.https,
																	path: item.path || undefined,
																}}
																serverIp={
																	compose?.server?.ipAddress?.toString() ||
																	ip?.toString()
																}
															/>
														)}
														<AddDomainCompose
															composeId={composeId}
															domainId={item.domainId}
														>
															<Button
																variant="ghost"
																size="icon"
																className="group hover:bg-blue-500/10"
															>
																<PenBoxIcon className="size-3.5 text-primary group-hover:text-blue-500" />
															</Button>
														</AddDomainCompose>
														<DialogAction
															title="Delete Domain"
															description="Are you sure you want to delete this domain?"
															type="destructive"
															onClick={async () => {
																await deleteDomain({
																	domainId: item.domainId,
																})
																	.then((_data) => {
																		refetch();
																		toast.success(
																			"Domain deleted successfully",
																		);
																	})
																	.catch(() => {
																		toast.error("Error deleting domain");
																	});
															}}
														>
															<Button
																variant="ghost"
																size="icon"
																className="group hover:bg-red-500/10"
																isLoading={isRemoving}
															>
																<Trash2 className="size-4 text-primary group-hover:text-red-500" />
															</Button>
														</DialogAction>
													</div>
												</div>

												{/* Domain Details */}
												<div className="flex flex-wrap gap-3">
													<TooltipProvider>
														<Tooltip>
															<TooltipTrigger asChild>
																<Badge variant="secondary">
																	<InfoIcon className="size-3 mr-1" />
																	Path: {item.path || "/"}
																</Badge>
															</TooltipTrigger>
															<TooltipContent>
																<p>URL path for this service</p>
															</TooltipContent>
														</Tooltip>
													</TooltipProvider>

													<TooltipProvider>
														<Tooltip>
															<TooltipTrigger asChild>
																<Badge variant="secondary">
																	<InfoIcon className="size-3 mr-1" />
																	Port: {item.port}
																</Badge>
															</TooltipTrigger>
															<TooltipContent>
																<p>Container port exposed</p>
															</TooltipContent>
														</Tooltip>
													</TooltipProvider>

													<TooltipProvider>
														<Tooltip>
															<TooltipTrigger asChild>
																<Badge
																	variant={item.https ? "outline" : "secondary"}
																>
																	{item.https ? "HTTPS" : "HTTP"}
																</Badge>
															</TooltipTrigger>
															<TooltipContent>
																<p>
																	{item.https
																		? "Secure HTTPS connection"
																		: "Standard HTTP connection"}
																</p>
															</TooltipContent>
														</Tooltip>
													</TooltipProvider>

													{item.certificateType && (
														<TooltipProvider>
															<Tooltip>
																<TooltipTrigger asChild>
																	<Badge variant="outline">
																		Cert: {item.certificateType}
																	</Badge>
																</TooltipTrigger>
																<TooltipContent>
																	<p>SSL Certificate Provider</p>
																</TooltipContent>
															</Tooltip>
														</TooltipProvider>
													)}

													<TooltipProvider>
														<Tooltip>
															<TooltipTrigger asChild>
																<Badge
																	variant="outline"
																	className={
																		validationState?.isValid
																			? "bg-green-500/10 text-green-500 cursor-pointer"
																			: validationState?.error
																				? "bg-red-500/10 text-red-500 cursor-pointer"
																				: "bg-yellow-500/10 text-yellow-500 cursor-pointer"
																	}
																	onClick={() =>
																		handleValidateDomain(item.host)
																	}
																>
																	{validationState?.isLoading ? (
																		<>
																			<Loader2 className="size-3 mr-1 animate-spin" />
																			Checking DNS...
																		</>
																	) : validationState?.isValid ? (
																		<>
																			<CheckCircle2 className="size-3 mr-1" />
																			{validationState.message
																				? "Behind Cloudflare"
																				: "DNS Valid"}
																		</>
																	) : validationState?.error ? (
																		<>
																			<XCircle className="size-3 mr-1" />
																			DNS Invalid
																		</>
																	) : (
																		<>
																			<RefreshCw className="size-3 mr-1" />
																			Validate DNS
																		</>
																	)}
																</Badge>
															</TooltipTrigger>
															<TooltipContent className="max-w-xs">
																{validationState?.error &&
																!validationState.isValid ? (
																	<div className="flex flex-col gap-1">
																		<p className="font-medium text-red-500">
																			Error:
																		</p>
																		<p>{validationState.error}</p>
																	</div>
																) : validationState?.isValid ? (
																	<div className="flex flex-col gap-1">
																		<p className="font-medium text-green-500">
																			{validationState.message
																				? "Info:"
																				: "Valid Configuration:"}
																		</p>
																		<p>
																			{validationState.message ||
																				`Domain points to ${validationState.resolvedIp}`}
																		</p>
																	</div>
																) : (
																	"Click to validate DNS configuration"
																)}
															</TooltipContent>
														</Tooltip>
													</TooltipProvider>
												</div>
											</div>
										</CardContent>
									</Card>
								);
							})}
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
};
