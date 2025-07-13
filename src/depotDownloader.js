const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

/**
 * DepotDownloader wrapper for reliable Steam content downloads
 */
class DepotDownloader {
  constructor(options = {}) {
    this.username = options.username;
    this.password = options.password;
    this.tempDir = options.tempDir || "./temp";
    this.executablePath =
      options.executablePath || this.getDefaultExecutablePath();
    this.downloadAttempts = options.downloadAttempts || 3;
  }

  getDefaultExecutablePath() {
    const platform = os.platform();
    if (platform === "win32") {
      return "./DepotDownloader.exe";
    } else if (platform === "linux") {
      return "./DepotDownloader";
    } else if (platform === "darwin") {
      return "./DepotDownloader";
    }
    return "./DepotDownloader";
  }

  async ensureDepotDownloaderExists() {
    if (fs.existsSync(this.executablePath)) {
      console.log("✅ DepotDownloader found");
      return true;
    }

    console.log("📥 DepotDownloader not found, downloading...");
    await this.downloadDepotDownloader();
    return true;
  }

  async downloadDepotDownloader() {
    const platform = os.platform();
    const arch = os.arch();

    let downloadUrl;
    let fileName;

    if (platform === "win32") {
      downloadUrl =
        "https://github.com/SteamRE/DepotDownloader/releases/latest/download/DepotDownloader-windows-x64.zip";
      fileName = "DepotDownloader-windows-x64.zip";
    } else if (platform === "linux") {
      downloadUrl =
        "https://github.com/SteamRE/DepotDownloader/releases/latest/download/DepotDownloader-linux-x64.zip";
      fileName = "DepotDownloader-linux-x64.zip";
    } else if (platform === "darwin") {
      downloadUrl =
        "https://github.com/SteamRE/DepotDownloader/releases/latest/download/DepotDownloader-macos-x64.zip";
      fileName = "DepotDownloader-macos-x64.zip";
    } else {
      throw new Error(`Unsupported platform: ${platform}`);
    }

    console.log(`📥 Downloading DepotDownloader for ${platform}...`);

    // Download using curl or wget
    const downloadCommand =
      platform === "win32"
        ? `powershell -Command "Invoke-WebRequest -Uri '${downloadUrl}' -OutFile '${fileName}'"`
        : `curl -L -o "${fileName}" "${downloadUrl}"`;

    await this.runCommand(downloadCommand, {
      description: "Downloading DepotDownloader",
      cwd: process.cwd(),
    });

    // Extract the zip file
    console.log("📦 Extracting DepotDownloader...");
    const extractCommand =
      platform === "win32"
        ? `powershell -Command "Expand-Archive -Path '${fileName}' -DestinationPath '.' -Force"`
        : `unzip -o "${fileName}"`;

    await this.runCommand(extractCommand, {
      description: "Extracting DepotDownloader",
      cwd: process.cwd(),
    });

    // Make executable on Unix systems
    if (platform !== "win32") {
      await this.runCommand(`chmod +x ./DepotDownloader`, {
        description: "Making DepotDownloader executable",
        cwd: process.cwd(),
      });
    }

    // Clean up zip file
    fs.unlinkSync(fileName);
    console.log("✅ DepotDownloader installed successfully");
  }

  async downloadManifest(appId, depotId, manifestId, outputDir = null) {
    await this.ensureDepotDownloaderExists();

    const output = outputDir || this.tempDir;
    if (!fs.existsSync(output)) {
      fs.mkdirSync(output, { recursive: true });
    }

    console.log(
      `📦 Downloading manifest ${manifestId} for app ${appId}, depot ${depotId}...`
    );

    const args = [
      "-app",
      appId.toString(),
      "-depot",
      depotId.toString(),
      "-manifest",
      manifestId,
      "-username",
      this.username,
      "-password",
      this.password,
      "-dir",
      output,
    ];

    const result = await this.runDepotDownloader(args, {
      description: `Downloading depot ${depotId}`,
      maxAttempts: this.downloadAttempts,
    });

    return {
      success: result.success,
      outputDir: output,
      error: result.error,
      downloadTime: result.duration,
    };
  }

  async downloadSpecificFiles(
    appId,
    depotId,
    manifestId,
    filePattern,
    outputDir = null
  ) {
    await this.ensureDepotDownloaderExists();

    const output = outputDir || this.tempDir;
    if (!fs.existsSync(output)) {
      fs.mkdirSync(output, { recursive: true });
    }

    console.log(
      `📦 Downloading files matching '${filePattern}' from depot ${depotId}...`
    );

    // Create a temporary filelist with the regex pattern
    const fileListPath = path.join(this.tempDir, `filelist_${depotId}.txt`);
    const regexPattern = `regex:${filePattern}`;
    fs.writeFileSync(fileListPath, regexPattern);

    console.log(`📋 Created filelist with pattern: ${regexPattern}`);

    // For VPK files, we need to use filelist with regex pattern
    const args = [
      "-app",
      appId.toString(),
      "-depot",
      depotId.toString(),
      "-manifest",
      manifestId,
      "-username",
      this.username,
      "-password",
      this.password,
      "-dir",
      output,
      "-filelist",
      fileListPath,
    ];

    const result = await this.runDepotDownloader(args, {
      description: `Downloading specific files from depot ${depotId}`,
      maxAttempts: this.downloadAttempts,
    });

    // Clean up the temporary filelist
    try {
      fs.unlinkSync(fileListPath);
    } catch (err) {
      // Ignore cleanup errors
    }

    return {
      success: result.success,
      outputDir: output,
      error: result.error,
      downloadTime: result.duration,
    };
  }

  async downloadMultipleFiles(
    appId,
    depotId,
    manifestId,
    filePatterns,
    outputDir = null
  ) {
    await this.ensureDepotDownloaderExists();

    const output = outputDir || this.tempDir;
    if (!fs.existsSync(output)) {
      fs.mkdirSync(output, { recursive: true });
    }

    console.log(
      `📦 Batch downloading ${filePatterns.length} file patterns from depot ${depotId}...`
    );

    // Create a temporary filelist with all regex patterns
    const fileListPath = path.join(
      this.tempDir,
      `batch_filelist_${depotId}.txt`
    );
    const patterns = filePatterns
      .map((pattern) => `regex:${pattern}`)
      .join("\n");
    fs.writeFileSync(fileListPath, patterns);

    console.log(
      `📋 Created batch filelist with ${filePatterns.length} patterns`
    );
    filePatterns.forEach((pattern) => {
      console.log(`   - ${pattern}`);
    });

    // Download all files matching any of the patterns
    const args = [
      "-app",
      appId.toString(),
      "-depot",
      depotId.toString(),
      "-manifest",
      manifestId,
      "-username",
      this.username,
      "-password",
      this.password,
      "-dir",
      output,
      "-filelist",
      fileListPath,
    ];

    const result = await this.runDepotDownloader(args, {
      description: `Batch downloading files from depot ${depotId}`,
      maxAttempts: this.downloadAttempts,
    });

    // Clean up the temporary filelist
    try {
      fs.unlinkSync(fileListPath);
    } catch (err) {
      // Ignore cleanup errors
    }

    return {
      success: result.success,
      outputDir: output,
      error: result.error,
      downloadTime: result.duration,
    };
  }

  async runDepotDownloader(args, options = {}) {
    const { description = "DepotDownloader operation", maxAttempts = 3 } =
      options;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(`🔄 ${description} (attempt ${attempt}/${maxAttempts})`);

      const startTime = Date.now();
      const result = await this.runCommand(
        `"${this.executablePath}" ${args.join(" ")}`,
        {
          description,
          cwd: process.cwd(),
          timeout: 30 * 60 * 1000, // 30 minutes timeout
        }
      );

      const duration = Date.now() - startTime;

      if (result.success) {
        console.log(
          `✅ ${description} completed successfully in ${(
            duration / 1000
          ).toFixed(1)}s`
        );
        return { success: true, duration, output: result.output };
      } else {
        console.error(
          `❌ ${description} failed (attempt ${attempt}/${maxAttempts}): ${result.error}`
        );

        if (attempt < maxAttempts) {
          const backoffTime = Math.min(
            30000 * Math.pow(2, attempt - 1),
            120000
          ); // 30s, 60s, 120s
          console.log(`⏳ Waiting ${backoffTime / 1000}s before retry...`);
          await new Promise((resolve) => setTimeout(resolve, backoffTime));
        }
      }
    }

    return { success: false, error: "Max attempts exceeded" };
  }

  async runCommand(command, options = {}) {
    const {
      description = "Command",
      cwd = process.cwd(),
      timeout = 10 * 60 * 1000,
    } = options;

    return new Promise((resolve) => {
      let output = "";
      let errorOutput = "";

      const child = spawn(command, [], {
        shell: true,
        cwd,
        stdio: ["pipe", "pipe", "pipe"],
      });

      const timeoutId = setTimeout(() => {
        child.kill("SIGKILL");
        resolve({
          success: false,
          error: `Command timed out after ${timeout / 1000}s`,
          output: output + errorOutput,
        });
      }, timeout);

      child.stdout.on("data", (data) => {
        const text = data.toString();
        output += text;
        // Show all DepotDownloader output in real-time
        const lines = text.split("\n").filter((line) => line.trim());
        lines.forEach((line) => {
          if (line.trim()) {
            console.log(`📥 ${line.trim()}`);
          }
        });
      });

      child.stderr.on("data", (data) => {
        const text = data.toString();
        errorOutput += text;
        // Show all stderr output (errors, warnings, and sometimes progress)
        const lines = text.split("\n").filter((line) => line.trim());
        lines.forEach((line) => {
          if (line.trim()) {
            console.error(`⚠️ ${line.trim()}`);
          }
        });
      });

      child.on("close", (code) => {
        clearTimeout(timeoutId);

        const success = code === 0;
        const fullOutput = output + errorOutput;

        resolve({
          success,
          error: success ? null : `Process exited with code ${code}`,
          output: fullOutput,
          exitCode: code,
        });
      });

      child.on("error", (error) => {
        clearTimeout(timeoutId);
        resolve({
          success: false,
          error: error.message,
          output: output + errorOutput,
        });
      });
    });
  }

  async getLatestManifestId(appId, depotId) {
    await this.ensureDepotDownloaderExists();

    console.log(
      `🔍 Getting latest manifest ID for app ${appId}, depot ${depotId}...`
    );

    const args = [
      "-app",
      appId.toString(),
      "-depot",
      depotId.toString(),
      "-username",
      this.username,
      "-password",
      this.password,
      "-manifest-only",
    ];

    const result = await this.runDepotDownloader(args, {
      description: "Getting manifest information",
      maxAttempts: 2,
    });

    if (result.success) {
      console.log("🔍 Parsing DepotDownloader output...");
      console.log("Raw output:", result.output);

      // Try multiple patterns to match manifest ID
      const patterns = [
        /Manifest (\d+) \(/i, // "Manifest 1597148535702430842 (07/07/2025 21:24:46)"
        /manifest (\d+) \(/i,
        /Manifest ID: (\d+)/i,
        /manifest id: (\d+)/i,
        /manifest:\s*(\d+)/i,
      ];

      for (const pattern of patterns) {
        const manifestMatch = result.output.match(pattern);
        if (manifestMatch) {
          const manifestId = manifestMatch[1];
          console.log(`📦 Found manifest ID using pattern: ${manifestId}`);
          return manifestId;
        }
      }

      // If no pattern matches, show the output for debugging
      console.error("❌ Could not parse manifest ID from output:");
      console.error("Output preview:", result.output.substring(0, 1000));
    }

    throw new Error(
      `Failed to get manifest ID: ${
        result.error || "Could not parse manifest ID from output"
      }`
    );
  }
}

module.exports = { DepotDownloader };
