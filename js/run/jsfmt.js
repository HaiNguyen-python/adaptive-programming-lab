/**
 * console.log formatting that follows Node's util.inspect for the values beginners print:
 * strings, numbers, booleans, arrays and plain objects.
 *
 * makeInspect is self-contained on purpose: the JavaScript runner turns it into text with
 * toString() and places it inside a Web Worker, so it must not use anything outside itself.
 */
export function makeInspect() {
  const BREAK = 80;
  const COMPACT = 3;
  const MAX_DEPTH = 2;
  const MAX_ITEMS = 100;

  function quote(s) {
    let q = "'";
    if (s.includes("'")) {
      if (!s.includes('"')) q = '"';
      else if (!s.includes('`') && !s.includes('${')) q = '`';
    }
    let esc = s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\t/g, '\\t').replace(/\r/g, '\\r');
    if (q === "'") esc = esc.replace(/'/g, "\\'");
    return q + esc + q;
  }

  function primitive(v) {
    const t = typeof v;
    if (v === null) return 'null';
    if (t === 'undefined') return 'undefined';
    if (t === 'string') return quote(v);
    if (t === 'number') return Object.is(v, -0) ? '-0' : String(v);
    if (t === 'bigint') return `${v}n`;
    if (t === 'boolean') return String(v);
    if (t === 'symbol') return v.toString();
    return null;
  }

  function groupArray(ctx, output, value) {
    let totalLength = 0;
    let maxLength = 0;
    let outputLength = output.length;
    if (value.length > MAX_ITEMS) outputLength--;
    const dataLen = new Array(outputLength);
    for (let i = 0; i < outputLength; i++) {
      const len = output[i].length;
      dataLen[i] = len;
      totalLength += len + 2;
      if (maxLength < len) maxLength = len;
    }
    const actualMax = maxLength + 2;
    if (actualMax * 3 + ctx.indent < BREAK && (totalLength / actualMax > 5 || maxLength <= 6)) {
      const averageBias = Math.sqrt(actualMax - totalLength / output.length);
      const biasedMax = Math.max(actualMax - 3 - averageBias, 1);
      const columns = Math.min(
        Math.round(Math.sqrt(2.5 * biasedMax * outputLength) / biasedMax),
        Math.floor((BREAK - ctx.indent) / actualMax),
        COMPACT * 4,
        15,
      );
      if (columns <= 1) return output;
      const tmp = [];
      const maxLineLength = [];
      for (let i = 0; i < columns; i++) {
        let lineLength = 0;
        for (let j = i; j < output.length; j += columns) if (dataLen[j] > lineLength) lineLength = dataLen[j];
        maxLineLength.push(lineLength + 2);
      }
      let padStart = true;
      for (let i = 0; i < output.length; i++) {
        if (typeof value[i] !== 'number' && typeof value[i] !== 'bigint') { padStart = false; break; }
      }
      for (let i = 0; i < outputLength; i += columns) {
        const max = Math.min(i + columns, outputLength);
        let str = '';
        let j = i;
        for (; j < max - 1; j++) {
          const cell = `${output[j]}, `;
          str += padStart ? cell.padStart(maxLineLength[j - i], ' ') : cell.padEnd(maxLineLength[j - i], ' ');
        }
        str += padStart ? output[j].padStart(maxLineLength[j - i] - 2, ' ') : output[j];
        tmp.push(str);
      }
      if (value.length > MAX_ITEMS) tmp.push(output[outputLength]);
      output = tmp;
    }
    return output;
  }

  function reduce(ctx, output, base, braces, isArray, depth, value) {
    const entries = output.length;
    if (isArray && entries > 6) output = groupArray(ctx, output, value);
    if (ctx.currentDepth - depth < COMPACT && entries === output.length) {
      const start = output.length + ctx.indent + braces[0].length + base.length + 10;
      let total = output.length + start;
      let fits = total + output.length <= BREAK;
      for (let i = 0; fits && i < output.length; i++) {
        total += output[i].length;
        if (total > BREAK) fits = false;
      }
      if (fits) {
        const joined = output.join(', ');
        if (!joined.includes('\n')) return `${base ? `${base} ` : ''}${braces[0]} ${joined} ${braces[1]}`;
      }
    }
    const ind = `\n${' '.repeat(ctx.indent)}`;
    return `${base ? `${base} ` : ''}${braces[0]}${ind}  ${output.join(`,${ind}  `)}${ind}${braces[1]}`;
  }

  function child(ctx, v, depth) {
    ctx.indent += 2;
    const s = format(ctx, v, depth);
    ctx.indent -= 2;
    return s;
  }

  function format(ctx, v, depth) {
    const p = primitive(v);
    if (p !== null) return p;
    if (typeof v === 'function') {
      const src = Function.prototype.toString.call(v);
      if (/^class\b/.test(src)) return `[class ${v.name || '(anonymous)'}]`;
      return v.name ? `[Function: ${v.name}]` : '[Function (anonymous)]';
    }
    if (ctx.seen.includes(v)) return '[Circular *1]';
    const isArray = Array.isArray(v);
    const tag = Object.prototype.toString.call(v);
    if (tag === '[object Error]') return `${v.name}: ${v.message}`;
    if (tag === '[object Date]') return Number.isNaN(v.getTime()) ? 'Invalid Date' : v.toISOString();
    if (tag === '[object RegExp]') return String(v);
    if (depth > MAX_DEPTH) return isArray ? '[Array]' : '[Object]';

    ctx.seen.push(v);
    ctx.currentDepth = depth;
    let output = [];
    let base = '';
    let braces = ['{', '}'];
    if (isArray) {
      braces = ['[', ']'];
      const shown = Math.min(v.length, MAX_ITEMS);
      for (let i = 0; i < shown; i++) output.push(child(ctx, v[i], depth + 1));
      if (v.length > MAX_ITEMS) output.push(`... ${v.length - MAX_ITEMS} more item${v.length - MAX_ITEMS > 1 ? 's' : ''}`);
    } else if (tag === '[object Map]') {
      base = `Map(${v.size})`;
      for (const [k, val] of v) output.push(`${child(ctx, k, depth + 1)} => ${child(ctx, val, depth + 1)}`);
    } else if (tag === '[object Set]') {
      base = `Set(${v.size})`;
      for (const val of v) output.push(child(ctx, val, depth + 1));
    } else {
      const ctor = v.constructor && v.constructor.name;
      if (!Object.getPrototypeOf(v)) base = '[Object: null prototype]';
      else if (ctor && ctor !== 'Object') base = ctor;
      for (const key of Object.keys(v)) {
        const name = /^[a-zA-Z_][a-zA-Z_0-9]*$/.test(key) ? key : quote(key);
        output.push(`${name}: ${child(ctx, v[key], depth + 1)}`);
      }
    }
    ctx.seen.pop();
    if (output.length === 0) return `${base ? `${base} ` : ''}${braces[0]}${braces[1]}`;
    return reduce(ctx, output, base, braces, isArray, depth, v);
  }

  /** Text for one value, as it appears inside console.log output (strings are quoted). */
  function inspect(value) {
    return format({ seen: [], indent: 0, currentDepth: 0 }, value, 0);
  }

  /** Text for a whole console.log call: top-level strings are printed as they are. */
  function formatArgs(args) {
    return Array.from(args).map((a) => (typeof a === 'string' ? a : inspect(a))).join(' ');
  }

  return { inspect, formatArgs };
}

const shared = makeInspect();
export const inspect = shared.inspect;
export const formatArgs = shared.formatArgs;
