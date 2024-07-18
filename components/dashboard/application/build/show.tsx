import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { Cog } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

enum BuildType {
	dockerfile = "dockerfile",
	heroku_buildpacks = "heroku_buildpacks",
	paketo_buildpacks = "paketo_buildpacks",
	nixpacks = "nixpacks",
}

const mySchema = z.discriminatedUnion("buildType", [
	z.object({
		buildType: z.literal("dockerfile"),
		dockerfile: z
			.string({
				required_error: "Dockerfile path is required",
				invalid_type_error: "Dockerfile path is required",
			})
			.min(1, "Dockerfile required"),
	}),
	z.object({
		buildType: z.literal("heroku_buildpacks"),
	}),
	z.object({
		buildType: z.literal("paketo_buildpacks"),
	}),
	z.object({
		buildType: z.literal("nixpacks"),
	}),
]);

type AddTemplate = z.infer<typeof mySchema>;
interface Props {
	applicationId: string;
}

export const ShowBuildChooseForm = ({ applicationId }: Props) => {
	const { mutateAsync, isLoading } =
		api.application.saveBuildType.useMutation();
	const { data, refetch } = api.application.one.useQuery(
		{
			applicationId,
		},
		{
			enabled: !!applicationId,
		},
	);

	const form = useForm<AddTemplate>({
		defaultValues: {
			buildType: BuildType.nixpacks,
		},
		resolver: zodResolver(mySchema),
	});

	const buildType = form.watch("buildType");
	useEffect(() => {
		if (data) {
			// TODO: refactor this
			if (data.buildType === "dockerfile") {
				form.reset({
					buildType: data.buildType,
					...(data.buildType && {
						dockerfile: data.dockerfile || "",
					}),
				});
			} else {
				form.reset({
					buildType: data.buildType,
				});
			}
		}
	}, [form.formState.isSubmitSuccessful, form.reset, data, form]);

	const onSubmit = async (data: AddTemplate) => {
		await mutateAsync({
			applicationId,
			buildType: data.buildType,
			dockerfile: data.buildType === "dockerfile" ? data.dockerfile : null,
		})
			.then(async () => {
				toast.success("Build type saved");
				await refetch();
			})
			.catch(() => {
				toast.error("Error to save the build type");
			});
	};

	return (
		<Card className="group relative w-full bg-transparent">
			<CardHeader>
				<CardTitle className="flex items-start justify-between">
					<div className="flex flex-col gap-2">
						<span className="flex flex-col space-y-0.5">Build Type</span>
						<p className="flex items-center text-sm font-normal text-muted-foreground">
							Select the way of building your code
						</p>
					</div>
					<div className="hidden space-y-1 text-sm font-normal md:block">
						<Cog className="size-6 text-muted-foreground" />
					</div>
				</CardTitle>
			</CardHeader>
			<CardContent>
				<Form {...form}>
					<form
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-4 p-2"
					>
						<FormField
							control={form.control}
							name="buildType"
							defaultValue={form.control._defaultValues.buildType}
							render={({ field }) => {
								return (
									<FormItem className="space-y-3">
										<FormLabel>Build Type</FormLabel>
										<FormControl>
											<RadioGroup
												onValueChange={field.onChange}
												value={field.value}
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
													<FormLabel className="font-normal">
														Nixpacks
													</FormLabel>
												</FormItem>
												<FormItem className="flex items-center space-x-3 space-y-0">
													<FormControl>
														<RadioGroupItem value="heroku_buildpacks" />
													</FormControl>
													<FormLabel className="font-normal">
														Heroku Buildpacks
													</FormLabel>
												</FormItem>
												<FormItem className="flex items-center space-x-3 space-y-0">
													<FormControl>
														<RadioGroupItem value="paketo_buildpacks" />
													</FormControl>
													<FormLabel className="font-normal">
														Paketo Buildpacks
													</FormLabel>
												</FormItem>
											</RadioGroup>
										</FormControl>
										<FormMessage />
									</FormItem>
								);
							}}
						/>
						{buildType === "dockerfile" && (
							<FormField
								control={form.control}
								name="dockerfile"
								render={({ field }) => {
									return (
										<FormItem>
											<FormLabel>Docker File</FormLabel>
											<FormControl>
												<Input
													placeholder={"Path of your docker file"}
													{...field}
													value={field.value ?? ""}
												/>
											</FormControl>

											<FormMessage />
										</FormItem>
									);
								}}
							/>
						)}
						<div className="flex w-full justify-end">
							<Button isLoading={isLoading} type="submit">
								Save
							</Button>
						</div>
					</form>
				</Form>
			</CardContent>
		</Card>
	);
};
