import { validateRequest } from "@dokploy/server";
import { createServerSideHelpers } from "@trpc/react-query/server";
import type { GetServerSidePropsContext, NextPage } from "next";
import dynamic from "next/dynamic";
import { appRouter } from "@/server/api/root";
import { api } from "@/utils/api";
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
			<SwaggerUI
				spec={spec}
				persistAuthorization={true}
				plugins={[
					{
						statePlugins: {
							auth: {
								wrapActions: {
									authorize: (ori: any) => (args: any) => {
										const result = ori(args);
										const apiKey = args?.apiKey?.value;
										if (apiKey) {
											localStorage.setItem("swagger_api_key", apiKey);
										}
										return result;
									},
									logout: (ori: any) => (args: any) => {
										const result = ori(args);
										localStorage.removeItem("swagger_api_key");
										return result;
									},
								},
							},
						},
					},
				]}
				requestInterceptor={(request: any) => {
					const apiKey = localStorage.getItem("swagger_api_key");
					if (apiKey) {
						request.headers = request.headers || {};
						request.headers["x-api-key"] = apiKey;
					}
					return request;
				}}
			/>
		</div>
	);
};

export default Home;
export async function getServerSideProps(context: GetServerSidePropsContext) {
	const { req, res } = context;
	const { user, session } = await validateRequest(context.req);
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
			session: session as any,
			user: user as any,
		},
		transformer: superjson,
	});
	if (user.role === "member") {
		const userR = await helpers.user.one.fetch({
			userId: user.id,
		});

		if (!userR?.canAccessToAPI) {
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
