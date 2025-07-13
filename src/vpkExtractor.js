const fs = require("fs");
const path = require("path");
const vpk = require("vpk");

/**
 * Extract images from VPK files to a directory structure
 * @param {string} tempDir - Directory containing VPK files
 * @param {string} outputDir - Directory to extract images to
 * @param {Array} vpkFolders - Array of folder paths to extract
 * @returns {Promise<{extracted: number, failed: number}>}
 */
async function extractImagesFromVPK(tempDir, outputDir, vpkFolders) {
  const vpkDirPath = path.join(tempDir, "pak01_dir.vpk");

  if (!fs.existsSync(vpkDirPath)) {
    throw new Error(
      "VPK directory file not found. Make sure downloads completed successfully."
    );
  }

  console.log("📦 Loading VPK directory...");
  const vpkDir = new vpk(vpkDirPath);
  vpkDir.load();

  const results = {
    extracted: 0,
    failed: 0,
    errors: [],
  };

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log("🗂️  Extracting images from VPK files...");

  // Get all image files from specified folders
  const imageFiles = [];
  for (const fileName of vpkDir.files) {
    for (const folder of vpkFolders) {
      if (fileName.startsWith(folder)) {
        // Only extract image files
        const ext = path.extname(fileName).toLowerCase();
        if (
          [
            ".png",
            ".jpg",
            ".jpeg",
            ".tga",
            ".bmp",
            ".gif",
            ".vtf",
            ".svg",
          ].includes(ext)
        ) {
          imageFiles.push(fileName);
        }
        break;
      }
    }
  }

  console.log(`📷 Found ${imageFiles.length} image files to extract`);

  // Batch processing to avoid memory issues
  const batchSize = 20;
  for (
    let batchStart = 0;
    batchStart < imageFiles.length;
    batchStart += batchSize
  ) {
    const batchEnd = Math.min(batchStart + batchSize, imageFiles.length);
    const batch = imageFiles.slice(batchStart, batchEnd);

    console.log(
      `📦 Processing batch ${
        Math.floor(batchStart / batchSize) + 1
      }/${Math.ceil(imageFiles.length / batchSize)} (${batch.length} files)`
    );

    for (let i = 0; i < batch.length; i++) {
      const fileName = batch[i];
      const globalIndex = batchStart + i;
      const progress = `[${globalIndex + 1}/${imageFiles.length}]`;

      try {
        // Get file data from VPK
        const fileData = vpkDir.getFile(fileName);

        if (fileData) {
          // Create output path maintaining directory structure
          const outputPath = path.join(outputDir, fileName);
          const outputDirPath = path.dirname(outputPath);

          // Ensure directory exists
          if (!fs.existsSync(outputDirPath)) {
            fs.mkdirSync(outputDirPath, { recursive: true });
          }

          // Write file
          fs.writeFileSync(outputPath, fileData);

          if (globalIndex % 10 === 0 || globalIndex === imageFiles.length - 1) {
            console.log(`${progress} ✅ Extracted ${fileName}`);
          }
          results.extracted++;
        } else {
          console.log(`${progress} ⚠️  Could not read ${fileName}`);
          results.failed++;
          results.errors.push({
            file: fileName,
            error: "Could not read file data from VPK",
          });
        }
      } catch (error) {
        if (
          error.message.includes("ENOSPC") ||
          error.message.includes("No space left")
        ) {
          console.error(`❌ DISK SPACE ERROR: ${error.message}`);
          throw new Error(
            `Disk space exhausted while extracting ${fileName}. Consider running locally or increasing runner disk space.`
          );
        }

        console.error(
          `${progress} ❌ Failed to extract ${fileName}: ${error.message}`
        );
        results.failed++;
        results.errors.push({
          file: fileName,
          error: error.message,
        });
      }
    }

    // Small delay between batches to allow system to catch up
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  console.log(`\n📊 VPK extraction complete:`);
  console.log(`   ✅ Extracted: ${results.extracted}`);
  console.log(`   ❌ Failed: ${results.failed}`);

  return results;
}

module.exports = {
  extractImagesFromVPK,
};
