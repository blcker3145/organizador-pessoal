import { Mic, MicOff, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getRecognitionCtor, SPEECH_ERRORS, speechSupported, type Recognition } from "../lib/speech";
import { ui } from "../lib/ui";
import { cx } from "../lib/util";

/** Só um campo dita por vez. */
let stopActive: (() => void) | null = null;

export function useDictation(onFinal: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const rec = useRef<Recognition | null>(null);
  const wanted = useRef(false);
  const finalRef = useRef(onFinal);
  finalRef.current = onFinal;

  // referência estável para comparar com o ditado ativo
  const stopRef = useRef(() => {
    wanted.current = false;
    rec.current?.stop();
    setListening(false);
    setInterim("");
    if (stopActive === stopRef.current) stopActive = null;
  });
  const stop = stopRef.current;

  const start = () => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      ui.toast("Este navegador não tem ditado por voz. Abra o app no Chrome ou no Edge.");
      return;
    }
    stopActive?.();
    const r = new Ctor();
    r.lang = "pt-BR";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let partial = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalRef.current(res[0].transcript);
        else partial += res[0].transcript;
      }
      setInterim(partial);
    };
    r.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      wanted.current = false;
      ui.toast(SPEECH_ERRORS[e.error] || `O ditado parou (${e.error}). Tente de novo.`);
    };
    r.onend = () => {
      // o navegador encerra sozinho após um silêncio; reinicia enquanto o ditado estiver ligado
      if (rec.current !== r) return;
      if (wanted.current) {
        try {
          r.start();
          return;
        } catch {
          /* cai para o encerramento */
        }
      }
      setListening(false);
      setInterim("");
    };
    rec.current = r;
    wanted.current = true;
    try {
      r.start();
      setListening(true);
      stopActive = stop;
    } catch {
      wanted.current = false;
      ui.toast("Não foi possível ligar o microfone. Tente de novo.");
    }
  };

  useEffect(
    () => () => {
      wanted.current = false;
      rec.current?.abort();
      if (stopActive === stopRef.current) stopActive = null;
    },
    [],
  );

  return { supported: speechSupported(), listening, interim, start, stop, toggle: () => (listening ? stop() : start()) };
}

export function DictationButton({ dictation }: { dictation: ReturnType<typeof useDictation> }) {
  const { supported, listening, toggle } = dictation;
  return (
    <button
      type="button"
      className={cx("btn ghost sm dictate-btn", listening && "on")}
      // não tira o foco do texto: a fala entra onde está o cursor
      onMouseDown={(e) => e.preventDefault()}
      onClick={toggle}
      aria-pressed={listening}
      title={supported ? "Ditar por voz: fale e o texto entra onde está o cursor" : "Ditado por voz disponível no Chrome e no Edge"}
    >
      {supported ? <Mic size={14} /> : <MicOff size={14} />}
      {listening ? "Ouvindo…" : "Ditar"}
    </button>
  );
}

export function DictationBar({ dictation }: { dictation: ReturnType<typeof useDictation> }) {
  if (!dictation.listening) return null;
  return (
    <div className="dictation-bar" role="status" aria-live="polite" onMouseDown={(e) => e.preventDefault()}>
      <span className="rec-dot" aria-hidden="true" />
      <span className="grow ellipsis">{dictation.interim || "Ouvindo… diga \"vírgula\", \"ponto final\" ou \"nova linha\" para pontuar"}</span>
      <button type="button" className="btn sm" onClick={dictation.stop}>
        <Square size={12} fill="currentColor" /> Parar
      </button>
    </div>
  );
}
