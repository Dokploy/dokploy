import { zodResolver } from "@hookform/resolvers/zod";
import { HelpCircle, PlusIcon } from "lucide-react";
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

const addCertificate = z.object({
	name: z.string().min(1, "Name is required"),
	certificateData: z.string().min(1, "Certificate data is required"),
	privateKey: z.string().min(1, "Private key is required"),
	autoRenew: z.boolean().optional(),
	serverId: z.string().optional(),
});

type AddCertificate = z.infer<typeof addCertificate>;

export const AddCertificate = () => {
	const [open, setOpen] = useState(false);
	const utils = api.useUtils();

	const { data: isCloud } = api.settings.isCloud.useQuery();
	const { mutateAsync, isError, error, isLoading } =
		api.certificates.create.useMutation();
	const { data: servers } = api.server.withSSHKey.useQuery();

	const form = useForm<AddCertificate>({
		defaultValues: {
			name: "",
			certificateData: "",
			privateKey: "",
			autoRenew: false,
		},
		resolver: zodResolver(addCertificate),
	});
	useEffect(() => {
		form.reset();
	}, [form, form.formState.isSubmitSuccessful, form.reset]);

	const onSubmit = async (data: AddCertificate) => {
		await mutateAsync({
			name: data.name,
			certificateData: data.certificateData,
			privateKey: data.privateKey,
			autoRenew: data.autoRenew,
			serverId: data.serverId,
			organizationId: "",
		})
			.then(async () => {
				toast.success("Certificate Created");
				await utils.certificates.all.invalidate();
				setOpen(false);
			})
			.catch(() => {
				toast.error("Error creating the Certificate");
			});
	};
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger className="" asChild>
				<Button>
					{" "}
					<PlusIcon className="h-4 w-4" />
					Add Certificate
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Add New Certificate</DialogTitle>
					<DialogDescription>
						Upload or generate a certificate to secure your application
					</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}

				<Form {...form}>
					<form
						id="hook-form-add-certificate"
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-4 "
					>
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => {
								return (
									<FormItem>
										<FormLabel>Certificate Name</FormLabel>
										<FormControl>
											<Input placeholder={"My Certificate"} {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								);
							}}
						/>
						<FormField
							control={form.control}
							name="certificateData"
							render={({ field }) => (
								<FormItem>
									<div className="space-y-0.5">
										<FormLabel>Certificate Data</FormLabel>
									</div>
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
									<div className="space-y-0.5">
										<FormLabel>Private Key</FormLabel>
									</div>
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
										defaultValue={field.value}
									>
										<SelectTrigger>
											<SelectValue placeholder="Select a Server" />
										</SelectTrigger>
										<SelectContent>
											<SelectGroup>
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
												<SelectLabel>Servers ({servers?.length})</SelectLabel>
											</SelectGroup>
										</SelectContent>
									</Select>
									<FormMessage />
								</FormItem>
							)}
						/>
					</form>

					<DialogFooter className="flex w-full flex-row !justify-end">
						<Button
							isLoading={isLoading}
							form="hook-form-add-certificate"
							type="submit"
						>
							Create
						</Button>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
