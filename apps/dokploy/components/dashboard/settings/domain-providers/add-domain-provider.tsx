"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { api } from "@/utils/api";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
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
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Globe, Shield, Key } from "lucide-react";

const namecheapFormSchema = z.object({
	name: z.string().min(1, "Name is required"),
	type: z.literal("namecheap"),
	apiKey: z.string().min(1, "API Key is required"),
	apiUser: z.string().min(1, "API User is required"),
	clientIp: z.string().min(1, "Client IP is required"),
	enablePurchase: z.boolean().default(false),
});

// Form schema that matches the API structure
const domainProviderSchema = z.union([
	// OAuth Netlify
	z.object({
		name: z.string().min(1, "Name is required"),
		type: z.literal("netlify"),
		authMethod: z.literal("oauth"),
		clientId: z.string().min(1, "Client ID is required for OAuth"),
		clientSecret: z.string().min(1, "Client Secret is required for OAuth"),
	}),
	// Direct Netlify
	z.object({
		name: z.string().min(1, "Name is required"),
		type: z.literal("netlify"),
		authMethod: z.literal("direct"),
		apiToken: z.string().min(1, "Access Token is required for direct auth"),
	}),
	// Namecheap provider
	namecheapFormSchema,
]);

type DomainProviderFormValues = z.infer<typeof domainProviderSchema>;

interface AddDomainProviderProps {
	open: boolean;
	setOpen: (open: boolean) => void;
}

export const AddDomainProvider = ({ open, setOpen }: AddDomainProviderProps) => {
	const [providerType, setProviderType] = useState<"netlify" | "namecheap">("netlify");
	const [netlifyAuthMethod, setNetlifyAuthMethod] = useState<"oauth" | "direct">("oauth");

	const form = useForm<DomainProviderFormValues>({
		resolver: zodResolver(domainProviderSchema),
		defaultValues: (() => {
			if (providerType === "netlify") {
				if (netlifyAuthMethod === "oauth") {
					return {
						name: "",
						type: "netlify" as const,
						authMethod: "oauth" as const,
						clientId: "",
						clientSecret: "",
					};
				} else {
					return {
						name: "",
						type: "netlify" as const,
						authMethod: "direct" as const,
						apiToken: "",
					};
				}
			} else {
				return {
					name: "",
					type: "namecheap" as const,
					apiKey: "",
					apiUser: "",
					clientIp: "",
					enablePurchase: false,
				};
			}
		})(),
	});

	const { mutateAsync: createDomainProvider, isLoading } =
		api.domainProvider.create.useMutation({
			onSuccess: async () => {
				toast.success("Domain provider created successfully");
				setOpen(false);
				form.reset();
			},
			onError: (error) => {
				toast.error(error.message);
			},
		});

	const handleSubmit = (values: DomainProviderFormValues) => {
		createDomainProvider(values);
	};

	const handleProviderTypeChange = (type: "netlify" | "namecheap") => {
		setProviderType(type);
		// Reset form with new type
		if (type === "netlify") {
			const netlifyValues = netlifyAuthMethod === "oauth"
				? {
						name: form.getValues("name") || "",
						type: "netlify" as const,
						authMethod: "oauth" as const,
						clientId: "",
						clientSecret: "",
				  }
				: {
						name: form.getValues("name") || "",
						type: "netlify" as const,
						authMethod: "direct" as const,
						apiToken: "",
				  };
			form.reset(netlifyValues);
		} else {
			form.reset({
				name: form.getValues("name") || "",
				type: "namecheap" as const,
				apiKey: "",
				apiUser: "",
				clientIp: "",
				enablePurchase: false,
			});
		}
	};

	const handleNetlifyAuthMethodChange = (authMethod: "oauth" | "direct") => {
		setNetlifyAuthMethod(authMethod);
		// Reset form with new auth method
		const netlifyValues = authMethod === "oauth"
			? {
					name: form.getValues("name") || "",
					type: "netlify" as const,
					authMethod: "oauth" as const,
					clientId: "",
					clientSecret: "",
			  }
			: {
					name: form.getValues("name") || "",
					type: "netlify" as const,
					authMethod: "direct" as const,
					apiToken: "",
			  };
		form.reset(netlifyValues);
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Globe className="h-5 w-5" />
						Add Domain Provider
					</DialogTitle>
				</DialogHeader>
				<Form {...form}>
					<form onSubmit={form.handleSubmit(handleSubmit)} className="grid gap-6">
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Name</FormLabel>
									<FormControl>
										<Input
											placeholder="My Domain Provider Account"
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormItem>
							<FormLabel>Provider Type</FormLabel>
							<Select
								value={providerType}
								onValueChange={handleProviderTypeChange}
							>
								<FormControl>
									<SelectTrigger>
										<SelectValue placeholder="Select provider type" />
									</SelectTrigger>
								</FormControl>
								<SelectContent>
									<SelectItem value="netlify">
										<div className="flex items-center gap-2">
											<Shield className="h-4 w-4" />
											Netlify DNS
										</div>
									</SelectItem>
									<SelectItem value="namecheap">
										<div className="flex items-center gap-2">
											<Key className="h-4 w-4" />
											Namecheap
										</div>
									</SelectItem>
								</SelectContent>
							</Select>
						</FormItem>

						{providerType === "netlify" && (
							<>
								<FormItem>
									<FormLabel>Authentication Method</FormLabel>
									<Select
										value={netlifyAuthMethod}
										onValueChange={handleNetlifyAuthMethodChange}
									>
										<FormControl>
											<SelectTrigger>
												<SelectValue placeholder="Select authentication method" />
											</SelectTrigger>
										</FormControl>
										<SelectContent>
											<SelectItem value="oauth">
												<div className="flex items-center gap-2">
													<Shield className="h-4 w-4" />
													OAuth (Recommended)
												</div>
											</SelectItem>
											<SelectItem value="direct">
												<div className="flex items-center gap-2">
													<Key className="h-4 w-4" />
													Direct Access Token
												</div>
											</SelectItem>
										</SelectContent>
									</Select>
								</FormItem>

								{netlifyAuthMethod === "oauth" && (
									<>
										<FormField
											control={form.control}
											name="clientId"
											render={({ field }) => (
												<FormItem>
													<FormLabel>Client ID</FormLabel>
													<FormControl>
														<Input
															placeholder="Enter your Netlify OAuth Client ID"
															{...field}
														/>
													</FormControl>
													<FormMessage />
												</FormItem>
											)}
										/>

										<FormField
											control={form.control}
											name="clientSecret"
											render={({ field }) => (
												<FormItem>
													<FormLabel>Client Secret</FormLabel>
													<FormControl>
														<Input
															type="password"
															placeholder="Enter your Netlify Client Secret"
															{...field}
														/>
													</FormControl>
													<FormMessage />
												</FormItem>
											)}
										/>

										<div className="text-sm text-muted-foreground">
											<p className="mb-2">
												To get these credentials:</p>
											<ol className="list-decimal list-inside space-y-1">
												<li>Create a Netlify app at{" "}
													<a
														href="https://app.netlify.com/applications/overview"
														target="_blank"
														rel="noopener noreferrer"
														className="text-blue-600 hover:underline"
													>
														app.netlify.com/applications/overview
													</a>
												</li>
												<li>Create a new application with OAuth scopes for DNS management</li>
												<li>Copy the Client ID and Client Secret from your app settings</li>
											</ol>
										</div>
									</>
								)}

								{netlifyAuthMethod === "direct" && (
									<>
										<FormField
											control={form.control}
											name="apiToken"
											render={({ field }) => (
												<FormItem>
													<FormLabel>Access Token</FormLabel>
													<FormControl>
														<Input
															type="password"
															placeholder="Enter your Netlify Personal Access Token"
															{...field}
														/>
													</FormControl>
													<FormMessage />
												</FormItem>
											)}
										/>

										<div className="text-sm text-muted-foreground">
											<p className="mb-2">
												To get a Personal Access Token:</p>
											<ol className="list-decimal list-inside space-y-1">
												<li>Go to your Netlify user settings</li>
												<li>Navigate to "Applications" → "Personal access tokens"</li>
												<li>Create a new token with DNS management scopes</li>
												<li>Copy the generated token</li>
											</ol>
										</div>
									</>
								)}
							</>
						)}

						{providerType === "namecheap" && (
							<>
								<FormField
									control={form.control}
									name="apiKey"
									render={({ field }) => (
										<FormItem>
											<FormLabel>API Key</FormLabel>
											<FormControl>
												<Input
													type="password"
													placeholder="Enter your Namecheap API key"
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="apiUser"
									render={({ field }) => (
										<FormItem>
											<FormLabel>API User</FormLabel>
											<FormControl>
												<Input
													placeholder="Enter your Namecheap API username"
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="clientIp"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Client IP</FormLabel>
											<FormControl>
												<Input
													placeholder="Your whitelisted IP address"
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="enablePurchase"
									render={({ field }) => (
										<FormItem className="flex flex-row items-start space-x-3 space-y-0">
											<FormControl>
												<Checkbox
													checked={field.value}
													onCheckedChange={field.onChange}
												/>
											</FormControl>
											<div className="space-y-1 leading-none">
												<FormLabel>
													Enable domain purchases
												</FormLabel>
												<p className="text-sm text-muted-foreground">
													Allow purchasing domains through this provider
												</p>
											</div>
										</FormItem>
									)}
								/>
							</>
						)}
					</form>
				</Form>
				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						onClick={() => setOpen(false)}
						disabled={isLoading}
					>
						Cancel
					</Button>
					<Button
						type="submit"
						onClick={form.handleSubmit(handleSubmit)}
						disabled={isLoading}
					>
						{isLoading ? "Creating..." : "Add Provider"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};