# Crappy Bird

A Flappy Bird-inspired game built with TypeScript, Vite, and the HTML canvas. The project is static, so it works well in a normal GitHub repo and deploys cleanly on Vercel.

## Local development

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
```

The production output is written to `dist/`.

## GitHub setup

```bash
git add .
git commit -m "Build Crappy Bird"
git branch -M main
git remote add origin https://github.com/<your-user>/<your-repo>.git
git push -u origin main
```

## Vercel deployment

1. Push the repo to GitHub.
2. Import the repository into Vercel.
3. Vercel should detect `Vite` automatically.
4. Build command: `npm run build`
5. Output directory: `dist`

After that, each push to GitHub can trigger a fresh deployment.
