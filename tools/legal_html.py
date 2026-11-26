"""Юридические страницы: legal/*.md → legal/*.html со стилями «Жарко».
   python3 tools/legal_html.py
Публикуются только документы для пользователей (PAGES). checklist.md — внутренний, в html не превращается.
Поддерживается markdown, который есть в этих файлах: заголовки, абзацы, списки (в т.ч. вложенные и «- [ ]»),
таблицы, цитаты, ---, **жирный**, *курсив*, `код`, [ссылки](адрес). Ссылки на *.md переписываются на *.html,
ссылки-заглушки (без адреса) остаются простым текстом. Без внешних библиотек и внешних адресов."""
import html, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LEGAL = os.path.join(ROOT, 'legal')
PAGES = ['privacy', 'terms', 'consent']

def inline(s):
    out, pos = [], 0
    # код отдельно, чтобы внутри него не срабатывала разметка
    for m in re.finditer(r'`([^`]+)`', s):
        out.append(fmt(s[pos:m.start()])); out.append('<code>' + html.escape(m.group(1)) + '</code>'); pos = m.end()
    out.append(fmt(s[pos:]))
    return ''.join(out)

def link(m):
    text, href = m.group(1), html.unescape(m.group(2).strip())  # текст уже экранирован в fmt
    if re.match(r'^https?://', href):
        return '<a href="' + html.escape(href, True) + '" target="_blank" rel="noopener">' + text + '</a>'
    if re.match(r'^[\w./-]+\.(md|html)(#[\w-]*)?$', href):
        return '<a href="' + html.escape(re.sub(r'\.md(?=$|#)', '.html', href), True) + '">' + text + '</a>'
    return f'<span class="ph">{text}</span>'  # заглушка вроде (ссылка) — не делаем битую ссылку

def fmt(s):
    s = html.escape(s, quote=False)
    s = re.sub(r'\[([^\]]+)\]\(([^)]*)\)', link, s)
    s = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', s)
    s = re.sub(r'(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])', r'<em>\1</em>', s)
    s = re.sub(r'(?<![\w\[])\[(дата|ФИО|[^\]]{1,60})\](?!\()', r'<span class="ph">[\1]</span>', s)  # [заполнить]
    s = s.replace('☐', '<span class="box"></span>')
    return s

def table(rows):
    cells = [[c.strip() for c in r.strip().strip('|').split('|')] for r in rows]
    head, body = cells[0], [r for r in cells[2:]]
    h = '<div class="tw"><table><thead><tr>' + ''.join(f'<th>{inline(c)}</th>' for c in head) + '</tr></thead><tbody>'
    h += ''.join('<tr>' + ''.join(f'<td>{inline(c)}</td>' for c in r) + '</tr>' for r in body)
    return h + '</tbody></table></div>'

def lists(lines):
    """строки списка (с отступами) → вложенные <ul>/<ol>"""
    html_, stack = [], []  # stack: [(indent, tag)]
    for ln in lines:
        m = re.match(r'^(\s*)([-*]|\d+\.)\s+(.*)$', ln)
        if not m:  # продолжение пункта
            html_.append(' ' + inline(ln.strip())); continue
        ind, tag = len(m.group(1)), ('ol' if m.group(2)[0].isdigit() else 'ul')
        text = m.group(3)
        while stack and ind < stack[-1][0]:
            html_.append(f'</li></{stack.pop()[1]}>')
        if not stack or ind > stack[-1][0]:
            start = f' start="{int(m.group(2)[:-1])}"' if tag == 'ol' and int(m.group(2)[:-1]) != 1 else ''
            html_.append(f'<{tag}{start}>'); stack.append((ind, tag))
        else:
            html_.append('</li>')
        chk = re.match(r'^\[( |x)\]\s+(.*)$', text)
        if chk:
            html_.append(f'<li class="task"><span class="box{" on" if chk.group(1) == "x" else ""}"></span>{inline(chk.group(2))}')
        else:
            html_.append('<li>' + inline(text))
    while stack:
        html_.append(f'</li></{stack.pop()[1]}>')
    return ''.join(html_)

def convert(md):
    lines, out, i, title = md.splitlines(), [], 0, ''
    while i < len(lines):
        ln = lines[i]
        if not ln.strip():
            i += 1; continue
        m = re.match(r'^(#{1,4})\s+(.*)$', ln)
        if m:
            lvl = len(m.group(1)); title = title or m.group(2)
            out.append(f'<h{lvl}>{inline(m.group(2))}</h{lvl}>'); i += 1; continue
        if re.match(r'^(-{3,}|\*{3,})\s*$', ln):
            out.append('<hr>'); i += 1; continue
        if ln.lstrip().startswith('|') and i + 1 < len(lines) and re.match(r'^\s*\|?\s*:?-{3,}', lines[i + 1]):
            j = i
            while j < len(lines) and lines[j].lstrip().startswith('|'): j += 1
            out.append(table(lines[i:j])); i = j; continue
        if ln.startswith('>'):
            j = i
            while j < len(lines) and lines[j].startswith('>'): j += 1
            out.append('<blockquote>' + convert('\n'.join(l[1:].lstrip() for l in lines[i:j]))[0] + '</blockquote>'); i = j; continue
        if re.match(r'^\s*([-*]|\d+\.)\s+', ln):
            j = i
            while j < len(lines) and lines[j].strip() and (re.match(r'^\s*([-*]|\d+\.)\s+', lines[j]) or lines[j].startswith(' ')): j += 1
            out.append(lists(lines[i:j])); i = j; continue
        j = i
        while j < len(lines) and lines[j].strip() and not re.match(r'^(#{1,4}\s|>|\||\s*([-*]|\d+\.)\s|-{3,}\s*$)', lines[j]): j += 1
        j = max(j, i + 1)
        out.append('<p>' + '<br>'.join(inline(l.strip()) for l in lines[i:j]) + '</p>'); i = j
    return '\n'.join(out), title

PAGE = '''<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{title} — Жарко</title>
<link rel="icon" href="../icons/favicon-32.png" sizes="32x32">
<link rel="stylesheet" href="../css/fonts.css">
<script>(function(){{try{{var t=JSON.parse(localStorage.getItem('kuking:theme')||'"auto"');}}catch(e){{t='auto'}}var d=t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.setAttribute('data-theme',d?'dark':'light')}})();</script>
<style>
:root {{ --f-display: 'Fira Sans Extra Condensed', 'Arial Narrow', sans-serif; --f-text: 'Golos Text', system-ui, -apple-system, sans-serif;
  --bg: #F2F1EC; --paper: #FFFFFF; --sunk: #E9E7E0; --ink: #1D1A17; --muted: #5C5650; --line: #DEDBD3; --brand: #6E1F2E; --act: #F08A24; --act-soft: #FCE6CF; color-scheme: light; }}
:root[data-theme="dark"] {{ --bg: #171413; --paper: #221E1C; --sunk: #2C2724; --ink: #F2EDE6; --muted: #B5ACA2; --line: #3A3430; --brand: #E3A1AC; --act-soft: #3A2A1A; color-scheme: dark; }}
* {{ box-sizing: border-box; }}
html {{ -webkit-text-size-adjust: 100%; }}
body {{ margin: 0; background: var(--bg); color: var(--ink); font: 400 16px/1.6 var(--f-text); }}
main {{ max-width: 760px; margin: 0 auto; padding: 16px 16px 64px; }}
.top {{ display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 0 16px; border-bottom: 2px solid var(--brand); margin-bottom: 24px; }}
.top a {{ color: var(--brand); text-decoration: none; font: 600 15px var(--f-text); }}
.logo {{ font: 800 28px/1 var(--f-display); color: var(--brand); letter-spacing: .01em; }}
h1, h2, h3, h4 {{ font-family: var(--f-display); font-weight: 800; line-height: 1.15; color: var(--brand); }}
h1 {{ font-size: clamp(30px, 7vw, 44px); margin: 8px 0 16px; }}
h2 {{ font-size: 24px; margin: 32px 0 8px; }}
h3 {{ font-size: 20px; margin: 24px 0 8px; font-weight: 600; }}
p, li {{ overflow-wrap: anywhere; }}
a {{ color: var(--brand); }}
code {{ font: 14px/1.4 ui-monospace, Menlo, monospace; background: var(--sunk); padding: 1px 4px; border-radius: 4px; }}
hr {{ border: 0; border-top: 1px solid var(--line); margin: 28px 0; }}
blockquote {{ margin: 16px 0; padding: 12px 16px; background: var(--paper); border-left: 4px solid var(--act); border-radius: 4px; }}
blockquote p {{ margin: 0; }}
.tw {{ overflow-x: auto; margin: 16px 0; border: 1px solid var(--line); border-radius: 10px; background: var(--paper); }}
table {{ border-collapse: collapse; width: 100%; font-size: 15px; }}
th, td {{ text-align: left; vertical-align: top; padding: 8px 12px; border-bottom: 1px solid var(--line); }}
th {{ font-weight: 600; background: var(--sunk); }}
tr:last-child td {{ border-bottom: 0; }}
.ph {{ background: var(--act-soft); border-radius: 4px; padding: 0 3px; }}
li.task {{ list-style: none; margin-left: -1.2em; }}
.box {{ display: inline-block; width: 14px; height: 14px; border: 2px solid var(--muted); border-radius: 3px; margin-right: 8px; vertical-align: -2px; }}
.box.on {{ background: var(--act); border-color: var(--act); }}
footer {{ margin-top: 40px; color: var(--muted); font-size: 14px; }}
</style>
</head>
<body>
<main>
<div class="top"><span class="logo">Жарко</span><a href="../">← В приложение</a></div>
{body}
<footer>Документ сгенерирован из legal/{name}.md</footer>
</main>
</body>
</html>
'''

if __name__ == '__main__':
    for name in PAGES:
        src = os.path.join(LEGAL, name + '.md')
        if not os.path.exists(src):
            print('нет', src); continue
        body, title = convert(open(src, encoding='utf-8').read())
        dst = os.path.join(LEGAL, name + '.html')
        open(dst, 'w', encoding='utf-8').write(PAGE.format(title=html.escape(re.sub(r'[*`]', '', title) or name), body=body, name=name))
        print('legal/' + name + '.html')
