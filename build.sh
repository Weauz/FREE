#!/bin/bash
# Fabrique FREE en version $1 (ex : ./build.sh 1.1.0) : FREE.exe, dossier layout, FREE-Installation.exe
set -e
V="$1"; [[ "$V" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "usage: build.sh X.Y.Z"; exit 1; }
C="${V//./,},0"
cd /home/claude
# 1. numeros de version partout
python3 - "$V" <<'P'
import json,re,sys
v=sys.argv[1]
p='free/package.json'; d=json.load(open(p)); d['version']=v; open(p,'w').write(json.dumps(d,indent=2,ensure_ascii=False)+'\n')
for p in ['launcher/FREE.cs','setup/Setup.cs']:
    s=open(p,encoding='utf-8').read()
    s=re.sub(r'Assembly(File)?Version\("[^"]*"\)', lambda m:'Assembly%sVersion("%s.0")'%(m.group(1) or '',v), s)
    s=re.sub(r'public const string Version = "[^"]*";','public const string Version = "%s";'%v, s)
    open(p,'w',encoding='utf-8').write(s)
p='setup/setup.rc'; s=open(p).read()
c=v.replace('.',',')+',0'
s=re.sub(r'(FILEVERSION|PRODUCTVERSION) [0-9,]+', lambda m:m.group(1)+' '+c, s)
s=re.sub(r'"(FileVersion|ProductVersion)", "[^"]*"', lambda m:'"%s", "%s"'%(m.group(1), v+'.0' if m.group(1)=='FileVersion' else v), s)
s=re.sub(r'version="[0-9.]+" processorArchitecture', 'version="%s.0" processorArchitecture'%v, open('setup/setup.manifest').read()) if False else s
open(p,'w').write(s)
P
# 2. FREE.exe
(cd launcher && mcs -sdk:4.5 -target:winexe -optimize -win32icon:free.ico -out:FREE.exe -r:System.Windows.Forms.dll -r:System.Drawing.dll -r:System.IO.Compression.dll -r:System.IO.Compression.FileSystem.dll FREE.cs 2>&1 | grep -E "error|succeeded")
# 3. dossier layout (fins de ligne Windows, BOM pour le LISEZ-MOI)
L=/mnt/user-data/outputs/layout
rm -rf $L && mkdir -p $L/ressources/app $L/ressources/installation
cp launcher/FREE.exe $L/
(printf '\xef\xbb\xbf'; sed 's/$/\r/' out/share/LISEZ-MOI.txt) > $L/LISEZ-MOI.txt
sed 's/$/\r/' out/share/Installation/installer-rea.ps1 > $L/ressources/installation/installer-rea.ps1
(cd free && find . -path ./node_modules -prune -o -type f -print) | while read f; do
  mkdir -p "$L/ressources/app/$(dirname "$f")"
  case "$f" in *.ico|*.png) cp "free/$f" "$L/ressources/app/$f";; *) sed 's/\r\?$/\r/' "free/$f" > "$L/ressources/app/$f";; esac
done
# 4. installateur
cd setup
x86_64-w64-mingw32-windres --preprocessor=cpp -c 1252 -O res setup.rc -o setup.res
rm -f payload.zip; (cd $L && zip -qr -9 -X /home/claude/setup/payload.zip FREE.exe LISEZ-MOI.txt ressources)
mcs -sdk:4.5 -target:winexe -optimize -win32res:setup.res -resource:payload.zip,payload.zip -resource:logo.png,logo.png -out:FREE-Installation.exe -r:System.Windows.Forms.dll -r:System.Drawing.dll -r:System.IO.Compression.dll Setup.cs 2>&1 | grep -E "error|succeeded"
cp FREE-Installation.exe /mnt/user-data/outputs/FREE-Installation.exe
echo "FREE $V construit."
