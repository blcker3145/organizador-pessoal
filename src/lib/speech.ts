/* Ditado por voz com a Web Speech API (Chrome e Edge). */

interface SpeechAlternative {
  transcript: string;
}
interface SpeechResult {
  isFinal: boolean;
  0: SpeechAlternative;
}
interface SpeechResultEvent {
  resultIndex: number;
  results: { length: number; [i: number]: SpeechResult };
}
interface SpeechErrorEvent {
  error: string;
}

export interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechResultEvent) => void) | null;
  onerror: ((e: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type RecognitionCtor = new () => Recognition;

export function getRecognitionCtor(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export const speechSupported = () => !!getRecognitionCtor();

export const SPEECH_ERRORS: Record<string, string> = {
  "not-allowed": "O microfone está bloqueado. Libere o acesso nas permissões do navegador e tente de novo.",
  "service-not-allowed": "O navegador não liberou o reconhecimento de voz. Use o Chrome ou o Edge.",
  "audio-capture": "Nenhum microfone encontrado. Confira se ele está conectado.",
  network: "O ditado precisa de internet: o Chrome e o Edge transcrevem a fala on-line.",
  "language-not-supported": "O navegador não reconhece português neste aparelho.",
};

/**
 * Converte comandos falados em pontuação e quebras de linha.
 * "\n" marca um novo bloco.
 */
export function applyVoiceCommands(raw: string): string {
  let t = ` ${raw} `;
  // o espaço depois do comando fica de fora (lookahead) para não engolir uma quebra de linha vizinha
  const rules: [RegExp, string][] = [
    [/\s(?:novo parágrafo|nova linha|próxima linha)(?=\s)/gi, "\n"],
    [/\sponto de interrogação(?=\s)/gi, "?"],
    [/\sponto de exclamação(?=\s)/gi, "!"],
    [/\sponto final(?=\s)/gi, "."],
    [/\sdois pontos(?=\s)/gi, ":"],
    [/\sponto e vírgula(?=\s)/gi, ";"],
    [/\svírgula(?=\s)/gi, ","],
  ];
  rules.forEach(([re, rep]) => {
    t = t.replace(re, rep);
  });
  return t
    .replace(/[ \t]+([,.;:!?])/g, "$1")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/([.!?]\s+)(\p{Ll})/gu, (_m, p: string, c: string) => p + c.toUpperCase())
    .trim();
}
