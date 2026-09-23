import { inflateSync } from "node:zlib";

/**
 * The text of a PDF made by @react-pdf (pdfkit): streams are Flate-compressed and each
 * embedded font writes glyph ids as hex, mapped back to Unicode by its ToUnicode CMap.
 * Good enough to assert that a report contains a name or an amount; it does not keep
 * layout, and spacing between runs is approximate.
 */
export function pdfText(pdf: Buffer): string {
  const raw = pdf.toString("latin1");
  const objects = new Map<string, { dict: string; stream: string | null }>();
  for (const match of raw.matchAll(
    /(\d+) 0 obj([\s\S]*?)(?:stream\r?\n([\s\S]*?)\r?\nendstream[\s\S]*?)?endobj/g,
  )) {
    const [, id, dict, body] = match;
    let stream: string | null = null;
    if (body !== undefined) {
      const bytes = Buffer.from(body, "latin1");
      try {
        stream = /FlateDecode/.test(dict)
          ? inflateSync(bytes).toString("latin1")
          : body;
      } catch {
        stream = null;
      }
    }
    objects.set(id, { dict, stream });
  }

  const cmapOf = (id: string): Map<string, string> => {
    const map = new Map<string, string>();
    const text = objects.get(id)?.stream ?? "";
    const utf16 = (hex: string) =>
      String.fromCodePoint(
        ...(hex.match(/.{4}/g) ?? []).map((unit) => parseInt(unit, 16)),
      );
    for (const block of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))
      for (const pair of block[1].matchAll(
        /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g,
      ))
        map.set(pair[1].toLowerCase(), utf16(pair[2]));
    for (const block of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g))
      for (const range of block[1].matchAll(
        /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(?:<([0-9a-fA-F]+)>|\[([^\]]*)\])/g,
      )) {
        const [, lo, hi, start, list] = range;
        const width = lo.length;
        const from = parseInt(lo, 16);
        const to = parseInt(hi, 16);
        const targets = list
          ? [...list.matchAll(/<([0-9a-fA-F]+)>/g)].map((m) => utf16(m[1]))
          : null;
        for (let code = from; code <= to; code++) {
          const key = code.toString(16).padStart(width, "0");
          if (targets) map.set(key, targets[code - from] ?? "");
          else {
            const base = parseInt(start!, 16) + (code - from);
            map.set(key, String.fromCodePoint(base));
          }
        }
      }
    return map;
  };

  // Resource name (/F1) → the CMap of that font object.
  const fonts = new Map<string, Map<string, string>>();
  for (const { dict } of objects.values())
    for (const entry of dict.matchAll(/\/(F\d+)\s+(\d+) 0 R/g)) {
      const font = objects.get(entry[2]);
      const toUnicode = font?.dict.match(/\/ToUnicode\s+(\d+) 0 R/);
      if (toUnicode && !fonts.has(entry[1]))
        fonts.set(entry[1], cmapOf(toUnicode[1]));
    }

  const decode = (hex: string, map: Map<string, string> | undefined) => {
    if (!map) return "";
    const width = [...map.keys()][0]?.length ?? 4;
    let out = "";
    for (let i = 0; i < hex.length; i += width)
      out += map.get(hex.slice(i, i + width).toLowerCase()) ?? "";
    return out;
  };

  const lines: string[] = [];
  for (const { dict, stream } of objects.values()) {
    if (
      !stream ||
      /ToUnicode|FontFile|Subtype\s*\/Image|CIDToGIDMap/.test(dict)
    )
      continue;
    if (!/\bT[Jj]\b/.test(stream)) continue;
    let current: Map<string, string> | undefined;
    let line = "";
    for (const token of stream.matchAll(
      /\/(F\d+)\s+[\d.]+\s+Tf|\[((?:[^\]\\]|\\.)*)\]\s*TJ|<([0-9a-fA-F]*)>\s*Tj|\b(ET)\b/g,
    )) {
      if (token[1]) current = fonts.get(token[1]);
      else if (token[2] !== undefined)
        for (const part of token[2].matchAll(/<([0-9a-fA-F]*)>|(-?[\d.]+)/g)) {
          if (part[1] !== undefined) line += decode(part[1], current);
          else if (Number(part[2]) < -200) line += " ";
        }
      else if (token[3] !== undefined) line += decode(token[3], current);
      else if (token[4]) {
        if (line) lines.push(line);
        line = "";
      }
    }
    if (line) lines.push(line);
  }
  return lines.join("\n");
}
