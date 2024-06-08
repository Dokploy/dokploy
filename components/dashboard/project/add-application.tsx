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
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { AlertBlock } from "@/components/shared/alert-block";
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { Folder } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Textarea } from "@/components/ui/textarea";

const AddTemplateSchema = z.object({
	name: z.string().min(1, {
		message: "Name is required",
	}),
	appName: z
		.string()
		.min(1, {
			message: "App name is required",
		})
		.regex(/^[a-z](?!.*--)([a-z0-9-]*[a-z])?$/, {
			message:
				"App name supports letters, numbers, '-' and can only start and end letters, and does not support continuous '-'",
		}),
	description: z.string().optional(),
});

type AddTemplate = z.infer<typeof AddTemplateSchema>;

interface Props {
	projectId: string;
	projectName?: string;
}

export const AddApplication = ({ projectId, projectName }: Props) => {
	const utils = api.useUtils();
	const [visible, setVisible] = useState(false);

	const { mutateAsync, isLoading, error, isError } =
		api.application.create.useMutation();

	const form = useForm<AddTemplate>({
		defaultValues: {
			name: "",
			appName: `${projectName}-`,
			description: "",
		},
		resolver: zodResolver(AddTemplateSchema),
	});

	const onSubmit = async (data: AddTemplate) => {
		await mutateAsync({
			name: data.name,
			appName: data.appName,
			description: data.description,
			projectId,
		})
			.then(async () => {
				toast.success("Service Created");
				form.reset();
				setVisible(false);
				await utils.project.one.invalidate({
					projectId,
				});
			})
			.catch((e) => {
				toast.error("Error to create the service");
			});
	};

	return (
		<Dialog open={visible} onOpenChange={setVisible}>
			<DialogTrigger className="w-full">
				<DropdownMenuItem
					className="w-full cursor-pointer space-x-3"
					onSelect={(e) => e.preventDefault()}
				>
					<Folder className="size-4 text-muted-foreground" />
					<span>Application</span>
				</DropdownMenuItem>
			</DialogTrigger>
			<DialogContent className="max-h-screen  overflow-y-auto sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Create</DialogTitle>
					<DialogDescription>
						Assign a name and description to your application
					</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}

				<Form {...form}>
					<form
						id="hook-form"
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-4"
					>
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Name</FormLabel>
									<FormControl>
										<Input
											placeholder="Frontend"
											{...field}
											onChange={(e) => {
												const val = e.target.value?.trim() || "";
												form.setValue("appName", `${projectName}-${val}`);
												field.onChange(val);
											}}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="appName"
							render={({ field }) => (
								<FormItem>
									<FormLabel>AppName</FormLabel>
									<FormControl>
										<Input placeholder="my-app" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="description"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Description</FormLabel>
									<FormControl>
										<Textarea
											placeholder="Description about your service..."
											className="resize-none"
											{...field}
										/>
									</FormControl>

									<FormMessage />
								</FormItem>
							)}
						/>

						{/* <FormField
              control={form.control}
              name="buildType"
              render={({ field }) => (
                <FormItem className="space-y-3">
                  <FormLabel>Build Type</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      className="flex flex-col space-y-1"
                    >
                      <FormItem className="flex items-center space-x-3 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="dockerfile" />
                        </FormControl>
                        <FormLabel className="font-normal">
                          Dockerfile
                        </FormLabel>
                      </FormItem>
                      <FormItem className="flex items-center space-x-3 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="nixpacks" />
                        </FormControl>
                        <FormLabel className="font-normal">Nixpacks</FormLabel>
                      </FormItem>
                      <FormItem className="flex items-center space-x-3 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="heroku_buildpacks" />
                        </FormControl>
                        <FormLabel className="font-normal">
                          Heroku Buildpacks
                        </FormLabel>
                      </FormItem>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            /> */}
					</form>

					<DialogFooter>
						<Button isLoading={isLoading} form="hook-form" type="submit">
							Create
						</Button>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
