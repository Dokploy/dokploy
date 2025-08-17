import { findGitlabById, updateGitlab } from "@dokploy/server";
import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse,
) {
	const { code, gitlabId } = req.query;

	if (!code || Array.isArray(code)) {
		return res.status(400).json({ error: "Missing or invalid code" });
	}

	const gitlab = await findGitlabById(gitlabId as string);
	const gitlabUrl = new URL(gitlab.gitlabUrl);

	const headers: HeadersInit = {
		"Content-Type": "application/x-www-form-urlencoded",
	};

	// In case of basic auth being present in the URL, we need to remove it from the URL
	// and add it to the Authorization header.
	if (gitlabUrl.username && gitlabUrl.password) {
		headers.Authorization = `Basic ${Buffer.from(`${gitlabUrl.username}:${gitlabUrl.password}`).toString("base64")}`;
	}

	const url =
		gitlabUrl.username && gitlabUrl.password
			? new URL(gitlabUrl, {
					...gitlabUrl,
					username: "",
					password: "",
				}).toString()
			: gitlabUrl.toString();

	const response = await fetch(`${url}/oauth/token`, {
		method: "POST",
		headers,
		body: new URLSearchParams({
			client_id: gitlab.applicationId as string,
			client_secret: gitlab.secret as string,
			code: code as string,
			grant_type: "authorization_code",
			redirect_uri: `${gitlab.redirectUri}?gitlabId=${gitlabId}`,
		}),
	});

	const result = await response.json();

	if (!result.access_token || !result.refresh_token) {
		return res.status(400).json({ error: "Missing or invalid code" });
	}

	const expiresAt = Math.floor(Date.now() / 1000) + result.expires_in;
	await updateGitlab(gitlab.gitlabId, {
		accessToken: result.access_token,
		refreshToken: result.refresh_token,
		expiresAt,
	});

	return res.redirect(307, "/dashboard/settings/git-providers");
}
