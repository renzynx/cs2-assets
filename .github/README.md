# CS2 Assets Tracker

Modified version of [ByMykel/counter-strike-image-tracker](https://github.com/ByMykel/counter-strike-image-tracker) that extracts CS2 assets using DepotDownloader and Source2Viewer CLI.

## Extracted Asset Folders

The tool extracts only these specific CS2 asset folders:

- `panorama/images/econ/characters`
- `panorama/images/econ/default_generated`
- `panorama/images/econ/music_kits`
- `panorama/images/econ/patches`
- `panorama/images/econ/season_icons`
- `panorama/images/econ/set_icons`
- `panorama/images/econ/status_icons`
- `panorama/images/econ/stickers`
- `panorama/images/econ/tools`
- `panorama/images/econ/weapons`
- `panorama/images/econ/weapon_cases`
- `panorama/images/econ/tournaments`
- `panorama/images/econ/premier_seasons`

## GitHub Actions Setup

This project is configured to run automatically using GitHub Actions to check for CS2 asset updates.

### Setting up Secrets

To use the automated workflow, you need to set up the following GitHub repository secrets:

1. Go to your repository on GitHub
2. Click on **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret** and add the following secrets:

- `STEAM_USERNAME`: Your Steam account username
- `STEAM_PASSWORD`: Your Steam account password

**Important**: Make sure your Steam account has access to CS2 and consider using a dedicated Steam account for automation purposes.

### Running the Workflow

The workflow will automatically run:

- Every 6 hours to check for updates
- Manually via the "Actions" tab with an optional force flag

### Local Development

If you want to run this locally, you can set environment variables:

```bash
# Windows (PowerShell)
$env:STEAM_USERNAME="your_steam_username"
$env:STEAM_PASSWORD="your_steam_password"
npm start

# Linux/macOS
export STEAM_USERNAME="your_steam_username"
export STEAM_PASSWORD="your_steam_password"
npm start
```

Add `--force` flag to force update even if manifest ID hasn't changed:

```bash
npm run extract
# or
node src/index.js --force
```

### Available Scripts

```bash
npm start       # Run the main application
npm run extract # Force update and extract assets
```

## Dependencies

- `vpk`: For handling Valve VPK files
- **DepotDownloader**: Automatically downloaded CLI tool for Steam content downloads
- **Source2Viewer**: Automatically downloaded CLI tool for Source 2 asset decompilation

Install dependencies with:

```bash
npm install
```
