# What to send

The application form asks for two things.

1. A public GitHub repo.
2. `DESIGN.md` at the root of that repo. It is already written: how a turn works, why it is built this way, what was rejected, and what another week would add.

Paste the repo link into the form. There is no due date. A later submission still gets a chance if the architecture beats the ones already in.

## Before the repo is public

- `npm run eval` prints 30/30.
- `npm install` then `npm run dev` is the only setup, plus the two keys in `.env.example`.
- `.env` is gitignored. Do not commit it. `data/` and `traces/` are gitignored too.
- `DESIGN.md` stays one page. `demo/ARCHITECTURE.md` is the same design in the order a turn runs, for the recording. The form asked for `DESIGN.md`, not a second design document.

## The video

`demo/minimis.mp4` is the walkthrough. `demo/SCRIPT.md` is the narration. The form text we have asks for the repo, not a video. Attach the mp4 only if the form has a place for it. Otherwise the file in the repo is enough for someone who clones it.

Record again with `node scripts/record-demo.mjs` while `npm run dev` is running. That command needs Playwright and ffmpeg, which are not dependencies of the app, so a judge's `npm install` stays the same.

## Publish

Create an empty public GitHub repo, then from this folder:

```bash
git init
git add .
git status
git commit -m "Add the search chat, the design note, and the eval."
git branch -M main
git remote add origin https://github.com/YOU/minimis.git
git push -u origin main
```

Check `git status` before the commit and confirm `.env` is not listed.
