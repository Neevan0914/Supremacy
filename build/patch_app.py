# One-off patch of the pre-built React app inside Supremacy.html: adds the
# Settings modal (src/app/settings.js) plus buttons to open it. Idempotent.
import re, sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
root = pathlib.Path(__file__).resolve().parent.parent
html = (root / "Supremacy.html").read_text()
MARK = "/*sup-settings*/"
comp = (root / "src/app/settings.js").read_text()
comp = "\n".join(l for l in comp.splitlines() if not l.startswith("//"))
if MARK in html:
    # replace previously injected component with the current source
    html = re.sub(r"/\*sup-settings\*/.*?/\*end-sup-settings\*/", lambda m: MARK + comp + "/*end-sup-settings*/", html, flags=re.S)
else:
    btn_style = 'style:{flex:"0 1 140px",background:"none",border:"1px solid #3d4a3f",color:"#8a9186",padding:"8px 8px",borderRadius:4,fontFamily:"\'IBM Plex Mono\', monospace",fontSize:10,letterSpacing:"0.04em",cursor:"pointer"}'
    pairs = [
        ("function J0(){let[l,t]=(0,g.useState)(null)",
         MARK + comp + "/*end-sup-settings*/\nfunction J0(){let[__st,__setSt]=(0,g.useState)(0);let[l,t]=(0,g.useState)(null)"),
        ("function f2({onSelectMap:l})", "function f2({onSelectMap:l,onSettings:__os})"),
        ('"EVERY HEXAGON A NATION. CONQUER, ALLY, OR BE CONQUERED.")',
         '"EVERY HEXAGON A NATION. CONQUER, ALLY, OR BE CONQUERED."),g.default.createElement("button",{onClick:__os,style:{background:"none",border:"1px solid #3d4a3f",color:"#8a9186",padding:"8px 22px",borderRadius:4,fontFamily:"\'IBM Plex Mono\', monospace",fontSize:11,letterSpacing:"0.08em",cursor:"pointer"}},"\\u2699 SETTINGS")'),
        ('a==="title"&&g.default.createElement(f2,{onSelectMap:wu})',
         'a==="title"&&g.default.createElement(f2,{onSelectMap:wu,onSettings:()=>__setSt(1)}),__st&&g.default.createElement(SupSettings,{onClose:()=>{__st===2&&an(!1),__setSt(0)},inBattle:a==="battle"})'),
        ('"\\u27F2 MENU"),g.default.createElement("button",{onClick:()=>an(B=>!B)',
         '"\\u27F2 MENU"),g.default.createElement("button",{onClick:()=>{a==="battle"&&!yt?(an(!0),__setSt(2)):__setSt(1)},' + btn_style + '},"\\u2699 SETTINGS"),g.default.createElement("button",{onClick:()=>an(B=>!B)'),
    ]
    for old, new in pairs:
        if html.count(old) != 1:
            sys.exit(f"anchor not unique/found: {old[:80]}")
        html = html.replace(old, new)
(root / "Supremacy.html").write_text(html)
print("app patched")
