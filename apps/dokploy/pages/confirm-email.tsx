import { OnboardingLayout } from "@/components/layouts/onboarding-layout";
import { Logo } from "@/components/shared/logo";
import { CardDescription, CardTitle } from "@/components/ui/card";
import { db } from "@/server/db";
import { auth } from "@/server/db/schema";
import { IS_CLOUD, updateAuthById } from "@dokploy/server";
import { isBefore } from "date-fns";
import { eq } from "drizzle-orm";
import type { GetServerSidePropsContext } from "next";
import Link from "next/link";
import type { ReactElement } from "react";

export default function Home() {
	return (
		<div className="flex  h-screen w-full items-center justify-center ">
			<div className="flex flex-col items-center gap-4 w-full">
				<Link href="/" className="flex flex-row items-center gap-2">
					<Logo />
					<span className="font-medium text-sm">Dokploy</span>
				</Link>
				<CardTitle className="text-2xl font-bold">Email Confirmed</CardTitle>
				<CardDescription>
					Congratulations, your email is confirmed.
				</CardDescription>
				<div>
					<Link href="/" className="w-full text-primary">
						Click here to login
					</Link>
				</div>
			</div>
		</div>
	);
}

Home.getLayout = (page: ReactElement) => {
	return <OnboardingLayout>{page}</OnboardingLayout>;
};
export async function getServerSideProps(context: GetServerSidePropsContext) {
	if (!IS_CLOUD) {
		return {
			redirect: {
				permanent: true,
				destination: "/",
			},
		};
	}
	const { token } = context.query;

	if (typeof token !== "string") {
		return {
			redirect: {
				permanent: true,
				destination: "/",
			},
		};
	}

	const authR = await db.query.auth.findFirst({
		where: eq(auth.confirmationToken, token),
	});

	if (
		!authR ||
		authR?.confirmationToken === null ||
		authR?.confirmationExpiresAt === null
	) {
		return {
			redirect: {
				permanent: true,
				destination: "/",
			},
		};
	}

	const isExpired = isBefore(new Date(authR.confirmationExpiresAt), new Date());

	if (isExpired) {
		return {
			redirect: {
				permanent: true,
				destination: "/",
			},
		};
	}

	await updateAuthById(authR.id, {
		confirmationToken: null,
		confirmationExpiresAt: null,
	});

	return {
		props: {
			token: authR.confirmationToken,
		},
	};
}
