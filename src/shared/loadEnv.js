const fs = require("node:fs");
const path = require("node:path");

const parseEnvLine = (line) => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }

  const separatorIndex = trimmed.indexOf("=");
  if (separatorIndex <= 0) {
    return null;
  }

  const key = trimmed.slice(0, separatorIndex).trim();
  let value = trimmed.slice(separatorIndex + 1).trim();

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return { key, value };
};

const loadEnvFile = (filePath = path.resolve(".env")) => {
  if (!fs.existsSync(filePath)) {
    return false;
  }

  fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map(parseEnvLine)
    .filter(Boolean)
    .forEach(({ key, value }) => {
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    });

  return true;
};

module.exports = {
  loadEnvFile,
  parseEnvLine,
};
