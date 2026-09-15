import type { CreativeStage } from "./types";

export const CREATIVE_STAGES: { value: CreativeStage; label: string; color: string }[] = [
  { value: "ideia", label: "Ideia", color: "" },
  { value: "briefing", label: "Briefing", color: "purple" },
  { value: "criacao", label: "Em criação", color: "orange" },
  { value: "revisao", label: "Revisão", color: "blue" },
  { value: "aprovado", label: "Aprovado", color: "blue" },
  { value: "entregue", label: "Entregue", color: "green" },
];

export const creativeStageInfo = (s: CreativeStage) => CREATIVE_STAGES.find((x) => x.value === s) || CREATIVE_STAGES[0];

/** Formatos comuns e o tamanho padrão de cada um (px, salvo quando indicado). */
export const CREATIVE_FORMATS: { value: string; size: string }[] = [
  { value: "Post feed", size: "1080×1350" },
  { value: "Post quadrado", size: "1080×1080" },
  { value: "Carrossel", size: "1080×1350" },
  { value: "Story / Reels", size: "1080×1920" },
  { value: "Anúncio", size: "1080×1080" },
  { value: "Thumbnail YouTube", size: "1280×720" },
  { value: "Banner site", size: "1920×600" },
  { value: "Capa LinkedIn", size: "1584×396" },
  { value: "Apresentação", size: "1920×1080" },
  { value: "Identidade visual", size: "" },
  { value: "Impresso A4", size: "210×297 mm" },
  { value: "Outro", size: "" },
];

export const CREATIVE_CHANNELS = ["Instagram", "TikTok", "YouTube", "LinkedIn", "Facebook", "Site", "WhatsApp", "Impresso"];

export const BRIEFING_SECTIONS = ["Objetivo", "Público", "Mensagem principal", "Estilo e referências", "Observações"];

/** Reduz a imagem antes de guardar, para caber no armazenamento do navegador. */
export function imageFileToDataUrl(file: File, maxSide = 900, quality = 0.78): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("leitura"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("imagem"));
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("canvas"));
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
