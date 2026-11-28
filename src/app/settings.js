// Settings modal injected into the (pre-built) React app in Supremacy.html by
// build/patch_app.py. Plain createElement calls, no JSX. `g` is the app's React
// module binding inside the bundle.
function SupSettings({ onClose, inBattle }) {
  const R = g.default;
  const B3 = window.Battle3D || {};
  const levels = B3.QUALITY_LEVELS || ["low", "medium", "high", "ultra"];
  const [q, setQ] = R.useState(() => (B3.getQuality ? B3.getQuality() : "high"));
  const recommended = B3.defaultQuality ? B3.defaultQuality() : "high";
  R.useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  const pick = (v) => {
    setQ(v);
    B3.setQuality && B3.setQuality(v);
  };
  const info = {
    low: ["LOW", "Original look. Fastest; for older laptops and phones."],
    medium: ["MEDIUM", "Physical sky and sunlight, image-based lighting, PBR textures, detailed weapons, trees and rocks, wet puddles."],
    high: ["HIGH", "Adds wind-swept grass, ambient occlusion, HDR bloom, filmic grading and muzzle-flash lighting."],
    ultra: ["ULTRA", "Adds real-time puddle reflections, 4096px shadows, cloth-sheen and clear-coat materials, denser grass and full-resolution rendering. Needs a strong GPU."],
  };
  const mono = "'IBM Plex Mono', monospace";
  const h = R.createElement;
  return h(
    "div",
    {
      onClick: onClose,
      style: { position: "fixed", inset: 0, zIndex: 200, background: "rgba(5,8,6,0.82)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 },
    },
    h(
      "div",
      {
        role: "dialog",
        "aria-label": "Settings",
        onClick: (e) => e.stopPropagation(),
        style: { width: "100%", maxWidth: 440, background: "#0f140f", border: "1px solid #2a3630", borderRadius: 8, padding: "18px 18px 16px", fontFamily: mono, color: "#e8e4d5", boxShadow: "0 10px 40px rgba(0,0,0,0.6)" },
      },
      h("div", { style: { fontFamily: "'Oswald', sans-serif", fontSize: 22, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 14 } }, "SETTINGS"),
      h("div", { style: { fontSize: 10, color: "#8a9186", letterSpacing: "0.12em", marginBottom: 8 } }, "GRAPHICS QUALITY"),
      h(
        "div",
        { style: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 } },
        levels.map((v) =>
          h(
            "button",
            {
              key: v,
              onClick: () => pick(v),
              "aria-pressed": q === v,
              style: {
                background: q === v ? "#c9973f" : "#161d15",
                color: q === v ? "#0a0f0c" : "#c8c4b5",
                border: "1px solid " + (q === v ? "#c9973f" : "#2a3630"),
                borderRadius: 4,
                padding: "9px 2px",
                fontFamily: mono,
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.06em",
                cursor: "pointer",
              },
            },
            info[v] ? info[v][0] : v.toUpperCase(),
          ),
        ),
      ),
      h("p", { style: { fontSize: 11, lineHeight: 1.55, color: "#c8c4b5", margin: "12px 0 4px", minHeight: 52 } }, info[q] ? info[q][1] : ""),
      h(
        "p",
        { style: { fontSize: 10, color: "#5a6158", margin: "0 0 14px", letterSpacing: "0.04em" } },
        "RECOMMENDED FOR THIS DEVICE: ",
        (info[recommended] || [recommended])[0],
        inBattle ? " · APPLIES FROM YOUR NEXT BATTLE" : "",
      ),
      h(
        "button",
        {
          onClick: onClose,
          style: { width: "100%", background: "none", border: "1px solid #3d4a3f", color: "#8a9186", padding: "9px 8px", borderRadius: 4, fontFamily: mono, fontSize: 11, letterSpacing: "0.06em", cursor: "pointer" },
        },
        "CLOSE",
      ),
    ),
  );
}
