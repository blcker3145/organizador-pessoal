/* Texto do editor de blocos só para leitura, com os links clicáveis. */
import { hrefOf, splitLinks } from "../lib/links";
import type { Block } from "../lib/types";
import { cx } from "../lib/util";

export function ReadBlocks({ blocks }: { blocks: Block[] }) {
  return (
    <div className="editor read">
      {blocks.map((b, i) =>
        b.type === "divider" ? (
          <div key={b.id} className="blk divider">
            <hr />
          </div>
        ) : (
          <div key={b.id} className={cx("blk", b.type, b.checked && "checked")}>
            {b.type === "bullet" && <span className="marker">•</span>}
            {b.type === "number" && <span className="marker">{blocks.slice(0, i).filter((x) => x.type === "number").length + 1}.</span>}
            {b.type === "todo" && <span className="marker">{b.checked ? "☑" : "☐"}</span>}
            <span className="blk-field">
              <span className="blk-links blk-read">
                {splitLinks(b.text).map((part, k) =>
                  part.href ? (
                    <a key={k} href={hrefOf(part.href)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                      {part.text}
                    </a>
                  ) : (
                    <span key={k}>{part.text}</span>
                  ),
                )}
              </span>
            </span>
          </div>
        ),
      )}
    </div>
  );
}
