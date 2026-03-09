"use strict";

const fs = require("node:fs");
const path = require("node:path");

function replacePythonSymlink(venvBinDir) {
  const python312 = path.join(venvBinDir, "python3.12");
  const python = path.join(venvBinDir, "python");

  if (fs.existsSync(python312) && fs.lstatSync(python312).isSymbolicLink()) {
    const resolvedTarget = fs.realpathSync(python312);
    fs.unlinkSync(python312);
    fs.copyFileSync(resolvedTarget, python312);
    fs.chmodSync(python312, 0o755);
  }

  if (fs.existsSync(python)) {
    const stat = fs.lstatSync(python);
    if (stat.isSymbolicLink() || stat.isFile()) {
      fs.unlinkSync(python);
    }
  }

  fs.symlinkSync("python3.12", python);
}

module.exports = async function afterPack(context) {
  const productFilename = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${productFilename}.app`);
  const venvBinDir = path.join(
    appPath,
    "Contents",
    "Resources",
    "runtime",
    "backend",
    ".venv",
    "bin",
  );

  if (!fs.existsSync(venvBinDir)) {
    throw new Error(`afterPack: expected Python runtime at ${venvBinDir}`);
  }

  replacePythonSymlink(venvBinDir);
  console.log(`[afterPack] normalized bundled python runtime in ${venvBinDir}`);
};
