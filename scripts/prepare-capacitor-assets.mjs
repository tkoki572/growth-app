import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webDir = path.join(projectRoot, "www");
const webFiles = ["index.html", "style.css", "script.js"];

await rm(webDir, { recursive: true, force: true });
await mkdir(webDir, { recursive: true });

for (const file of webFiles) {
  await cp(path.join(projectRoot, file), path.join(webDir, file));
}
await cp(path.join(projectRoot, "assets"), path.join(webDir, "assets"), { recursive: true });
// iOSネイティブ素材の原本はWebViewから参照しないため、アプリのWeb Assetsには含めません。
await rm(path.join(webDir, "assets", "ios"), { recursive: true, force: true });

console.log(`Capacitor Web Assetsを準備しました: ${webDir}`);
