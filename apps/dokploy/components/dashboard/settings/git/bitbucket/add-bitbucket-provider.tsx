import { zodResolver } from "@hookform/resolvers/zod";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
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
import { useUrl } from "@/utils/hooks/use-url";

const Schema = z.object({
	name: z.string().min(1, {
		message: "Name is required",
	}),
	username: z.string().min(1, {
		message: "Username is required",
	}),
	password: z.string().min(1, {
		message: "App Password is required",
	}),
	workspaceName: z.string().optional(),
});

type Schema = z.infer<typeof Schema>;

export const AddBitbucketProvider = () => {
	const utils = api.useUtils();
	const [isOpen, setIsOpen] = useState(false);
	const _url = useUrl();
	const { mutateAsync, error, isError } = api.bitbucket.create.useMutation();
	const { data: auth } = api.user.get.useQuery();
	const _router = useRouter();
	const form = useForm<Schema>({
		defaultValues: {
			username: "",
			password: "",
			workspaceName: "",
		},
		resolver: zodResolver(Schema),
	});

	useEffect(() => {
		form.reset({
			username: "",
			password: "",
			workspaceName: "",
		});
	}, [form, isOpen]);

	const onSubmit = async (data: Schema) => {
		await mutateAsync({
			bitbucketUsername: data.username,
			appPassword: data.password,
			bitbucketWorkspaceName: data.workspaceName || "",
			authId: auth?.id || "",
			name: data.name || "",
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
								<p className="text-muted-foreground text-sm">
									To integrate your Bitbucket account, you need to create a new
									App Password in your Bitbucket settings. Follow these steps:
								</p>
								<ol className="list-decimal list-inside text-sm text-muted-foreground">
									<li className="flex flex-row gap-2 items-center">
										Create new App Password{" "}
										<Link
											href="https://bitbucket.org/account/settings/app-passwords/new"
											target="_blank"
										>
											<ExternalLink className="w-fit text-primary size-4" />
										</Link>
									</li>
									<li>
										When creating the App Password, ensure you grant the
										following permissions:
										<ul className="list-disc list-inside ml-4">
											<li>Account: Read</li>
											<li>Workspace membership: Read</li>
											<li>Projects: Read</li>
											<li>Repositories: Read</li>
											<li>Pull requests: Read</li>
											<li>Webhooks: Read and write</li>
										</ul>
									</li>
									<li>
										After creating, you'll receive an App Password. Copy it and
										paste it below along with your Bitbucket username.
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
									name="password"
									render={({ field }) => (
										<FormItem>
											<FormLabel>App Password</FormLabel>
											<FormControl>
												<Input
													type="password"
													placeholder="ATBBPDYUC94nR96Nj7Cqpp4pfwKk03573DD2"
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
											<FormLabel>Workspace Name (Optional)</FormLabel>
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
