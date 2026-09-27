# Git and GitHub workflow

## 1. First-time setup (once)

Install Git (https://git-scm.com) and tell it who you are:

```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

## 2. Put the project on GitHub

This folder is already a Git repository with the first commit made.

1. On GitHub, click **New repository**. Name it `outbreak-overkill`. Leave "Add a README", ".gitignore" and "license" **unticked** (the repo already has them).
2. In a terminal inside this folder:

```bash
git remote add origin https://github.com/<your-username>/outbreak-overkill.git
git push -u origin main
```

GitHub may ask you to sign in; the GitHub CLI (`gh auth login`) or GitHub Desktop both make this painless.

## 3. Turn on GitHub Pages (a public link to play)

Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**. The workflow in `.github/workflows/pages.yml` then publishes the game on every push to `main`, at `https://<your-username>.github.io/outbreak-overkill/`. Check progress under the **Actions** tab.

## 4. Day-to-day: one branch per feature

`main` should always be playable. New work happens on a branch:

```bash
git switch main
git pull
git switch -c feature/weapon-evolutions     # new branch

# ...edit, play-test, repeat...

git add -A
git commit -m "Add weapon evolution system"
git push -u origin feature/weapon-evolutions
```

Then open a **Pull Request** on GitHub (or `gh pr create`), read the diff, play the branch locally one more time, and merge. Delete the branch after merging.

Branch name prefixes:

| Prefix | For |
| --- | --- |
| `feature/` | new content or systems (`feature/spitter-enemy`) |
| `fix/` | bugs (`fix/knife-hitbox`) |
| `balance/` | number tweaks only (`balance/wave-7-hounds`) |
| `art/`, `audio/` | asset work |
| `chore/` | tooling, docs, refactors |

## 5. Commit messages

Short imperative summary, under ~60 characters, optional body explaining why:

```
Add Bloater acid pool on death

Bloaters now leave a 3s bile pool so killing them in melee range
has a cost. Pool damage is in OO.ENEMIES.bloater.explode.
```

Commit small and often. A commit per working step makes it easy to undo one thing without losing the rest.

## 6. Releases

When a batch of features is stable:

1. Bump `OO.VERSION` in `js/config.js` and `version` in `package.json`.
2. Add an entry to `CHANGELOG.md`.
3. Tag it:

```bash
git tag -a v0.2.0 -m "v0.2.0: weapon evolutions, meta shop"
git push --tags
```

4. Optionally run `npm run bundle` and attach `dist/outbreak-overkill.html` to a GitHub Release.

## 7. Useful commands

```bash
git status                 # what changed
git diff                   # see the changes
git log --oneline --graph  # history
git restore <file>         # throw away uncommitted edits to a file
git switch -               # jump back to the previous branch
git stash / git stash pop  # park work-in-progress temporarily
```
