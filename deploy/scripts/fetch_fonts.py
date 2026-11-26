#!/usr/bin/env python3
"""Жарко: скачать шрифты на сервер один раз, чтобы пользователи грузили их с нашего домена, а не из-за рубежа.
   sudo python3 scripts/fetch_fonts.py [/srv/zharko-web/fonts]
Кладёт 6 файлов woff2 (кириллица + латиница) с именами, которые ждёт css/fonts.css приложения:
  fira-sans-extra-condensed-{600,800}-{cyrillic,latin}.woff2, golos-text-{cyrillic,latin}.woff2
Источник 1 — Google Fonts (CSS API, из него берём ссылки на файлы), источник 2 — пакеты Fontsource на jsDelivr.
Скачивание идёт с СЕРВЕРА и один раз; данные пользователей при этом никуда не передаются.
Уже скачанные файлы не перекачиваются. Только стандартная библиотека Python."""
import os, re, sys, urllib.request

DST = sys.argv[1] if len(sys.argv) > 1 else '/srv/zharko-web/fonts'
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
SUBSETS = ('cyrillic', 'latin')
WANT = {  # имя файла → (семейство, начертание в CSS Google, имя у Fontsource)
    **{f'fira-sans-extra-condensed-{w}-{s}.woff2': ('Fira Sans Extra Condensed', str(w), s,
        f'https://cdn.jsdelivr.net/npm/@fontsource/fira-sans-extra-condensed@5/files/fira-sans-extra-condensed-{s}-{w}-normal.woff2')
       for w in (600, 800) for s in SUBSETS},
    **{f'golos-text-{s}.woff2': ('Golos Text', '400 700', s,
        f'https://cdn.jsdelivr.net/npm/@fontsource-variable/golos-text@5/files/golos-text-{s}-wght-normal.woff2')
       for s in SUBSETS},
}
GOOGLE_CSS = 'https://fonts.googleapis.com/css2?family=Fira+Sans+Extra+Condensed:wght@600;800&family=Golos+Text:wght@400..700&display=swap'

def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=30) as r:
        return r.read()

def google_urls():
    """CSS Google: блоки «/* subset */ @font-face {...}» → {(семейство, вес, subset): url}"""
    try:
        css = get(GOOGLE_CSS).decode('utf-8')
    except Exception as e:
        print('  Google Fonts недоступен:', e); return {}
    out = {}
    for sub, block in re.findall(r'/\*\s*([\w-]+)\s*\*/\s*@font-face\s*\{(.*?)\}', css, re.S):
        fam = re.search(r"font-family:\s*'([^']+)'", block); w = re.search(r'font-weight:\s*([\d ]+);', block)
        url = re.search(r'url\((https://[^)]+\.woff2)\)', block)
        if fam and w and url:
            out[(fam.group(1), w.group(1).strip(), sub)] = url.group(1)
    return out

def ok_woff2(b):
    return len(b) > 1000 and b[:4] == b'wOF2'

def main():
    os.makedirs(DST, exist_ok=True)
    need = {n: v for n, v in WANT.items() if not os.path.exists(os.path.join(DST, n))}
    if not need:
        print('Шрифты уже на месте:', DST); return 0
    g = google_urls()
    bad = []
    for name, (fam, w, sub, fallback) in need.items():
        data = None
        for url in filter(None, [g.get((fam, w, sub)), fallback]):
            try:
                b = get(url)
                if ok_woff2(b):
                    data = b; break
                print('  не woff2:', url)
            except Exception as e:
                print('  не скачалось:', url, '-', e)
        if data is None:
            bad.append(name); continue
        tmp = os.path.join(DST, name + '.part')
        open(tmp, 'wb').write(data); os.replace(tmp, os.path.join(DST, name))
        print(f'  {name}  {len(data) // 1024} КБ')
    if bad:
        print('Не скачались:', ', '.join(bad), '— приложение покажет запасные шрифты. Повтори позже.'); return 1
    print('Готово:', DST); return 0

if __name__ == '__main__':
    sys.exit(main())
