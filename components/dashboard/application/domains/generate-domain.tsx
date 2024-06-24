import React from "react";
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
import { Button } from "@/components/ui/button";
import { api } from "@/utils/api";
import { RefreshCcw, TrashIcon } from "lucide-react";
import { toast } from "sonner";

interface Props {
	applicationId: string;
}
export const GenerateDomain = ({ applicationId }: Props) => {
	const { mutateAsync, isLoading } = api.domain.generateDomain.useMutation();
	const utils = api.useUtils();
	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button variant="secondary" isLoading={isLoading}>
					Generate Domain
					<RefreshCcw className="size-4  text-muted-foreground " />
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						Are you sure to generate a new domain?
					</AlertDialogTitle>
					<AlertDialogDescription>
						This will generate a new domain and will be used to access to the
						application
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						onClick={async () => {
							await mutateAsync({
								applicationId,
							})
								.then((data) => {
									utils.domain.byApplicationId.invalidate({
										applicationId: applicationId,
									});
									utils.application.readTraefikConfig.invalidate({
										applicationId: applicationId,
									});
									toast.success("Generated Domain succesfully");
								})
								.catch(() => {
									toast.error("Error to generate Domain");
								});
						}}
					>
						Confirm
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
};
