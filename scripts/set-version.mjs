// Usage: npm run release:version -- 0.3.0
// Sets the same version in package.json, src-tauri/tauri.conf.json and src-tauri/Cargo.toml.
// The updater compares this version against the latest GitHub release, so it must go up for every release.
import { readFileSync, writeFileSync } from "node:fs";

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) {
  console.error("Usage: npm run release:version -- <major.minor.patch>");
  process.exit(1);
}

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
pkg.version = version;
writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");

const conf = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
conf.version = version;
writeFileSync("src-tauri/tauri.conf.json", JSON.stringify(conf, null, 2) + "\n");

const cargo = readFileSync("src-tauri/Cargo.toml", "utf8").replace(/^version = ".*"$/m, `version = "${version}"`);
writeFileSync("src-tauri/Cargo.toml", cargo);

console.log(`Version set to ${version}. Commit, then: git tag v${version} && git push origin main --tags`);
