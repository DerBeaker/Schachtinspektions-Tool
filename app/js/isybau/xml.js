// Schlanker XML-Parser/-Writer für ISYBAU-Dateien.
// Läuft im Browser und in Node (keine DOM-Abhängigkeit), damit Import/Export testbar sind.

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeEntities(s) {
  if (s.indexOf('&') < 0) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|\w+);/g, (m, e) => {
    if (e[0] === '#') {
      const cp = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : m;
    }
    return ENT[e] ?? m;
  });
}

const localName = (n) => {
  const i = n.indexOf(':');
  return i >= 0 ? n.slice(i + 1) : n;
};

/** Parst XML-Text in einen einfachen Baum {name, attrs, children, text}. */
export function parseXml(src) {
  const root = { name: '#document', attrs: {}, children: [], text: '' };
  const stack = [root];
  let i = 0;
  const n = src.length;
  const tagRe = /<\s*([^\s/>]+)([^>]*?)(\/?)\s*>/y;
  const attrRe = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  while (i < n) {
    const lt = src.indexOf('<', i);
    if (lt < 0) break;
    if (lt > i) {
      const t = src.slice(i, lt);
      if (t.trim()) stack[stack.length - 1].text += decodeEntities(t);
    }
    if (src.startsWith('<!--', lt)) {
      const e = src.indexOf('-->', lt + 4);
      i = e < 0 ? n : e + 3;
      continue;
    }
    if (src.startsWith('<![CDATA[', lt)) {
      const e = src.indexOf(']]>', lt + 9);
      stack[stack.length - 1].text += src.slice(lt + 9, e < 0 ? n : e);
      i = e < 0 ? n : e + 3;
      continue;
    }
    if (src[lt + 1] === '?' || src[lt + 1] === '!') {
      const e = src.indexOf('>', lt);
      i = e < 0 ? n : e + 1;
      continue;
    }
    if (src[lt + 1] === '/') {
      const e = src.indexOf('>', lt);
      const name = localName(src.slice(lt + 2, e).trim());
      // tolerant schließen
      for (let s = stack.length - 1; s > 0; s--) {
        if (stack[s].name === name) { stack.length = s; break; }
      }
      i = e + 1;
      continue;
    }
    tagRe.lastIndex = lt;
    const m = tagRe.exec(src);
    if (!m) throw new Error('Ungültiges XML bei Position ' + lt);
    const node = { name: localName(m[1]), attrs: {}, children: [], text: '' };
    let a;
    attrRe.lastIndex = 0;
    while ((a = attrRe.exec(m[2]))) node.attrs[a[1]] = decodeEntities(a[3] ?? a[4] ?? '');
    stack[stack.length - 1].children.push(node);
    if (!m[3]) stack.push(node);
    i = tagRe.lastIndex;
  }
  for (const nd of walk(root)) nd.text = nd.text.trim();
  return root.children[0] || null;
}

function* walk(node) {
  yield node;
  for (const c of node.children) yield* walk(c);
}

/** Dekodiert Bytes anhand der XML-Deklaration (ISYBAU-Dateien sind meist ISO-8859-1). */
export function decodeXmlBytes(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder('utf-8').decode(bytes.subarray(3));
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 200));
  const m = /encoding\s*=\s*["']([^"']+)["']/i.exec(head);
  const enc = (m ? m[1] : 'utf-8').toLowerCase();
  try {
    return new TextDecoder(enc === 'iso-8859-1' || enc === 'latin1' ? 'windows-1252' : enc).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

// ---- Zugriffshelfer -------------------------------------------------------

export function child(node, path) {
  if (!node) return null;
  let cur = node;
  for (const p of path.split('/')) {
    cur = cur.children.find((c) => c.name === p);
    if (!cur) return null;
  }
  return cur;
}

export function children(node, path) {
  if (!node) return [];
  const parts = path.split('/');
  const last = parts.pop();
  const parent = parts.length ? child(node, parts.join('/')) : node;
  return parent ? parent.children.filter((c) => c.name === last) : [];
}

export function text(node, path) {
  const c = child(node, path);
  return c ? c.text : '';
}

export function num(node, path) {
  const t = text(node, path);
  if (t === '') return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

export function findAll(node, name, out = []) {
  if (!node) return out;
  for (const c of node.children) {
    if (c.name === name) out.push(c);
    findAll(c, name, out);
  }
  return out;
}

// ---- Writer ---------------------------------------------------------------

export function esc(v) {
  return String(v)
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Baut XML aus einer verschachtelten Struktur:
 *   ['Name', value | [children...] , attrs?]
 * Elemente mit value null/undefined/'' werden ausgelassen (optionale Felder).
 */
export class XmlWriter {
  constructor() { this.out = []; }
  el(name, value, depth) {
    if (value === null || value === undefined || value === '') return;
    const ind = '  '.repeat(depth);
    if (Array.isArray(value)) {
      const before = this.out.length;
      this.out.push(`${ind}<${name}>`);
      const mark = this.out.length;
      for (const item of value) if (item) this.el(item[0], item[1], depth + 1);
      if (this.out.length === mark) { this.out.length = before; return; } // leeres Element weglassen
      this.out.push(`${ind}</${name}>`);
    } else {
      this.out.push(`${ind}<${name}>${esc(value)}</${name}>`);
    }
  }
  toString() { return this.out.join('\r\n'); }
}

/** Kodiert Text als ISO-8859-1; Zeichen außerhalb werden als Zeichenreferenz geschrieben. */
export function encodeLatin1(str) {
  let s = '';
  for (const ch of str) {
    const cp = ch.codePointAt(0);
    s += cp > 0xff ? `&#x${cp.toString(16).toUpperCase()};` : ch;
  }
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
