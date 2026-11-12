import React from "react";
import { useTheme } from "../design.jsx";

// A small, safe renderer for the AI's answers: headings, bullet and numbered lists, **bold**,
// *italic* and `code`. Text is never inserted as HTML.
function inline(text, keyBase) {
  const parts = [];
  const re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`)/g;
  let last = 0, m, i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith("**")) parts.push(<strong key={`${keyBase}-${i++}`}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith("`")) parts.push(<code key={`${keyBase}-${i++}`} style={{ background: "rgba(128,128,128,0.18)", padding: "1px 5px", borderRadius: 5 }}>{t.slice(1, -1)}</code>);
    else parts.push(<em key={`${keyBase}-${i++}`}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export default function Markdown({ text }) {
  const { TEXT } = useTheme();
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  const out = [];
  let list = null;
  const flush = () => { if (list) { const Tag = list.ordered ? "ol" : "ul"; out.push(<Tag key={`l${out.length}`} style={{ margin: "4px 0 8px", paddingLeft: 20, listStyleType: list.ordered ? "decimal" : "disc" }}>{list.items}</Tag>); list = null; } };
  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const num = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const head = line.match(/^#{1,4}\s+(.*)$/);
    if (bullet || num) {
      const ordered = !!num;
      if (!list || list.ordered !== ordered) { flush(); list = { ordered, items: [] }; }
      list.items.push(<li key={i} style={{ margin: "3px 0", lineHeight: 1.5 }}>{inline((bullet || num)[1], i)}</li>);
      return;
    }
    flush();
    if (!line.trim()) return;
    if (head) out.push(<p key={i} style={{ margin: "10px 0 4px", fontWeight: 700 }}>{inline(head[1], i)}</p>);
    else out.push(<p key={i} style={{ margin: "0 0 8px", lineHeight: 1.55 }}>{inline(line, i)}</p>);
  });
  flush();
  return <div style={{ fontSize: 14, color: TEXT }}>{out}</div>;
}
