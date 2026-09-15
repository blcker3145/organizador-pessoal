// Compila o app e publica a pasta dist na branch gh-pages (GitHub Pages).
import { execSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";

const run = (cmd, cwd) => execSync(cmd, { stdio: "inherit", cwd });
const read = (cmd) => execSync(cmd).toString().trim();

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
