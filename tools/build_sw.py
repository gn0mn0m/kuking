"""Пересобрать sw.js после любых правок: python3 tools/build_sw.py
Версия кэша = хэш всех файлов, поэтому телефоны сами подтянут обновление."""
import os, hashlib, json
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# deploy/ — серверный комплект, fonts/ — только на сервере (воркер кэширует шрифты при первом запросе)
skip_dirs = ('.git', 'tools', 'supabase', '.github', 'deploy', 'fonts')
files = []
for d, dirs, fs in os.walk(root):
    dirs[:] = [x for x in dirs if x not in skip_dirs]
    for f in fs:
        p = os.path.relpath(os.path.join(d, f), root)
        if p in ('sw.js',) or p.endswith('.md') or f.startswith('.'):
            continue
        files.append(p)
files.sort()
h = hashlib.sha1()
for f in files:
    h.update(open(os.path.join(root, f), 'rb').read())
tpl = open(os.path.join(root, 'tools', 'sw.template.js'), encoding='utf8').read()
out = tpl.replace('__VERSION__', h.hexdigest()[:10]).replace('__ASSETS__', json.dumps(['./'] + files, ensure_ascii=False, indent=0))
open(os.path.join(root, 'sw.js'), 'w', encoding='utf8').write(out)
print('sw.js:', h.hexdigest()[:10], len(files), 'files')
