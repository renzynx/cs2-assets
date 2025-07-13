const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

/**
 * Source2Viewer CLI wrapper for decompiling Source 2 files
 */
class Source2Viewer {
  constructor(options = {}) {
    this.tempDir = options.tempDir || "./temp";
    this.executablePath =
      options.executablePath || this.getDefaultExecutablePath();
  }

  getDefaultExecutablePath() {
    const platform = os.platform();
    if (platform === "win32") {
      return "./Source2Viewer-CLI.exe";
    } else {
      return "./Source2Viewer-CLI";
    }
  }

  async ensureSource2ViewerExists() {
    if (fs.existsSync(this.executablePath)) {
      console.log("✅ Source2Viewer CLI found");
      return true;
    }

    console.log("📥 Source2Viewer CLI not found, downloading...");
    await this.downloadSource2Viewer();
    return true;
  }

  async downloadSource2Viewer() {
    const platform = os.platform();
    const arch = os.arch();

    let downloadUrl;
    let fileName;

    if (platform === "win32") {
      downloadUrl =
        "https://github.com/ValveResourceFormat/ValveResourceFormat/releases/latest/download/cli-windows-x64.zip";
      fileName = "cli-windows-x64.zip";
    } else if (platform === "linux") {
      if (arch === "arm64") {
        downloadUrl =
          "https://github.com/ValveResourceFormat/ValveResourceFormat/releases/latest/download/cli-linux-arm64.zip";
        fileName = "cli-linux-arm64.zip";
      } else {
        downloadUrl =
          "https://github.com/ValveResourceFormat/ValveResourceFormat/releases/latest/download/cli-linux-x64.zip";
        fileName = "cli-linux-x64.zip";
      }
    } else if (platform === "darwin") {
      if (arch === "arm64") {
        downloadUrl =
          "https://github.com/ValveResourceFormat/ValveResourceFormat/releases/latest/download/cli-macos-arm64.zip";
        fileName = "cli-macos-arm64.zip";
      } else {
        downloadUrl =
          "https://github.com/ValveResourceFormat/ValveResourceFormat/releases/latest/download/cli-macos-x64.zip";
        fileName = "cli-macos-x64.zip";
      }
    } else {
      throw new Error(`Unsupported platform: ${platform}`);
    }

    console.log(`📥 Downloading Source2Viewer CLI for ${platform}-${arch}...`);

    // Download using curl or wget
    const downloadCommand =
      platform === "win32"
        ? `powershell -Command "Invoke-WebRequest -Uri '${downloadUrl}' -OutFile '${fileName}'"`
        : `curl -L -o "${fileName}" "${downloadUrl}"`;

    await this.runCommand(downloadCommand, {
      description: "Downloading Source2Viewer CLI",
      cwd: process.cwd(),
    });

    // Extract the zip file
    console.log("📦 Extracting Source2Viewer CLI...");
    const extractCommand =
      platform === "win32"
        ? `powershell -Command "Expand-Archive -Path '${fileName}' -DestinationPath '.' -Force"`
        : `unzip -o "${fileName}"`;

    await this.runCommand(extractCommand, {
      description: "Extracting Source2Viewer CLI",
      cwd: process.cwd(),
    });

    // Find the extracted executable
    const extractedFiles = fs.readdirSync(".");
    let executableName;

    if (platform === "win32") {
      executableName = extractedFiles.find(
        (f) => f.endsWith(".exe") && f.toLowerCase().includes("source")
      );
      if (!executableName) {
        executableName = "Source2Viewer.exe"; // fallback
      }
    } else {
      executableName = extractedFiles.find(
        (f) => !f.includes(".") && f.toLowerCase().includes("source")
      );
      if (!executableName) {
        executableName = "Source2Viewer"; // fallback
      }
    }

    // Rename to standard name if needed
    if (executableName !== path.basename(this.executablePath)) {
      if (fs.existsSync(executableName)) {
        fs.renameSync(executableName, this.executablePath);
      }
    }

    // Make executable on Unix systems
    if (platform !== "win32") {
      await this.runCommand(`chmod +x "${this.executablePath}"`, {
        description: "Making Source2Viewer executable",
        cwd: process.cwd(),
      });
    }

    // Clean up zip file
    if (fs.existsSync(fileName)) {
      fs.unlinkSync(fileName);
    }

    console.log("✅ Source2Viewer CLI installed successfully");
  }

  async decompileFile(inputFile, outputDir, options = {}) {
    await this.ensureSource2ViewerExists();

    const {
      extension = "vtex_c",
      folderFilter = null,
      decompile = true,
    } = options;

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    console.log(`🔧 Decompiling ${path.basename(inputFile)}...`);

    const args = [];

    // Input file
    args.push("-i", `"${inputFile}"`);

    // Output directory
    args.push("-o", `"${outputDir}"`);

    // File extension filter
    if (extension) {
      args.push("-e", `"${extension}"`);
    }

    // Decompile mode
    if (decompile) {
      args.push("-d");
    }

    // Folder filter
    if (folderFilter) {
      args.push("-f", `"${folderFilter}"`);
    }

    const result = await this.runCommand(
      `"${this.executablePath}" ${args.join(" ")}`,
      {
        description: `Decompiling ${path.basename(inputFile)}`,
        cwd: process.cwd(),
        timeout: 5 * 60 * 1000, // 5 minutes timeout
      }
    );

    return {
      success: result.success,
      output: result.output,
      error: result.error,
    };
  }

  async decompileVPKFiles(vpkFiles, outputDir, options = {}) {
    await this.ensureSource2ViewerExists();

    const results = {
      decompiled: 0,
      failed: 0,
      errors: [],
    };

    for (const vpkFile of vpkFiles) {
      try {
        const result = await this.decompileFile(vpkFile, outputDir, options);

        if (result.success) {
          results.decompiled++;
          console.log(`✅ Decompiled ${path.basename(vpkFile)}`);
        } else {
          results.failed++;
          results.errors.push({
            file: vpkFile,
            error: result.error || "Unknown decompilation error",
          });
          console.error(
            `❌ Failed to decompile ${path.basename(vpkFile)}: ${result.error}`
          );
        }
      } catch (error) {
        results.failed++;
        results.errors.push({
          file: vpkFile,
          error: error.message,
        });
        console.error(
          `❌ Error decompiling ${path.basename(vpkFile)}: ${error.message}`
        );
      }
    }

    return results;
  }

  async extractVPKFolder(vpkDirPath, outputDir, options = {}) {
    await this.ensureSource2ViewerExists();

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    console.log(
      `🔧 Extracting ${options.folder || "files"} from ${path.basename(
        vpkDirPath
      )} using Source2Viewer...`
    );

    // Build CLI arguments using the correct format: -i "./temp/pak01_dir.vpk" -o "./static" -e "vtex_c" -d -f "panorama/images/econ"
    const args = [
      "-i",
      `"${vpkDirPath}"`,
      "-o",
      `"${outputDir}"`,
      "-e",
      options.extension || "vtex_c",
      "-d",
    ];

    if (options.folder) {
      args.push("-f", `"${options.folder}"`);
    }

    const command = `"${this.executablePath}" ${args.join(" ")}`;
    console.log(`🔧 Running: ${command}`);

    const result = await this.runCommand(command, {
      description: `Extracting ${
        options.folder || "files"
      } from ${path.basename(vpkDirPath)} using Source2Viewer`,
      cwd: process.cwd(),
      timeout: 10 * 60 * 1000, // 10 minutes timeout for large extractions
    });

    return {
      success: result.success,
      output: result.output,
      error: result.error,
    };
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
        // Show progress for decompilation
        const lines = text.split("\n").filter((line) => line.trim());
        lines.forEach((line) => {
          if (line.trim()) {
            console.log(`🔧 ${line.trim()}`);
          }
        });
      });

      child.stderr.on("data", (data) => {
        const text = data.toString();
        errorOutput += text;
        // Show errors and warnings
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
}

module.exports = { Source2Viewer };
