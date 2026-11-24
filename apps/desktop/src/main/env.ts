import fs from "fs";
import path from "path";

/**
 * Loads environment variables from the root .env file without external dependencies.
 * Ensures GROQ_API_KEY and other configuration values are available in Electron.
 */
export function loadRootEnv(): void {
  const candidates = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "../.env"),
    path.resolve(process.cwd(), "../../.env"),
    path.resolve(__dirname, "../../../.env"),
    path.resolve(__dirname, "../../../../.env"),
  ];

  for (const envPath of candidates) {
    if (fs.existsSync(envPath)) {
      try {
        const content = fs.readFileSync(envPath, "utf8");
        for (const line of content.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const eqIdx = trimmed.indexOf("=");
          if (eqIdx > 0) {
            const key = trimmed.slice(0, eqIdx).trim();
            const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
            if (key && !process.env[key]) {
              process.env[key] = val;
            }
          }
        }
        console.log(`[LifeOS Desktop] Environment successfully initialized from "${envPath}"`);
        return;
      } catch (err) {
        console.warn(`[LifeOS Desktop] Error reading env at "${envPath}":`, err);
      }
    }
  }
}
