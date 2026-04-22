import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { BitbucketIcon } from "@/components/icons/data-tools-icons";
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

const Schema = z.object({
	name: z.string().min(1, { message: "Name is required" }),
	username: z.string().min(1, { message: "Username is required" }),
	email: z.string().email().optional(),
	apiToken: z.string().min(1, { message: "API Token is required" }),
	workspaceName: z.string().optional(),
});

type Schema = z.infer<typeof Schema>;

export const AddBitbucketProvider = () => {
	const utils = api.useUtils();
	const [isOpen, setIsOpen] = useState(false);
	const { mutateAsync, error, isError } = api.bitbucket.create.useMutation();
	const { data: auth } = api.user.get.useQuery();
	const form = useForm<Schema>({
		defaultValues: {
			username: "",
			apiToken: "",
			workspaceName: "",
		},
		resolver: zodResolver(Schema),
	});

	useEffect(() => {
		form.reset({
			username: "",
			email: "",
			apiToken: "",
			workspaceName: "",
		});
	}, [form, isOpen]);

	const onSubmit = async (data: Schema) => {
		await mutateAsync({
			bitbucketUsername: data.username,
			apiToken: data.apiToken,
			bitbucketWorkspaceName: data.workspaceName || "",
			authId: auth?.id || "",
			name: data.name || "",
			bitbucketEmail: data.email || "",
		})
			.then(async () => {
				await utils.gitProvider.getAll.invalidate();
				toast.success("Bitbucket configured successfully");
				setIsOpen(false);
			})
			.catch(() => {
				toast.error("Error configuring Bitbucket");
			});
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button
					variant="secondary"
					className="flex items-center space-x-1 bg-blue-700 text-white hover:bg-blue-600"
				>
					<BitbucketIcon />
					<span>Bitbucket</span>
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl ">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						Bitbucket Provider <BitbucketIcon className="size-5" />
					</DialogTitle>
				</DialogHeader>

				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}
				<Form {...form}>
					<form
						id="hook-form-add-bitbucket"
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-1"
					>
						<CardContent className="p-0">
							<div className="flex flex-col gap-4">
								<AlertBlock type="warning">
									Bitbucket App Passwords are deprecated for new providers. Use
									an API Token instead. Existing providers with App Passwords
									will continue to work until 9th June 2026.
								</AlertBlock>

								<div className="mt-1 text-sm">
									Manage tokens in
									<Link
										href="https://id.atlassian.com/manage-profile/security/api-tokens"
										target="_blank"
										className="inline-flex items-center gap-1 ml-1"
									>
										<span>Bitbucket settings</span>
										<ExternalLink className="w-fit text-primary size-4" />
									</Link>
								</div>
								<ul className="list-disc list-inside ml-4 text-sm text-muted-foreground">
									<li className="text-muted-foreground text-sm">
										Click on Create API token with scopes
									</li>
									<li className="text-muted-foreground text-sm">
										Select the expiration date (Max 1 year)
									</li>
									<li className="text-muted-foreground text-sm">
										Select Bitbucket product.
									</li>
								</ul>
								<p className="text-muted-foreground text-sm">
									Select the following scopes:
								</p>

								<ul className="list-disc list-inside ml-4 text-sm text-muted-foreground">
									<li>read:repository:bitbucket</li>
									<li>read:pullrequest:bitbucket</li>
									<li>read:webhook:bitbucket</li>
									<li>read:workspace:bitbucket</li>
									<li>write:webhook:bitbucket</li>
								</ul>

								<FormField
									control={form.control}
									name="name"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Name</FormLabel>
											<FormControl>
												<Input
													placeholder="Your Bitbucket Provider, eg: my-personal-account"
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="username"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Bitbucket Username</FormLabel>
											<FormControl>
												<Input
													placeholder="Your Bitbucket username"
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="email"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Bitbucket Email</FormLabel>
											<FormControl>
												<Input placeholder="Your Bitbucket email" {...field} />
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
											<FormLabel>API Token</FormLabel>
											<FormControl>
												<Input
													placeholder="Paste your Bitbucket API token"
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="workspaceName"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Workspace Name (optional)</FormLabel>
											<FormControl>
												<Input
													placeholder="For organization accounts"
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<Button isLoading={form.formState.isSubmitting}>
									Configure Bitbucket
								</Button>
							</div>
						</CardContent>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
