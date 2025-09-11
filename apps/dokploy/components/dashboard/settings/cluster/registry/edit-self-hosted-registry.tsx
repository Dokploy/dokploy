import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, PenBoxIcon, Server } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
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
import { api } from "@/utils/api";

const EditSelfHostedRegistrySchema = z.object({
	registryName: z.string().min(1, {
		message: "Registry name is required",
	}),
	username: z.string().min(1, {
		message: "Username is required",
	}),
	password: z.string().min(6, {
		message: "Password must be at least 6 characters",
	}),
	domain: z.string().min(1, {
		message: "Domain is required",
	}).refine((domain) => {
		// Allow localhost for testing and valid domains
		if (domain === "localhost" || domain.includes("localhost")) {
			return true;
		}
		// Basic domain validation
		const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/;
		return domainRegex.test(domain);
	}, {
		message: "Please enter a valid domain (e.g., registry.yourdomain.com or registry.localhost)",
	}),
});

type EditSelfHostedRegistryForm = z.infer<typeof EditSelfHostedRegistrySchema>;

interface EditSelfHostedRegistryProps {
	registryId: string;
	registry: {
		registryName: string;
		username: string;
		registryUrl: string;
		imagePrefix: string;
	};
}

export const EditSelfHostedRegistry = ({ registryId, registry }: EditSelfHostedRegistryProps) => {
	const utils = api.useUtils();
	const [isOpen, setIsOpen] = useState(false);

	const { mutateAsync: updateRegistry, isLoading, error, isError } = 
		api.registry.update.useMutation();

	const form = useForm<EditSelfHostedRegistryForm>({
		defaultValues: {
			registryName: registry.registryName,
			username: registry.username,
			password: "", // Don't pre-fill password for security
			domain: registry.imagePrefix || extractDomainFromUrl(registry.registryUrl),
		},
		resolver: zodResolver(EditSelfHostedRegistrySchema),
	});

	// Extract domain from registry URL
	function extractDomainFromUrl(url: string): string {
		try {
			const urlObj = new URL(url);
			return urlObj.hostname;
		} catch {
			// If it's not a valid URL, return as is (might be localhost:5000)
			return url.replace(/^https?:\/\//, '').split(':')[0];
		}
	}

	const onSubmit = async (data: EditSelfHostedRegistryForm) => {
		// For self-hosted registries, we need to update the registry configuration
		// and potentially restart the Docker service
		await updateRegistry({
			registryId,
			registryName: data.registryName,
			username: data.username,
			password: data.password,
			registryUrl: data.domain.includes('localhost') ? `http://${data.domain}:5000` : `https://${data.domain}`,
			imagePrefix: data.domain,
		})
		.then(async () => {
			await utils.registry.all.invalidate();
			toast.success("Self-hosted registry updated successfully!");
			setIsOpen(false);
		})
		.catch(() => {
			toast.error("Failed to update self-hosted registry");
		});
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="group hover:bg-blue-500/10"
				>
					<PenBoxIcon className="size-3.5 text-primary group-hover:text-blue-500" />
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Server className="h-5 w-5" />
						Edit Self-Hosted Registry
					</DialogTitle>
					<DialogDescription>
						Update your self-hosted registry configuration. Changes will be applied to the running registry.
					</DialogDescription>
				</DialogHeader>
				
				{isError && (
					<div className="flex flex-row gap-4 rounded-lg bg-red-50 p-2 dark:bg-red-950">
						<AlertTriangle className="text-red-600 dark:text-red-400" />
						<span className="text-sm text-red-600 dark:text-red-400">
							{error?.message || "An error occurred"}
						</span>
					</div>
				)}

				<Form {...form}>
					<form
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid grid-cols-1 sm:grid-cols-2 w-full gap-4"
					>
						<div className="flex flex-col gap-4">
							<FormField
								control={form.control}
								name="registryName"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Registry Name</FormLabel>
										<FormControl>
											<Input 
												placeholder="Self-Hosted Registry" 
												{...field} 
											/>
										</FormControl>
										<FormDescription>
											A friendly name for your registry
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>

						<div className="flex flex-col gap-4">
							<FormField
								control={form.control}
								name="username"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Username</FormLabel>
										<FormControl>
											<Input 
												placeholder="registry" 
												{...field} 
											/>
										</FormControl>
										<FormDescription>
											Username for registry authentication
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>

						<div className="flex flex-col gap-4">
							<FormField
								control={form.control}
								name="password"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Password</FormLabel>
										<FormControl>
											<Input 
												placeholder="Enter new password" 
												type="password"
												{...field} 
											/>
										</FormControl>
										<FormDescription>
											New password for registry authentication (min 6 characters)
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>

						<div className="flex flex-col gap-4">
							<FormField
								control={form.control}
								name="domain"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Domain</FormLabel>
										<FormControl>
											<Input 
												placeholder="registry.localhost" 
												{...field} 
											/>
										</FormControl>
										<FormDescription>
											Domain for the registry (e.g., registry.localhost or registry.yourdomain.com)
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>

						<div className="col-span-2 p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
							<div className="flex items-start gap-3">
								<AlertTriangle className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
								<div className="text-sm">
									<p className="font-medium text-blue-900 dark:text-blue-100 mb-1">
										Important Notes:
									</p>
									<ul className="text-blue-800 dark:text-blue-200 space-y-1 list-disc list-inside">
										<li>Changing the domain will update the registry URL</li>
										<li>Password changes will update authentication</li>
										<li>The registry service will be restarted with new settings</li>
										<li>For production domains, ensure SSL certificates are properly configured</li>
									</ul>
								</div>
							</div>
						</div>

						<DialogFooter className="flex flex-col w-full sm:justify-between gap-4 flex-wrap sm:flex-col col-span-2">
							<div className="flex flex-row gap-2 justify-end">
								<Button
									type="button"
									variant="outline"
									onClick={() => setIsOpen(false)}
								>
									Cancel
								</Button>
								<Button 
									type="submit" 
									isLoading={isLoading}
									className="bg-green-600 hover:bg-green-700"
								>
									<Server className="h-4 w-4 mr-2" />
									Update Self-Hosted Registry
								</Button>
							</div>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
