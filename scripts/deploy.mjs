// Compila o app e publica a pasta dist na branch gh-pages (GitHub Pages).
import { execSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const run = (cmd, cwd) => execSync(cmd, { stdio: "inherit", cwd });
const read = (cmd) => execSync(cmd).toString().trim();

// sem o Supabase configurado o site publicado abriria só a tela de configuração
const envText = [".env.local", ".env"]
  .filter((file) => existsSync(file))
  .map((file) => readFileSync(file, "utf8"))
  .join("\n");
const hasEnv = (name) => Boolean(process.env[name]) || new RegExp(`^${name}=\\S+`, "m").test(envText);
if (!hasEnv("VITE_SUPABASE_URL") || !hasEnv("VITE_SUPABASE_ANON_KEY") || /SEU-PROJETO|cole-a-chave/.test(envText)) {
  console.error("Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env.local antes de publicar.");
  process.exit(1);
}

const remote = read("git remote get-url origin");
const commit = read("git rev-parse --short HEAD");

rmSync("dist", { recursive: true, force: true });
run("npm run build");
// sem Jekyll: o GitHub Pages serve os arquivos exatamente como saem do build
writeFileSync("dist/.nojekyll", "");

run("git init -q -b gh-pages", "dist");
run("git add -A", "dist");
run(`git -c user.name="deploy" -c user.email="deploy@local" commit -q -m "Publicar site (${commit})"`, "dist");
run(`git push -q -f "${remote}" gh-pages`, "dist");
rmSync("dist/.git", { recursive: true, force: true });

console.log("\nPublicado. Em 1 ou 2 minutos o site atualiza em https://blcker3145.github.io/organizador-pessoal/");
