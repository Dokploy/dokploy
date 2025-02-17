import {
	type DomainSchema,
	type Schema,
	type Template,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const mainDomain = generateRandomDomain(schema);
	const domains: DomainSchema[] = [
		{
			host: mainDomain,
			port: 8080,
			serviceName: "glance",
		},
	];

	const mounts: Template["mounts"] = [
		{
			filePath: "/app/config/glance.yml",
			content: `
server:
  assets-path: /app/assets

theme:
  custom-css-file: /assets/user.css

pages:
  !include: home.yml`,
		},
    {
			filePath: "/app/config/home.yml",
			content: `
- name: Home
  columns:
    - size: small
      widgets:
        - type: calendar
          first-day-of-week: monday

        - type: rss
          limit: 10
          collapse-after: 3
          cache: 12h
          feeds:
            - url: https://selfh.st/rss/
              title: selfh.st
            - url: https://ciechanow.ski/atom.xml
            - url: https://www.joshwcomeau.com/rss.xml
              title: Josh Comeau
            - url: https://samwho.dev/rss.xml
            - url: https://ishadeed.com/feed.xml
              title: Ahmad Shadeed

        - type: twitch-channels
          channels:
            - theprimeagen
            - j_blow
            - piratesoftware
            - cohhcarnage
            - christitustech
            - EJ_SA

    - size: full
      widgets:
        - type: group
          widgets:
            - type: hacker-news
            - type: lobsters

        - type: videos
          channels:
            - UCXuqSBlHAE6Xw-yeJA0Tunw # Linus Tech Tips
            - UCR-DXc1voovS8nhAvccRZhg # Jeff Geerling
            - UCsBjURrPoezykLs9EqgamOA # Fireship
            - UCBJycsmduvYEL83R_U4JriQ # Marques Brownlee
            - UCHnyfMqiRRG1u-2MsSQLbXA # Veritasium

        - type: group
          widgets:
            - type: reddit
              subreddit: technology
              show-thumbnails: true
            - type: reddit
              subreddit: selfhosted
              show-thumbnails: true

    - size: small
      widgets:
        - type: weather
          location: London, United Kingdom
          units: metric # alternatively "imperial"
          hour-format: 12h # alternatively "24h"

        - type: markets
          symbol-link-template: https://www.tradingview.com/symbols/{SYMBOL}/news
          markets:
            - symbol: SPY
              name: S&P 500
            - symbol: BTC-USD
              name: Bitcoin
            - symbol: NVDA
              name: NVIDIA
            - symbol: AAPL
              name: Apple
            - symbol: MSFT
              name: Microsoft

        - type: releases
          cache: 1d
          repositories:
            - Dokploy/dokploy
            - Dokploy/website
            - immich-app/immich
            - syncthing/syncthing`,
		},
	];

	return {
		domains,
		mounts,
	};
}
