#!/bin/bash
# Instantané de l'état des 3 PR Dokploy suivies + de canary.
R=dokploy/dokploy
for n in 5154 5257 5258; do
  gh pr view "$n" --repo "$R" --json number,state,mergeable,reviewDecision,mergedAt,closedAt,commits,statusCheckRollup,labels,updatedAt \
    --jq '"pr\(.number).state=\(.state)
pr\(.number).mergeable=\(.mergeable)
pr\(.number).decision=\(.reviewDecision // "none")
pr\(.number).merged=\(.mergedAt // "no")
pr\(.number).closed=\(.closedAt // "no")
pr\(.number).head=\(.commits[-1].oid[0:9])
pr\(.number).commits=\(.commits|length)
pr\(.number).ci=\([.statusCheckRollup[]? | "\(.name // .context):\(.conclusion // .state)"] | sort | join(","))
pr\(.number).labels=\([.labels[]?.name] | sort | join(","))
pr\(.number).updated=\(.updatedAt)"'
  echo "pr$n.reviews=$(gh api "repos/$R/pulls/$n/reviews" --jq 'length')"
  echo "pr$n.inline=$(gh api "repos/$R/pulls/$n/comments" --jq 'length')"
  echo "pr$n.comments=$(gh api "repos/$R/issues/$n/comments" --jq 'length')"
  echo "pr$n.lastactor=$(gh api "repos/$R/issues/$n/comments" --jq '[.[].user.login] | last // "none"')"
done
# Issues suivies : #5344 (bug Stripe canary), #5256 (feature request OVH, se
# fermera au merge de #5258). Les commentaires y sont invisibles côté PR.
for i in 5344 5256; do
  gh issue view "$i" --repo "$R" --json number,state,updatedAt,labels \
    --jq '"issue\(.number).state=\(.state)
issue\(.number).updated=\(.updatedAt)
issue\(.number).labels=\([.labels[]?.name] | sort | join(","))"'
  echo "issue$i.comments=$(gh api "repos/$R/issues/$i/comments" --jq 'length')"
  echo "issue$i.lastactor=$(gh api "repos/$R/issues/$i/comments" --jq '[.[].user.login] | last // "none"')"
done
echo "canary.head=$(gh api "repos/$R/commits/canary" --jq '.sha[0:9]')"
echo "canary.lastmigration=$(gh api "repos/$R/contents/apps/dokploy/drizzle/meta/_journal.json?ref=canary" --jq '.content' | base64 -d | python3 -c 'import json,sys; print(json.load(sys.stdin)["entries"][-1]["tag"])')"
