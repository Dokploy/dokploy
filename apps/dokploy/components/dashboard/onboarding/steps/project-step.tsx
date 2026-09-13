import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/utils/api";
import { displayFont } from "../font";

const schema = z.object({
	name: z.string().min(1, "Name is required"),
	description: z.string().optional(),
});
type Schema = z.infer<typeof schema>;

interface Props {
	onNext: (project: { projectId: string; environmentId: string }) => void;
	/** Drops the onboarding wizard's display serif for callers (e.g. the
	 * post-checkout welcome modal) that want the app's regular typography. */
	plainTitle?: boolean;
}

export const ProjectStep = ({ onNext, plainTitle }: Props) => {
	const titleClassName = plainTitle
		? "text-xl font-semibold tracking-tight"
		: `${displayFont.className} text-4xl sm:text-5xl leading-[1.05] tracking-tight`;
	const { mutateAsync, isPending } = api.project.create.useMutation();
	const utils = api.useUtils();

	const form = useForm<Schema>({
		defaultValues: { name: "My First Project", description: "" },
		resolver: zodResolver(schema),
	});

	const onSubmit = async (data: Schema) => {
		try {
			const result = await mutateAsync(data);
			await utils.project.all.invalidate();
			toast.success("Project created");
			onNext({
				projectId: result.project.projectId,
				environmentId: result.environment?.environmentId ?? "",
			});
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Error creating the project",
			);
		}
	};

	return (
		<div className="flex flex-col gap-10">
			<div className="flex flex-col gap-4">
				<span className="font-mono text-xs uppercase tracking-[0.2em] text-primary">
					Workspace
				</span>
				<h1 className={titleClassName}>Create your first project.</h1>
				<p className="text-muted-foreground text-lg max-w-md leading-relaxed">
					Projects group your apps, databases and environments together.
				</p>
			</div>

			<Form {...form}>
				<form
					onSubmit={form.handleSubmit(onSubmit)}
					className="flex flex-col gap-5 max-w-sm"
				>
					<FormField
						control={form.control}
						name="name"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Name</FormLabel>
								<FormControl>
									<Input placeholder="My First Project" {...field} />
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
								<FormLabel>Description (optional)</FormLabel>
								<FormControl>
									<Textarea
										placeholder="What is this project for?"
										className="resize-none"
										{...field}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					<Button
						type="submit"
						isLoading={isPending}
						className="w-fit px-8 mt-2"
					>
						Create project
					</Button>
				</form>
			</Form>
		</div>
	);
};
