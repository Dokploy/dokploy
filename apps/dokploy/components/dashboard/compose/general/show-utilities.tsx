import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTranslation } from "next-i18next";
import { useState } from "react";
import { IsolatedDeployment } from "./isolated-deployment";
import { RandomizeCompose } from "./randomize-compose";

interface Props {
	composeId: string;
}

export const ShowUtilities = ({ composeId }: Props) => {
	const { t } = useTranslation("dashboard");
	const [isOpen, setIsOpen] = useState(false);
	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button variant="ghost">{t("dashboard.compose.showUtilities")}</Button>
			</DialogTrigger>
			<DialogContent className="max-h-screen overflow-y-auto sm:max-w-5xl">
				<DialogHeader>
					<DialogTitle>{t("dashboard.compose.utilities")}</DialogTitle>
					<DialogDescription>
						{t("dashboard.compose.showUtilitiesDescription")}
					</DialogDescription>
				</DialogHeader>
				<Tabs defaultValue="isolated">
					<TabsList className="grid w-full grid-cols-2">
						<TabsTrigger value="isolated">
							{t("dashboard.compose.isolatedDeployment")}
						</TabsTrigger>
						<TabsTrigger value="randomize">
							{t("dashboard.compose.randomizeCompose")}
						</TabsTrigger>
					</TabsList>
					<TabsContent value="randomize" className="pt-5">
						<RandomizeCompose composeId={composeId} />
					</TabsContent>
					<TabsContent value="isolated" className="pt-5">
						<IsolatedDeployment composeId={composeId} />
					</TabsContent>
				</Tabs>
			</DialogContent>
		</Dialog>
	);
};
