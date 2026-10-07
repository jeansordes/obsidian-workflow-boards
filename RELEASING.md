# Releases and Community submission

1. Run `npm ci && npm run check`.
2. Test installation in a clean Obsidian vault: save settings, open all three views, create a task, organize it, log and restart a recurring task, disable/re-enable the plugin and confirm view cleanup. Test mobile before claiming mobile verification.
3. Set the same x.y.z version in `package.json`, `package-lock.json` and `manifest.json`; add its minimum app version to `versions.json`.
4. Push a matching tag (without a v prefix). The release workflow creates a draft with `main.js`, `manifest.json` and `styles.css`. Review and publish it as a regular release; the Community directory does not currently detect GitHub prereleases.
5. For the first Community listing, sign into https://community.obsidian.md with an Obsidian account, link the repository owner's GitHub account, and add the repository. Resolve scanner feedback and publish through the portal. A GitHub release alone is not a Community listing.

Official instructions: https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin

## Initial release verification status

- Automated engine, schema, creation and CRM tests: passed.
- Build and dependency audit: passed.
- Manual Obsidian desktop and mobile validation: pending.
- Community listing published; automated review of 0.1.1 passed, including byte-for-byte build verification.
- Non-blocking recommendations: artifact attestations and vault file enumeration. Artifact attestation workflow changes require owner approval for additional GitHub Actions permissions.

Future support requires someone to review issues, test Obsidian compatibility and publish fixes; a repository and CI do not themselves provide ongoing maintenance.
