import { zodResolver } from "@hookform/resolvers/zod";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { GitlabIcon } from "@/components/icons/data-tools-icons";
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

const Schema = z.object({
	name: z.string().min(1, {
		message: "Name is required",
	}),
	gitlabUrl: z.string().min(1, {
		message: "GitLab URL is required",
	}),
	applicationId: z.string().min(1, {
		message: "Application ID is required",
	}),
	applicationSecret: z.string().min(1, {
		message: "Application Secret is required",
	}),

	redirectUri: z.string().min(1, {
		message: "Redirect URI is required",
	}),
	groupName: z.string().optional(),
});

type Schema = z.infer<typeof Schema>;

export const AddGitlabProvider = () => {
	const utils = api.useUtils();
	const [isOpen, setIsOpen] = useState(false);
	const url = useUrl();
	const { data: auth } = api.user.get.useQuery();
	const { mutateAsync, error, isError } = api.gitlab.create.useMutation();
	const webhookUrl = `${url}/api/providers/gitlab/callback`;

	const form = useForm<Schema>({
		defaultValues: {
			applicationId: "",
			applicationSecret: "",
			groupName: "",
			redirectUri: webhookUrl,
			name: "",
			gitlabUrl: "https://gitlab.com",
		},
		resolver: zodResolver(Schema),
	});

	const gitlabUrl = form.watch("gitlabUrl");

	useEffect(() => {
		form.reset({
			applicationId: "",
			applicationSecret: "",
			groupName: "",
			redirectUri: webhookUrl,
			name: "",
			gitlabUrl: "https://gitlab.com",
		});
	}, [form, isOpen]);

	const onSubmit = async (data: Schema) => {
		await mutateAsync({
			applicationId: data.applicationId || "",
			secret: data.applicationSecret || "",
			groupName: data.groupName || "",
			authId: auth?.id || "",
			name: data.name || "",
			redirectUri: data.redirectUri || "",
			gitlabUrl: data.gitlabUrl || "https://gitlab.com",
		})
			.then(async () => {
				await utils.gitProvider.getAll.invalidate();
				toast.success("GitLab created successfully");
				setIsOpen(false);
			})
			.catch(() => {
				toast.error("Error configuring GitLab");
			});
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button
					variant="default"
					className="flex items-center space-x-1 bg-purple-700 text-white hover:bg-purple-600"
				>
					<GitlabIcon />
					<span>GitLab</span>
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl  ">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						GitLab Provider <GitlabIcon className="size-5" />
					</DialogTitle>
				</DialogHeader>

				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}
				<Form {...form}>
					<form
						id="hook-form-add-gitlab"
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-1"
					>
						<CardContent className="p-0">
							<div className="flex flex-col gap-4">
								<p className="text-muted-foreground text-sm">
									To integrate your GitLab account, you need to create a new
									application in your GitLab settings. Follow these steps:
								</p>
								<ol className="list-decimal list-inside text-sm text-muted-foreground">
									<li className="flex flex-row gap-2 items-center">
										Go to your GitLab profile settings{" "}
										<Link
											href={`${gitlabUrl}/-/profile/applications`}
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
											<li>Scopes: api, read_user, read_repository</li>
										</ul>
									</li>
									<li>
										After creating, you'll receive an Application ID and Secret,
										copy them and paste them below.
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
									name="gitlabUrl"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Gitlab URL</FormLabel>
											<FormControl>
												<Input placeholder="https://gitlab.com/" {...field} />
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
									name="applicationId"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Application ID</FormLabel>
											<FormControl>
												<Input placeholder="Application ID" {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="applicationSecret"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Application Secret</FormLabel>
											<FormControl>
												<Input
													type="password"
													placeholder="Application Secret"
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="groupName"
									render={({ field }) => (
										<FormItem>
											<FormLabel>
												Group Name (Optional, Comma-Separated List)
											</FormLabel>
											<FormControl>
												<Input
													placeholder="For organization/group access use the slugish name of the group eg: my-org"
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<Button isLoading={form.formState.isSubmitting}>
									Configure GitLab App
								</Button>
							</div>
						</CardContent>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
