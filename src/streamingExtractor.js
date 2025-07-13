const fs = require("fs");
const path = require("path");
const vpk = require("vpk");
const { Source2Viewer } = require("./source2Viewer");

class StreamingVPKProcessor {
  constructor(depotDownloader, outputDir, vpkFolders) {
    this.depotDownloader = depotDownloader;
    this.outputDir = outputDir;
    this.vpkFolders = vpkFolders;
    this.tempVpkDir = "./temp_vpk";
    this.source2Viewer = new Source2Viewer({ tempDir: this.tempVpkDir });
    this.results = {
      downloaded: 0,
      extracted: 0,
      failed: 0,
      errors: [],
    };
  }

  async processVPKFiles(appId, depotId, manifestId) {
    console.log("🔄 Starting VPK processing...");

    // Ensure temp and output directories exist
    if (!fs.existsSync(this.tempVpkDir)) {
      fs.mkdirSync(this.tempVpkDir, { recursive: true });
    }
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    try {
      // Step 1: Download pak01_dir.vpk first
      console.log("📥 Downloading VPK directory file...");
      const dirResult = await this.depotDownloader.downloadSpecificFiles(
        appId,
        depotId,
        manifestId,
        "csgo/pak01_dir\\.vpk",
        this.tempVpkDir
      );

      if (!dirResult.success) {
        throw new Error(`Failed to download VPK directory: ${dirResult.error}`);
      }

      // Find the downloaded directory file
      const vpkDirPath = this.findVPKDirFile();
      if (!vpkDirPath) {
        throw new Error("Could not find pak01_dir.vpk file");
      }

      console.log("📦 Loading VPK directory structure...");
      const vpkDir = new vpk(vpkDirPath);
      vpkDir.load();

      // Get required VPK archives that contain our target files
      const requiredArchives = this.getRequiredVPKArchives(vpkDir);
      console.log(
        `📦 Need to download ${requiredArchives.length} VPK archives`
      );

      if (requiredArchives.length === 0) {
        console.log("⚠️ No VPK archives contain target files");
        return this.results;
      }

      // Download all required VPK archives first (Source2Viewer needs them all present)
      console.log("📥 Downloading required VPK archives...");
      await this.downloadRequiredArchives(
        appId,
        depotId,
        manifestId,
        requiredArchives
      );

      // Use Source2Viewer to extract target files from all VPKs at once
      console.log("🔧 Extracting files with Source2Viewer...");
      const extractResult = await this.extractWithSource2Viewer(vpkDirPath);

      if (extractResult.success) {
        console.log("✅ Source2Viewer extraction completed");

        // Count extracted images (no conversion needed)
        const extractedImages = this.findExtractedImages();
        console.log(`📷 Found ${extractedImages.length} extracted PNG images`);

        this.results.extracted = extractedImages.length;
        this.results.downloaded = requiredArchives.length;
      } else {
        console.error(
          `❌ Source2Viewer extraction failed: ${extractResult.error}`
        );
        this.results.failed++;
      }

      console.log(`\n📊 Processing complete:`);
      console.log(`   📥 Downloaded: ${this.results.downloaded} VPK files`);
      console.log(`   📦 Extracted: ${this.results.extracted} PNG images`);
      console.log(`   ❌ Failed: ${this.results.failed}`);

      return this.results;
    } finally {
      // Clean up temp directory
      this.cleanup();
    }
  }

  getRequiredVPKArchives(vpkDir) {
    console.log("🔍 Analyzing which VPK archives contain target files...");
    const requiredIndices = new Set();

    for (const fileName of vpkDir.files) {
      for (const folder of this.vpkFolders) {
        if (fileName.startsWith(folder)) {
          const fileInfo = vpkDir.tree[fileName];
          if (fileInfo && fileInfo.archiveIndex !== undefined) {
            requiredIndices.add(fileInfo.archiveIndex);
          }
          break;
        }
      }
    }

    const sortedIndices = Array.from(requiredIndices).sort((a, b) => a - b);
    console.log(`📦 Target files are in archives: ${sortedIndices.join(", ")}`);

    return sortedIndices;
  }

  findVPKDirFile() {
    const searchPaths = [
      path.join(this.tempVpkDir, "game", "csgo", "pak01_dir.vpk"),
      path.join(this.tempVpkDir, "csgo", "pak01_dir.vpk"),
      path.join(this.tempVpkDir, "pak01_dir.vpk"),
    ];

    for (const searchPath of searchPaths) {
      if (fs.existsSync(searchPath)) {
        console.log(`📂 Found VPK directory at: ${searchPath}`);
        return searchPath;
      }
    }

    // Debug: List what's actually in the temp directory
    console.log("🔍 Searching for VPK directory file...");
    try {
      this.listDirectory(this.tempVpkDir, 0, 3); // List up to 3 levels deep
    } catch (err) {
      console.log(`Could not list directory: ${err.message}`);
    }

    return null;
  }

  listDirectory(dir, currentLevel, maxLevel) {
    if (currentLevel > maxLevel || !fs.existsSync(dir)) return;

    const indent = "  ".repeat(currentLevel);
    const items = fs.readdirSync(dir);

    for (const item of items) {
      const itemPath = path.join(dir, item);
      const stats = fs.statSync(itemPath);

      if (stats.isDirectory()) {
        console.log(`${indent}📁 ${item}/`);
        this.listDirectory(itemPath, currentLevel + 1, maxLevel);
      } else {
        console.log(`${indent}📄 ${item} (${stats.size} bytes)`);
      }
    }
  }

  async downloadRequiredArchives(appId, depotId, manifestId, requiredArchives) {
    console.log(
      `📥 Batch downloading ${requiredArchives.length} VPK archives...`
    );

    // Create file patterns for all required archives
    const filePatterns = requiredArchives.map((archiveIndex) => {
      const paddedIndex = archiveIndex.toString().padStart(3, "0");
      return `csgo/pak01_${paddedIndex}\\.vpk`;
    });

    // Log what we're downloading
    console.log("📋 VPK files to download:");
    requiredArchives.forEach((archiveIndex, i) => {
      const paddedIndex = archiveIndex.toString().padStart(3, "0");
      console.log(`   ${i + 1}. pak01_${paddedIndex}.vpk`);
    });

    // Use batch download
    const downloadResult = await this.depotDownloader.downloadMultipleFiles(
      appId,
      depotId,
      manifestId,
      filePatterns,
      this.tempVpkDir
    );

    if (!downloadResult.success) {
      throw new Error(
        `Failed to batch download VPK archives: ${downloadResult.error}`
      );
    }

    console.log(
      `✅ Batch downloaded ${requiredArchives.length} VPK archives in ${(
        downloadResult.downloadTime / 1000
      ).toFixed(1)}s`
    );
  }

  async extractWithSource2Viewer(vpkDirPath) {
    console.log(
      "🔧 Running Source2Viewer to extract specific panorama/images/econ folders..."
    );

    // Extract each target folder separately to ensure we only get what we want
    const results = [];

    for (const folder of this.vpkFolders) {
      console.log(`📁 Extracting folder: ${folder}`);

      const result = await this.source2Viewer.extractVPKFolder(
        vpkDirPath,
        this.outputDir,
        {
          extension: "vtex_c",
          folder: folder,
          decompile: true,
        }
      );

      results.push(result);

      if (!result.success) {
        console.warn(`⚠️ Failed to extract ${folder}: ${result.error}`);
      } else {
        console.log(`✅ Successfully extracted ${folder}`);
      }
    }

    // Return success if at least one folder was extracted successfully
    const successfulExtractions = results.filter((r) => r.success).length;
    const totalFolders = this.vpkFolders.length;

    console.log(
      `📊 Extraction summary: ${successfulExtractions}/${totalFolders} folders extracted successfully`
    );

    return {
      success: successfulExtractions > 0,
      error:
        successfulExtractions === 0 ? "No folders could be extracted" : null,
      details: results,
    };
  }

  findExtractedImages() {
    const imageFiles = [];

    if (!fs.existsSync(this.outputDir)) {
      return imageFiles;
    }

    // Recursively find PNG files in the output directory
    const findImages = (dir) => {
      const items = fs.readdirSync(dir);

      for (const item of items) {
        const itemPath = path.join(dir, item);
        const stats = fs.statSync(itemPath);

        if (stats.isDirectory()) {
          findImages(itemPath);
        } else if (item.toLowerCase().endsWith(".png")) {
          imageFiles.push(itemPath);
        }
      }
    };

    findImages(this.outputDir);
    return imageFiles;
  }

  cleanup() {
    try {
      if (fs.existsSync(this.tempVpkDir)) {
        fs.rmSync(this.tempVpkDir, { recursive: true, force: true });
        console.log("🧹 Cleaned up temporary VPK files");
      }
    } catch (error) {
      console.warn(`⚠️ Could not clean up temp directory: ${error.message}`);
    }
  }
}

module.exports = { StreamingVPKProcessor };
