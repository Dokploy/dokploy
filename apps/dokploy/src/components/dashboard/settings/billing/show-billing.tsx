import { CreditCard } from "lucide-react";

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

export const ShowBilling = () => {
	return (
		<div className="flex flex-1 flex-col w-full">
			<Card className="flex flex-1 flex-col bg-sidebar p-2.5 rounded-xl max-w-5xl mx-auto w-full">
				<div className="flex flex-1 flex-col rounded-xl bg-background shadow-md">
					<CardHeader>
						<CardTitle className="text-xl flex flex-row gap-2">
							<CreditCard className="size-6 text-muted-foreground self-center" />
							Billing
						</CardTitle>
						<CardDescription>
							Stripe отключён. Выполняется миграция на T‑Касса.
						</CardDescription>
					</CardHeader>
					<CardContent className="py-6 border-t text-sm text-muted-foreground">
						Новый интерфейс управления подпиской будет добавлен в следующих шагах.
					</CardContent>
				</div>
			</Card>
		</div>
	);
};

