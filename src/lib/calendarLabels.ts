import type { VideoStage } from "./types";

const LABELS: Record<VideoStage, string> = {
  ideia: "Ideia",
  roteiro: "Roteiro",
  gravacao: "Gravação",
  edicao: "Edição",
  agendado: "Agendado",
  publicado: "Publicado",
};

export const stageInfoLabel = (stage: VideoStage) => LABELS[stage] || stage;
