// The fixed header widget — visual descendant of Document::widget
// (htdocs/coffee/src/run.coffee): white box, subtle border and shadow,
// #6AC/red palette, Gill Sans stack. Rebuilt inside a Shadow DOM so the
// host page's CSS and ours can't leak into each other.

export const TOOLBAR_ATTR = 'data-ql-toolbar';

export interface ToolbarOptions {
  count: number;
  onClose: () => void;
}

const TOOLBAR_CSS = `
.box {
  pointer-events: auto;
  box-sizing: border-box;
  max-width: 600px;
  margin: 0 auto;
  padding: 12px 16px;
  position: relative;
  text-align: left;
  font-family: "Gill Sans", "Gill Sans MT", "Helvetica Neue", Arial, sans-serif;
  font-size: 14px;
  line-height: 20px;
  font-weight: normal;
  color: #6ac;
  background: #fff;
  border: 1px solid #ccc;
  border-radius: 3px;
  box-shadow: 1px 0 15px rgba(0, 0, 0, 0.2);
}
.title { font-size: 18px; }
.title .wt { font-size: 12px; color: #aaa; }
.subtitle strong { color: #f00; font-weight: normal; }
.close {
  position: absolute;
  top: 8px;
  right: 10px;
  border: 0;
  background: none;
  color: #aaa;
  font: inherit;
  font-size: 16px;
  cursor: pointer;
  padding: 2px 6px;
}
.close:hover { color: #f00; }
`;

export function createToolbar(doc: Document, opts: ToolbarOptions): HTMLElement {
  const host = doc.createElement('div');
  host.setAttribute(TOOLBAR_ATTR, '');
  // The host carries only positioning; everything visual lives in the shadow
  // tree. pointer-events:none keeps the full-width strip from swallowing
  // clicks outside the box itself.
  host.style.cssText =
    'position:fixed;top:10px;left:0;right:0;z-index:2147483647;pointer-events:none;';

  const shadow = host.attachShadow({ mode: 'open' });

  const style = doc.createElement('style');
  style.textContent = TOOLBAR_CSS;
  shadow.appendChild(style);

  const box = doc.createElement('div');
  box.className = 'box';

  const close = doc.createElement('button');
  close.className = 'close';
  close.type = 'button';
  close.title = 'Turn off';
  close.textContent = '✕';
  close.addEventListener('click', () => opts.onClose());

  const title = doc.createElement('div');
  title.className = 'title';
  title.append('Quotelink ');
  const wt = doc.createElement('span');
  wt.className = 'wt';
  wt.textContent = '(working title)';
  title.appendChild(wt);

  const subtitle = doc.createElement('div');
  subtitle.className = 'subtitle';
  const count = doc.createElement('strong');
  count.textContent = String(opts.count);
  subtitle.append(count, ` shareable sentence${opts.count === 1 ? '' : 's'} — click one to share.`);

  box.append(close, title, subtitle);
  shadow.appendChild(box);

  doc.body.appendChild(host);
  return host;
}
