# Membaca .xlsx langsung dari XML-nya (openpyxl gagal pada stylesheet berkas ini)
import sys, zipfile, re
from xml.etree import ElementTree as ET

NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
NSR = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'

def baca(path):
    z = zipfile.ZipFile(path)
    # shared strings
    sst = []
    if 'xl/sharedStrings.xml' in z.namelist():
        root = ET.fromstring(z.read('xl/sharedStrings.xml'))
        for si in root.findall(f'{NS}si'):
            sst.append(''.join(t.text or '' for t in si.iter(f'{NS}t')))
    # daftar lembar
    wb = ET.fromstring(z.read('xl/workbook.xml'))
    rels = ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
    peta = {r.get('Id'): r.get('Target') for r in rels}
    lembar = []
    for sh in wb.find(f'{NS}sheets'):
        tgt = peta[sh.get(f'{NSR}id')].lstrip('/')
        if not tgt.startswith('xl/'): tgt = 'xl/' + tgt
        lembar.append((sh.get('name'), tgt))
    return z, sst, lembar

def kolomIdx(ref):
    h = re.match(r'([A-Z]+)', ref).group(1)
    n = 0
    for c in h: n = n * 26 + (ord(c) - 64)
    return n - 1

def baris(z, sst, target):
    root = ET.fromstring(z.read(target))
    data = root.find(f'{NS}sheetData')
    for row in data.findall(f'{NS}row'):
        sel = {}
        for c in row.findall(f'{NS}c'):
            i = kolomIdx(c.get('r'))
            t = c.get('t')
            v = c.find(f'{NS}v')
            isx = c.find(f'{NS}is')
            if t == 's' and v is not None:
                nilai = sst[int(v.text)]
            elif t == 'inlineStr' and isx is not None:
                nilai = ''.join(x.text or '' for x in isx.iter(f'{NS}t'))
            elif v is not None:
                nilai = v.text
            else:
                nilai = None
            sel[i] = nilai
        if sel:
            lebar = max(sel) + 1
            yield [sel.get(i) for i in range(lebar)]
