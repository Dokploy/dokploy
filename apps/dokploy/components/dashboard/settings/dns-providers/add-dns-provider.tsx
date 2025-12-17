"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { api } from "@/utils/api";
import { z } from "zod";
import { useForm } from "react-hook-form";
import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@/components/ui/alert";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
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
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

// Define the DNS provider schema locally for client-side use
const dnsProviderSchema = z.object({
	name: z.string().min(1, "Name is required"),
	type: z.enum(["cloudflare", "route53", "digitalocean", "namecheap", "gandi", "azure", "google"]),
	apiToken: z.string().optional(),
	secretAccessKey: z.string().optional(),
	accessKeyId: z.string().optional(),
	region: z.string().optional(),
	ttl: z.string().default("1"),
});

const formSchema = dnsProviderSchema
	.extend({
		name: z
			.string()
			.min(1, "Name is required"),
	})
	.superRefine((data, ctx) => {
		// Provider-specific validation
		switch (data.type) {
			case "cloudflare":
				if (!data.apiToken) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						path: ["apiToken"],
						message: "API token is required for Cloudflare",
					});
				}
				break;
			case "digitalocean":
				if (!data.apiToken) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						path: ["apiToken"],
						message: "API token is required for DigitalOcean",
					});
				}
				break;
			case "route53":
				if (!data.accessKeyId) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						path: ["accessKeyId"],
						message: "Access key ID is required for Route53",
					});
				}
				if (!data.secretAccessKey) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						path: ["secretAccessKey"],
						message: "Secret access key is required for Route53",
					});
				}
				if (!data.region) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						path: ["region"],
						message: "Region is required for Route53",
					});
				}
				break;
			case "namecheap":
				if (!data.apiToken) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						path: ["apiToken"],
						message: "API user is required for Namecheap",
					});
				}
				break;
			case "gandi":
				if (!data.apiToken) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						path: ["apiToken"],
						message: "Personal access token is required for Gandi",
					});
				}
				break;
			case "azure":
				if (!data.apiToken) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						path: ["apiToken"],
						message: "Client secret is required for Azure",
					});
				}
				if (!data.accessKeyId) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						path: ["accessKeyId"],
						message: "Client ID is required for Azure",
					});
				}
				if (!data.region) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						path: ["region"],
						message: "Tenant ID is required for Azure",
					});
				}
				break;
			case "google":
				if (!data.apiToken) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						path: ["apiToken"],
						message: "Service account key is required for Google",
					});
				}
				if (!data.region) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						path: ["region"],
						message: "Project ID is required for Google",
					});
				}
				break;
		}
	});

type formSchemaType = z.infer<typeof formSchema>;

const AddDNSProvider = ({
	open,
	setOpen,
	dnsProviders,
}: {
	open: boolean;
	setOpen: (open: boolean) => void;
	dnsProviders: any[];
}) => {
	const { t } = useTranslation();
	const utils = api.useUtils();

	const existingNames = dnsProviders.map((provider) => provider.name);

	const finalFormSchema = formSchema.refine((val) => !existingNames.includes(val.name), {
		message: "A DNS provider with this name already exists",
		path: ["name"],
	});

	const form = useForm<formSchemaType>({
		resolver: zodResolver(finalFormSchema),
		defaultValues: {
			name: "",
			type: "cloudflare",
			apiToken: "",
			secretAccessKey: "",
			accessKeyId: "",
			region: "",
			ttl: "1",
		},
	});

	const { mutateAsync: createDnsProvider, isLoading } =
		api.dnsProvider.create.useMutation({
			onSuccess: async () => {
				utils.dnsProvider.byOrganization.invalidate();
				toast.success("DNS Provider created successfully");
				setOpen(false);
				form.reset();
			},
			onError: (error) => {
				toast.error(error.message);
			},
		});

	const selectedType = form.watch("type");

	const handleSubmit = (values: formSchemaType) => {
		createDnsProvider(values);
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent className="max-h-[85vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Add DNS Provider</DialogTitle>
					<DialogDescription>
						Add a DNS provider for wildcard domain SSL certificate support
					</DialogDescription>
				</DialogHeader>

				<Form {...form}>
					<form
						id="hook-form-add-dns-provider"
						onSubmit={form.handleSubmit(handleSubmit)}
						className="grid gap-4"
					>
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Name</FormLabel>
									<FormControl>
										<Input placeholder="My Cloudflare Account" {...field} />
									</FormControl>
									<FormDescription>
										A descriptive name for this DNS provider
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="type"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Provider Type</FormLabel>
									<Select onValueChange={field.onChange} defaultValue={field.value}>
										<FormControl>
											<SelectTrigger>
												<SelectValue placeholder="Select DNS provider" />
											</SelectTrigger>
										</FormControl>
										<SelectContent>
											<SelectItem value="cloudflare">Cloudflare</SelectItem>
											<SelectItem value="route53">Amazon Route53</SelectItem>
											<SelectItem value="digitalocean">DigitalOcean</SelectItem>
											<SelectItem value="namecheap">Namecheap</SelectItem>
											<SelectItem value="gandi">Gandi</SelectItem>
											<SelectItem value="azure">Microsoft Azure</SelectItem>
											<SelectItem value="google">Google Cloud</SelectItem>
										</SelectContent>
									</Select>
									<FormDescription>
										Select your DNS provider for wildcard certificate challenges
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>

						{/* Cloudflare Fields */}
						{selectedType === "cloudflare" && (
							<>
								<FormField
									control={form.control}
									name="apiToken"
									render={({ field }) => (
										<FormItem>
											<FormLabel>API Token</FormLabel>
											<FormControl>
												<Textarea
													placeholder="Enter your Cloudflare API token"
													{...field}
												/>
											</FormControl>
											<FormDescription>
												Create an API token in Cloudflare with Zone:DNS:Edit permissions
											</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="ttl"
									render={({ field }) => (
										<FormItem>
											<FormLabel>TTL (seconds)</FormLabel>
											<FormControl>
												<Input
													placeholder="1"
													{...field}
												/>
											</FormControl>
											<FormDescription>
												Time to live for DNS records (default: 1)
											</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>
							</>
						)}

						{/* Route53 Fields */}
						{selectedType === "route53" && (
							<>
								<FormField
									control={form.control}
									name="accessKeyId"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Access Key ID</FormLabel>
											<FormControl>
												<Input
													placeholder="AKIAIOSFODNN7EXAMPLE"
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="secretAccessKey"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Secret Access Key</FormLabel>
											<FormControl>
												<Textarea
													placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="region"
									render={({ field }) => (
										<FormItem>
											<FormLabel>AWS Region</FormLabel>
											<FormControl>
												<Input
													placeholder="us-east-1"
													{...field}
												/>
											</FormControl>
											<FormDescription>
												AWS region where your Route53 hosted zone is located
											</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="ttl"
									render={({ field }) => (
										<FormItem>
											<FormLabel>TTL (seconds)</FormLabel>
											<FormControl>
												<Input
													placeholder="10"
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							</>
						)}

						{/* DigitalOcean Fields */}
						{selectedType === "digitalocean" && (
							<>
								<FormField
									control={form.control}
									name="apiToken"
									render={({ field }) => (
										<FormItem>
											<FormLabel>API Token</FormLabel>
											<FormControl>
												<Textarea
														placeholder="your_digitalocean_personal_access_token"
													{...field}
												/>
											</FormControl>
											<FormDescription>
												Create a personal access token with write permissions
											</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="ttl"
									render={({ field }) => (
										<FormItem>
											<FormLabel>TTL (seconds)</FormLabel>
											<FormControl>
												<Input
													placeholder="30"
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							</>
						)}

						{/* Namecheap Fields */}
						{selectedType === "namecheap" && (
							<>
								<FormField
									control={form.control}
									name="apiToken"
									render={({ field }) => (
										<FormItem>
											<FormLabel>API User</FormLabel>
											<FormControl>
												<Input
													placeholder="your-namecheap-username"
													{...field}
												/>
											</FormControl>
											<FormDescription>
												Your Namecheap API user (username)
											</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="ttl"
									render={({ field }) => (
										<FormItem>
											<FormLabel>TTL (seconds)</FormLabel>
											<FormControl>
												<Input
													placeholder="60"
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							</>
						)}

						{/* Gandi Fields */}
						{selectedType === "gandi" && (
							<>
								<FormField
									control={form.control}
									name="apiToken"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Personal Access Token</FormLabel>
											<FormControl>
												<Textarea
													placeholder="your-gandi-pat-1234567890abcdef"
													{...field}
												/>
											</FormControl>
											<FormDescription>
												Create a personal access token in your Gandi account
											</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="ttl"
									render={({ field }) => (
										<FormItem>
											<FormLabel>TTL (seconds)</FormLabel>
											<FormControl>
												<Input
													placeholder="10800"
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							</>
						)}

						{/* Azure Fields */}
						{selectedType === "azure" && (
							<>
								<FormField
									control={form.control}
									name="accessKeyId"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Client ID</FormLabel>
											<FormControl>
												<Input
													placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="apiToken"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Client Secret</FormLabel>
											<FormControl>
												<Textarea
													placeholder="your-client-secret"
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="region"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Tenant ID</FormLabel>
											<FormControl>
												<Input
													placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="ttl"
									render={({ field }) => (
										<FormItem>
											<FormLabel>TTL (seconds)</FormLabel>
											<FormControl>
												<Input
													placeholder="60"
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							</>
						)}

						{/* Google Cloud Fields */}
						{selectedType === "google" && (
							<>
								<FormField
									control={form.control}
									name="apiToken"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Service Account Key</FormLabel>
											<FormControl>
												<Textarea
													placeholder='{ "type": "service_account", ... }'
													{...field}
												/>
											</FormControl>
											<FormDescription>
												Paste your service account key JSON content
											</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="region"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Project ID</FormLabel>
											<FormControl>
												<Input
													placeholder="my-project-12345"
													{...field}
												/>
											</FormControl>
											<FormDescription>
												Your Google Cloud project ID
											</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="ttl"
									render={({ field }) => (
										<FormItem>
											<FormLabel>TTL (seconds)</FormLabel>
											<FormControl>
												<Input
													placeholder="300"
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							</>
						)}

						<Alert>
							<AlertTitle>DNS Challenge Setup</AlertTitle>
							<AlertDescription>
								This DNS provider will be used to automatically solve ACME challenges for wildcard
								domain SSL certificates. Make sure your API credentials have DNS management permissions.
							</AlertDescription>
						</Alert>
					</form>
				</Form>

				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						onClick={() => {
							setOpen(false);
							form.reset();
						}}
					>
						Cancel
					</Button>
					<Button
						type="submit"
						form="hook-form-add-dns-provider"
						disabled={isLoading}
						loading={isLoading}
					>
						Add DNS Provider
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};

export { AddDNSProvider };
