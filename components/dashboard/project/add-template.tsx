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
import { AlertBlock } from "@/components/shared/alert-block";
import { api } from "@/utils/api";
import { Github, Globe, PuzzleIcon } from "lucide-react";
import { toast } from "sonner";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import Link from "next/link";

interface Props {
	projectId: string;
}

export const AddTemplate = ({ projectId }: Props) => {
	const utils = api.useUtils();
	const { data } = api.compose.templates.useQuery();

	const { mutateAsync, isLoading, error, isError } =
		api.compose.deployTemplate.useMutation();

	return (
		<Dialog>
			<DialogTrigger className="w-full">
				<DropdownMenuItem
					className="w-full cursor-pointer space-x-3"
					onSelect={(e) => e.preventDefault()}
				>
					<PuzzleIcon className="size-4 text-muted-foreground" />
					<span>Templates</span>
				</DropdownMenuItem>
			</DialogTrigger>
			<DialogContent className="max-h-screen  overflow-y-auto sm:max-w-7xl">
				<DialogHeader>
					<DialogTitle>Create Template</DialogTitle>
					<DialogDescription>
						Deploy a open source template to your project
					</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}

				<div
					id="hook-form"
					className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 w-full gap-4"
				>
					{data?.map((template, index) => (
						<AlertDialog key={`template-${index}`}>
							<AlertDialogTrigger asChild>
								<div
									key={template.name}
									className="flex flex-col gap-4 border p-6 rounded-lg hover:bg-card/20 cursor-pointer transition-colors"
								>
									<div className="flex flex-col gap-4">
										<div className="flex flex-col items-center gap-2">
											<img
												src={template.logo}
												className="size-20 object-contain"
												alt=""
											/>
										</div>

										<div className="flex flex-col gap-2">
											<div className="flex flex-col gap-2">
												<span>{template.name}</span>
												<div className="flex flex-row gap-2">
													<Link
														href={template.links.github}
														target="_blank"
														className="text-sm text-muted-foreground"
													>
														<Github className="size-4 text-muted-foreground" />
													</Link>
													<Link
														href={template.links.docs}
														target="_blank"
														className="text-sm text-muted-foreground"
													>
														<Globe className="size-4 text-muted-foreground" />
													</Link>
												</div>
											</div>

											<p className="text-sm text-muted-foreground">
												{template.description}
											</p>
										</div>
									</div>
								</div>
							</AlertDialogTrigger>
							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>
										Are you absolutely sure to deploy {template.name} to your
										project?
									</AlertDialogTitle>
									<AlertDialogDescription>
										This action cannot be undone. Automatically will setup the
										template in your project.
									</AlertDialogDescription>
								</AlertDialogHeader>
								<AlertDialogFooter>
									<AlertDialogCancel>Cancel</AlertDialogCancel>
									<AlertDialogAction
										onClick={async () => {
											if (!template.folder) {
												toast.error(
													"This template doest not have a folder specified",
												);
												return;
											}
											await mutateAsync({
												folder: template.folder,
												projectId,
											})
												.then(async () => {
													toast.success("Template Created");
													await utils.project.one.invalidate({
														projectId,
													});
												})
												.catch(() => {
													toast.error("Error to create the template");
												});
										}}
									>
										Continue
									</AlertDialogAction>
								</AlertDialogFooter>
							</AlertDialogContent>
						</AlertDialog>
					))}
				</div>
			</DialogContent>
		</Dialog>
	);
};
