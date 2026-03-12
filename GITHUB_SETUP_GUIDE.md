# GitHub Setup Guide

This file shows the easiest way to publish this project as a clean GitHub repository.

## Best repository name

`ens-free-trial-subdomain-registrar`

## Best description

`Free 30-day ENS subname trial registrar with no child grace period and no child-owner renewals.`

## Option A: Create the repository in the GitHub web UI

1. Go to GitHub.
2. Click **New repository**.
3. Choose the correct owner (your personal account or your organization).
4. Repository name: `ens-free-trial-subdomain-registrar`
5. Visibility:
   - **Private** if this is still under internal review.
   - **Public** if you want outside auditing and transparency.
6. **Do not pre-initialize** the repository with a README, `.gitignore`, or license if you are pushing this local folder as-is.
7. Click **Create repository**.

## Option B: Create it with GitHub CLI

From inside this project folder:

```bash
gh repo create your-org/ens-free-trial-subdomain-registrar --private --source=. --remote=origin --push
```

If you want a public repo instead:

```bash
gh repo create your-org/ens-free-trial-subdomain-registrar --public --source=. --remote=origin --push
```

## If you prefer plain Git commands

After creating the empty repo on GitHub:

```bash
git init
git add .
git commit -m "Initial commit: ENS Free Trial Subdomain Registrar"
git branch -M main
git remote add origin git@github.com:your-org/ens-free-trial-subdomain-registrar.git
git push -u origin main
```

## Recommended repository settings after the first push

### Protect `main`

Turn on branch protection or a ruleset for `main` and require:

- pull requests before merge
- the CI workflow to pass
- conversation resolution before merge
- no force pushes
- no branch deletion

### Turn on security features

For a public repo, turn on at least:

- Dependabot alerts
- secret scanning
- push protection
- code scanning

### Add reviewers

If this is an organization repo, add at least:

- one smart-contract reviewer
- one ENS/domain reviewer
- one ops/deployment reviewer

## Suggested first tags and releases

- `v1.0.0-rc1` for the audited candidate
- `v1.0.0` for the production release

## Suggested branch model

- `main` = reviewed, deployable code only
- feature branches = all active work
- release branches only if your team already uses them

## Suggested first pull request title

`chore: publish ENS Free Trial Subdomain Registrar`
