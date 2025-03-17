import { GiteaIcon } from "@/components/icons/data-tools-icons"; // Use GiteaIcon for Gitea
import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
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
import { api } from "@/utils/api";
import { useUrl } from "@/utils/hooks/use-url";
import { zodResolver } from "@hookform/resolvers/zod";

import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const Schema = z.object({
	name: z.string().min(1, {
		message: "Name is required",
	}),
	giteaUrl: z.string().min(1, {
		message: "Gitea URL is required",
	}),
	clientId: z.string().min(1, {
		message: "Client ID is required",
	}),
	clientSecret: z.string().min(1, {
		message: "Client Secret is required",
	}),
	redirectUri: z.string().min(1, {
		message: "Redirect URI is required",
	}),
	organizationName: z.string().optional(), // Added organizationName to the schema
});

type Schema = z.infer<typeof Schema>;

export const AddGiteaProvider = () => {
	const utils = api.useUtils();
	const [isOpen, setIsOpen] = useState(false);
	const url = useUrl();
	const { mutateAsync, error, isError } = api.gitea.create.useMutation(); // Updated API call for Gitea
	const webhookUrl = `${url}/api/providers/gitea/callback`; // Updated webhook URL for Gitea

	const form = useForm<Schema>({
		defaultValues: {
			clientId: "",
			clientSecret: "",
			redirectUri: webhookUrl,
			name: "",
			giteaUrl: "https://gitea.com",
		},
		resolver: zodResolver(Schema),
	});

	const giteaUrl = form.watch("giteaUrl");

	useEffect(() => {
		form.reset({
			clientId: "",
			clientSecret: "",
			redirectUri: webhookUrl,
			name: "",
			giteaUrl: "https://gitea.com",
		});
	}, [form, isOpen]);

	const onSubmit = async (data: Schema) => {
		await mutateAsync({
			clientId: data.clientId || "",
			clientSecret: data.clientSecret || "",
			name: data.name || "",
			redirectUri: data.redirectUri || "",
			giteaUrl: data.giteaUrl || "https://gitea.com", // Use Gitea URL
		})
			.then(async () => {
				await utils.gitProvider.getAll.invalidate();
				toast.success("Gitea provider created successfully");
				setIsOpen(false);
			})
			.catch(() => {
				toast.error("Error configuring Gitea");
			});
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button
					variant="default"
					className="flex items-center space-x-1 bg-green-700 text-white hover:bg-green-500"
				>
					<GiteaIcon />
					<span>Gitea</span>
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl  overflow-y-auto max-h-screen ">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						Gitea Provider <GiteaIcon className="size-5" />
					</DialogTitle>
				</DialogHeader>

				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}
				<Form {...form}>
					<form
						id="hook-form-add-gitea"
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-1"
					>
						<CardContent className="p-0">
							<div className="flex flex-col gap-4">
								<p className="text-muted-foreground text-sm">
									To integrate your Gitea account, you need to create a new
									application in your Gitea settings. Follow these steps:
								</p>
								<ol className="list-decimal list-inside text-sm text-muted-foreground">
									<li className="flex flex-row gap-2 items-center">
										Go to your Gitea settings{" "}
										<Link
											href={`${giteaUrl}/user/settings/applications`}
											target="_blank"
										>
											<ExternalLink className="w-fit text-primary size-4" />
										</Link>
									</li>
									<li>Navigate to Applications</li>
									<li>
										Create a new application with the following details:
										<ul className="list-disc list-inside ml-4">
											<li>Name: Dokploy</li>
											<li>
												Redirect URI:{" "}
												<span className="text-primary">{webhookUrl}</span>{" "}
											</li>
											<li>
												Select Permissions - organization: read, user: read,
												repository: read/write
											</li>
										</ul>
									</li>
									<li>
										After creating, you'll receive an ID and Secret, copy them
										and paste them below.
									</li>
								</ol>
								<FormField
									control={form.control}
									name="name"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Name</FormLabel>
											<FormControl>
												<Input
													placeholder="Random Name eg(my-personal-account)"
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="giteaUrl" // Ensure consistent name for Gitea URL
									render={({ field }) => (
										<FormItem>
											<FormLabel>Gitea URL</FormLabel>
											<FormControl>
												<Input placeholder="https://gitea.com/" {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="redirectUri"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Redirect URI</FormLabel>
											<FormControl>
												<Input
													disabled
													placeholder="Random Name eg(my-personal-account)"
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="clientId"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Client ID</FormLabel>
											<FormControl>
												<Input placeholder="Client ID" {...field} />
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
													placeholder="Client Secret"
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<Button isLoading={form.formState.isSubmitting}>
									Configure Gitea App {/* Ensured consistency with Gitea */}
								</Button>
							</div>
						</CardContent>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
