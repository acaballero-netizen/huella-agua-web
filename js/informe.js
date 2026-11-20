/* Informe imprimible de la huella de agua: UNA página A4, lo mínimo.
 *
 *   arriba   logo, nombre del proyecto y una línea de datos, sin caja
 *   centro   la rueda principal: clase de consumo de agua de los aparatos
 *   abajo    las cuatro ruedas pequeñas: riego, piscina, reutilización y huella
 *
 * Las ruedas son las mismas de la web (arco del valor sobre un anillo y la letra o la
 * cifra en el centro), con los colores de la escala A–G de la herramienta.
 * Es HTML que app.js pone en <section id="informe"> justo antes de imprimir; el aspecto
 * de papel está en estilos.css (@media print). No calcula nada: lee P (proyecto),
 * R (resultados del motor) y D (datos).
 */
(function (global) {
  "use strict";

  const fmt = (v, d = 1) => (v == null || !isFinite(v)) ? "–"
    : v.toLocaleString("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d });
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const CLASES = ["A", "B", "C", "D", "E", "F", "G"];
  // la escala A–G de la herramienta (estilos.css, --clase-A…G)
  const COLOR = { A: "#b3e0f5", B: "#7cc4ea", C: "#47a3d8", D: "#2b7fc0", E: "#2a5ba3", F: "#34408c", G: "#3d2a73" };
  const AZUL = "#2f7aa6", ANILLO = "#eef5fa";
  const LOGO = "https://nivel-industrializacion.five.es/assets/images/LOGO_IVE_MIN.svg";

  // Arco de la rueda: frac en 0..1, sobre un círculo de radio 50 centrado en (50, 50).
  function arco(frac) {
    if (frac == null || frac <= 0) return "";
    if (frac >= 0.9999) return "M 50 0 A 50 50 0 1 1 50 100 A 50 50 0 1 1 50 0 Z";
    const a = frac * 2 * Math.PI;
    const x = 50 + 50 * Math.sin(a), y = 50 - 50 * Math.cos(a);
    return `M 50 50 L 50 0 A 50 50 0 ${frac > 0.5 ? 1 : 0} 1 ${x.toFixed(3)} ${y.toFixed(3)} Z`;
  }
  // centro: texto grande; sub: texto pequeño debajo. Sin frac, solo el anillo.
  function rueda({ frac = null, color = AZUL, centro = "–", sub = "", vacia = false }) {
    return `<svg viewBox="0 0 100 100" class="${vacia ? "vacia" : ""}">
      <circle cx="50" cy="50" r="50" fill="${ANILLO}"/>
      ${frac != null ? `<path d="${arco(frac)}" fill="${color}"/>` : ""}
      <circle cx="50" cy="50" r="38" fill="#fff"/>
      <text x="50" y="${sub ? 52 : 57}" text-anchor="middle" class="r-c">${centro}</text>
      ${sub ? `<text x="50" y="66" text-anchor="middle" class="r-s">${sub}</text>` : ""}</svg>`;
  }
  // rueda de clase: el arco crece cuanto mejor es la letra (A llena, G casi vacía)
  const ruedaClase = (clase, sub) => clase
    ? rueda({ frac: (7 - CLASES.indexOf(clase)) / 7, color: COLOR[clase], centro: clase, sub })
    : rueda({ centro: "–", sub, vacia: true });

  function html(P, R) {
    const id = P.identificacion || {};
    const t = R.territorio || {};
    const pz = P.piscina, g = P.grises, pl = P.pluviales;
    const conReuso = g.existe || pl.existe;
    const tramo = R.tramo || "Sin escasez";
    const hoy = new Date().toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
    const ocupacion = P.uso === "Vivienda unifamiliar"
      ? `vivienda unifamiliar, ${fmt(R.totalOcu, 0)} ocupantes`
      : `${fmt(R.totalViv, 0)} viviendas, ${fmt(R.totalOcu, 0)} ocupantes`;

    const pequena = (titulo, cuerpo, pie) =>
      `<div class="i-peq"><h3>${titulo}</h3>${cuerpo}<p>${pie}</p></div>`;

    return `<div class="i-hoja">
      <header class="i-cab">
        <img class="i-logo" src="${LOGO}" alt="IVE">
        <p class="i-cab-tipo">Huella de agua en edificación</p>
        <h1 class="i-cab-nombre">${esc(id.nombre) || "Proyecto sin nombre"}</h1>
        <p class="i-cab-datos">${[id.promotor ? `Promotor: ${esc(id.promotor)}` : "", esc(P.provincia), ocupacion, hoy].filter(Boolean).join(" · ")}</p>
      </header>

      <section class="i-principal">
        <h2>Clase de consumo de agua</h2>
        <div class="i-rueda-grande">${ruedaClase(R.clase, `índice ${fmt(R.indice, 2)}`)}</div>
        <p class="i-cifra"><b>${fmt(R.apLitrosDia, 1)}</b> L/persona·día frente a ${fmt(R.refLitros, 1)} de referencia</p>
        <p class="i-nota">Consumo de los aparatos por persona comparado con la referencia nacional (INE),
          con la escala de una zona ${{ "Sin escasez": "sin escasez", "Escasez": "con escasez", "Escasez severa": "con escasez severa" }[tramo]} de agua.</p>
      </section>

      <section class="i-cuatro">
        ${pequena("Riego", ruedaClase(P.riego.existe ? R.claseRiego : null, P.riego.existe ? "" : "no incluido"),
          P.riego.existe ? `${fmt(R.riego.total, 0)} m³/año` : "Sin zonas verdes")}
        ${pequena("Piscina", ruedaClase(pz.existe ? R.clasePiscina : null, pz.existe ? "" : "no incluida"),
          pz.existe ? `${fmt(R.piscina.total, 0)} m³/año` : "Sin piscina")}
        ${pequena("Reutilización", ruedaClase(conReuso ? R.claseReuso : null, conReuso ? "" : "no incluida"),
          conReuso ? `${fmt(R.coberturaReuso * 100, 0)} % cubierto` : "Sin aguas grises ni pluviales")}
        ${pequena("Huella", rueda({ centro: fmt(R.huellaPersona, 0), sub: "m³ eq" }),
          `m³ eq/persona·año · AWARE ${fmt(t.aware, 2)}`)}
      </section>

      <footer class="i-pie">Estimación de proyecto con los datos declarados; los valores distintos de los de partida son responsabilidad del proyectista.
        Fuentes: INE, CTE DB-HS4, European Water Label, AEMET, FAO-56, WEI+ (MITECO), AWARE 2.0 (WULCA), ISO 14046.</footer>
    </div>`;
  }

  global.HA_INFORME = { html };
})(typeof window !== "undefined" ? window : globalThis);
