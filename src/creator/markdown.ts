import type { CreatorBlock, CreatorInlineRun, CreatorInlineStyle } from "../types/creator";

function pushRun(runs: CreatorInlineRun[], text: string, style: CreatorInlineStyle = "normal", href?: string): void {
  if (!text) return;
  const previous = runs[runs.length - 1];
  if (previous && previous.style === style && previous.href === href) previous.text += text;
  else runs.push({ text, style, ...(href ? { href } : {}) });
}

export function parseMarkdownInline(value: string): CreatorInlineRun[] {
  const runs: CreatorInlineRun[] = [];
  let index = 0;
  while (index < value.length) {
    if (value[index] === "\\" && index + 1 < value.length) { pushRun(runs, value[index + 1]); index += 2; continue; }
    const rest = value.slice(index);
    const link = rest.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/i);
    if (link) { pushRun(runs, link[1], "link", link[2]); index += link[0].length; continue; }
    const boldItalic = rest.match(/^(?:\*\*\*|___)(.+?)(?:\*\*\*|___)/);
    if (boldItalic) { pushRun(runs, boldItalic[1], "bold-italic"); index += boldItalic[0].length; continue; }
    const bold = rest.match(/^(?:\*\*|__)(.+?)(?:\*\*|__)/);
    if (bold) { pushRun(runs, bold[1], "bold"); index += bold[0].length; continue; }
    const code = rest.match(/^`([^`]+)`/);
    if (code) { pushRun(runs, code[1], "code"); index += code[0].length; continue; }
    const italic = rest.match(/^(?:\*|_)([^*_]+?)(?:\*|_)/);
    if (italic) { pushRun(runs, italic[1], "italic"); index += italic[0].length; continue; }
    pushRun(runs, value[index]); index += 1;
  }
  return runs;
}
function inlineText(runs: CreatorInlineRun[]): string { return runs.map((run) => run.text).join("").trim(); }
function inline(value: string): { text: string; runs: CreatorInlineRun[] } { const runs=parseMarkdownInline(value.trim()); return { text:inlineText(runs), runs }; }
function flushParagraph(lines: string[], blocks: CreatorBlock[]): void { const joined=lines.join(" ").replace(/\s+/g," "); const parsed=inline(joined); if(parsed.text)blocks.push({type:"paragraph",...parsed}); lines.length=0; }

export function parseMarkdownBlocks(markdown: string): CreatorBlock[] {
  const blocks: CreatorBlock[] = [], paragraph: string[] = [], lines=markdown.replace(/\r\n?/g,"\n").split("\n"); let inFence=false,fenceLines:string[]=[];
  for(const raw of lines){const line=raw.replace(/\s+$/g,"");if(/^\s*```/.test(line)){if(inFence){blocks.push({type:"code",text:fenceLines.join("\n")});fenceLines=[];inFence=false;}else{flushParagraph(paragraph,blocks);inFence=true;}continue;}if(inFence){fenceLines.push(raw);continue;}if(!line.trim()){flushParagraph(paragraph,blocks);continue;}
    const heading=line.match(/^\s*(#{1,6})\s+(.+)$/);if(heading){flushParagraph(paragraph,blocks);blocks.push({type:"heading",level:heading[1].length as 1|2|3|4|5|6,...inline(heading[2])});continue;}
    if(/^\s*(?:---+|___+|\*\*\*+)\s*$/.test(line)){flushParagraph(paragraph,blocks);blocks.push({type:"rule"});continue;}
    const bullet=line.match(/^\s*[-+*]\s+(.+)$/);if(bullet){flushParagraph(paragraph,blocks);blocks.push({type:"bullet",...inline(bullet[1])});continue;}
    const numbered=line.match(/^\s*(\d+)[.)]\s+(.+)$/);if(numbered){flushParagraph(paragraph,blocks);blocks.push({type:"numbered",number:Number(numbered[1]),...inline(numbered[2])});continue;}
    const quote=line.match(/^\s*>\s?(.*)$/);if(quote){flushParagraph(paragraph,blocks);blocks.push({type:"quote",...inline(quote[1])});continue;}
    paragraph.push(line.trim());
  }
  if(inFence)blocks.push({type:"code",text:fenceLines.join("\n")});flushParagraph(paragraph,blocks);return blocks;
}
export function parsePlainTextBlocks(text:string):CreatorBlock[]{return text.replace(/\r\n?/g,"\n").split(/\n\s*\n/g).map(part=>part.trim()).filter(Boolean).map(value=>({type:"paragraph",text:value.replace(/\n/g," "),runs:[{text:value.replace(/\n/g," "),style:"normal"}]}));}
function escapeHtml(value:string):string{return value.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
function inlineRunsToHtml(runs:CreatorInlineRun[]):string{return runs.map(run=>{const text=escapeHtml(run.text);if(run.style==="bold")return`<strong>${text}</strong>`;if(run.style==="italic")return`<em>${text}</em>`;if(run.style==="bold-italic")return`<strong><em>${text}</em></strong>`;if(run.style==="code")return`<code>${text}</code>`;if(run.style==="link"&&run.href)return`<a href="${escapeHtml(run.href)}" rel="noreferrer">${text}</a>`;return text;}).join("");}
export function markdownPreviewHtml(markdown:string):string{const blocks=parseMarkdownBlocks(markdown),fragments:string[]=[];let listType:"ul"|"ol"|null=null;const closeList=()=>{if(listType){fragments.push(`</${listType}>`);listType=null;}};for(const block of blocks){if(block.type==="bullet"||block.type==="numbered"){const desired=block.type==="bullet"?"ul":"ol";if(listType!==desired){closeList();listType=desired;fragments.push(`<${desired}>`);}fragments.push(`<li>${inlineRunsToHtml(block.runs??[{text:block.text,style:"normal"}])}</li>`);continue;}closeList();if(block.type==="heading")fragments.push(`<h${block.level}>${inlineRunsToHtml(block.runs??[{text:block.text,style:"normal"}])}</h${block.level}>`);else if(block.type==="paragraph")fragments.push(`<p>${inlineRunsToHtml(block.runs??[{text:block.text,style:"normal"}])}</p>`);else if(block.type==="quote")fragments.push(`<blockquote>${inlineRunsToHtml(block.runs??[{text:block.text,style:"normal"}])}</blockquote>`);else if(block.type==="code")fragments.push(`<pre><code>${escapeHtml(block.text)}</code></pre>`);else fragments.push("<hr>");}closeList();return fragments.join("\n");}
