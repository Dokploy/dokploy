import { zodResolver } from "@hookform/resolvers/zod";
import { HelpCircle, PlusIcon, SquarePen } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
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
	name: z.string().min(1, "Name is required"),
	certificateData: z.string().min(1, "Certificate data is required"),
	privateKey: z.string().min(1, "Private key is required"),
	autoRenew: z.boolean().optional(),
	serverId: z.string().optional(),
});

type HandleCertificateForm = z.infer<typeof handleCertificateSchema>;

interface Props {
	certificateId?: string;
}

export const HandleCertificate = ({ certificateId }: Props) => {
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

	const { mutateAsync, isError, error, isLoading } = certificateId
		? api.certificates.update.useMutation()
		: api.certificates.create.useMutation();

	const form = useForm<HandleCertificateForm>({
		defaultValues: {
			name: "",
			certificateData: "",
			privateKey: "",
			autoRenew: false,
		},
		resolver: zodResolver(handleCertificateSchema),
	});

	useEffect(() => {
		if (existingCert) {
			form.reset({
				name: existingCert.name,
				certificateData: existingCert.certificateData,
				privateKey: existingCert.privateKey,
				autoRenew: existingCert.autoRenew ?? false,
			});
		} else {
			form.reset({
				name: "",
				certificateData: "",
				privateKey: "",
				autoRenew: false,
			});
		}
	}, [existingCert, form, open]);

	const onSubmit = async (data: HandleCertificateForm) => {
		await mutateAsync({
			...(certificateId ? { certificateId } : {}),
			name: data.name,
			certificateData: data.certificateData,
			privateKey: data.privateKey,
			autoRenew: data.autoRenew,
			serverId: data.serverId === "dokploy" ? undefined : data.serverId,
			organizationId: "",
		} as any)
			.then(async () => {
				toast.success(
					certificateId ? "Certificate Updated" : "Certificate Created",
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
						? "Error updating the Certificate"
						: "Error creating the Certificate",
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
						Add Certificate
					</Button>
				)}
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>
						{certificateId ? "Update" : "Add New"} Certificate
					</DialogTitle>
					<DialogDescription>
						{certificateId
							? "Modify the certificate details"
							: "Upload or generate a certificate to secure your application"}
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
									<FormLabel>Certificate Name</FormLabel>
									<FormControl>
										<Input placeholder="My Certificate" {...field} />
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
									<FormLabel>Certificate Data</FormLabel>
									<FormControl>
										<Textarea
											className="h-32"
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
									<FormLabel>Private Key</FormLabel>
									<FormControl>
										<Textarea
											className="h-32"
											placeholder={privateKeyDataHolder}
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="autoRenew"
							render={({ field }) => (
								<FormItem className="flex items-center gap-2">
									<FormControl>
										<input
											type="checkbox"
											checked={field.value}
											onChange={field.onChange}
										/>
									</FormControl>
									<FormLabel className="!mt-0">Auto-renew</FormLabel>
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
														Select a Server {!isCloud && "(Optional)"}
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
													placeholder={!isCloud ? "Dokploy" : "Select a Server"}
												/>
											</SelectTrigger>
											<SelectContent>
												<SelectGroup>
													{!isCloud && (
														<SelectItem value="dokploy">
															<span className="flex items-center gap-2 justify-between w-full">
																<span>Dokploy</span>
																<span className="text-muted-foreground text-xs self-center">
																	Default
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
														Servers ({servers?.length + (!isCloud ? 1 : 0)})
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

					<DialogFooter className="flex w-full flex-row !justify-end">
						<Button
							isLoading={isLoading}
							form="hook-form-handle-certificate"
							type="submit"
						>
							{certificateId ? "Update" : "Create"}
						</Button>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
