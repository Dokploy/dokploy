```
npm install
npm run dev
```

```
open http://localhost:3000
```

## Inngest

This service uses Inngest to queue deployments. Run the local dev server in a separate terminal:

```
npm run dev:inngest
```

It syncs with the app at `http://localhost:4000/api/inngest` and serves its dashboard at `http://localhost:8288`.
