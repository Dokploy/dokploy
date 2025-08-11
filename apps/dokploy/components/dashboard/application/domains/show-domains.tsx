import { DialogAction } from "@/components/shared/dialog-action";
import { Badge } from "@/components/ui/badge";
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
	CheckCircle2,
	ExternalLink,
	GlobeIcon,
	InfoIcon,
	Loader2,
	PenBoxIcon,
	RefreshCw,
	Server,
	Trash2,
	XCircle,
} from "lucide-react";
import { useTranslation } from "next-i18next";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { DnsHelperModal } from "./dns-helper-modal";
import { AddDomain } from "./handle-domain";

export type ValidationState = {
	isLoading: boolean;
	isValid?: boolean;
	error?: string;
	resolvedIp?: string;
	message?: string;
	cdnProvider?: string;
};

export type ValidationStates = Record<string, ValidationState>;

interface Props {
	id: string;
	type: "application" | "compose";
}

export const ShowDomains = ({ id, type }: Props) => {
	const { t } = useTranslation("dashboard");
	const { data: application } =
		type === "application"
			? api.application.one.useQuery(
					{
						applicationId: id,
					},
					{
						enabled: !!id,
					},
				)
			: api.compose.one.useQuery(
					{
						composeId: id,
					},
					{
						enabled: !!id,
					},
				);
	const [validationStates, setValidationStates] = useState<ValidationStates>(
		{},
	);
	const { data: ip } = api.settings.getIp.useQuery();

	const {
		data,
		refetch,
		isLoading: isLoadingDomains,
	} = type === "application"
		? api.domain.byApplicationId.useQuery(
				{
					applicationId: id,
				},
				{
					enabled: !!id,
				},
			)
		: api.domain.byComposeId.useQuery(
				{
					composeId: id,
				},
				{
					enabled: !!id,
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
					application?.server?.ipAddress?.toString() || ip?.toString() || "",
			});

			setValidationStates((prev) => ({
				...prev,
				[host]: {
					isLoading: false,
					isValid: result.isValid,
					error: result.error,
					resolvedIp: result.resolvedIp,
					cdnProvider: result.cdnProvider,
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
					error: error.message || t("dashboard.domain.failedToValidate"),
				},
			}));
		}
	};

	return (
		<div className="flex w-full flex-col gap-5 ">
			<Card className="bg-background">
				<CardHeader className="flex flex-row items-center flex-wrap gap-4 justify-between">
					<div className="flex flex-col gap-1">
						<CardTitle className="text-xl">
							{t("dashboard.domain.domains")}
						</CardTitle>
						<CardDescription>
							{t("dashboard.domain.domainsDescription")}
						</CardDescription>
					</div>

					<div className="flex flex-row gap-4 flex-wrap">
						{data && data?.length > 0 && (
							<AddDomain id={id} type={type}>
								<Button>
									<GlobeIcon className="size-4" />{" "}
									{t("dashboard.domain.addDomain")}
								</Button>
							</AddDomain>
						)}
					</div>
				</CardHeader>
				<CardContent className="flex w-full flex-row gap-4">
					{isLoadingDomains ? (
						<div className="flex w-full flex-row gap-4 min-h-[40vh] justify-center items-center">
							<Loader2 className="size-5 animate-spin text-muted-foreground" />
							<span className="text-base text-muted-foreground">
								{t("dashboard.domain.loadingDomains")}
							</span>
						</div>
					) : data?.length === 0 ? (
						<div className="flex w-full flex-col items-center justify-center gap-3 min-h-[40vh]">
							<GlobeIcon className="size-8 text-muted-foreground" />
							<span className="text-base text-muted-foreground">
								{t("dashboard.domain.requireAtLeastOneDomain")}
							</span>
							<div className="flex flex-row gap-4 flex-wrap">
								<AddDomain id={id} type={type}>
									<Button>
										<GlobeIcon className="size-4" />{" "}
										{t("dashboard.domain.addDomain")}
									</Button>
								</AddDomain>
							</div>
						</div>
					) : (
						<div className="grid grid-cols-1 gap-4 xl:grid-cols-2 w-full min-h-[40vh] ">
							{data?.map((item) => {
								const validationState = validationStates[item.host];
								return (
									<Card
										key={item.domainId}
										className="relative overflow-hidden w-full border transition-all hover:shadow-md bg-transparent h-fit"
									>
										<CardContent className="p-6">
											<div className="flex flex-col gap-4">
												{/* Service & Domain Info */}
												<div className="flex items-center justify-between flex-wrap gap-y-2">
													{item.serviceName && (
														<Badge variant="outline" className="w-fit">
															<Server className="size-3 mr-1" />
															{item.serviceName}
														</Badge>
													)}
													<div className="flex gap-2 flex-wrap">
														{!item.host.includes("traefik.me") && (
															<DnsHelperModal
																domain={{
																	host: item.host,
																	https: item.https,
																	path: item.path || undefined,
																}}
																serverIp={
																	application?.server?.ipAddress?.toString() ||
																	ip?.toString()
																}
															/>
														)}
														<AddDomain
															id={id}
															type={type}
															domainId={item.domainId}
														>
															<Button
																variant="ghost"
																size="icon"
																className="group hover:bg-blue-500/10"
															>
																<PenBoxIcon className="size-3.5 text-primary group-hover:text-blue-500" />
															</Button>
														</AddDomain>
														<DialogAction
															title={t("dashboard.domain.deleteDomainTitle")}
															description={t(
																"dashboard.domain.deleteDomainDescription",
															)}
															type="destructive"
															onClick={async () => {
																await deleteDomain({
																	domainId: item.domainId,
																})
																	.then((_data) => {
																		refetch();
																		toast.success(
																			t(
																				"dashboard.domain.domainDeletedSuccessfully",
																			),
																		);
																	})
																	.catch(() => {
																		toast.error(
																			t("dashboard.domain.errorDeletingDomain"),
																		);
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
												<div className="w-full break-all">
													<Link
														className="flex items-center gap-2 text-base font-medium hover:underline"
														target="_blank"
														href={`${item.https ? "https" : "http"}://${
															item.host
														}${item.path}`}
													>
														{item.host}
														<ExternalLink className="size-4 min-w-4" />
													</Link>
												</div>

												{/* Domain Details */}
												<div className="flex flex-wrap gap-3">
													<TooltipProvider>
														<Tooltip>
															<TooltipTrigger asChild>
																<Badge variant="secondary">
																	<InfoIcon className="size-3 mr-1" />
																	{t("dashboard.domain.path")}:{" "}
																	{item.path || "/"}
																</Badge>
															</TooltipTrigger>
															<TooltipContent>
																<p>
																	{t("dashboard.domain.urlPathDescription")}
																</p>
															</TooltipContent>
														</Tooltip>
													</TooltipProvider>

													<TooltipProvider>
														<Tooltip>
															<TooltipTrigger asChild>
																<Badge variant="secondary">
																	<InfoIcon className="size-3 mr-1" />
																	{t("dashboard.domain.port")}: {item.port}
																</Badge>
															</TooltipTrigger>
															<TooltipContent>
																<p>
																	{t(
																		"dashboard.domain.containerPortDescription",
																	)}
																</p>
															</TooltipContent>
														</Tooltip>
													</TooltipProvider>

													<TooltipProvider>
														<Tooltip>
															<TooltipTrigger asChild>
																<Badge
																	variant={item.https ? "outline" : "secondary"}
																>
																	{item.https
																		? t("dashboard.domain.https")
																		: t("dashboard.domain.http")}
																</Badge>
															</TooltipTrigger>
															<TooltipContent>
																<p>
																	{item.https
																		? t(
																				"dashboard.domain.secureHttpsConnection",
																			)
																		: t(
																				"dashboard.domain.standardHttpConnection",
																			)}
																</p>
															</TooltipContent>
														</Tooltip>
													</TooltipProvider>

													{item.certificateType && (
														<TooltipProvider>
															<Tooltip>
																<TooltipTrigger asChild>
																	<Badge variant="outline">
																		{t("dashboard.domain.cert")}:{" "}
																		{item.certificateType}
																	</Badge>
																</TooltipTrigger>
																<TooltipContent>
																	<p>
																		{t(
																			"dashboard.domain.sslCertificateProvider",
																		)}
																	</p>
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
																			{t("dashboard.domain.checkingDns")}
																		</>
																	) : validationState?.isValid ? (
																		<>
																			<CheckCircle2 className="size-3 mr-1" />
																			{validationState.message &&
																			validationState.cdnProvider
																				? `${t("dashboard.domain.behind")} ${
																						validationState.cdnProvider
																					}`
																				: t("dashboard.domain.dnsValid")}
																		</>
																	) : validationState?.error ? (
																		<>
																			<XCircle className="size-3 mr-1" />
																			{validationState.error}
																		</>
																	) : (
																		<>
																			<RefreshCw className="size-3 mr-1" />
																			{t("dashboard.domain.validateDns")}
																		</>
																	)}
																</Badge>
															</TooltipTrigger>
															<TooltipContent className="max-w-xs">
																{validationState?.error ? (
																	<div className="flex flex-col gap-1">
																		<p className="font-medium text-red-500">
																			{t("dashboard.domain.error")}:
																		</p>
																		<p>{validationState.error}</p>
																	</div>
																) : (
																	t(
																		"dashboard.domain.clickToValidateDnsConfiguration",
																	)
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
