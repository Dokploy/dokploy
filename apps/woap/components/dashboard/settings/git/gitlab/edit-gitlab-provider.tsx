import { zodResolver } from "@hookform/resolvers/zod";
import { PenBoxIcon } from "lucide-react";
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

const Schema = z.object({
	name: z.string().min(1, {
		message: "Name is required",
	}),
	gitlabUrl: z.string().url({
		message: "Invalid Gitlab URL",
	}),
	groupName: z.string().optional(),
});

type Schema = z.infer<typeof Schema>;

interface Props {
	gitlabId: string;
}

export const EditGitlabProvider = ({ gitlabId }: Props) => {
	const { data: gitlab, refetch } = api.gitlab.one.useQuery(
		{
			gitlabId,
		},
		{
			enabled: !!gitlabId,
		},
	);
	const utils = api.useUtils();
	const [isOpen, setIsOpen] = useState(false);
	const { mutateAsync, error, isError } = api.gitlab.update.useMutation();
	const { mutateAsync: testConnection, isLoading } =
		api.gitlab.testConnection.useMutation();
	const form = useForm<Schema>({
		defaultValues: {
			groupName: "",
			name: "",
			gitlabUrl: "https://gitlab.com",
		},
		resolver: zodResolver(Schema),
	});

	const groupName = form.watch("groupName");

	useEffect(() => {
		form.reset({
			groupName: gitlab?.groupName || "",
			name: gitlab?.gitProvider.name || "",
			gitlabUrl: gitlab?.gitlabUrl || "",
		});
	}, [form, isOpen]);

	const onSubmit = async (data: Schema) => {
		await mutateAsync({
			gitlabId,
			gitProviderId: gitlab?.gitProviderId || "",
			groupName: data.groupName || "",
			name: data.name || "",
			gitlabUrl: data.gitlabUrl || "",
		})
			.then(async () => {
				await utils.gitProvider.getAll.invalidate();
				toast.success("Gitlab updated successfully");
				setIsOpen(false);
				refetch();
			})
			.catch(() => {
				toast.error("Error updating Gitlab");
			});
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="group hover:bg-blue-500/10 "
				>
					<PenBoxIcon className="size-3.5  text-primary group-hover:text-blue-500" />
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl ">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						Update GitLab <GitlabIcon className="size-5" />
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
											<FormLabel>Gitlab Url</FormLabel>
											<FormControl>
												<Input placeholder="https://gitlab.com" {...field} />
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

								<div className="flex w-full justify-between gap-4 mt-4">
									<Button
										type="button"
										variant={"secondary"}
										isLoading={isLoading}
										onClick={async () => {
											await testConnection({
												gitlabId,
												groupName: groupName || "",
											})
												.then(async (message) => {
													toast.info(`Message: ${message}`);
												})
												.catch((error) => {
													toast.error(`Error: ${error.message}`);
												});
										}}
									>
										Test Connection
									</Button>
									<Button type="submit" isLoading={form.formState.isSubmitting}>
										Update
									</Button>
								</div>
							</div>
						</CardContent>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
