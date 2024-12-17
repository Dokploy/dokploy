import { appRouter } from "@/server/api/root";
import { api } from "@/utils/api";
import { validateRequest } from "@dokploy/server";
import { createServerSideHelpers } from "@trpc/react-query/server";
import type { GetServerSidePropsContext, NextPage } from "next";
import dynamic from "next/dynamic";
import "swagger-ui-react/swagger-ui.css";
import { useEffect, useState } from "react";
import superjson from "superjson";

const SwaggerUI = dynamic(() => import("swagger-ui-react"), { ssr: false });

const Home: NextPage = () => {
	const { data } = api.settings.getOpenApiDocument.useQuery();
	const [spec, setSpec] = useState({});

	useEffect(() => {
		if (data) {
			const protocolAndHost = `${window.location.protocol}//${window.location.host}/api`;
			const newSpec = {
				...data,
				servers: [{ url: protocolAndHost }],
				externalDocs: {
					url: `${protocolAndHost}/settings.getOpenApiDocument`,
				},
			};
			setSpec(newSpec);
		}
	}, [data]);

	return (
		<div className="h-screen bg-white">
			<SwaggerUI spec={spec} />
		</div>
	);
};

export default Home;
export async function getServerSideProps(context: GetServerSidePropsContext) {
	const { req, res } = context;
	const { user, session } = await validateRequest(context.req, context.res);
	if (!user) {
		return {
			redirect: {
				permanent: true,
				destination: "/",
			},
		};
	}
	const helpers = createServerSideHelpers({
		router: appRouter,
		ctx: {
			req: req as any,
			res: res as any,
			db: null as any,
			session: session,
			user: user,
		},
		transformer: superjson,
	});
	if (user.rol === "user") {
		const result = await helpers.user.byAuthId.fetch({
			authId: user.id,
		});

		if (!result.canAccessToAPI) {
			return {
				redirect: {
					permanent: true,
					destination: "/",
				},
			};
		}
	}

	return {
		props: {},
	};
}
