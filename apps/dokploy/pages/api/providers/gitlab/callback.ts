import {
	getGitlabProvider,
	updateGitlabProvider,
} from "@/server/api/services/git-provider";
import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse,
) {
	console.log(req.body);
	const { code, gitlabId } = req.query;

	if (!code || Array.isArray(code)) {
		return res.status(400).json({ error: "Missing or invalid code" });
	}

	const gitlab = await getGitlabProvider(gitlabId as string);

	const response = await fetch("https://gitlab.com/oauth/token", {
		method: "POST",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
		},
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

	const updatedGiltab = await updateGitlabProvider(gitlab.gitlabProviderId, {
		accessToken: result.access_token,
		refreshToken: result.refresh_token,
	});

	return res.redirect(307, "/dashboard/settings/git-providers");
}
// b7262a56a0e84690d6352e07147e0cc4ff862818efe93a5fc7a12dc99a1382fd
// {
// 	accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
// 	host: 'localhost:3000',
// 	'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
// 	'accept-encoding': 'gzip, deflate, br, zstd',
// 	'accept-language': 'es-ES,es;q=0.9',
// 	'cache-control': 'max-age=0',
// 	referer: 'https://gitlab.com/',
// 	'x-request-id': '3e925ffc549f9a3d3ef5d5f376c2a6f0',
// 	'x-real-ip': '10.240.3.64',
// 	'x-forwarded-port': '443',
// 	'x-forwarded-scheme': 'https',
// 	'x-original-uri': '/api/providers/gitlab/callback?code=f26181b5c7397444ace5211f9ac4683b2d7bd64cd9431e85d3b6b4722827fabf',
// 	'x-scheme': 'https',
// 	'sec-fetch-site': 'cross-site',
// 	'sec-fetch-mode': 'navigate',
// 	'sec-fetch-user': '?1',
// 	'sec-fetch-dest': 'document',
// 	'sec-ch-ua': '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"',
// 	'sec-ch-ua-mobile': '?0',
// 	'sec-ch-ua-platform': '"macOS"',
// 	priority: 'u=0, i',
// 	'x-original-proto': 'https',
// 	cookie: 'rl_anonymous_id=RS_ENC_v3_IjEzMzVhYzg0LTIyYjctNGExNi04YzE5LTg4M2ZiOTEwMTRmYSI%3D; rl_page_init_referrer=RS_ENC_v3_IiRkaXJlY3Qi; __adroll_fpc=7113966cdd8d59aba5e5ef62ff22c535-1715634343969; rl_session=RS_ENC_v3_eyJpZCI6MTcxNTYzNDM0Mzc1NiwiZXhwaXJlc0F0IjoxNzE1NjM3MDY5NDg1LCJ0aW1lb3V0IjoxODAwMDAwLCJhdXRvVHJhY2siOnRydWV9; _ga_65LBX6LVJK=GS1.1.1715634344.1.1.1715635269.0.0.0; __ar_v4=FZBVRO7FTNEL3NZLTQLETP%3A20240512%3A9%7CJTXM2THZSJHDPEH4IPCBUU%3A20240512%3A9%7CFPP3PVDSUZBVHNEE67AUWV%3A20240512%3A9; auth_session=ih5fycwxzb5qkubabuc7u4qvz3wn2cfjzjdnigdh',
// 	'x-forwarded-proto': 'https',
// 	'x-forwarded-host': 'mcnknfld-3000.use2.devtunnels.ms',
// 	'x-forwarded-for': '10.240.3.64',
// 	'proxy-connection': 'Keep-Alive',
// 	'x-middleware-invoke': '',
// 	'x-invoke-path': '/api/providers/gitlab/callback',
// 	'x-invoke-query': '%7B%22code%22%3A%22f26181b5c7397444ace5211f9ac4683b2d7bd64cd9431e85d3b6b4722827fabf%22%2C%22__nextDefaultLocale%22%3A%22en%22%2C%22__nextLocale%22%3A%22en%22%7D',
// 	'x-invoke-output': '/api/providers/gitlab/callback'
//   }
