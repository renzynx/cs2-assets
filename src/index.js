/**
 * CS2 Assets Tracker - Enhanced version with DepotDownloader for reliable Steam downloads
 * Original from ByMykel/counter-strike-image-tracker modified for WebP conversion and reliability
 * https://github.com/ByMykel/counter-strike-image-tracker/blob/main/index.js
 */

const fs = require("fs");
const path = require("path");
const { StreamingVPKProcessor } = require("./streamingExtractor");
const { DepotDownloader } = require("./depotDownloader");

const appId = 730;
const depotId = 2347770;
const dir = `./static`;
const temp = "./temp";
const manifestIdFile = "manifest.txt";

const vpkFolders = [
  "panorama/images/econ/characters",
  "panorama/images/econ/default_generated",
  "panorama/images/econ/music_kits",
  "panorama/images/econ/patches",
  "panorama/images/econ/season_icons",
  "panorama/images/econ/set_icons",
  "panorama/images/econ/status_icons",
  "panorama/images/econ/stickers",
  "panorama/images/econ/tools",
  "panorama/images/econ/weapons",
  "panorama/images/econ/weapon_cases",
  "panorama/images/econ/tournaments",
  "panorama/images/econ/premier_seasons",
];

const steamUsername = process.env.STEAM_USERNAME;
const steamPassword = process.env.STEAM_PASSWORD;

if (!steamUsername || !steamPassword) {
  console.error(
    "❌ Missing Steam credentials. Please set STEAM_USERNAME and STEAM_PASSWORD environment variables."
  );
  process.exit(1);
}

const forceFlag = process.argv.includes("--force");

// Create directories
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

if (!fs.existsSync(temp)) {
  fs.mkdirSync(temp, { recursive: true });
}

// Initialize DepotDownloader
const depotDownloader = new DepotDownloader({
  username: steamUsername,
  password: steamPassword,
  tempDir: temp,
  downloadAttempts: 3,
});

async function main() {
  console.log("🚀 Starting CS2 asset download and conversion...");

  try {
    console.log("🔍 Checking for latest CS2 manifest...");
    const latestManifestId = await depotDownloader.getLatestManifestId(
      appId,
      depotId
    );

    console.log(`📦 Latest manifest ID: ${latestManifestId}`);

    let existingManifestId = "";

    try {
      existingManifestId = fs
        .readFileSync(`${dir}/${manifestIdFile}`, "utf8")
        .trim();
    } catch (err) {
      if (err.code !== "ENOENT") {
        console.error(`❌ Error reading manifest ID file: ${err.message}`);
        throw err;
      }
    }

    if (existingManifestId === latestManifestId && !forceFlag) {
      console.log(
        "⚠️ Latest manifest ID matches existing manifest ID, exiting."
      );
      process.exit(0);
    }

    console.log(
      "🔄 Manifest ID changed or force flag used, processing files..."
    );

    const processor = new StreamingVPKProcessor(
      depotDownloader,
      dir,
      vpkFolders
    );

    try {
      const results = await processor.processVPKFiles(
        appId,
        depotId,
        latestManifestId
      );
      console.log(`\n🎉 Processing completed successfully!`);
      console.log(`   📦 PNG images extracted: ${results.extracted}`);

      if (results.failed > 0) {
        console.log(`   ❌ Failed operations: ${results.failed}`);
        if (results.errors.length > 0) {
          console.log("\n⚠️ Error details:");
          results.errors.slice(0, 5).forEach((error) => {
            console.log(`   - ${error.file}: ${error.error}`);
          });
          if (results.errors.length > 5) {
            console.log(`   ... and ${results.errors.length - 5} more errors`);
          }
        }
      }
    } catch (error) {
      console.error(`❌ Processing failed: ${error.message}`);
    }

    // Update manifest ID file
    try {
      fs.writeFileSync(`${dir}/${manifestIdFile}`, latestManifestId);
      console.log("✅ Updated manifest ID file.");
    } catch (error) {
      console.error(`❌ Failed to write manifest ID file: ${error.message}`);
    }

    console.log("🎉 CS2 asset download completed successfully!");
  } catch (error) {
    console.error(`❌ Fatal error: ${error.message}`);
    process.exit(1);
  }
}

main();
