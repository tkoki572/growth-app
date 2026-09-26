import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const fromRoot = (...parts) => path.join(projectRoot, ...parts);

async function readJson(relativePath) {
  return JSON.parse(await readFile(fromRoot(relativePath), "utf8"));
}

async function sha256(relativePath) {
  return createHash("sha256").update(await readFile(fromRoot(relativePath))).digest("hex").toUpperCase();
}

async function pngInfo(relativePath) {
  const data = await readFile(fromRoot(relativePath));
  check(data.subarray(1, 4).toString("ascii") === "PNG", `${relativePath}がPNGではありません`);
  return {
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20),
    colorType: data[25]
  };
}

const config = await readJson("capacitor.config.json");
const packageJson = await readJson("package.json");
check(config.appName === "Rypace", "Capacitor appNameがRypaceではありません");
check(config.appId === "com.tkoki572.growthapp", "Bundle IDが正式値ではありません");
check(config.webDir === "www", "Capacitor webDirがwwwではありません");
check(!("server" in config), "本番設定にserver設定が含まれています");

const allowedCapacitorPackages = new Set(["@capacitor/core", "@capacitor/ios", "@capacitor/cli"]);
const capacitorPackages = [
  ...Object.keys(packageJson.dependencies || {}),
  ...Object.keys(packageJson.devDependencies || {})
].filter((name) => name.startsWith("@capacitor/"));
check(capacitorPackages.every((name) => allowedCapacitorPackages.has(name)), "不要なCapacitorプラグインが含まれています");

const iconPath = "assets/ios/Rypace-AppIcon-1024.png";
const splashPath = "assets/ios/Rypace-Splash-v1.0-90pct.png";
const icon = await pngInfo(iconPath);
const splash = await pngInfo(splashPath);
check(icon.width === 1024 && icon.height === 1024, "App Iconが1024×1024ではありません");
check(icon.colorType === 2, "App Iconが透過なしRGBではありません");
check(splash.width === 853 && splash.height === 1844, "Splash素材の寸法が原本と異なります");
check(splash.colorType === 2, "Splash素材が透過なしRGBではありません");
check(await sha256(iconPath) === "B82D0553E938D89D3E73A557C9ACF02E7A04EAD5BDBD6CE21C1214F63294E998", "App Icon原本が変更されています");
check(await sha256(splashPath) === "043BF16FB4EF5E6708E6B9FCCB717EEF57BE4653A7841BF6C6FE4ED613C08783", "Splash原本が変更されています");

const indexHtml = await readFile(fromRoot("index.html"), "utf8");
const appScript = await readFile(fromRoot("script.js"), "utf8");
check(indexHtml.includes("<title>Rypace</title>"), "Web版のタイトルがRypaceではありません");
check(!indexHtml.includes("Growth App") && !appScript.includes("Growth App"), "ユーザー表示に旧ブランド名が残っています");
check(appScript.includes('const STORAGE_KEY = "selfGrowthAppState";'), "既存localStorageキーが変更されています");
check(!/https?:\/\/localhost|https?:\/\/127\.0\.0\.1/.test(`${indexHtml}\n${appScript}`), "本番コードにlocalhost URLがあります");

check((await stat(fromRoot("www", "index.html"))).isFile(), "www/index.htmlが生成されていません");
check(await sha256("index.html") === await sha256("www/index.html"), "www/index.htmlがWeb版と一致しません");
check(await sha256("style.css") === await sha256("www/style.css"), "www/style.cssがWeb版と一致しません");
check(await sha256("script.js") === await sha256("www/script.js"), "www/script.jsがWeb版と一致しません");
try {
  await stat(fromRoot("www", "assets", "ios"));
  failures.push("未使用のiOS原本がWeb Assetsへ含まれています");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

if (failures.length > 0) {
  console.error(failures.map((message) => `FAIL: ${message}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log("iOS release readiness checks passed");
}
