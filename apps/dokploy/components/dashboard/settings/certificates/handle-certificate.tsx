import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { HelpCircle, PlusIcon, SquarePen } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
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
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
	Tooltip,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/utils/api";

const certificateDataHolder =
	"-----BEGIN CERTIFICATE-----\nMIIFRDCCAyygAwIBAgIUEPOR47ys6VDwMVB9tYoeEka83uQwDQYJKoZIhvcNAQELBQAwGTEXMBUGA1UEAwwObWktZG9taW5pby5jb20wHhcNMjQwMzExMDQyNzU3WhcN\n------END CERTIFICATE-----";

const privateKeyDataHolder =
	"-----BEGIN PRIVATE KEY-----\nMIIFRDCCAyygAwIBAgIUEPOR47ys6VDwMVB9tYoeEka83uQwDQYJKoZIhvcNAQELBQAwGTEXMBUGA1UEAwwObWktZG9taW5pby5jb20wHhcNMjQwMzExMDQyNzU3WhcN\n-----END PRIVATE KEY-----";

const handleCertificateSchema = z.object({
	name: z.string().min(1, "settings.certificates.nameRequired"),
	certificateData: z
		.string()
		.min(1, "settings.certificates.certificateDataRequired"),
	privateKey: z.string().min(1, "settings.certificates.privateKeyRequired"),
	serverId: z.string().optional(),
});

type HandleCertificateForm = z.infer<typeof handleCertificateSchema>;

interface Props {
	certificateId?: string;
}

export const HandleCertificate = ({ certificateId }: Props) => {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);
	const utils = api.useUtils();

	const { data: isCloud } = api.settings.isCloud.useQuery();
	const { data: servers } = api.server.withSSHKey.useQuery();
	const hasServers = servers && servers.length > 0;
	const shouldShowServerDropdown = hasServers && !certificateId; // Hide on edit

	const { data: existingCert, refetch } = api.certificates.one.useQuery(
		{ certificateId: certificateId || "" },
		{ enabled: !!certificateId },
	);

	const createMutation = api.certificates.create.useMutation();
	const updateMutation = api.certificates.update.useMutation();
	const mutation = certificateId ? updateMutation : createMutation;
	const { mutateAsync, isError, error, isPending } = mutation;

	const form = useForm<HandleCertificateForm>({
		defaultValues: {
			name: "",
			certificateData: "",
			privateKey: "",
		},
		resolver: zodResolver(handleCertificateSchema),
	});

	useEffect(() => {
		if (existingCert) {
			form.reset({
				name: existingCert.name,
				certificateData: existingCert.certificateData,
				privateKey: existingCert.privateKey,
			});
		} else {
			form.reset({
				name: "",
				certificateData: "",
				privateKey: "",
			});
		}
	}, [existingCert, form, open]);

	const onSubmit = async (data: HandleCertificateForm) => {
		const basePayload = {
			name: data.name,
			certificateData: data.certificateData,
			privateKey: data.privateKey,
		};

		const promise = certificateId
			? updateMutation.mutateAsync({
					certificateId,
					...basePayload,
				})
			: createMutation.mutateAsync({
					...basePayload,
					serverId: data.serverId === "dokploy" ? undefined : data.serverId,
					organizationId: "",
				});

		await promise
			.then(async () => {
				toast.success(
					certificateId
						? t("settings.certificates.updated")
						: t("settings.certificates.created"),
				);
				await utils.certificates.all.invalidate();
				if (certificateId) {
					refetch();
				}
				setOpen(false);
			})
			.catch(() => {
				toast.error(
					certificateId
						? t("settings.certificates.updateError")
						: t("settings.certificates.createError"),
				);
			});
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				{certificateId ? (
					<Button
						variant="ghost"
						size="icon"
						className="group hover:bg-blue-500/10"
					>
						<SquarePen className="size-3.5 text-primary group-hover:text-blue-500" />
					</Button>
				) : (
					<Button>
						<PlusIcon className="h-4 w-4" />
						{t("settings.certificates.addCertificate")}
					</Button>
				)}
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>
						{certificateId
							? t("settings.certificates.updateTitle")
							: t("settings.certificates.addTitle")}
					</DialogTitle>
					<DialogDescription>
						{certificateId
							? t("settings.certificates.updateDescription")
							: t("settings.certificates.addDescription")}
					</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}

				<Form {...form}>
					<form
						id="hook-form-handle-certificate"
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-4"
					>
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem>
									<FormLabel>
										{t("settings.certificates.certificateName")}
									</FormLabel>
									<FormControl>
										<Input
											placeholder={t(
												"settings.certificates.certificateNamePlaceholder",
											)}
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="certificateData"
							render={({ field }) => (
								<FormItem>
									<FormLabel>
										{t("settings.certificates.certificateData")}
									</FormLabel>
									<FormControl>
										<Textarea
											className="h-32 max-h-32 resize-none overflow-y-auto field-sizing-fixed"
											placeholder={certificateDataHolder}
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="privateKey"
							render={({ field }) => (
								<FormItem>
									<FormLabel>{t("settings.certificates.privateKey")}</FormLabel>
									<FormControl>
										<Textarea
											className="h-32 max-h-32 resize-none overflow-y-auto field-sizing-fixed"
											placeholder={privateKeyDataHolder}
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						{shouldShowServerDropdown && (
							<FormField
								control={form.control}
								name="serverId"
								render={({ field }) => (
									<FormItem>
										<TooltipProvider delayDuration={0}>
											<Tooltip>
												<TooltipTrigger asChild>
													<FormLabel className="break-all w-fit flex flex-row gap-1 items-center">
														{t("settings.certificates.selectServer")}{" "}
														{!isCloud &&
															`(${t("settings.certificates.optional")})`}
														<HelpCircle className="size-4 text-muted-foreground" />
													</FormLabel>
												</TooltipTrigger>
											</Tooltip>
										</TooltipProvider>

										<Select
											onValueChange={field.onChange}
											defaultValue={
												field.value || (!isCloud ? "dokploy" : undefined)
											}
										>
											<SelectTrigger>
												<SelectValue
													placeholder={
														!isCloud
															? "Dokploy"
															: t("settings.certificates.selectServer")
													}
												/>
											</SelectTrigger>
											<SelectContent>
												<SelectGroup>
													{!isCloud && (
														<SelectItem value="dokploy">
															<span className="flex items-center gap-2 justify-between w-full">
																<span>Dokploy</span>
																<span className="text-muted-foreground text-xs self-center">
																	{t("settings.certificates.default")}
																</span>
															</span>
														</SelectItem>
													)}
													{servers?.map((server) => (
														<SelectItem
															key={server.serverId}
															value={server.serverId}
														>
															<span className="flex items-center gap-2 justify-between w-full">
																<span>{server.name}</span>
																<span className="text-muted-foreground text-xs self-center">
																	{server.ipAddress}
																</span>
															</span>
														</SelectItem>
													))}
													<SelectLabel>
														{t("settings.certificates.serversCount", {
															count:
																(servers?.length ?? 0) + (!isCloud ? 1 : 0),
														})}
													</SelectLabel>
												</SelectGroup>
											</SelectContent>
										</Select>
										<FormMessage />
									</FormItem>
								)}
							/>
						)}
					</form>

					<DialogFooter className="flex w-full flex-row justify-end!">
						<Button
							isLoading={isPending}
							form="hook-form-handle-certificate"
							type="submit"
						>
							{certificateId
								? t("settings.certificates.update")
								: t("settings.certificates.create")}
						</Button>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
