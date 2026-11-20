/* Interfaz de la web: pinta las secciones, recoge los datos y enseña los resultados.
 *
 * No calcula nada por sí misma. Funciona en dos modos (ver js/api.js):
 *   servidor  pide los números a la API, igual que la herramienta de industrialización del
 *             IVE. El motor (calculo.js) y los datos (datos.js) no llegan al navegador.
 *   demo      sin API (doble clic, página publicada): carga calculo.js y datos.js y calcula
 *             en el propio navegador.
 * El proyecto no se guarda en ningún servidor. Vive en esta pestaña (sessionStorage): se
 * conserva al recargar y se pierde al cerrarla.
 */
(function () {
  "use strict";

  let D = null;                      // tablas de datos: de la API o de js/datos.js (arrancar)
  const C = window.HA_PROYECTO;      // catálogo de aparatos y proyecto de partida (js/proyecto.js)
  const API = window.HA_API;
  const CLAVE = "ha-web-proyecto-v2";   // v2: tipologías como filas y bloque unifamiliar

  // ------------------------------------------------------------------ estado
  // Lo que guardaban las versiones anteriores en el navegador (localStorage) se borra: el
  // proyecto ya no debe sobrevivir a cerrar la página.
  try { localStorage.removeItem(CLAVE); localStorage.removeItem("ha-web-estado-servidor"); } catch (e) { /* nada */ }
  let P = cargar();
  let R = null;                      // resultados del motor: los pone render()
  const abiertas = { emplazamiento: true, aparatos: true, riego: false, piscina: false, reutilizacion: false, resultados: true };

  // Completa un proyecto guardado en la pestaña con lo que viene del código. null si no
  // tiene la forma esperada.
  function normalizar(guardado) {
    const base = C.proyectoPorDefecto();
    if (!(guardado && Array.isArray(guardado.aparatos) && guardado.aparatos.length === base.aparatos.length)) return null;
    // los valores de partida y las unidades vienen siempre del código, no del guardado
    guardado.aparatos = guardado.aparatos.map((a, i) => ({ ...base.aparatos[i],
      presente: a.presente, caudal: a.caudal, n: a.n,                     // la base es fija
      usos: C.USOS_QUE_SIGUEN.includes(a.id) && a.usos === base.aparatos[i].usosDef ? null : a.usos }));
    // antes había un depósito único: pasa a ser el aljibe de pluviales
    if (guardado.deposito != null && guardado.depositoPluviales == null) guardado.depositoPluviales = guardado.deposito;
    delete guardado.deposito;
    return { ...base, ...guardado };
  }
  function cargar() {
    try {
      const p = normalizar(JSON.parse(sessionStorage.getItem(CLAVE) || "null"));
      if (p) return p;
    } catch (e) { /* sin almacenamiento: se arranca con el proyecto vacío */ }
    return C.proyectoVacio();
  }
  function guardar() {
    try { sessionStorage.setItem(CLAVE, JSON.stringify(P)); } catch (e) { /* nada */ }
  }

  // ------------------------------------------------------------------ utilidades
  // «–» si el dato aún no está (vacío o cero): en los resúmenes, pendiente
  const oGuion = (v, d = 1) => (v == null || !isFinite(v) || v === 0) ? "–" : fmt(v, d);
  const fmt = (v, d = 1) => (v == null || !isFinite(v)) ? "–"
    : v.toLocaleString("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d });
  const aTexto = v => (v == null || v === "") ? "" : String(v).replace(".", ",");
  function aNumero(s) {
    s = String(s).trim().replace(/\s/g, "");
    if (s === "") return null;
    if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
    const n = Number(s);
    return isFinite(n) ? n : NaN;
  }

  function h(tag, attrs, ...hijos) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k === "html") el.innerHTML = v;
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const c of hijos.flat(Infinity)) {
      if (c == null || c === false) continue;
      el.append(c.nodeType ? c : document.createTextNode(c));
    }
    return el;
  }
  const svg = (html, attrs) => {
    const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    for (const [k, v] of Object.entries(attrs)) s.setAttribute(k, v);
    s.innerHTML = html;
    return s;
  };

  const colorClase = c => `var(--clase-${c})`;
  const letra = c => c ? h("span", { class: "letra" + (["A", "B"].includes(c) ? " oscura" : ""),
    style: `background:${colorClase(c)}` }, c) : h("span", {}, "—");

  // ------------------------------------------------------------------ rueda
  // Donut de la herramienta IVE: arco del valor sobre un círculo gris y un círculo
  // blanco al 75 % encima. frac en 0..1; null deja solo el anillo gris.
  function arco(frac) {
    if (frac == null || frac <= 0) return "";
    if (frac >= 0.9999) return "M 50 0 A 50 50 0 1 1 50 100 A 50 50 0 1 1 50 0 Z";
    const a = frac * 2 * Math.PI;
    const x = 50 + 50 * Math.sin(a), y = 50 - 50 * Math.cos(a);
    return `M 50 50 L 50 0 A 50 50 0 ${frac > 0.5 ? 1 : 0} 1 ${x.toFixed(3)} ${y.toFixed(3)} Z`;
  }
  function rueda(el, { frac = null, texto = "", sub = "", color = "var(--primary-colour)", tipo = "" }) {
    el.innerHTML = "";
    const w = h("div", { class: "wheel " + tipo });
    const circ = h("div", { class: "circle" });
    circ.append(
      svg(`<path d="M 50 0 A 50 50 0 1 1 50 100 A 50 50 0 1 1 50 0 Z" fill="var(--secondary-colour)"/>` +
          `<path d="${arco(frac)}" fill="${color}"/>` +
          `<circle cx="50" cy="50" r="37.5" fill="var(--background-colour)"/>`,
          { viewBox: "0 0 100 100" }),
      h("div", { class: "label" }, texto, sub ? h("small", {}, sub) : null));
    w.append(circ);
    el.append(w);
  }
  function ruedaClase(el, clase, sub) {
    if (!clase) return rueda(el, { texto: "—", sub, tipo: "de-letra" });
    const i = C.CLASES.indexOf(clase);
    rueda(el, { frac: (7 - i) / 7, texto: clase, sub, color: colorClase(clase), tipo: "de-letra" });
  }
  const ruedaPendiente = el => rueda(el, { texto: "pendiente", tipo: "pendiente" });

  // ------------------------------------------------------------------ controles
  /* Todos los campos tienen la misma forma: etiqueta ENCIMA de la caja, nunca dentro.
   * Así dos campos puestos en fila quedan alineados por arriba aunque uno tenga etiqueta
   * larga y otro corta. Lo editable va en azul (clase .field); lo que no se toca, en gris
   * (.field.lectura-only). Ver la cabecera de estilos.css. */
  function campoBase(etiqueta, control, { unidad, clases = "", ancho, ayuda } = {}) {
    return h("div", { class: "field " + clases, style: ancho ? `max-width:${ancho}` : null },
      etiqueta ? h("div", { class: "etq" }, etiqueta,
        ayuda ? info(typeof etiqueta === "string" ? etiqueta : "", ayuda) : null) : null,
      h("div", { class: "caja" + (unidad ? " con-unidad" : "") }, control,
        unidad ? h("span", { class: "unidad" }, unidad) : null),
      h("span", { class: "error" }));
  }
  function campo({ etiqueta, valor, unidad, alCambiar, modificado, soloLectura, ancho, ayuda, placeholder }) {
    const input = h("input", { type: "text", inputmode: "decimal", autocomplete: "off",
      value: aTexto(valor), readonly: soloLectura || null, "aria-label": etiqueta, placeholder: placeholder || "–" });
    const f = campoBase(etiqueta, input, { unidad, ancho, ayuda,
      clases: (modificado ? "modificado " : "") + (soloLectura ? "lectura-only" : "") });
    const err = f.querySelector(".error");
    input.addEventListener("input", () => {
      const n = aNumero(input.value);
      if (Number.isNaN(n) || (n != null && n < 0)) { err.textContent = "Número no válido"; return; }
      err.textContent = "";
      alCambiar(n, f);
    });
    return f;
  }
  function campoTexto({ etiqueta, valor, alCambiar }) {
    const input = h("input", { type: "text", autocomplete: "off", value: valor || "", "aria-label": etiqueta,
      oninput: e => alCambiar(e.target.value) });
    return campoBase(etiqueta, input);
  }
  // sinEtiqueta: cuando el título de grupo ya dice qué es (p. ej. «Provincia del proyecto»).
  // Opción vacía de un desplegable: «- Seleccionar … -», elegida mientras no haya valor.
  const sinValor = v => v == null || v === "";
  const opcionVacia = (texto, valor) => h("option", { value: "", disabled: true, selected: sinValor(valor) || null }, `- ${texto} -`);
  function desplegable({ etiqueta, opciones, valor, alCambiar, clases, sinEtiqueta, vacio }) {
    const sel = h("select", { "aria-label": etiqueta, class: sinValor(valor) ? "pendiente" : null, onchange: e => alCambiar(e.target.value) },
      vacio ? opcionVacia(vacio, valor) : null,
      opciones.map(o => {
        const [v, t] = Array.isArray(o) ? o : [o, o];
        return h("option", { value: v, selected: String(v) === String(valor) || null }, t);
      }));
    return campoBase(sinEtiqueta ? null : etiqueta, sel, { clases });
  }
  // Título de grupo (nivel 3 de texto). editable=true → azul: «esto lo rellenas tú».
  // editable=false → gris oscuro: «esto son datos que da la herramienta».
  // extra: algo que va en la misma línea, pegado a la derecha (un indicador, un total).
  function grupo(titulo, { editable = true, ayuda, extra } = {}) {
    return h("div", { class: "grupo-titulo " + (editable ? "editable" : "dato") }, titulo,
      ayuda ? info(titulo, ayuda) : null,
      extra ? h("div", { class: "grupo-extra" }, extra) : null);
  }
  // Mini resumen de una subsección plegada: piezas «valor + etiqueta» separadas.
  // Cada pieza es un texto, [valor, etiqueta] o un nodo (p. ej. una etiqueta de color).
  function resumen(piezas) {
    return h("div", { class: "resumen" }, piezas.filter(Boolean).map(p =>
      Array.isArray(p) ? h("span", { class: "pieza" }, h("strong", {}, p[0]), " " + p[1])
        : p.nodeType ? p : h("span", { class: "pieza" }, p)));
  }
  const claseTramo = tramo => "tramo tramo-" + (tramo || "").replace(/\s/g, "-").toLowerCase();
  // Elección entre pocas opciones grandes y excluyentes, con icono y una línea de texto.
  function tarjetas({ items, valor, alCambiar, etiqueta }) {
    return h("div", { class: "tarjetas", role: "radiogroup", "aria-label": etiqueta },
      items.map(it => h("button", { type: "button", class: "tarjeta", role: "radio",
        "aria-checked": String(it.valor === valor), onclick: () => { if (it.valor !== valor) alCambiar(it.valor); } },
        h("span", { class: "tarjeta-icono", html: it.icono }),
        h("span", { class: "tarjeta-texto" }, h("strong", {}, it.titulo), h("span", {}, it.texto)),
        h("span", { class: "tarjeta-check", "aria-hidden": "true" }))));
  }
  function interruptor(activo, alCambiar, etiqueta) {
    return h("button", { class: "switch", role: "switch", "aria-checked": String(!!activo),
      "aria-label": etiqueta || "Activar", onclick: e => { e.stopPropagation(); alCambiar(!activo); } },
      svg(`<rect class="track" x="0" y="0" width="45" height="25" rx="12.5"/><circle class="thumb" cy="12.5" r="10"/>`,
        { viewBox: "0 0 45 25" }));
  }
  function opciones({ titulo, items, valor, alCambiar, vertical }) {
    return h("div", {},
      titulo ? grupo(titulo) : null,
      h("div", { class: "menu" + (vertical ? " vertical" : "") }, items.map(([v, t]) =>
        h("div", { class: "opcion", role: "radio", tabindex: 0, "aria-checked": String(v === valor),
          onclick: () => alCambiar(v), onkeydown: e => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); alCambiar(v); } } },
          svg(`<circle cx="10" cy="10" r="8" stroke-width="1"/>`, { class: "bullet", viewBox: "0 0 20 20" }),
          h("span", {}, t)))));
  }
  // items: [clave, texto, activo, motivo]. Con motivo, la casilla no se puede marcar (el
  // proyecto no tiene ese uso) y el motivo se dice en gris al lado.
  function casillas({ titulo, items, alCambiar, horizontal, ayuda }) {
    return h("div", {},
      titulo ? grupo(titulo, { ayuda }) : null,
      h("div", { class: "menu " + (horizontal ? "en-linea" : "vertical") }, items.map(([clave, t, activo, motivo]) =>
        h("div", { class: "opcion" + (motivo ? " no-aplica" : ""), role: "checkbox", tabindex: motivo ? -1 : 0,
          "aria-checked": String(!!activo && !motivo), "aria-disabled": motivo ? "true" : null,
          onclick: () => { if (!motivo) alCambiar(clave, !activo); },
          onkeydown: e => { if (!motivo && (e.key === " " || e.key === "Enter")) { e.preventDefault(); alCambiar(clave, !activo); } } },
          h("div", { class: "box" }, svg(`<polyline points="1 5.5 4.5 9 11 1" stroke="#fff" stroke-width="2" fill="none"/>`, { width: 12, height: 10, viewBox: "0 0 12 10" })),
          h("span", {}, t, motivo ? h("small", {}, ` · ${motivo}`) : null)))));
  }
  // Dato calculado con forma de campo, en gris: alineado con las cajas de al lado.
  function campoDato(etiqueta, id, unidad, ayuda) {
    return campoBase(etiqueta, h("input", { type: "text", readonly: true, tabindex: -1, id, "aria-label": etiqueta }),
      { unidad, clases: "lectura-only", ayuda });
  }
  function info(titulo, html) {
    return h("button", { class: "info", "aria-label": "Más información", onclick: e => {
      e.stopPropagation();
      document.getElementById("info-titulo").textContent = titulo;
      document.getElementById("info-texto").innerHTML = html;
      document.getElementById("modal-info").hidden = false;
    } }, svg(`<path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14m0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16"/><path d="m8.93 6.588-2.29.287-.082.38.45.083c.294.07.352.176.288.469l-.738 3.468c-.194.897.105 1.319.808 1.319.545 0 1.178-.252 1.465-.598l.088-.416c-.2.176-.492.246-.686.246-.275 0-.375-.193-.304-.533zM9 4.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0"/>`,
      { width: "1rem", height: "1rem", viewBox: "0 0 16 16", class: "symbol" }));
  }

  // ------------------------------------------------------------------ esqueleto de sección
  // Plegada: resumen con una fila por subsección y las dos ruedas de la sección.
  // Abierta: los controles, y las ruedas pasan a ser dos columnas de valores por fila.
  // Sin h1/h2 la sección es «de datos»: sin columnas de ruedas, a todo lo ancho.
  // inactiva: el proyecto no tiene ese bloque (sin riego, sin piscina…). No se enseñan
  // ruedas ni cabeceras de ruedas; plegada no muestra nada más que el título con «No
  // incluido», y abierta solo el interruptor para activarla.
  // interruptores: las secciones opcionales (riego, piscina, reutilización) se activan
  // desde la propia cabecera, sin abrirla primero. Cada uno es { activo, alCambiar,
  // texto }; al activarlo la sección se abre sola y al desactivarlo se pliega.
  function seccion({ id, numero, titulo, h1, h2, cuerpo, inactiva, interruptores }) {
    const conRuedas = !!h1;
    const r1 = h("div", { class: "progress", "data-rueda": id + "-1" });
    const r2 = h("div", { class: "progress", "data-rueda": id + "-2" });
    const conmutadores = (interruptores || []).map(sw =>
      h("label", { class: "sec-switch", onclick: e => e.stopPropagation() },
        interruptor(sw.activo, v => { abiertas[id] = v || !inactivaTras(sw, v); sw.alCambiar(v); }, sw.texto || `Incluir ${titulo.toLowerCase()}`),
        sw.texto ? h("span", {}, sw.texto) : null));
    // ¿quedará la sección sin nada activado tras este cambio? Entonces se pliega.
    function inactivaTras(sw, v) {
      return !v && (interruptores || []).every(o => o === sw || !o.activo);
    }
    const el = h("section", { class: "section" + (abiertas[id] ? " abierta" : "") + (conRuedas ? "" : " de-datos") +
        (inactiva ? " inactiva" : "") + (interruptores ? " opcional" : ""), id: "sec-" + id },
      h("div", { class: "section-border" },
        h("div", { class: "section-header", onclick: () => {
            if (el.classList.contains("bloqueada")) return;
            abiertas[id] = !abiertas[id]; el.classList.toggle("abierta"); } },
          h("div", { class: "title" },
            h("span", { class: "title-texto" }, `${numero}. ${titulo}`),
            conmutadores.length ? h("span", { class: "sec-switches" }, conmutadores) : null,
            inactiva && !interruptores ? h("span", { class: "no-incluido" }, "No incluido") : null),
          conRuedas ? h("div", { class: "h1", html: h1 }) : null,
          conRuedas ? h("div", { class: "h2", html: h2 }) : null,
          h("div", { class: "toggle" }, h("span", { class: "estado-sec", "data-estado-sec": id }),
            svg(`<path d="M 6 9 l 6 6 6-6"/>`, { viewBox: "0 0 24 24", class: "arrow" }))),
        h("div", { class: "section-contents" },
          h("div", { class: "section-body" }, cuerpo),
          conRuedas ? [h("div", { class: "wheel-col" }, r1), h("div", { class: "wheel-col" }, r2), h("div", {})] : null)));
    return el;
  }
  // Subsección: título (+ ⓘ), control principal a la derecha, dos columnas de resultado
  // y el cuerpo con el resto de campos.
  // ancha: el cuerpo ocupa todo el ancho al abrir (sin las dos columnas de valores),
  // para subsecciones que llevan sus propios resultados en tabla.
  function subseccion({ id, numero, titulo, ayuda, control, cuerpo, apagado, textoApagado, ancha }) {
    return h("div", { class: "sub" + (apagado ? " apagado" : "") + (ancha ? " ancha" : ""), "data-sub": id },
      h("div", { class: "sub-header" },
        h("div", { class: "sub-title" }, h("span", { class: "num" }, numero), titulo.toUpperCase(),
          ayuda ? info(`${numero} ${titulo.toUpperCase()}`, ayuda) : null),
        h("div", { class: "sub-slot" },
          h("div", { class: "sub-value", "data-resumen": id }, "-"),
          control ? h("div", { class: "ctrl" }, control) : null)),
      h("div", { class: "sub-res r1", "data-r1": id }),
      h("div", { class: "sub-res r2", "data-r2": id }),
      h("div", { class: "sub-body" },
        textoApagado ? h("div", { class: "apagado-texto" }, textoApagado) : null,
        cuerpo || null));
  }

  // ------------------------------------------------------------------ 1 · emplazamiento
  // Contador − n + para cantidades enteras pequeñas (viviendas, ocupantes).
  // Vacío (null) mientras no se escriba nada: placeholder «–» y el dato queda pendiente.
  function contador({ valor, min = 0, max = 999, etiqueta, alCambiar }) {
    const input = h("input", { type: "text", inputmode: "numeric", value: valor == null ? "" : String(valor), placeholder: "–", "aria-label": etiqueta });
    const fijar = n => {
      n = Math.max(min, Math.min(max, Math.round(n)));
      input.value = String(n);
      alCambiar(n);
    };
    input.addEventListener("input", () => {
      const n = aNumero(input.value);
      if (n == null) { alCambiar(null); return; }
      if (!Number.isNaN(n)) alCambiar(Math.max(min, Math.min(max, Math.round(n))));
    });
    input.addEventListener("blur", () => { const n = aNumero(input.value); if (n != null && !Number.isNaN(n)) fijar(n); });
    return h("div", { class: "contador" },
      h("button", { type: "button", "aria-label": "Restar", onclick: () => fijar(aNumero(input.value) == null ? min : aNumero(input.value) - 1) }, "−"),
      input,
      h("button", { type: "button", "aria-label": "Sumar", onclick: () => fijar(aNumero(input.value) == null ? Math.max(min, 1) : aNumero(input.value) + 1) }, "+"));
  }

  const MESES_CORTO = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const suma = a => (a || []).reduce((s, v) => s + v, 0);
  const nombreTipo = tipo => {
    const tp = D.tipologias.find(x => x.TIPOLOGIA === tipo);
    return tp ? `${tipo} · ${tp.COMPOSICION}` : tipo;
  };

  // Textos de los ⓘ de los datos de la provincia. Cada uno dice qué es, para qué sirve
  // en el cálculo y de dónde sale.
  const AYUDA_DATO = {
    wei: t => `<p>Índice de explotación del agua de la demarcación <strong>${t.demarcacion}</strong>: agua extraída frente a recurso renovable.</p>
      <p>Decide el tramo de escasez, que endurece los umbrales de la clase: por debajo del 20 % sin escasez, entre 20 y 40 % escasez, desde 40 % escasez severa. Aquí: <strong>${fmt(t.wei, 1)} % · ${t.tramo.toLowerCase()}</strong>.</p>
      <p class="fuente">Eurostat / MITECO, WEI+ 2015-2021, por demarcación hidrográfica.</p>`,
    aware: t => `<p>Factor de caracterización de la escasez: convierte cada m³ consumido en m³ equivalentes mundiales. Es el que da la huella ISO 14046.</p>
      <p>Va por comunidad autónoma (${t.comunidad}), que es la resolución a la que la fuente publica España, con la agregación no agrícola.</p>
      <p class="fuente">WULCA, AWARE 2.0, fichero subnacional, hoja CFs_nonagri, valor anual.</p>`,
    p: t => `<p>Precipitación media anual de la estación de referencia. Alimenta el balance mensual de las aguas pluviales y el riego.</p>
      <p class="fuente">AEMET, valores climatológicos normales, estación ${t.estacion} (${t.indicativo}).</p>`,
    eto: t => `<p>Evapotranspiración de referencia: el agua que pierde un césped bien regado. Fija la necesidad de riego y la evaporación del vaso de la piscina (ETo × 1,05).</p>
      <p>AEMET no la publica: se calcula por FAO-56, aquí con <strong>${t.metodoEto}</strong>.</p>
      <p class="fuente">FAO-56: Penman-Monteith ec. 6 (viento 2 m/s) o Hargreaves-Samani ec. 52 donde la estación no publica horas de sol.</p>`,
  };
  function ayudaClima(t) {
    const fila = (txt, vals, d = 0) => `<tr><th>${txt}</th>${vals.map(v => `<td>${fmt(v, d)}</td>`).join("")}<td><strong>${fmt(suma(vals), 0)}</strong></td></tr>`;
    return `<p>Estación <strong>${t.estacion}</strong> (indicativo ${t.indicativo}). ETo por ${t.metodoEto}.</p>
      ${t.observacion ? `<p>${t.observacion}</p>` : ""}
      <div class="tabla-meses"><table>
        <tr><th></th>${MESES_CORTO.map(m => `<th>${m}</th>`).join("")}<th>Año</th></tr>
        ${fila("Precipitación, mm", t.p)}
        ${fila("ETo, mm", t.eto, 0)}
      </table></div>
      <p class="fuente">AEMET, valores climatológicos normales · FAO-56.</p>`;
  }

  function secEmplazamiento() {
    const provincias = D.territorio.map(t => t.provincia).sort((a, b) => a.localeCompare(b, "es"));

    // ---- 1.1 provincia
    // Toda la sección 1 va sobre la misma rejilla de tres columnas iguales (.rejilla3):
    // la columna 1 es la de lo que se elige (provincia, tipo de edificio, tipología) y las
    // columnas 2 y 3, la de los datos y el resto de campos. Cada fila de la rejilla tiene
    // la misma altura en sus tres celdas, así que todo queda en filas y columnas.
    const celda = id => h("div", { class: "tile", id });
    const provincia = h("div", { class: "rejilla3 rej-provincia" },
      grupo("Provincia del proyecto"),
      h("div", { class: "span2" },
        // el tramo de escasez es la conclusión de los datos: indicador a la derecha
        grupo("Datos hídricos de la provincia", { editable: false, extra: h("div", { class: "indicador", id: "tramo-provincia" }) })),
      desplegable({ opciones: provincias, valor: P.provincia, clases: "grande", etiqueta: "Provincia del proyecto", sinEtiqueta: true, vacio: "Seleccionar provincia",
        alCambiar: v => { P.provincia = v; cambio(); } }),
      celda("tile-wei"), celda("tile-aware"),
      celda("tile-comunidad"), celda("tile-p"), celda("tile-eto"),
      celda("tile-demarcacion"), h("div", {}), h("div", { class: "clima-pie", id: "clima-provincia" }));

    // ---- 1.2 uso y ocupación
    // Una banda con los datos generales (días, superficie, tipo de edificio) y debajo la
    // tabla de viviendas. Unifamiliar y plurifamiliar usan la misma tabla, con las mismas
    // columnas en el mismo sitio; la unifamiliar solo rellena las que tienen sentido
    // (tipología y ocupantes), sin repetir «1 vivienda» ni las personas.
    const esUni = P.uso === "Vivienda unifamiliar";
    const opcionesTipo = D.tipologias.map(tp => [tp.TIPOLOGIA, nombreTipo(tp.TIPOLOGIA)]);
    const libres = () => D.tipologias.map(tp => tp.TIPOLOGIA).filter(t => !P.tipologias.some(f => f.tipo === t));

    const AYUDA_TIPOLOGIAS = `<p>Una <strong>tipología</strong> es un modelo de vivienda definido por sus cuartos húmedos: la cocina y cuántos baños y aseos tiene.</p>
      <p>${D.tipologias.map(tp => `<strong>${tp.TIPOLOGIA}</strong>: ${tp.COMPOSICION.toLowerCase()}`).join("<br>")}</p>
      <p>${esUni ? "Elige la tipología de la vivienda e indica cuántas personas viven en ella."
        : "Añade una fila por cada tipología del edificio e indica cuántas viviendas hay de ese tipo y cuántas personas ocupan cada una."}</p>
      <p><strong>Para qué sirve:</strong> describe el edificio en el informe y agrupa las viviendas iguales en una sola fila. Hoy no cambia el consumo: el cálculo usa el número de viviendas y de ocupantes, no el de baños.</p>
      <p><strong>Ocupantes:</strong> las personas que se prevé que vivan en la vivienda de forma habitual. Multiplican los aparatos que se usan por persona (ducha, inodoro, lavabo), y la media por vivienda fija los ciclos de lavadora y lavavajillas.</p>`;

    // Rejilla de tres columnas: la tipología ocupa las dos primeras (con la × dentro) y la
    // tercera se parte en dos mitades, ocupantes | viviendas. Las mismas mitades que días
    // de uso | superficie en la banda de arriba.
    function filaTipo({ f, idx, fija }) {
      const opts = fija ? opcionesTipo : opcionesTipo.filter(([v]) => v === f.tipo || libres().includes(v));
      return h("div", { class: "rejilla3 tipo-fila" },
        h("div", { class: "span2 tipo-sel" },
          campoBase(h("span", { class: "solo-movil" }, "Tipología"),
            h("select", { "aria-label": "Tipología", class: sinValor(f.tipo) ? "pendiente" : null, onchange: e => { f.tipo = e.target.value; fija ? cambio() : render(); } },
              opcionVacia("Seleccionar tipología", f.tipo),
              opts.map(([v, t]) => h("option", { value: v, selected: v === f.tipo || null }, t)))),
          fija ? null : h("button", { class: "quitar", type: "button", title: "Quitar tipología", "aria-label": "Quitar tipología",
            disabled: P.tipologias.length === 1 || null, onclick: () => { P.tipologias.splice(idx, 1); render(); } }, "×")),
        h("div", { class: "mitades" },
          h("div", { class: "con-titulo" }, h("span", { class: "mini-label solo-movil" }, fija ? "Ocupantes" : "Ocupantes por vivienda"),
            contador({ valor: f.ocupantes, min: fija ? 1 : 0, etiqueta: fija ? "Ocupantes" : "Ocupantes por vivienda", alCambiar: n => { f.ocupantes = n; cambio(); } })),
          fija ? h("span", {})
            : h("div", { class: "con-titulo" }, h("span", { class: "mini-label solo-movil" }, "Viviendas"),
                contador({ valor: f.viviendas, etiqueta: "Viviendas", alCambiar: n => { f.viviendas = n; cambio(); } }))));
    }

    const tablaViviendas = h("div", { class: "tipos" },
      h("div", { class: "rejilla3 tipos-cab" },
        h("span", { class: "span2 editable" }, "Tipología", info("Tipologías de vivienda", AYUDA_TIPOLOGIAS)),
        h("div", { class: "mitades" },
          h("span", { class: "editable" }, esUni ? "Ocupantes" : "Ocupantes por vivienda"),
          h("span", { class: "editable" }, esUni ? "" : "Viviendas"))),
      esUni ? filaTipo({ f: P.unifamiliar, idx: "u", fija: true }) : P.tipologias.map((f, i) => filaTipo({ f, idx: i })),
      // pie: añadir tipología bajo la tipología (columnas 1-2) y los totales bajo sus
      // columnas (columna 3): personas bajo ocupantes, viviendas bajo viviendas
      esUni ? null : h("div", { class: "rejilla3 tipos-pie" },
        h("div", { class: "span2 tipos-anadir" },
          libres().length
            ? h("button", { class: "btn-sec chip-add", type: "button", onclick: () => {
                P.tipologias.push({ tipo: "", viviendas: null, ocupantes: null }); render(); } }, "+ Añadir tipología")
            : null,
          h("span", { class: "tipos-media", id: "tipos-media" })),
        h("div", { class: "mitades tipos-total" },
          h("div", { class: "total-celda", id: "total-personas" }),
          h("div", { class: "total-celda", id: "total-viviendas" }))));

    // Al cambiar de tipo se conserva lo introducido: la primera fila de la plurifamiliar
    // y la vivienda unifamiliar son la misma tipología con los mismos ocupantes.
    function cambiarUso(v) {
      if (v === P.uso) return;
      const primera = P.tipologias[0];
      if (v === "Vivienda unifamiliar" && primera) {
        P.unifamiliar = { tipo: primera.tipo, ocupantes: primera.ocupantes };
      } else if (v === "Vivienda plurifamiliar" && primera) {
        primera.tipo = P.unifamiliar.tipo;
        primera.ocupantes = P.unifamiliar.ocupantes;
        // la tipología de la unifamiliar puede coincidir con otra fila: se quita el duplicado
        P.tipologias = P.tipologias.filter((f, i) => i === 0 || f.tipo !== primera.tipo);
      }
      P.uso = v;
      render();
    }
    const ICONO_UNI = `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"><path d="M7 22 24 8l17 14"/><path d="M11 19v21h26V19"/><path d="M20 40V29h8v11"/></svg>`;
    const ICONO_PLURI = `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"><path d="M10 41V7h22v34"/><path d="M32 17h7v24"/><path d="M6 41h37"/><path d="M15 13h3M24 13h3M15 20h3M24 20h3M15 27h3M24 27h3"/></svg>`;

    // Banda: días · superficie · tipo de edificio, alineados por la caja.
    const tipoEdificio = campoBase("Tipo de edificio",
        segmentado({ etiqueta: "Tipo de edificio", valor: P.uso, alCambiar: cambiarUso,
          items: [["Vivienda unifamiliar", "Unifamiliar", ICONO_UNI], ["Vivienda plurifamiliar", "Plurifamiliar", ICONO_PLURI]] }),
        { clases: "campo-tipo", ayuda: `<p><strong>Unifamiliar:</strong> una sola vivienda; se indica su tipología y sus ocupantes.</p>
            <p><strong>Plurifamiliar:</strong> varias viviendas en un edificio; se describe con una fila por tipología.</p>
            <p>El cálculo es el mismo en los dos casos: suma viviendas y ocupantes. Al cambiar de uno a otro se conserva la tipología y los ocupantes de la primera fila.</p>` });
    // Banda en la rejilla: tipo de edificio (columna de la provincia) · días · superficie
    const banda = h("div", { class: "rejilla3 banda-uso" },
      tipoEdificio, h("div", {}),
      h("div", { class: "mitades" },
      campo({ etiqueta: "Días de uso", valor: P.diasUso, unidad: "días", alCambiar: v => { P.diasUso = v; cambio(); },
        ayuda: `<p>Días al año en que la vivienda está ocupada. <strong>335 por defecto</strong> en vivienda habitual: descuentan alrededor de un mes de ausencia por vacaciones.</p>
                <p>Súbelo a 365 si la ocupación es permanente, o bájalo en vivienda estacional o turística; en ese caso conviene justificarlo en la memoria.</p>
                <p>Multiplica el consumo anual de los aparatos, pero no la referencia con la que se compara: el dato del INE ya promedia las ausencias sobre los 365 días del año.</p>` }),
      campo({ etiqueta: "Superficie útil", valor: P.supUtil, unidad: "m²", placeholder: "Introducir", alCambiar: v => { P.supUtil = v; cambio(); },
        ayuda: `<p>Suma de la superficie útil de todas las viviendas.</p>
                <p><strong>No cambia la clase.</strong> Sirve para dar los resultados por metro cuadrado (consumo y huella por m² y año), que permiten comparar edificios de distinto tamaño, y es uno de los datos mínimos para poder calificar.</p>` })));

    return seccion({ id: "emplazamiento", numero: 1, titulo: "EMPLAZAMIENTO Y EDIFICIO",
      cuerpo: [
        subseccion({ id: "provincia", numero: "1.1", titulo: "Provincia",
          ayuda: `<p>La provincia fija todo el contexto hídrico del proyecto: el clima mensual de una estación de AEMET de la propia provincia, el índice de explotación WEI+ de su demarcación y el factor AWARE de su comunidad.</p>
                  <p>No hay que introducir nada más: todo se deduce de aquí. Cada dato tiene su ⓘ con la fuente.</p>`,
          cuerpo: provincia }),
        subseccion({ id: "edificio", numero: "1.2", titulo: "Uso y ocupación",
          ayuda: `<p>Describe cuánta gente usa el edificio y durante cuánto tiempo, que es lo que multiplica el consumo de los aparatos.</p>
                  <p>Los <strong>ocupantes</strong> multiplican los aparatos que se usan por persona (ducha, inodoro, lavabo) y las <strong>viviendas</strong> los que se usan por hogar (lavadora, lavavajillas).</p>`,
          cuerpo: [banda, tablaViviendas] }),
      ] });
  }

  // Partes de la sección 1 que cambian con los datos (sin tocar los campos).
  function actualizarEmplazamiento() {
    const t = R.territorio || {};
    // celdas de datos: nombre arriba, valor abajo; las geográficas, sin ⓘ ni unidad
    const ponTile = (id, nombre, valor, unidad, ayuda) => {
      const el = document.getElementById(id);
      if (el) el.replaceChildren(
        h("div", { class: "tile-nombre" }, nombre, ayuda ? info(nombre, ayuda) : null),
        h("div", { class: "tile-valor" + (unidad == null ? " texto" : "") }, valor, unidad ? h("span", {}, " " + unidad) : null));
    };
    ponTile("tile-comunidad", "Comunidad autónoma", t.comunidad || "–", null);
    ponTile("tile-demarcacion", "Demarcación hidrográfica", t.demarcacion || "–", null);
    const tramo = document.getElementById("tramo-provincia");
    if (tramo && t.tramo) tramo.replaceChildren(
      h("span", { class: "indicador-nombre" }, "Estrés hídrico"),
      h("span", { class: claseTramo(t.tramo) }, t.tramo),
      info("Tramo de estrés hídrico", `<p>Resume la presión sobre el agua en la demarcación <strong>${t.demarcacion}</strong> a partir de su índice de explotación WEI+ (${fmt(t.wei, 1)} %).</p>
        <p><strong>Sin escasez</strong>: WEI+ por debajo del 20 % · <strong>Escasez</strong>: entre 20 y 40 % · <strong>Escasez severa</strong>: 40 % o más.</p>
        <p>Es el único factor territorial de la clase: donde el agua escasea, los umbrales se endurecen. La clase D exige un índice de 1,00 sin escasez, 0,90 con escasez y 0,80 con escasez severa.</p>
        <p class="fuente">Umbrales: VERDE Edificios 2030, criterios CA 01 y CA 02 · WEI+: Eurostat / MITECO.</p>`));
    if (t.provincia) {
      ponTile("tile-wei", "Explotación del agua WEI+", `${fmt(t.wei, 1)} %`, "", AYUDA_DATO.wei(t));
      ponTile("tile-aware", "Factor de escasez AWARE", fmt(t.aware, 2), "m³ eq / m³", AYUDA_DATO.aware(t));
      ponTile("tile-p", "Precipitación anual", fmt(suma(t.p), 0), "mm/año", AYUDA_DATO.p(t));
      ponTile("tile-eto", "Evapotranspiración ETo", fmt(suma(t.eto), 0), "mm/año", AYUDA_DATO.eto(t));
    }
    const clima = document.getElementById("clima-provincia");
    if (clima && t.provincia) clima.replaceChildren(
      h("span", {}, `Clima: estación AEMET ${t.estacion} (${t.indicativo})`),
      h("button", { class: "enlace", type: "button", onclick: () => {
        document.getElementById("info-titulo").textContent = `Clima de ${t.provincia}`;
        document.getElementById("info-texto").innerHTML = ayudaClima(t);
        document.getElementById("modal-info").hidden = false;
      } }, "ver datos mensuales"));

    // resúmenes de la sección plegada: los datos que importan, de un vistazo
    const esUni = P.uso === "Vivienda unifamiliar";
    const nTipos = esUni ? 1 : P.tipologias.length;
    pon('[data-resumen="provincia"]', t.provincia ? resumen([
      h("span", { class: "pieza" }, h("strong", {}, t.provincia), " · " + t.comunidad),
      h("span", { class: claseTramo(t.tramo) }, t.tramo)]) : "-");
    pon('[data-resumen="edificio"]', resumen([
      h("span", { class: "pieza" }, h("strong", {}, esUni ? "Unifamiliar" : "Plurifamiliar")),
      esUni ? null : [oGuion(R.totalViv, 0), R.totalViv === 1 ? "vivienda" : "viviendas"],
      esUni ? null : [fmt(nTipos, 0), nTipos === 1 ? "tipología" : "tipologías"],
      [oGuion(R.totalOcu, 0), R.totalOcu === 1 ? "ocupante" : "ocupantes"],
      [oGuion(P.supUtil, 0), "m²"],
      [oGuion(P.diasUso, 0), "días/año"]]));

    pon("#total-personas", [h("span", {}, "Total"), h("strong", {}, `${oGuion(R.totalOcu, 0)} personas`)]);
    pon("#total-viviendas", [h("span", {}, "Total"), h("strong", {}, `${oGuion(R.totalViv, 0)} ${R.totalViv === 1 ? "vivienda" : "viviendas"}`)]);
    pon("#tipos-media", `${nTipos} ${nTipos === 1 ? "tipología" : "tipologías"} · ${fmt(R.ocupMedios, 2)} ocupantes de media por vivienda`.replace(/^(.*?· )0,00 /, "$1– "));
  }

  // ------------------------------------------------------------------ 2 · aparatos
  function ayudaAparato(a) {
    const c = D.aparatos.find(x => x.APARATO === a.catalogo) || {};
    const si = v => v === "SI";
    const apt = [si(c.PROVEE_GRISES) && "es origen válido de aguas grises",
      si(c.ACEPTA_GRISES) && "admite aguas grises", si(c.ACEPTA_PLUVIALES) && "admite pluviales"].filter(Boolean);
    const escala = c["EULS_A+"] != null
      ? `A+ ≤ ${c["EULS_A+"]} · A ≤ ${c.EULS_A} · B ≤ ${c.EULS_B} · C ≤ ${c.EULS_C} · D ≤ ${c.EULS_D}${c.EULS_E != null ? ` · E ≤ ${c.EULS_E}` : ""} ${a.uCaudal}`
      : "sin escala publicada";
    return `<p>Consumo = <strong>${a.uCaudal} × ${a.uUsos}</strong> × ${a.base === "persona" ? "ocupantes" : a.base === "vivienda" ? "viviendas" : "nº de aparatos"} × días de uso.</p>
      ${C.CAUDAL_DE_REFERENCIA.includes(a.id)
        ? `<p><strong>Volumen:</strong> de partida ${aTexto(a.caudalDef)} ${a.uCaudal}, un valor muy estandarizado; cámbialo solo si el producto elegido lo justifica.</p>
           <p><strong>Ciclos al día:</strong> automáticos, según el tamaño medio del hogar (IDAE, SPAHOUSEC II).</p>`
        : `<p><strong>Caudal o volumen:</strong> el del producto que se instale, según su ficha técnica. Como referencia, ${aTexto(a.caudalDef)} ${a.uCaudal} (CTE DB-HS4).</p>
           <p><strong>Usos al día:</strong> ${a.usosDef == null ? "ciclos según el tamaño medio del hogar (IDAE, SPAHOUSEC II)" : `${aTexto(a.usosDef)} ${a.uUsos} de partida, según estudios de uso`}.</p>`}
      ${a.id === "fregadero" ? `<p><strong>Sin lavavajillas</strong> los platos se friegan a mano: a los ${aTexto(a.usosDef)} min se suman los ciclos que habría hecho el lavavajillas, a 103 L por carga de 12 servicios fregada a mano (Stamminger et al., Universidad de Bonn, 2007). En un hogar de tres personas son algo más de 1 min al día por persona. Se calcula con el hogar medio del proyecto (2,5 personas mientras no haya ocupantes). Si escribes tu propio valor, manda el tuyo y queda en ámbar.</p>` : ""}
      <p>Escala European Water Label: ${escala}.</p>
      ${apt.length ? `<p>Agua no potable: ${apt.join(", ")}.</p>` : ""}
      <p class="fuente">Catálogo: CTE DB-HS4 · European Water Label · Ordenanza de aguas grises de Barcelona, art. 2.2.</p>`;
  }
  /* Sección 2 en tiras: una fila por aparato, agrupadas por estancia. Los aparatos que
   * están en el proyecto se ven como fila; los que no, como un botón «+ Añadir» debajo
   * de su grupo. El inodoro se presenta como UN aparato de doble descarga aunque el
   * motor lo siga calculando como dos líneas (completa y reducida), igual que la v2. */
  const GRUPOS_APARATOS = [
    { id: "bano", numero: "2.1", titulo: "Baño y aseo",
      filas: [["inodoro_completa", "inodoro_reducida"], "lavabo", "ducha", "banera", "bide", "lavamanos"] },
    { id: "cocina", numero: "2.2", titulo: "Cocina y lavado",
      filas: ["fregadero", "lavavajillas", "lavadora", "lavadero"] },
    { id: "comunes", numero: "2.3", titulo: "Zonas comunes y exteriores",
      filas: ["grifo_exterior", "grifo_garaje", "vertedero", "urinario"] },
  ];
  // nombres cortos para la tira; el completo sigue en la ⓘ y en el informe
  const NOMBRE_FILA = { inodoro_completa: "Inodoro", fregadero: "Fregadero",
    grifo_exterior: "Grifo exterior", urinario: "Urinario" };
  const idx = id => P.aparatos.findIndex(a => a.id === id);
  const ids = fila => [].concat(fila);

  const AYUDA_SE_APLICA = `<p>Los <strong>usos al día</strong> de cada aparato salen de estadísticas que se miden de tres maneras, y la herramienta multiplica por lo que corresponda:</p>
    <p><strong>Por persona</strong>: inodoro, lavabo, ducha, bañera, bidé, lavamanos y fregadero. Las descargas o los minutos al día son de cada ocupante, así que se multiplican por los ocupantes del edificio.</p>
    <p><strong>Por hogar</strong>: lavadora, lavavajillas y lavadero. Los ciclos son de cada vivienda, así que se multiplican por las viviendas.</p>
    <p><strong>Por aparato instalado</strong>: grifo exterior, grifo de garaje, vertedero y urinario. Son elementos del edificio y se cuentan: aquí sí hay que indicar cuántos hay.</p>
    <p>No se elige: es fijo para cada aparato. Evita, por ejemplo, contar un grifo exterior por cada ocupante (65 grifos en un edificio de 65 personas).</p>`;
  const AYUDA_ETIQUETA = `<p>La <strong>etiqueta europea del agua</strong> (European Water Label) es una etiqueta voluntaria de la industria europea del baño que clasifica griferías, duchas e inodoros según el agua que gastan, de forma parecida a la etiqueta energética.</p>
    <p>La clase depende del <strong>caudal</strong> en griferías y duchas (litros por minuto) y del <strong>volumen de descarga</strong> en los inodoros (litros), y va de A+ (la que menos gasta) a E.</p>
    <p>La herramienta la calcula con el caudal o volumen que declaras, para que puedas comprobarlo con la ficha del producto que prescribas. No interviene en el cálculo del consumo.</p>
    <p>Los aparatos sin escala publicada (bañera, lavadora, lavavajillas, lavadero, urinario) aparecen como «sin escala». En el inodoro se clasifica con la descarga completa.</p>
    <p class="fuente">European Water Label, escala de clases por tipo de producto.</p>`;

  // Caja pequeña de número para las tiras: azul, con unidad dentro, ámbar si se aparta
  // del valor de partida.
  function numero({ valor, unidad, defecto, etiqueta, alCambiar }) {
    const input = h("input", { type: "text", inputmode: "decimal", autocomplete: "off",
      value: aTexto(valor), placeholder: "–", "aria-label": etiqueta, title: etiqueta });
    const modif = v => defecto != null && v != null && Math.round(v * 100) / 100 !== defecto;
    const caja = h("div", { class: "num-caja" + (modif(valor) ? " modificado" : "") }, input,
      unidad ? h("span", { class: "unidad" }, unidad) : null);
    input.addEventListener("input", () => {
      const n = aNumero(input.value);
      if (n == null) { caja.classList.remove("error", "modificado"); alCambiar(null); return; }
      if (Number.isNaN(n) || n < 0) { caja.classList.add("error"); return; }
      caja.classList.remove("error");
      caja.classList.toggle("modificado", modif(n));
      alCambiar(n);
    });
    return caja;
  }

  // Usos que siguen un valor de partida que cambia con otro aparato (el fregadero sin
  // lavavajillas). Mientras no se toquen guardan null y la caja enseña el de partida, que
  // pinta actualizarAparatos(); escribir ese mismo valor, o vaciarla, vuelve a seguirlo.
  function usosQueSiguen(a) {
    const input = h("input", { type: "text", inputmode: "decimal", autocomplete: "off",
      value: aTexto(a.usos), placeholder: "–", "aria-label": "Usos al día", title: "Usos al día" });
    const caja = h("div", { class: "num-caja", "data-usos-sigue": a.id }, input, h("span", { class: "unidad" }, a.uUsos));
    const partida = () => { const x = R && R.aparatos.find(y => y.id === a.id); return x ? x.usosPartida : null; };
    input.addEventListener("input", () => {
      const n = aNumero(input.value);
      if (n != null && (Number.isNaN(n) || n < 0)) { caja.classList.add("error"); return; }
      caja.classList.remove("error");
      a.usos = n == null || Math.round(n * 100) / 100 === partida() ? null : n;
      cambio();
    });
    input.addEventListener("blur", () => { if (a.usos == null) input.value = aTexto(partida()); });
    return caja;
  }

  // Una tira sobre la rejilla de tres columnas de la sección 1:
  //   col. 1  aparato   ·   col. 2  caudal | usos   ·   col. 3  cantidad | etiqueta  ×
  // quitar=null no pone la × (filas del inodoro: la × es del bloque entero).
  function tira(a, { nombre, ayuda, quitar, sub, sinEtiqueta } = {}) {
    const partida = C.valoresPartida(a, P);
    const celdaUsos = a.usosDef == null
      ? h("div", { class: "num-caja fijo", title: "Automático: ciclos según el tamaño medio del hogar (IDAE)" },
          h("span", { "data-usos": a.id }), h("span", { class: "unidad" }, a.uUsos))
      : C.USOS_QUE_SIGUEN.includes(a.id)
        ? usosQueSiguen(a)
        : numero({ valor: a.usos, unidad: a.uUsos, defecto: partida.usos, etiqueta: "Usos al día", alCambiar: n => { a.usos = n; cambio(); } });
    // por persona / por hogar: dato gris; por aparato instalado: se cuenta, caja azul
    const celdaCantidad = a.base === "edificio"
      ? numero({ valor: a.n, unidad: "uds.", defecto: partida.n, etiqueta: "Número de aparatos", alCambiar: n => { a.n = n; cambio(); } })
      : h("div", { class: "aplica", "data-cant": a.id });
    return h("div", { class: "rejilla3 tira-ap" + (sub ? " tira-sub" : ""), "data-fila": a.id },
      h("div", { class: "tira-nombre" }, nombre || NOMBRE_FILA[a.id] || a.etiqueta, ayuda ? info(a.etiqueta, ayuda) : null),
      h("div", { class: "mitades" },
        h("div", { class: "tira-celda", "data-col": "Caudal o volumen" },
          numero({ valor: a.caudal, unidad: a.uCaudal, defecto: C.CAUDAL_DE_REFERENCIA.includes(a.id) ? partida.caudal : null, etiqueta: "Caudal o volumen", alCambiar: n => { a.caudal = n; cambio(); } })),
        h("div", { class: "tira-celda", "data-col": "Usos al día" }, celdaUsos)),
      h("div", { class: "tercios" },
        h("div", { class: a.base === "edificio" ? "tira-celda" : "tira-dato izq", "data-col": "Cantidad" }, celdaCantidad),
        h("div", { class: "tira-dato izq", "data-col": "Etiqueta", "data-ewl": sinEtiqueta ? null : a.id },
          sinEtiqueta ? h("span", { class: "sin-escala" }, "–") : null),
        // consumo en la última columna, con sus unidades (como en riego), y la ×
        h("div", { class: "etiqueta-celda" },
          h("div", { class: "tira-dato izq consumo-celda", "data-col": "Consumo", "data-m3": a.id }),
          quitar ? h("button", { class: "quitar", type: "button", title: "Quitar del proyecto",
            "aria-label": "Quitar " + (NOMBRE_FILA[a.id] || a.etiqueta), onclick: quitar }, "×") : null)));
  }

  function tiraAparato(fila) {
    const [id, id2] = ids(fila);
    const a = P.aparatos[idx(id)];
    if (!id2) return tira(a, { ayuda: ayudaAparato(a), quitar: () => { a.presente = false; render(); } });

    // Inodoro: el tipo de cisterna junto al nombre (se elige lo primero), una fila por
    // descarga y la × del bloque entero centrada en su altura.
    const b = P.aparatos[idx(id2)];
    const unica = P.inodoroTipo === "unica";
    const cambiarTipo = v => {
      if (v === P.inodoroTipo) return;
      P.inodoroTipo = v;
      // al cambiar de tipo, los usos de la descarga completa pasan a los de partida
      // del nuevo tipo: 1 al día con doble descarga, las 5 con descarga única
      a.usos = C.valoresPartida(a, P).usos;
      render();
    };
    return h("div", { class: "tira-bloque" },
      h("div", { class: "rejilla3 tira-ap tira-titulo" },
        // nombre a la izquierda y el tipo de cisterna a la derecha, dentro de la columna 1
        h("div", { class: "tira-nombre inodoro-cab" }, h("span", {}, "Inodoro", info("Inodoro", ayudaInodoro(a, b))),
          h("span", { class: "seg-con-titulo" }, h("span", { class: "seg-titulo" }, "Descarga"),
            segmentado({ etiqueta: "Tipo de descarga de la cisterna", valor: P.inodoroTipo, alCambiar: cambiarTipo,
              items: [["doble", "Doble"], ["unica", "Única"]] })))),
      tira(a, { nombre: unica ? "Descarga" : "Descarga completa", sub: true }),
      unica ? null : tira(b, { nombre: "Descarga reducida", sub: true, sinEtiqueta: true }),
      h("button", { class: "quitar quitar-bloque", type: "button", title: "Quitar del proyecto", "aria-label": "Quitar inodoro",
        onclick: () => { a.presente = false; b.presente = false; render(); } }, "×"));
  }

  function ayudaInodoro(a, b) {
    return `<p>Elige el tipo de cisterna:</p>
      <p><strong>Doble descarga</strong>: dos pulsadores, uno para la descarga completa y otro para la reducida. Se calcula cada una con su volumen y sus descargas al día. De partida: ${aTexto(a.caudalDef)} L × ${aTexto(a.usosDef)} descarga completa y ${aTexto(b.caudalDef)} L × ${aTexto(b.usosDef)} reducidas por persona y día.</p>
      <p><strong>Descarga única</strong>: un solo volumen para todas las descargas. De partida: ${aTexto(a.caudalDef)} L × ${C.USOS_INODORO_UNICA} descargas por persona y día, las mismas cinco que con doble descarga pero todas completas.</p>
      <p>La etiqueta europea se calcula con el volumen de la descarga completa. Admite agua gris y pluvial para la cisterna.</p>
      <p class="fuente">Catálogo: CTE DB-HS4 · European Water Label · Ordenanza de aguas grises de Barcelona, art. 2.2.</p>`;
  }

  // Selector de pocas opciones en línea (pastillas). Editable: azul.
  function segmentado({ items, valor, alCambiar, etiqueta }) {
    return h("div", { class: "segmentado", role: "radiogroup", "aria-label": etiqueta },
      items.map(([v, t, icono]) => h("button", { type: "button", role: "radio", "aria-checked": String(v === valor),
        onclick: () => alCambiar(v) }, icono ? h("span", { class: "seg-icono", html: icono }) : null, t)));
  }

  // Ventana de confirmación con el mismo aspecto que las de información.
  function confirmar({ titulo, texto, aceptar, alAceptar }) {
    document.getElementById("info-titulo").textContent = titulo;
    const cuerpo = document.getElementById("info-texto");
    cuerpo.innerHTML = texto;
    cuerpo.append(h("div", { class: "confirmar-botones" },
      h("button", { type: "button", class: "btn-sec", onclick: () => { document.getElementById("modal-info").hidden = true; } }, "Cancelar"),
      h("button", { type: "button", class: "accept-button confirmar-si", onclick: () => { document.getElementById("modal-info").hidden = true; alAceptar(); } }, aceptar)));
    document.getElementById("modal-info").hidden = false;
  }
  function restaurarAparatos() {
    confirmar({
      titulo: "Restaurar valores de partida",
      texto: `<p>Se van a restaurar los <strong>valores de partida</strong> de todos los aparatos: caudales o volúmenes, usos al día y número de aparatos.</p>
        <p>Se perderán los valores que hayas cambiado (los marcados en ámbar). Los aparatos que has añadido o quitado y el tipo de inodoro se mantienen.</p>`,
      aceptar: "Restaurar",
      alAceptar: () => {
        for (const a of P.aparatos) {
          const v = C.valoresPartida(a, P);
          a.caudal = v.caudal; if (a.usosDef != null) a.usos = C.USOS_QUE_SIGUEN.includes(a.id) ? null : v.usos; if (v.n != null) a.n = v.n;
        }
        render();
      } });
  }

  function secAparatos() {
    const subs = GRUPOS_APARATOS.map(g => {
      const presentes = g.filas.filter(f => P.aparatos[idx(ids(f)[0])].presente);
      const ausentes = g.filas.filter(f => !P.aparatos[idx(ids(f)[0])].presente);
      const cabecera = h("div", { class: "rejilla3 tira-ap tira-cab" },
        h("span", {}, "Aparato"),
        h("div", { class: "mitades" }, h("span", { class: "editable" }, "Caudal o volumen"), h("span", { class: "editable" }, "Usos al día")),
        h("div", { class: "tercios" },
          h("span", {}, "Cantidad", info("Cantidad", AYUDA_SE_APLICA)),
          h("span", {}, "Etiqueta", info("Etiqueta europea del agua", AYUDA_ETIQUETA)),
          h("span", {}, "Consumo", info("Consumo", `<p>Consumo anual del aparato: caudal o volumen × usos al día × cantidad × días de uso. Sirve para ver qué aparatos pesan más en el total.</p>`))));
      // banda gris al final del grupo, como en la sección 1: añadir a la izquierda
      // (columnas 1-2) y los totales del grupo en la columna 3
      const banda = h("div", { class: "rejilla3 tipos-pie banda-grupo" },
        h("div", { class: "span2 tipos-anadir" },
          ausentes.length ? [h("span", { class: "anadir-txt" }, "Añadir:"),
            ausentes.map(f => {
              const [id, id2] = ids(f);
              const a = P.aparatos[idx(id)];
              return h("button", { class: "btn-sec chip-add", type: "button", onclick: () => {
                a.presente = true; if (id2) P.aparatos[idx(id2)].presente = true; render(); } },
                "+ " + (NOMBRE_FILA[id] || a.etiqueta));
            })] : null),
        h("div", {}));
      const cuerpo = [
        presentes.length
          ? h("div", { class: "tiras" }, cabecera, presentes.map(tiraAparato))
          : h("p", { class: "explica" }, "Ningún aparato de este grupo en el proyecto."),
        banda,
      ];
      return subseccion({ id: "grupo-" + g.id, numero: g.numero, titulo: g.titulo, ancha: true, cuerpo });
    });

    const pie = h("div", { class: "leyenda leyenda-aparatos" },
      h("span", { class: "muestra modificado" }), "Valor distinto del de partida: queda bajo responsabilidad del proyectista.",
      h("button", { type: "button", class: "enlace restaurar", onclick: restaurarAparatos }, "Restaurar valores de partida"));

    return seccion({ id: "aparatos", numero: 2, titulo: "APARATOS",
      h1: "Consumo frente<br>a la referencia", h2: "Clase de<br>consumo",
      cuerpo: [subs, pie] });
  }

  // ------------------------------------------------------------------ 3 · riego
  /* Sección 3 en tiras, como los aparatos: una fila por zona regada. Las opciones se
   * enseñan cortas («Alta», «Goteo enterrado») y el valor que se guarda es el de la
   * tabla de la v2 («Demanda alta», «Tubería perforada, instalada baja tierra»), que es
   * el que buscará el motor cuando se porte el riego. Cada cabecera de columna lleva su
   * ⓘ con la tabla de coeficientes. */
  const MAX_ZONAS = 6;
  const CORTO_RIEGO = {
    "Plantación mixta": "Mixta",
    "Demanda alta": "Alta", "Demanda media": "Media", "Demanda baja": "Baja",
    "Efecto alto": "Alto", "Efecto medio": "Medio", "Efecto bajo": "Bajo",
    "Densidad alta": "Alta", "Densidad media": "Media", "Densidad baja": "Baja",
    "Tubería perforada, instalada baja tierra": "Goteo enterrado",
    "Tubería perforada, instalada en el suelo": "Goteo en superficie",
    "Difusores y micro-aspersores": "Difusores",
  };
  const corto = v => CORTO_RIEGO[v] || v;
  const zonaNueva = () => ({ nombre: "", area: null, especie: "", demanda: "", efecto: "", densidad: "", sistema: "" });

  // Tabla especie × nivel para las ⓘ de los coeficientes (Ksp, Km, Kd).
  function tablaCoef(filas, campo, titulo) {
    const especies = [...new Set(filas.map(f => f.ESPECIE))];
    const niveles = [...new Set(filas.map(f => f[campo]))];
    const v = (e, n) => (filas.find(f => f.ESPECIE === e && f[campo] === n) || {}).VALOR;
    return `<div class="tabla-meses"><table><tr><th>${titulo}</th>${niveles.map(n => `<th>${corto(n)}</th>`).join("")}</tr>
      ${especies.map(e => `<tr><th>${e}</th>${niveles.map(n => `<td>${fmt(v(e, n), 1)}</td>`).join("")}</tr>`).join("")}</table></div>`;
  }
  const FUENTE_RIEGO = `<p class="fuente">Level(s) indicador 3.1, hoja «Irrigation Calc.», basada en WUCOLS. Necesidad = ETo × Ksp × Km × Kd ÷ eficiencia.</p>`;
  const AYUDA_RIEGO = {
    vegetacion: () => `<p><strong>Vegetación y demanda</strong> fijan el coeficiente de especie (Ksp): cuánta agua necesita la planta frente al césped de referencia. Una demanda baja corresponde a especies adaptadas a la sequía.</p>${tablaCoef(D.riego.ks, "DEMANDA", "Ksp")}${FUENTE_RIEGO}`,
    microclima: () => `<p>El <strong>microclima</strong> (Km) corrige por el entorno de la zona: alto en zonas soleadas, ventosas o junto a superficies que reflejan calor; bajo en zonas sombreadas o protegidas del viento.</p>${tablaCoef(D.riego.km, "EFECTO", "Km")}${FUENTE_RIEGO}`,
    densidad: () => `<p>La <strong>densidad</strong> de plantación (Kd): la vegetación densa sombrea el suelo y pierde menos agua por evaporación directa, así que necesita menos riego por metro cuadrado que una plantación dispersa.</p>${tablaCoef(D.riego.kd, "DENSIDAD", "Kd")}${FUENTE_RIEGO}`,
    sistema: () => `<p>La <strong>eficiencia</strong> del sistema es la fracción del agua aportada que llega de verdad a las raíces. Cuanto menor, más agua hay que aportar para cubrir la misma necesidad.</p>
      <div class="tabla-meses"><table><tr><th>Sistema</th><th>Eficiencia</th></tr>${D.riego.sistemas.map(s => `<tr><th>${corto(s.SISTEMA)}<br><small>${s.SISTEMA}</small></th><td>${fmt(s.EFICIENCIA * 100, 0)} %</td></tr>`).join("")}</table></div>${FUENTE_RIEGO}`,
  };

  // Zona de riego sobre la rejilla de tres columnas:
  //   col. 1  nombre (2/3) | superficie (1/3)
  //   col. 2  vegetación | demanda | microclima
  //   col. 3  densidad | sistema de riego | consumo  ×
  function tiraZona(z, i) {
    const r = P.riego;
    const listas = {
      especie: [...new Set(D.riego.ks.map(k => k.ESPECIE))],
      demanda: [...new Set(D.riego.ks.map(k => k.DEMANDA))],
      efecto: [...new Set(D.riego.km.map(k => k.EFECTO))],
      densidad: [...new Set(D.riego.kd.map(k => k.DENSIDAD))],
      sistema: D.riego.sistemas.map(s => s.SISTEMA),
    };
    const sel = (clave, etiqueta) => h("select", { class: "sel-tira" + (sinValor(z[clave]) ? " pendiente" : ""), "aria-label": etiqueta, title: etiqueta,
      onchange: e => { z[clave] = e.target.value; e.target.classList.remove("pendiente"); cambio(); } },
      opcionVacia("Elegir", z[clave]),
      listas[clave].map(v => h("option", { value: v, selected: v === z[clave] || null, title: v }, corto(v))));
    return h("div", { class: "rejilla3 tira-ap tira-zona3" },
      h("div", { class: "zona-sup" },
        h("div", { class: "tira-celda", "data-col": "Zona" },
          h("input", { class: "txt-tira", type: "text", value: z.nombre, placeholder: `Zona ${i + 1}`,
            "aria-label": "Nombre de la zona", title: "Nombre o título de la zona (opcional)",
            oninput: e => { z.nombre = e.target.value; guardar(); } })),
        h("div", { class: "tira-celda", "data-col": "Superficie" },
          numero({ valor: z.area, unidad: "m²", etiqueta: "Superficie de la zona", alCambiar: n => { z.area = n; cambio(); } }))),
      h("div", { class: "tercios" },
        h("div", { class: "tira-celda", "data-col": "Vegetación" }, sel("especie", "Vegetación")),
        h("div", { class: "tira-celda", "data-col": "Demanda" }, sel("demanda", "Demanda hídrica")),
        h("div", { class: "tira-celda", "data-col": "Microclima" }, sel("efecto", "Microclima"))),
      h("div", { class: "tercios tercios-riego" },
        h("div", { class: "tira-celda", "data-col": "Densidad" }, sel("densidad", "Densidad de plantación")),
        h("div", { class: "tira-celda", "data-col": "Sistema de riego" }, sel("sistema", "Sistema de riego")),
        // consumo de la zona al final, con sus unidades, y la ×
        h("div", { class: "etiqueta-celda" },
          h("div", { class: "tira-dato izq consumo-celda", "data-col": "Consumo", "data-zona-m3": i }),
          h("button", { class: "quitar", type: "button", title: "Quitar zona", "aria-label": "Quitar zona",
            onclick: () => { r.zonas.splice(i, 1); if (!r.zonas.length) r.existe = false; render(); } }, "×"))));
  }

  function secRiego() {
    const r = P.riego;
    const cab = h("div", { class: "rejilla3 tira-ap tira-cab tira-zona3" },
      h("div", { class: "zona-sup" }, h("span", { class: "editable" }, "Zona"), h("span", { class: "editable" }, "Superficie")),
      h("div", { class: "tercios" },
        h("span", { class: "editable" }, "Vegetación", info("Vegetación y demanda", AYUDA_RIEGO.vegetacion())),
        h("span", { class: "editable" }, "Demanda"),
        h("span", { class: "editable" }, "Microclima", info("Microclima", AYUDA_RIEGO.microclima()))),
      h("div", { class: "tercios tercios-riego" },
        h("span", { class: "editable" }, "Densidad", info("Densidad de plantación", AYUDA_RIEGO.densidad())),
        h("span", { class: "editable" }, "Sistema de riego", info("Sistema de riego", AYUDA_RIEGO.sistema())),
        h("span", {}, "Consumo", info("Consumo de la zona", `<p>Agua de riego que necesita la zona al año: superficie × déficit hídrico de la provincia × coeficientes de la vegetación ÷ eficiencia del sistema.</p>`))));
    const zonas = subseccion({ id: "zonas", numero: "3.1", titulo: "Zonas regadas", ancha: true,
      ayuda: `<p>Una fila por cada zona verde con un mismo tipo de plantación y de riego. Hasta ${MAX_ZONAS} zonas. El nombre es opcional: sirve para reconocer cada zona en el informe.</p>
        <p>La necesidad de riego de cada zona sale del clima de la provincia (la ETo de cada mes menos la lluvia) multiplicado por los coeficientes de su vegetación, microclima y densidad, y dividido por la eficiencia del sistema. Cada columna tiene su ⓘ con la tabla de valores.</p>
        <p>La letra de riego compara el jardín con el mismo jardín en césped de demanda alta, con microclima alto, densidad baja y aspersores: mide las decisiones de proyecto, no el tamaño del jardín.</p>`,
      cuerpo: [
        h("div", { class: "tiras" }, cab, r.zonas.map(tiraZona)),
        r.zonas.length < MAX_ZONAS
          ? h("div", { class: "anadir" }, h("button", { class: "btn-sec chip-add", type: "button",
              onclick: () => { r.zonas.push(zonaNueva()); render(); } }, "+ Añadir zona"))
          : null] });
    return seccion({ id: "riego", numero: 3, titulo: "RIEGO DE ZONAS VERDES",
      h1: "Riego frente<br>al caso base", h2: "Clase de<br>riego", inactiva: !r.existe,
      interruptores: [{ activo: r.existe, texto: "",
        alCambiar: v => { r.existe = v; if (v && !r.zonas.length) r.zonas.push(zonaNueva()); render(); } }],
      cuerpo: r.existe ? zonas : h("p", { class: "pista" }, "Activa el interruptor del título si el proyecto tiene zonas verdes con riego.") });
  }

  // ------------------------------------------------------------------ 4 · piscina
  /* Sección 4 en una sola tira, como el riego: una fila con todos los datos del vaso, de
   * la temporada y del mantenimiento, cada columna con su ⓘ. El resultado va al pie. */
  const CORTO_COBERTURA = { "Manta térmica / solar": "Manta térmica" };
  function secPiscina() {
    const p = P.piscina;
    const AYUDA_VASO = `<p><strong>Superficie</strong> de lámina de agua y <strong>profundidad media</strong> del vaso. La superficie gobierna la evaporación; el volumen (superficie × profundidad), el agua de llenado y de cada renovación.</p>`;
    const AYUDA_COBERTURA = `<p>La cubierta reduce la evaporación del vaso, que es la mayor parte del agua evitable de una piscina. Evaporación que queda con cada cubierta:</p>
      <div class="tabla-meses"><table><tr><th>Cubierta</th><th>Evaporación que queda</th></tr>${D.coberturas.map(c => `<tr><th>${c.COBERTURA}</th><td>${fmt(c.FACTOR_EVAPORACION * 100, 0)} %</td></tr>`).join("")}</table></div>
      <p>Solo el vaso <strong>sin cubierta</strong> recoge la lluvia de la temporada, que se descuenta de la reposición.</p>
      <p class="fuente">Evaporación en lámina libre: ETo de la provincia × 1,05 (FAO-56, cap. 3), repartida mes a mes con el perfil de la ETo.</p>`;
    const AYUDA_TEMPORADA = `<p>Meses en que el vaso está lleno y en uso. La evaporación solo cuenta en esos meses. Si la temporada cruza el fin de año (por ejemplo, de noviembre a febrero) se cuenta igual.</p>`;
    const AYUDA_RENOV = `<p>Vaciados completos del vaso al año. Con 1 se llena una vez por temporada; con 0,5, cada dos años.</p>`;
    const AYUDA_FILTROS = `<p>El filtro de arena se limpia invirtiendo el flujo de agua (<strong>contralavado</strong>), y esa agua se vierte. Se estiman 400 litros por lavado y 20 lavados al año: 8 m³/año.</p>
      <p><strong>Sin vaciado</strong> (filtros de cartucho, o recuperación del agua de lavado) ese consumo desaparece. Es agua evitable y cuenta en la letra de la piscina.</p>`;

    const sel = (clave, etiqueta, opciones, num) => h("select", { class: "sel-tira" + (sinValor(p[clave]) ? " pendiente" : ""), "aria-label": etiqueta, title: etiqueta,
      onchange: e => { p[clave] = num ? +e.target.value : e.target.value === "true" ? true : e.target.value === "false" ? false : e.target.value; e.target.classList.remove("pendiente"); cambio(); } },
      opcionVacia("Elegir", p[clave]),
      opciones.map(([v, t]) => h("option", { value: String(v), selected: v === p[clave] || null }, t)));
    const meses = MESES_CORTO.map((m, i) => [i + 1, m]);

    // Rejilla de tres columnas, como riego y aparatos:
    //   col. 1  superficie | profundidad          (el vaso)
    //   col. 2  cubierta | desde | hasta           (evaporación y temporada)
    //   col. 3  vaciados | filtros | consumo       (mantenimiento y resultado)
    const cab = h("div", { class: "rejilla3 tira-ap tira-cab tira-pis3" },
      h("div", { class: "mitades" },
        h("span", { class: "editable" }, "Superficie", info("Vaso", AYUDA_VASO)),
        h("span", { class: "editable" }, "Profundidad")),
      h("div", { class: "tercios tercios-pis" },
        h("span", { class: "editable" }, "Cubierta", info("Cubierta del vaso", AYUDA_COBERTURA)),
        h("span", { class: "editable" }, "Desde", info("Temporada", AYUDA_TEMPORADA)),
        h("span", { class: "editable" }, "Hasta")),
      h("div", { class: "tercios" },
        h("span", { class: "editable" }, "Filtros", info("Lavado de filtros", AYUDA_FILTROS)),
        h("span", { class: "editable" }, "Vaciados", info("Vaciados al año", AYUDA_RENOV)),
        h("span", {}, "Consumo", info("Consumo de la piscina", `<p>Agua de la piscina al año: evaporación de la temporada (descontada la lluvia si el vaso está descubierto), llenado y vaciados, y lavado de filtros.</p>`))));
    const fila = h("div", { class: "rejilla3 tira-ap tira-pis3" },
      h("div", { class: "mitades" },
        h("div", { class: "tira-celda", "data-col": "Superficie" }, numero({ valor: p.sup, unidad: "m²", etiqueta: "Superficie del vaso", alCambiar: n => { p.sup = n; cambio(); } })),
        h("div", { class: "tira-celda", "data-col": "Profundidad" }, numero({ valor: p.prof, unidad: "m", etiqueta: "Profundidad media", alCambiar: n => { p.prof = n; cambio(); } }))),
      h("div", { class: "tercios tercios-pis" },
        h("div", { class: "tira-celda", "data-col": "Cubierta" }, sel("cobertura", "Cubierta del vaso", D.coberturas.map(c => [c.COBERTURA, CORTO_COBERTURA[c.COBERTURA] || c.COBERTURA]))),
        h("div", { class: "tira-celda", "data-col": "Desde" }, sel("mesIni", "Primer mes de temporada", meses, true)),
        h("div", { class: "tira-celda", "data-col": "Hasta" }, sel("mesFin", "Último mes de temporada", meses, true))),
      h("div", { class: "tercios" },
        h("div", { class: "tira-celda", "data-col": "Filtros" }, sel("backwash", "Lavado de filtros", [[true, "Con vaciado"], [false, "Sin vaciado"]])),
        h("div", { class: "tira-celda", "data-col": "Vaciados" }, numero({ valor: p.renov, unidad: "/año", etiqueta: "Vaciados del vaso al año", alCambiar: n => { p.renov = n; cambio(); } })),
        h("div", { class: "tira-dato izq consumo-celda", "data-col": "Consumo", id: "pis-consumo" })));

    const vaso = subseccion({ id: "vaso", numero: "4.1", titulo: "Vaso y temporada", ancha: true,
      ayuda: `${AYUDA_VASO}${AYUDA_TEMPORADA}<p>Cada columna tiene su ⓘ.</p>`,
      cuerpo: h("div", { class: "tiras" }, cab, fila) });

    return seccion({ id: "piscina", numero: 4, titulo: "PISCINA",
      h1: "Agua evitable<br>frente al caso base", h2: "Clase de<br>piscina", inactiva: !p.existe,
      interruptores: [{ activo: p.existe, texto: "", alCambiar: v => { p.existe = v; render(); } }],
      cuerpo: p.existe ? vaso : h("p", { class: "pista" }, "Activa el interruptor del título si el proyecto tiene piscina.") });
  }

  // ------------------------------------------------------------------ 5 · reutilización
  /* Sección 5 sobre la rejilla de tres columnas, con el mismo reparto en cada fuente:
   *   col. 1  lo que se declara de la fuente (rendimiento; superficie · tipo · filtro)
   *   col. 2  destinos, en pastillas
   *   col. 3  lo que sale: agua disponible y depósitos de predimensionado
   * Los destinos que no aplican salen en gris, y su ⓘ dice por qué cada uno. */
  const CORTO_CAPTACION = {
    "Tejado duro inclinado": "Inclinado", "Tejado plano sin gravilla": "Plano",
    "Tejado plano con gravilla": "Con gravilla", "Tejado verde intensivo": "Verde int.",
    "Tejado verde extensivo": "Verde ext.", "Superficie empedrada": "Empedrado",
    "Revestimiento asfáltico": "Asfalto",
  };

  function pastillasDestino(fuente, items) {
    return h("div", { class: "destinos", role: "group", "aria-label": "Destinos" }, items.map(([clave, texto, motivo]) =>
      h("button", { type: "button", class: "destino" + (motivo ? " no-aplica" : ""), disabled: motivo ? true : null,
        "aria-pressed": String(!!fuente[clave] && !motivo), title: motivo ? `${texto}: ${motivo}` : texto,
        onclick: () => { fuente[clave] = !fuente[clave]; render(); } }, texto)));
  }

  // ⓘ de destinos de cada fuente: qué es cada uno y, si sale en gris, por qué.
  function ayudaDestinos(items) {
    return `<p>A qué usos va el agua. Solo los que no necesitan agua potable. Cada aparato la recibe solo si el catálogo dice que la admite.</p>
      ${items.map(([, texto, motivo, explica]) => `<p><strong>${texto}</strong>${motivo ? ` <em>(en gris: ${motivo})</em>` : ""}: ${explica}</p>`).join("")}
      <p class="fuente">Ordenanza de aguas grises de Barcelona, art. 2.2 · RD 1620/2007 de reutilización · UNE-EN 16941-1 y 16941-2.</p>`;
  }

  function secReutilizacion() {
    const g = P.grises, pl = P.pluviales;
    const conFuente = g.existe || pl.existe;
    const presente = id => P.aparatos.some(a => a.id === id && a.presente);
    const sinRiego = P.riego.existe ? null : "el proyecto no tiene riego";
    const sinPiscina = P.piscina.existe ? null : "el proyecto no tiene piscina";
    const baldeoG = ["grifo_garaje", "vertedero"].some(presente) ? null : "no hay grifo de garaje ni vertedero";
    const baldeoP = ["lavadero", "grifo_exterior", "grifo_garaje", "vertedero"].some(presente) ? null : "no hay lavadero ni grifos de baldeo";
    let n = 0;
    const num = () => `5.${++n}`;

    const DEST_G = [
      ["cisternas", "Cisternas", null, "inodoros y urinarios. Es el destino natural de las grises: su demanda es diaria y constante, como su producción."],
      ["riego", "Riego por goteo", sinRiego, "solo por goteo o enterrado. El agua gris tratada no se puede pulverizar (aspersores, difusores) porque genera aerosoles en contacto con las personas."],
      ["baldeo", "Baldeo", baldeoG, "solo grifo de garaje y vertedero. El grifo exterior y el lavadero quedan fuera porque su uso implica contacto directo con personas, ropa o plantas comestibles."],
    ];
    const DEST_P = [
      ["cisternas", "Cisternas", null, "inodoros y urinarios."],
      ["riego", "Riego", sinRiego, "con cualquier sistema: el agua de lluvia filtrada no tiene las restricciones de las grises."],
      ["baldeo", "Baldeo", baldeoP, "lavadero, grifo exterior, grifo de garaje y vertedero."],
      ["piscina", "Piscina", sinPiscina, "llenado y reposición del vaso, con el tratamiento propio de la piscina."],
    ];

    // Fila del aljibe, igual en las dos fuentes: volumen declarado y propuesto en la
    // columna 1, por qué en la 2, lo que sale en la 3.
    const filaAljibe = (clave, etiqueta, idUsada, idNota) => [
      h("div", { class: "rejilla3 tira-ap tira-cab tira-np3 cab-aljibe" },
        h("div", { class: "mitades" }, h("span", { class: "editable" }, "Aljibe"), h("span", {}, "Propuesto")),
        h("span", {}, etiqueta),
        h("span", {}, "Aprovechada")),
      h("div", { class: "rejilla3 tira-ap tira-np3" },
        h("div", { class: "mitades" },
          h("div", { class: "tira-celda", "data-col": "Aljibe" },
            numero({ valor: P[clave], unidad: "L", etiqueta,
              alCambiar: v => { P[clave] = v; cambio(); } })),
          h("div", { class: "tira-dato izq", "data-col": "Propuesto", id: `np-${clave}-prop` })),
        h("div", { class: "tira-dato izq nota-aljibe", "data-col": "Qué decide", id: idNota }),
        h("div", { class: "tira-dato izq", "data-col": "Aprovechada", id: idUsada }))];

    const grises = g.existe ? subseccion({ id: "grises", numero: num(), titulo: "Aguas grises", ancha: true,
      ayuda: `<p>Agua de duchas y bañeras, que son el único origen válido de aguas grises (Ordenanza de Barcelona, art. 2.2), tratada para usos que no necesitan agua potable.</p>
        <p>El <strong>rendimiento del tratamiento</strong> es la fracción del agua gris que sale aprovechable: el 85 % es un valor habitual de los sistemas compactos.</p>
        <p>El <strong>depósito de recepción</strong> guarda el agua gris bruta antes de tratarla: media jornada de producción, porque no debe acumularse más de 24 horas (AQUA ESPAÑA §5.3). En este proyecto, unos ${fmt(R.predim.recepcion, 0)} L.</p>
        <p>El <strong>aljibe de grises</strong> guarda el agua ya tratada, como mucho un día (§5.4): se propone un día de la demanda que las grises pueden cubrir, en el mes de más demanda. Si se declara menor, cada día se aprovecha como mucho su volumen.</p>`,
      cuerpo: h("div", { class: "tiras" },
        h("div", { class: "rejilla3 tira-ap tira-cab tira-np3" },
          h("div", { class: "mitades" }, h("span", { class: "editable" }, "Rendimiento"), h("span", {}, "Agua gris")),
          h("span", { class: "editable" }, "Destinos", info("Destinos de las aguas grises", ayudaDestinos(DEST_G))),
          h("span", {}, "Tratada")),
        h("div", { class: "rejilla3 tira-ap tira-np3" },
          h("div", { class: "mitades" },
            h("div", { class: "tira-celda", "data-col": "Rendimiento" },
              numero({ valor: Math.round(g.rend * 100), unidad: "%", etiqueta: "Rendimiento del tratamiento", alCambiar: v => { g.rend = v / 100; cambio(); } })),
            h("div", { class: "tira-dato izq", "data-col": "Agua gris", id: "np-grises-bruta" })),
          h("div", { class: "tira-celda", "data-col": "Destinos" }, pastillasDestino(g, DEST_G)),
          h("div", { class: "tira-dato izq", "data-col": "Tratada", id: "np-grises-trat" })),
        ...filaAljibe("depositoGrises", "Aljibe de grises tratadas · un día",
          "np-grises-usada", "np-nota-grises")) }) : null;

    const pluviales = pl.existe ? subseccion({ id: "pluviales", numero: num(), titulo: "Aguas pluviales", ancha: true,
      ayuda: `<p>Lluvia recogida en cubiertas u otras superficies, con la precipitación mes a mes de la provincia.</p>
        <p>Captada = superficie × lluvia × coeficiente de escorrentía × rendimiento del filtro.</p>
        <div class="tabla-meses"><table><tr><th>Superficie</th><th>Escorrentía</th></tr>${D.captacion.map(c => `<tr><th>${c.SUPERFICIE}</th><td>${fmt(c.ESCORRENTIA * 100, 0)} %</td></tr>`).join("")}</table></div>
        <p>Las pluviales cubren lo que no cubren las grises, que van primero porque su oferta es diaria y constante.</p>
        <p>El <strong>aljibe de pluviales</strong> guarda la lluvia del invierno para los meses secos. El balance es mensual y el agua guardada no pasa de su volumen, así que decide cuánta lluvia se aprovecha (UNE-EN 16941-1). Se propone el periodo seco medio de la provincia (el intervalo entre lluvias del mes más seco, según AEMET) con un 20 % de margen, sobre lo menor entre la lluvia captada y la demanda que queda.</p>`,
      cuerpo: h("div", { class: "tiras" },
        h("div", { class: "rejilla3 tira-ap tira-cab tira-np3" },
          h("div", { class: "tercios" }, h("span", { class: "editable" }, "Superficie"), h("span", { class: "editable" }, "Filtro"), h("span", { class: "editable" }, "Tipo")),
          h("span", { class: "editable" }, "Destinos", info("Destinos de las aguas pluviales", ayudaDestinos(DEST_P))),
          h("span", {}, "Captada")),
        h("div", { class: "rejilla3 tira-ap tira-np3" },
          h("div", { class: "tercios" },
            h("div", { class: "tira-celda", "data-col": "Superficie" },
              numero({ valor: pl.sup, unidad: "m²", etiqueta: "Superficie de captación", alCambiar: v => { pl.sup = v; cambio(); } })),
            h("div", { class: "tira-celda", "data-col": "Filtro" },
              numero({ valor: Math.round(pl.rend * 100), unidad: "%", etiqueta: "Rendimiento del filtro", alCambiar: v => { pl.rend = v / 100; cambio(); } })),
            h("div", { class: "tira-celda", "data-col": "Tipo" },
              h("select", { class: "sel-tira" + (sinValor(pl.tipo) ? " pendiente" : ""), "aria-label": "Tipo de superficie", title: "Tipo de superficie de captación",
                onchange: e => { pl.tipo = e.target.value; e.target.classList.remove("pendiente"); cambio(); } },
                opcionVacia("Elegir", pl.tipo),
                D.captacion.map(c => h("option", { value: c.SUPERFICIE, selected: c.SUPERFICIE === pl.tipo || null, title: c.SUPERFICIE },
                  CORTO_CAPTACION[c.SUPERFICIE] || c.SUPERFICIE))))),
          h("div", { class: "tira-celda", "data-col": "Destinos" }, pastillasDestino(pl, DEST_P)),
          h("div", { class: "tira-dato izq", "data-col": "Captada", id: "np-pluv-capt" })),
        ...filaAljibe("depositoPluviales", "Aljibe de pluviales · periodo seco",
          "np-pluv-usada", "np-nota-pluviales")) }) : null;

    return seccion({ id: "reutilizacion", numero: 5, titulo: "REUTILIZACIÓN DE AGUA NO POTABLE",
      h1: "Demanda cubierta<br>con no potable", h2: "Clase de<br>reutilización",
      inactiva: !conFuente,
      interruptores: [
        { activo: g.existe, texto: "Aguas grises", alCambiar: v => { g.existe = v; render(); } },
        { activo: pl.existe, texto: "Aguas pluviales", alCambiar: v => { pl.existe = v; render(); } }],
      cuerpo: conFuente
        ? [grises, pluviales]
        : h("p", { class: "pista" }, "Activa en el título las aguas grises, las pluviales o las dos si el proyecto las aprovecha.") });
  }

  // ------------------------------------------------------------------ estado de cada sección
  /* Control de los datos, sección a sección:
   *   ok      todo completo (verde)
   *   falta   hay datos sin poner (amarillo)
   *   error   hay algún dato imposible (rojo)
   *   fuera   el proyecto no incluye ese bloque (sin icono; no bloquea)
   * Resultados y el informe solo se abren con todo en ok o fuera. */
  const NOMBRES_SEC = { emplazamiento: "1. Emplazamiento y edificio", aparatos: "2. Aparatos", riego: "3. Riego",
    piscina: "4. Piscina", reutilizacion: "5. Reutilización" };
  function validar() {
    const res = {};
    const estado = (falta, error) => ({ estado: error.length ? "error" : falta.length ? "falta" : "ok", falta, error });
    const vacio = v => v == null || v === "";
    const positivo = v => typeof v === "number" && v > 0;

    { // 1 · emplazamiento y edificio
      const f = [], x = [];
      if (vacio(P.provincia)) f.push("provincia");
      if (!positivo(P.diasUso)) f.push("días de uso"); else if (P.diasUso > 366) x.push("más de 366 días de uso al año");
      if (!positivo(P.supUtil)) f.push("superficie útil");
      if (P.uso === "Vivienda unifamiliar") {
        const u = P.unifamiliar || {};
        if (vacio(u.tipo)) f.push("tipología");
        if (!positivo(u.ocupantes)) f.push("ocupantes"); else if (u.ocupantes > 20) x.push("más de 20 ocupantes en una vivienda");
      } else {
        if (!P.tipologias.length) f.push("tipologías");
        P.tipologias.forEach((t, i) => {
          const n = P.tipologias.length > 1 ? `tipología ${i + 1}: ` : "";
          if (vacio(t.tipo)) f.push(n + "tipo");
          if (!positivo(t.viviendas)) f.push(n + "viviendas");
          if (!positivo(t.ocupantes)) f.push(n + "ocupantes"); else if (t.ocupantes > 20) x.push(n + "más de 20 ocupantes por vivienda");
        });
      }
      if (positivo(P.supUtil) && R.totalViv > 0 && P.supUtil / R.totalViv < 15)
        x.push(`${fmt(P.supUtil / R.totalViv, 0)} m² por vivienda: superficie útil demasiado pequeña`);
      res.emplazamiento = estado(f, x);
    }
    { // 2 · aparatos
      const f = [], x = [];
      const presentes = P.aparatos.filter((a, i) => R.aparatos[i] && R.aparatos[i].presente);
      if (!presentes.length) f.push("ningún aparato en el proyecto");
      for (const a of presentes) {
        if (a.caudal == null) f.push(`${a.etiqueta}: caudal`); else if (a.caudal <= 0) x.push(`${a.etiqueta}: caudal cero`);
        if (a.usosDef !== null && !C.USOS_QUE_SIGUEN.includes(a.id)) {
          if (a.usos == null) f.push(`${a.etiqueta}: usos al día`); else if (a.usos > 50) x.push(`${a.etiqueta}: más de 50 usos al día`);
        }
        if (a.base === "edificio" && !positivo(a.n)) f.push(`${a.etiqueta}: número`);
      }
      res.aparatos = estado(f, x);
    }
    { // 3 · riego
      const r = P.riego;
      if (!r.existe) res.riego = { estado: "fuera", falta: [], error: [] };
      else {
        const f = [];
        if (!r.zonas.length) f.push("ninguna zona");
        r.zonas.forEach((z, i) => {
          const faltan = [["area", "superficie"], ["especie", "vegetación"], ["demanda", "demanda"], ["efecto", "microclima"],
            ["densidad", "densidad"], ["sistema", "sistema"]].filter(([k]) => k === "area" ? !positivo(z.area) : vacio(z[k])).map(([, t]) => t);
          if (faltan.length) f.push(`${z.nombre || `zona ${i + 1}`}: ${faltan.join(", ")}`);
        });
        res.riego = estado(f, []);
      }
    }
    { // 4 · piscina
      const z = P.piscina;
      if (!z.existe) res.piscina = { estado: "fuera", falta: [], error: [] };
      else {
        const f = [], x = [];
        if (!positivo(z.sup)) f.push("superficie");
        if (!positivo(z.prof)) f.push("profundidad"); else if (z.prof > 5) x.push("más de 5 m de profundidad media");
        if (vacio(z.cobertura)) f.push("cubierta");
        if (vacio(z.mesIni) || vacio(z.mesFin)) f.push("temporada");
        if (z.backwash == null) f.push("lavado de filtros");
        if (z.renov == null) f.push("vaciados"); else if (z.renov > 12) x.push("más de 12 vaciados al año");
        res.piscina = estado(f, x);
      }
    }
    { // 5 · reutilización
      const g = P.grises, pl = P.pluviales;
      if (!g.existe && !pl.existe) res.reutilizacion = { estado: "fuera", falta: [], error: [] };
      else {
        const f = [], x = [];
        const destinos = q => ["cisternas", "riego", "baldeo", "piscina"].some(k => q[k]);
        if (g.existe) {
          if (!destinos(g)) f.push("grises: destino");
          if (!(g.rend > 0 && g.rend <= 1)) x.push("grises: rendimiento fuera de 0–100 %");
          if (P.depositoGrises == null) f.push("aljibe de grises");
        }
        if (pl.existe) {
          if (!positivo(pl.sup)) f.push("pluviales: superficie");
          if (vacio(pl.tipo)) f.push("pluviales: tipo de superficie");
          if (!destinos(pl)) f.push("pluviales: destino");
          if (!(pl.rend > 0 && pl.rend <= 1)) x.push("pluviales: filtro fuera de 0–100 %");
          if (P.depositoPluviales == null) f.push("aljibe de pluviales");
        }
        res.reutilizacion = estado(f, x);
      }
    }
    return res;
  }
  // [id, nombre, validación] de las secciones que no están en verde
  function seccionesPendientes() {
    const v = validar();
    return Object.keys(NOMBRES_SEC).filter(k => v[k].estado === "falta" || v[k].estado === "error").map(k => [k, NOMBRES_SEC[k], v[k]]);
  }
  function pintarEstados() {
    const v = validar();
    const ICONO = { ok: "✓", falta: "!", error: "×" };
    const pintar = (id, estado, texto) => {
      const el = document.querySelector(`[data-estado-sec="${id}"]`);
      if (el) { el.className = "estado-sec " + estado; el.textContent = ICONO[estado] || ""; el.title = texto; }
      const marca = document.querySelector(`.minibarra [data-nav="${id}"]`);
      if (marca) { marca.classList.remove("ok", "falta", "error", "fuera"); marca.classList.add(estado); }
    };
    for (const k of Object.keys(NOMBRES_SEC)) {
      const e = v[k];
      pintar(k, e.estado, e.estado === "ok" ? "Completo" : e.estado === "fuera" ? "" :
        (e.error.length ? "Revisar: " + e.error.join(", ") + (e.falta.length ? ". " : "") : "") + (e.falta.length ? "Falta: " + e.falta.join(", ") : ""));
    }
    // 6 · resultados: bloqueada mientras alguna sección no esté en verde
    const pendientes = seccionesPendientes();
    const sec = document.getElementById("sec-resultados");
    if (sec) {
      const bloqueada = pendientes.length > 0;
      sec.classList.toggle("bloqueada", bloqueada);
      if (bloqueada && sec.classList.contains("abierta")) sec.classList.remove("abierta");
      if (bloqueada) abiertas.resultados = false;
      pintar("resultados", bloqueada ? "bloqueo" : "ok", bloqueada ? "Se abre cuando todas las secciones estén en verde" : "Listo");
      const ul = document.getElementById("res-pendientes");
      if (ul) ul.replaceChildren(...pendientes.map(([id, nombre, e]) => h("li", { class: e.estado },
        h("span", { class: "estado-sec " + e.estado }, ICONO[e.estado]),
        h("span", {}, h("strong", {}, nombre), ": " + [...e.error, ...e.falta].join(", ")),
        h("button", { type: "button", class: "res-ir", onclick: () => irASeccion(id) }, "Revisar"))));
    }
  }

  // ------------------------------------------------------------------ 6 · resultados
  /* Resumen de todo el proyecto antes del informe, sobre la misma rejilla de tres
   * columnas: lo declarado | lo que resulta | indicador y clase. Todo es dato (gris): aquí
   * no se edita nada; el título de cada fila lleva a su sección para corregirla. Debajo,
   * las comprobaciones que conviene mirar antes de generar el PDF. */
  // Huella de agua: el concepto menos conocido, así que se explica con los números del
  // proyecto. El texto se arma al pulsar el ⓘ para que lleve siempre los valores vigentes.
  function ayudaHuella() {
    const t = R.territorio || {};
    return `<p>La <strong>huella de agua por escasez</strong> no mide cuánta agua se gasta, sino el <strong>impacto</strong> de gastarla donde se gasta: un m³ consumido en una cuenca con escasez pesa más que uno consumido donde sobra el agua.</p>
      <p>Se calcula con el agua <strong>consumida</strong>, la que no vuelve al medio (el riego, la evaporación de la piscina y, con retorno nulo, el resto), multiplicada por el <strong>factor AWARE</strong> de la comunidad autónoma. El resultado son <strong>m³ equivalentes</strong>: los m³ que habría que consumir en un lugar con la escasez media del mundo para causar el mismo impacto.</p>
      <p>En este proyecto: ${fmt(R.consumida, 1)} m³/año consumidos × ${fmt(t.aware, 2)} (${t.comunidad || "–"}) = <strong>${fmt(R.huella, 0)} m³ eq/año</strong>, ${fmt(R.huellaPersona, 1)} por persona y año.</p>
      <p>Sirve para comparar proyectos en lugares distintos. No tiene letra: las letras miden la eficiencia del proyecto; la huella, además, dónde está.</p>
      <p class="fuente">ISO 14046:2014 · WULCA, AWARE 2.0.</p>`;
  }
  function infoVivo(titulo, html) {
    const b = info(titulo, "");
    b.onclick = e => {
      e.stopPropagation();
      document.getElementById("info-titulo").textContent = titulo;
      document.getElementById("info-texto").innerHTML = html();
      document.getElementById("modal-info").hidden = false;
    };
    return b;
  }

  function secResultados() {
    // plegada: un resumen como el de las demás secciones, con la clase y la huella en
    // las ruedas (lo mismo que el panel de la izquierda)
    const plegado = h("div", { class: "res-plegado" },
      subseccion({ id: "res-consumo", numero: "6.1", titulo: "Consumo de los aparatos" }),
      subseccion({ id: "res-letras", numero: "6.2", titulo: "Letras parciales" }),
      h("div", { class: "sub", "data-sub": "res-huella" },
        h("div", { class: "sub-header" },
          h("div", { class: "sub-title" }, h("span", { class: "num" }, "6.3"), "HUELLA DE AGUA", infoVivo("Huella de agua", ayudaHuella)),
          h("div", { class: "sub-slot" }, h("div", { class: "sub-value", "data-resumen": "res-huella" }, "-")))));
    const bloqueo = h("div", { class: "res-bloqueo" },
      h("p", {}, "Los resultados se abren cuando todas las secciones están en verde. Falta revisar:"),
      h("ul", { id: "res-pendientes" }));
    return seccion({ id: "resultados", numero: 6, titulo: "RESULTADOS",
      h1: "Clase de<br>consumo", h2: "Huella<br>m³ eq/persona·año",
      cuerpo: [bloqueo, plegado, h("div", { class: "res-abierto" },
        h("div", { class: "tiras res-tabla" },
          h("div", { class: "rejilla3 tira-ap tira-cab" },
            h("span", {}, "Lo declarado"),
            h("span", {}, "Lo que resulta"),
            h("div", { class: "mitades" }, h("span", {}, "Indicador"), h("span", {}, "Clase"))),
          h("div", { id: "res-filas" })),
        h("div", { class: "res-comprobar" },
          h("div", { class: "res-comprobar-cab" }, "Antes de generar el informe"),
          h("ul", { id: "res-avisos" }),
          h("div", { class: "res-acciones" },
            h("button", { type: "button", class: "accept-button confirmar-si", onclick: abrirInforme }, "Generar informe PDF"))))] });
  }

  function irASeccion(sec) {
    const s = document.getElementById("sec-" + sec);
    if (!s) return;
    if (!s.classList.contains("abierta") && !s.classList.contains("bloqueada")) { abiertas[sec] = true; s.classList.add("abierta"); }
    window.scrollTo({ top: s.getBoundingClientRect().top + window.scrollY - 85, behavior: "smooth" });
  }

  function actualizarResultados() {
    const cont = document.getElementById("res-filas");
    if (!cont) return;
    const t = R.territorio || {}, np = R.np;
    const linea = (...partes) => h("div", { class: "res-linea" }, partes.filter(x => x != null && x !== ""));
    const peq = txt => h("small", {}, txt);
    const valor = (v, u) => h("span", { class: "res-valor" }, h("strong", {}, v), u ? h("small", {}, " " + u) : null);
    const fila = ({ sec, titulo, incluido = true, declarado, resulta, indicador, clase, ayuda }) =>
      h("div", { class: "rejilla3 tira-ap res-fila" + (incluido ? "" : " res-fuera") },
        h("div", { class: "res-celda" },
          sec ? h("button", { type: "button", class: "res-titulo", title: "Ir a la sección", onclick: () => irASeccion(sec) }, titulo)
            : h("span", { class: "res-titulo" }, titulo, ayuda ? infoVivo("Huella de agua", ayudaHuella) : null),
          ...(incluido ? declarado : [linea("No incluido")])),
        h("div", { class: "res-celda" }, ...(incluido ? resulta : [])),
        h("div", { class: "mitades" },
          h("div", { class: "res-celda" }, incluido ? indicador : null),
          h("div", { class: "res-celda res-clase" }, incluido ? clase : null)));

    // 2 · aparatos: el inodoro de doble descarga cuenta como un aparato
    const presentes = P.aparatos.filter(a => a.presente && a.id !== "inodoro_reducida").length;
    const cambiados = R.aparatos.filter(r => r.presente && r.modificado).length;
    const zonas = P.riego.zonas.length;
    const pz = P.piscina, g = P.grises, pl = P.pluviales;
    const destinosDe = f => ["cisternas", "riego", "baldeo", "piscina"].filter(k => f[k])
      .map(k => ({ cisternas: "cisternas", riego: "riego", baldeo: "baldeo", piscina: "piscina" })[k]).join(", ") || "sin destinos";
    const conReuso = g.existe || pl.existe;

    cont.replaceChildren(
      fila({ sec: "emplazamiento", titulo: "1. Emplazamiento y edificio",
        declarado: [linea(`${P.provincia} · ${P.uso}`),
          linea(`${fmt(R.totalViv, 0)} ${R.totalViv === 1 ? "vivienda" : "viviendas"} · ${fmt(R.totalOcu, 0)} personas · ${fmt(P.diasUso, 0)} días · ${fmt(P.supUtil, 0)} m²`)],
        resulta: [linea(t.demarcacion || "–"), linea(`WEI+ ${fmt(t.wei, 1)} % · AWARE ${fmt(t.aware, 2)}`, peq(" m³ eq/m³"))],
        indicador: valor(fmt(t.wei, 0), "% WEI+"),
        clase: t.tramo ? h("span", { class: claseTramo(t.tramo) }, t.tramo) : "–" }),
      fila({ sec: "aparatos", titulo: "2. Aparatos",
        declarado: [linea(`${presentes} ${presentes === 1 ? "aparato" : "aparatos"} · inodoro de descarga ${P.inodoroTipo === "unica" ? "única" : "doble"}`),
          cambiados ? linea(h("span", { class: "res-ambar" }, `${cambiados} ${cambiados === 1 ? "valor cambiado" : "valores cambiados"} respecto al de partida`)) : linea("Todos con los valores de partida")],
        resulta: [linea(valor(fmt(R.apLitrosDia, 1), "L/persona·día")),
          linea(`${fmt(R.apTotal, 1)} m³/año · referencia ${fmt(R.refLitros, 1)} L/persona·día`)],
        indicador: valor(fmt(R.indice, 2), "índice"),
        clase: R.clase ? letra(R.clase) : "–" }),
      fila({ sec: "riego", titulo: "3. Riego de zonas verdes", incluido: P.riego.existe,
        declarado: [linea(`${zonas} ${zonas === 1 ? "zona" : "zonas"} · ${fmt(R.riego.area, 0)} m²`)],
        resulta: [linea(valor(fmt(R.riego.total, 1), "m³/año")), linea(`Caso base ${fmt(R.riego.base, 1)} m³/año`)],
        indicador: valor(R.indiceRiego == null ? "–" : fmt(R.indiceRiego, 2), "índice"),
        clase: R.claseRiego ? letra(R.claseRiego) : "–" }),
      fila({ sec: "piscina", titulo: "4. Piscina", incluido: pz.existe,
        declarado: [linea(`${fmt(pz.sup, 1)} m² × ${fmt(pz.prof, 2)} m · ${CORTO_COBERTURA[pz.cobertura] || pz.cobertura}`),
          linea(`${MESES_CORTO[pz.mesIni - 1]}–${MESES_CORTO[pz.mesFin - 1]} · filtros ${pz.backwash ? "con" : "sin"} vaciado · ${fmt(pz.renov, 1)} vaciados/año`)],
        resulta: [linea(valor(fmt(R.piscina.total, 1), "m³/año")),
          linea(`Evitable ${fmt(R.piscina.evitable, 1)} frente a ${fmt(R.piscina.base, 1)} del caso base`)],
        indicador: valor(R.indicePiscina == null ? "–" : fmt(R.indicePiscina, 2), "índice"),
        clase: R.clasePiscina ? letra(R.clasePiscina) : "–" }),
      fila({ sec: "reutilizacion", titulo: "5. Reutilización", incluido: conReuso,
        declarado: [g.existe ? linea(`Grises: ${destinosDe(g)} · aljibe ${fmt(P.depositoGrises, 0)} L`) : null,
          pl.existe ? linea(`Pluviales: ${fmt(pl.sup, 0)} m² · ${destinosDe(pl)} · aljibe ${fmt(P.depositoPluviales, 0)} L`) : null].filter(Boolean),
        resulta: [linea(valor(fmt(np.usada, 1), "m³/año aprovechados")),
          linea(`de ${fmt(np.potencial, 1)} m³/año que no necesitan ser potables`)],
        indicador: valor(fmt(R.coberturaReuso * 100, 0), "% cubierto"),
        clase: R.claseReuso ? letra(R.claseReuso) : "–" }),
      fila({ sec: null, titulo: "Balance y huella", ayuda: true,
        declarado: [linea("Retorno nulo: hipótesis declarada"),
          linea(peq("La huella pesa el agua consumida por la escasez del lugar: m³ consumidos × factor AWARE."))],
        resulta: [linea(`Suministrada ${fmt(R.suministrada, 1)} m³/año`), linea(`Consumida ${fmt(R.consumida, 1)} m³/año`),
          linea(`× AWARE ${fmt(t.aware, 2)} = ${fmt(R.huella, 0)} m³ eq/año`)],
        indicador: valor(fmt(R.huellaPersona, 1), "m³ eq/persona·año"),
        clase: valor(fmt(R.huella, 0), "m³ eq/año") }));

    // plegada: resumen y ruedas
    pon('[data-resumen="res-consumo"]', resumen([[fmt(R.apLitrosDia, 1), "L/persona·día"], [fmt(R.indice, 2), "índice"]]));
    const letraDe = (txt, activo, cl) => h("span", { class: "res-mini" }, txt + " ", activo && cl ? letra(cl) : h("span", { class: "res-sin" }, "—"));
    pon('[data-resumen="res-letras"]', h("div", { class: "res-letras" },
      letraDe("Riego", P.riego.existe, R.claseRiego), letraDe("Piscina", P.piscina.existe, R.clasePiscina),
      letraDe("Reutilización", conReuso, R.claseReuso)));
    pon('[data-resumen="res-huella"]', resumen([[fmt(R.huellaPersona, 1), "m³ eq/persona·año"], [fmt(R.huella, 0), "m³ eq/año"]]));
    const rc = document.querySelector('[data-rueda="resultados-1"]');
    if (rc) ruedaClase(rc, R.clase, R.clase ? `índice ${fmt(R.indice, 2)}` : "");
    const rh = document.querySelector('[data-rueda="resultados-2"]');
    if (rh) rueda(rh, { texto: fmt(R.huellaPersona, 0), sub: "por persona", color: "var(--linea)" });

    // comprobaciones: lo que conviene mirar antes del PDF
    const avisos = [];
    const aviso = (tipo, texto, sec) => avisos.push(h("li", { class: "res-aviso " + tipo },
      h("span", { class: "res-marca", "aria-hidden": "true" }, tipo === "ok" ? "✓" : "!"), h("span", {}, texto),
      sec ? h("button", { type: "button", class: "res-ir", onclick: () => irASeccion(sec) }, "Revisar") : null));
    if (!R.minimos) aviso("error", `Faltan datos para calificar: ${R.falta.join(", ")}.`, "emplazamiento");
    if (cambiados) aviso("ambar", `${cambiados} ${cambiados === 1 ? "valor de aparato distinto" : "valores de aparatos distintos"} del de partida: quedan bajo responsabilidad del proyectista.`, "aparatos");
    if (P.riego.existe && R.riego.incompletas) aviso("error", `${R.riego.incompletas} zona(s) de riego sin todos los datos: no computan.`, "riego");
    if (P.riego.existe && !zonas) aviso("error", "El riego está activado pero no tiene zonas.", "riego");
    if (g.existe && np.demandaGrises === 0) aviso("ambar", "Las aguas grises no tienen ningún destino.", "reutilizacion");
    if (g.existe && np.grisesPosible - np.usadaGrises > 0.05) aviso("ambar", `El aljibe de grises se queda corto: el día de más uso pide ${fmt(R.predim.tratada, 0)} L.`, "reutilizacion");
    if (pl.existe && np.ofertaPluviales > 0 && np.demandaResidual < 0.05) aviso("ambar", "La lluvia no tiene a qué ir: las grises ya cubren sus destinos.", "reutilizacion");
    if (pl.existe && np.ofertaPluviales > 0 && np.usadaPluviales < np.demandaResidual - 0.05 && np.depositoUsado >= num0(P.depositoPluviales) - 0.5)
      aviso("ambar", `El aljibe de pluviales se llena: con ${fmt(R.predim.aljibe, 0)} L se aprovecharía más lluvia.`, "reutilizacion");
    if (!avisos.length) aviso("ok", "Todos los datos están completos y no hay nada que revisar.");
    document.getElementById("res-avisos").replaceChildren(...avisos);
  }

  // ------------------------------------------------------------------ pintar y refrescar
  // render(): vuelve a construir las secciones (cuando cambia qué hay: un aparato, una
  // zona…). cambio(): solo refresca los números (cuando cambia un valor).
  // En modo demo el cálculo es inmediato. En modo servidor hay que esperar a la API: cada
  // petición lleva un turno y, si llega la respuesta de una vieja después de una nueva, se
  // descarta. Mientras se escribe se espera un instante para no preguntar a cada tecla.
  let turno = 0, espera = null;
  const motorLocal = () => window.HA_CALCULO;
  function render() {
    if (!API.activa()) { R = motorLocal().calcular(P, D); return pintar(); }
    const t = ++turno;
    // las secciones se reconstruyen siempre; si entretanto se pidió otro cálculo, se
    // vuelven a pedir los números para no quedarse con unos viejos
    return API.calcular(P)
      .then(r => { R = r; pintar(); if (t !== turno) refrescar(); })
      .catch(errorServidor);
  }
  function refrescar() {
    const t = ++turno;
    return API.calcular(P)
      .then(r => { if (t === turno) { R = r; actualizar(); } })
      .catch(errorServidor);
  }
  function pintar() {
    const cont = document.getElementById("secciones");
    const y = window.scrollY;
    cont.replaceChildren(secEmplazamiento(), secAparatos(), secRiego(), secPiscina(), secReutilizacion(), secResultados());
    window.scrollTo(0, y);
    actualizar();
    guardar();
  }
  function cambio() {
    guardar();
    if (!API.activa()) { R = motorLocal().calcular(P, D); return actualizar(); }
    clearTimeout(espera);
    turno++;   // lo que esté en camino ya es viejo
    espera = setTimeout(refrescar, 150);
  }
  const pon = (sel, contenido) => document.querySelectorAll(sel).forEach(el => {
    el.replaceChildren(...[].concat(contenido).map(c => c && c.nodeType ? c : document.createTextNode(c ?? "")));
  });
  const res = (valor, unidad) => [h("strong", {}, valor), unidad ? h("small", {}, unidad) : null];

  // Partes de la sección 2 que cambian con los datos.
  function actualizarAparatos() {
    const r = id => R.aparatos[idx(id)];
    const chipEwl = c => c == null ? h("span", { class: "sin-escala" }, "–") : c === "sin escala" ? h("span", { class: "sin-escala" }, "sin escala")
      : h("span", { class: "letra" + (["A+", "A", "B"].includes(c) ? " oscura" : ""), title: "European Water Label",
          style: `background:${colorClase(c === "A+" ? "A" : c === "peor que E" ? "G" : c)}` }, c);
    for (const g of GRUPOS_APARATOS) {
      let n = 0, m3 = 0;
      const aplica = { persona: [R.totalOcu, "ocupante", "ocupantes"], vivienda: [R.totalViv, "vivienda", "viviendas"] };
      for (const f of g.filas) {
        if (!P.aparatos[idx(ids(f)[0])].presente) continue;
        n++;
        for (const id of ids(f)) {
          const x = r(id);
          m3 += x.m3;
          pon(`[data-m3="${id}"]`, [h("strong", {}, fmt(x.m3, 1)), h("small", {}, " m³/año")]);
          pon(`[data-ewl="${id}"]`, chipEwl(x.claseEf));
          pon(`[data-usos="${id}"]`, fmt(x.usos, 2));
          const sigue = document.querySelector(`[data-usos-sigue="${id}"]`);
          if (sigue) {
            const inp = sigue.querySelector("input");
            if (x.sigue && document.activeElement !== inp) inp.value = aTexto(x.usos);
            sigue.classList.toggle("modificado", !!x.modificado);
          }
          const ap = aplica[x.base];
          if (ap) pon(`[data-cant="${id}"]`, [h("strong", {}, fmt(ap[0], 0)), " " + (ap[0] === 1 ? ap[1] : ap[2])]);
        }
      }
      pon(`[data-resumen="grupo-${g.id}"]`, n
        ? resumen([[fmt(n, 0), n === 1 ? "aparato" : "aparatos"], [fmt(m3, 1), "m³/año"]])
        : resumen(["Ninguno en el proyecto"]));
    }
    const ruedaRef = document.querySelector('[data-rueda="aparatos-1"]');
    if (ruedaRef) rueda(ruedaRef, { frac: Math.min(1, R.indice), texto: `${fmt(R.indice * 100, 0)}%`,
      color: R.clase ? colorClase(R.clase) : "var(--linea)" });
    const ruedaCl = document.querySelector('[data-rueda="aparatos-2"]');
    if (ruedaCl) ruedaClase(ruedaCl, R.clase);
  }

  function actualizar() {
    const t = R.territorio || {};

    // panel izquierdo
    ruedaClase(document.getElementById("rueda-global"), R.clase,
      R.clase ? `índice ${fmt(R.indice, 2)}` : "");
    document.getElementById("nota-global").textContent = R.clase
      ? `${fmt(R.apLitrosDia, 1)} L/persona·día frente a ${fmt(R.refLitros, 1)} de referencia · ${R.tramo.toLowerCase()}`
      : `Faltan datos para calificar: ${R.falta.join(", ")}.`;
    // Letras parciales. Un bloque que el proyecto no incluye se apaga en el panel: anillo
    // punteado, sin letra y en gris, para que se vea de un vistazo que no cuenta. (La
    // letra de reutilización de un proyecto sin sistema es una G en la v2 y así sale en
    // el informe; en el panel se apaga como los demás bloques no incluidos.)
    const mini = (k, activo, cl, sub) => {
      const el = document.getElementById("rueda-" + k);
      el.closest(".mini").classList.toggle("apagada", !activo);
      if (activo && cl) ruedaClase(el, cl, sub);
      else rueda(el, { texto: "—", sub: activo ? "faltan datos" : "no incluido", tipo: "sin-bloque" });
    };
    mini("riego", P.riego.existe, R.claseRiego, R.indiceRiego != null ? `índice ${fmt(R.indiceRiego, 2)}` : "");
    mini("piscina", P.piscina.existe, R.clasePiscina, R.indicePiscina != null ? `índice ${fmt(R.indicePiscina, 2)}` : "");
    mini("reutilizacion", P.grises.existe || P.pluviales.existe, R.claseReuso, `${fmt(R.coberturaReuso * 100, 0)} % cubierto`);
    rueda(document.getElementById("rueda-huella"), { texto: oGuion(R.huellaPersona, 0), sub: "por persona" });

    // 1 · emplazamiento
    actualizarEmplazamiento();

    // 2 · aparatos
    const ruedaRef = document.querySelector('[data-rueda="aparatos-1"]');
    if (ruedaRef) rueda(ruedaRef, { frac: Math.min(1, R.indice), texto: `${fmt(R.indice * 100, 0)}%`,
      color: R.clase ? colorClase(R.clase) : "var(--primary-colour)" });
    const ruedaCl = document.querySelector('[data-rueda="aparatos-2"]');
    if (ruedaCl) ruedaClase(ruedaCl, R.clase);
    actualizarAparatos();

    actualizarRiego();
    actualizarPiscina();
    actualizarReutilizacion();
    actualizarResultados();
    pintarEstados();
  }

  // Pareja de ruedas de una sección: índice frente a su referencia y letra.
  function ruedasSeccion(id, frac, texto, clase) {
    const r1 = document.querySelector(`[data-rueda="${id}-1"]`);
    if (r1) rueda(r1, { frac: frac == null ? null : Math.min(1, frac), texto,
      color: clase ? colorClase(clase) : "var(--linea)" });
    const r2 = document.querySelector(`[data-rueda="${id}-2"]`);
    if (r2) ruedaClase(r2, clase);
  }
  const item = (etq, valor, extra) => h("div", { class: "rc-item" }, h("span", {}, etq), h("strong", {}, valor), extra || null);
  const itemClase = (etq, clase, ayuda) => h("div", { class: "rc-item rc-clase" }, h("span", {}, etq),
    h("span", { class: "rc-letra" }, clase ? letra(clase) : h("strong", {}, "–"), ayuda ? info(etq, ayuda) : null));
  const pct = v => (v == null ? "–" : `${fmt(v * 100, 0)} %`);

  function actualizarRiego() {
    const rg = R.riego;
    ruedasSeccion("riego", R.indiceRiego, R.indiceRiego == null ? "–" : pct(R.indiceRiego), R.claseRiego);
    pon('[data-resumen="zonas"]', resumen([[fmt(P.riego.zonas.length, 0), P.riego.zonas.length === 1 ? "zona" : "zonas"],
      [fmt(rg.area, 0), "m²"], [fmt(rg.total, 1), "m³/año"]]));
    const rr = document.getElementById("resumen-riego");
    if (rr) rr.replaceChildren(
      item("Necesidad de riego", `${fmt(rg.total, 1)} m³/año`),
      item("Por m² regado", rg.area > 0 ? `${fmt(rg.total / rg.area * 1000, 0)} L/año` : "–"),
      item("Caso base", `${fmt(rg.base, 1)} m³/año`),
      item("Índice", R.indiceRiego == null ? "–" : fmt(R.indiceRiego, 2)),
      itemClase("Clase de riego", R.claseRiego, `<p>Compara el agua que necesita el jardín proyectado con la que necesitaría el mismo jardín en césped de demanda alta, microclima alto, densidad baja y aspersores (${fmt(rg.base, 1)} m³/año).</p>
        <p>El índice (${R.indiceRiego == null ? "–" : fmt(R.indiceRiego, 2)}) se califica con la misma escala que los aparatos, endurecida según el tramo de escasez (${R.tramo.toLowerCase()}).</p>
        <p>Se usa la demanda bruta, antes de descontar el agua no potable: el ahorro por reutilización cuenta en su propia letra.</p>`));
    // filas de cada zona: lo que consume
    rg.zonas.forEach((z, i) => pon(`[data-zona-m3="${i}"]`, z.completa
      ? [h("strong", {}, fmt(z.m3, 1)), h("small", {}, " m³/año")] : h("span", { class: "sin-escala" }, "–")));
    const av = document.getElementById("aviso-riego");
    if (av) av.replaceChildren(...(rg.incompletas
      ? [h("span", {}, `${rg.incompletas} zona(s) con superficie pero sin todos los datos: no computan.`)]
      : [h("span", {}, `Déficit hídrico de ${P.provincia}: ${fmt(Math.abs(R.deficitAnual), 0)} mm/año (ETo menos lluvia en los meses secos).`)]));
  }

  function actualizarPiscina() {
    const ps = R.piscina;
    ruedasSeccion("piscina", R.indicePiscina, R.indicePiscina == null ? "–" : pct(R.indicePiscina), R.clasePiscina);
    const pz = P.piscina;
    pon('[data-resumen="vaso"]', resumen([[fmt(pz.sup, 1), "m²"], CORTO_COBERTURA[pz.cobertura] || pz.cobertura,
      `${MESES_CORTO[pz.mesIni - 1]}–${MESES_CORTO[pz.mesFin - 1]}`]));
    pon("#pis-consumo", [h("strong", {}, fmt(ps.total, 1)), h("small", {}, " m³/año")]);
    const rp = document.getElementById("resumen-piscina");
    if (rp) rp.replaceChildren(
      item("Consumo de la piscina", `${fmt(ps.total, 1)} m³/año`),
      item("Agua evitable", `${fmt(ps.evitable, 1)} m³/año`),
      item("Caso base", `${fmt(ps.base, 1)} m³/año`),
      item("Índice", R.indicePiscina == null ? "–" : fmt(R.indicePiscina, 2)),
      itemClase("Clase de piscina", R.clasePiscina, `<p>Mide solo el <strong>agua evitable</strong> con decisiones de proyecto: la evaporación, que se corta con una cubierta, y el lavado de filtros, que puede hacerse sin vaciar (${fmt(ps.evitable, 1)} m³/año).</p>
        <p>Se compara con el mismo vaso sin cubierta y lavando por vaciado (${fmt(ps.base, 1)} m³/año). El llenado y las renovaciones dependen del tamaño del vaso: cuentan en el consumo y en la huella, pero no en la letra.</p>`));
  }

  function actualizarReutilizacion() {
    const np = R.np;
    ruedasSeccion("reutilizacion", R.coberturaReuso, pct(R.coberturaReuso), R.claseReuso);
    const destinos = f => ["cisternas", "riego", "baldeo", "piscina"].filter(k => f[k]).length;
    pon('[data-resumen="grises"]', P.grises.existe
      ? resumen([[fmt(np.ofertaGrises, 1), "m³/año tratados"], [fmt(destinos(P.grises), 0), destinos(P.grises) === 1 ? "destino" : "destinos"], [fmt(P.depositoGrises, 0), "L de aljibe"]])
      : resumen(["No"]));
    pon('[data-resumen="pluviales"]', P.pluviales.existe
      ? resumen([[fmt(P.pluviales.sup, 0), "m²"], [fmt(np.ofertaPluviales, 1), "m³/año captados"], [fmt(P.depositoPluviales, 0), "L de aljibe"]])
      : resumen(["No"]));
    const pon3 = (id, v, u) => pon("#" + id, [h("strong", {}, v), h("small", {}, " " + u)]);
    pon3("np-grises-bruta", fmt(np.grisesBruta, 1), "m³/año");
    pon3("np-grises-trat", fmt(np.ofertaGrises, 1), "m³/año");
    pon3("np-depositoGrises-prop", fmt(R.predim.tratada, 0), "L");
    const aprov = (id, u, d) => pon("#" + id, [h("strong", {}, fmt(u, 1)), h("small", {}, " m³/año"),
      d > 0 ? h("small", {}, ` · ${fmt(Math.min(1, u / d) * 100, 0)} %`) : null]);
    aprov("np-grises-usada", np.usadaGrises, np.demandaGrises);
    pon3("np-pluv-capt", fmt(np.ofertaPluviales, 1), "m³/año");
    pon3("np-depositoPluviales-prop", fmt(R.predim.aljibe, 0), "L");
    aprov("np-pluv-usada", np.usadaPluviales, np.demandaResidual);
    pon("#np-nota-grises", notaAljibeGrises());
    pon("#np-nota-pluviales", notaAljibePluviales());
    const rr = document.getElementById("resumen-reutilizacion");
    if (rr) rr.replaceChildren(
      item("Oferta", `${fmt(np.oferta, 1)} m³/año`),
      item("Aprovechada", `${fmt(np.usada, 1)} m³/año`),
      item("Al saneamiento", `${fmt(np.sobrante, 1)} m³/año`),
      item("Demanda no potable", `${fmt(np.potencial, 1)} m³/año`),
      item("Cobertura", pct(R.coberturaReuso)),
      itemClase("Clase de reutilización", R.claseReuso, `<p>Fracción de la demanda que no necesita ser potable (cisternas, baldeo, riego y piscina: ${fmt(np.potencial, 1)} m³/año) que se cubre de verdad con agua gris o pluvial (${fmt(np.usada, 1)} m³/año).</p>
        <p>Aquí la escala va al revés: más es mejor. La clase A exige cubrir el 80 % sin escasez, el 85 % con escasez y el 90 % con escasez severa; no reutilizar nada es una G.</p>`));
  }
  const cap = t => t ? t[0].toUpperCase() + t.slice(1) : t;
  const ponDato = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };

  // Qué decide cada aljibe, en una frase (motor.py §5, nota final).
  function notaAljibeGrises() {
    const np = R.np, prop = R.predim.tratada, dec = num0(P.depositoGrises);
    if (np.demandaGrises === 0) return "Las grises no tienen destino: no hace falta aljibe.";
    const perdida = np.grisesPosible - np.usadaGrises;
    if (perdida > 0.05) return [h("strong", {}, "Se queda corto. "),
      `El día de más uso pide ${fmt(prop, 0)} L: se dejan de aprovechar ${fmt(perdida, 1)} m³/año.`];
    if (dec > prop * 1.5 && prop > 0) return [h("strong", {}, "Sobra volumen. "),
      `Con ${fmt(prop, 0)} L basta: el agua tratada no debe guardarse más de un día.`];
    return "Guarda un día de lo que pueden cubrir las grises: el agua tratada no se almacena más.";
  }
  function notaAljibePluviales() {
    const np = R.np, pl = P.pluviales;
    if (np.ofertaPluviales === 0) return "No llega lluvia: revisa la superficie o el filtro.";
    const algunDestino = ["cisternas", "riego", "baldeo", "piscina"].some(k => pl[k]);
    if (np.demandaResidual < 0.05) return algunDestino
      ? [h("strong", {}, "Las grises ya lo cubren todo. "), "Lleva la lluvia al riego, al baldeo o a la piscina, o prescinde de ella."]
      : "Elige al menos un destino para la lluvia.";
    if (np.usadaPluviales >= np.demandaResidual - 0.05) return "Cubre toda la demanda que dejan las grises.";
    if (np.depositoUsado >= num0(P.depositoPluviales) - 0.5) return [h("strong", {}, "Se llena. "),
      `Ampliarlo aprovecharía más lluvia (propuesto ${fmt(R.predim.aljibe, 0)} L).`];
    if (np.ofertaPluviales < np.demandaResidual) return np.depositoUsado < 1
      ? "Limita la lluvia: se gasta toda el mismo mes. El propuesto cubre los días secos entre lluvias."
      : "Limita la lluvia captada: ampliar el aljibe no serviría.";
    return `Limita la demanda: sobra lluvia y se vierten ${fmt(np.vertidoPluviales, 1)} m³/año.`;
  }
  const num0 = v => (typeof v === "number" && isFinite(v) ? v : 0);
  const MESES_LARGO = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
    "septiembre", "octubre", "noviembre", "diciembre"];

  // ------------------------------------------------------------------ datos del proyecto e informe
  function abrirDatos() {
    // solo lo que no está ya en la web: el emplazamiento sale de la provincia elegida
    const id = P.identificacion;
    const al = clave => v => { id[clave] = v; guardar(); };
    const cont = document.getElementById("campos-informe");
    cont.replaceChildren(
      campoTexto({ etiqueta: "Nombre del proyecto:", valor: id.nombre, alCambiar: al("nombre") }),
      campoTexto({ etiqueta: "Promotor del proyecto:", valor: id.promotor, alCambiar: al("promotor") }));
    document.getElementById("aviso-informe").textContent = "";
    document.getElementById("modal-informe").hidden = false;
  }
  function abrirInforme() {
    const pendientes = seccionesPendientes();
    if (pendientes.length) {
      document.getElementById("info-titulo").textContent = "Faltan datos para el informe";
      document.getElementById("info-texto").innerHTML = `<p>El informe se genera cuando todas las secciones están en verde. Falta revisar:</p>
        <ul>${pendientes.map(([, nombre, v]) => `<li><strong>${nombre}</strong>: ${[...v.error, ...v.falta].join(", ")}</li>`).join("")}</ul>`;
      document.getElementById("modal-info").hidden = false;
      return;
    }
    abrirDatos();
  }
  function aceptarDatos() {
    const aviso = document.getElementById("aviso-informe");
    if (!P.identificacion.nombre.trim()) { aviso.textContent = "Indica al menos el nombre del proyecto."; return; }
    document.getElementById("modal-informe").hidden = true;
    // el contenido del informe está en js/informe.js; aquí solo se pone y se imprime
    document.getElementById("informe").innerHTML = window.HA_INFORME.html(P, R, D);
    window.print();
  }

  // ------------------------------------------------------------------ barra de la cabecera
  // El proyecto no se guarda en ningún servidor: vive en esta pestaña y se pierde al
  // cerrarla. «Nuevo proyecto» lo vacía antes, con confirmación porque no hay copia.
  // En modo servidor, si la API deja de responder, aquí se avisa.
  function errorServidor(e) {
    pintarBarra(`Sin respuesta del servidor: ${e.message}`);
  }
  function pintarBarra(mensaje) {
    const barra = document.getElementById("barra-proyecto");
    barra.hidden = false;
    barra.replaceChildren(...[
      mensaje ? h("span", { class: "barra-estado error" }, mensaje) : null,
      h("button", { type: "button", class: "barra-btn", onclick: () => confirmar({
        titulo: "Nuevo proyecto",
        texto: "<p>Se vacían todos los datos del proyecto actual. No se guardan en ningún sitio, así que no se podrán recuperar.</p>",
        aceptar: "Empezar de cero",
        alAceptar: async () => { P = C.proyectoVacio(); guardar(); await render(); pintarBarra(); } }) }, "Nuevo proyecto"),
    ].filter(Boolean));
  }

  // ------------------------------------------------------------------ arranque
  // Las ruedas del panel llevan a su sección (y la abren). La grande, a los aparatos.
  const DESTINO_RUEDA = { "rueda-global": "aparatos", "rueda-riego": "riego", "rueda-piscina": "piscina",
    "rueda-reutilizacion": "reutilizacion" };
  for (const [idRueda, sec] of Object.entries(DESTINO_RUEDA)) {
    const cont = document.getElementById(idRueda).closest(".mini, .top-wheel");
    cont.classList.add("enlazada");
    cont.setAttribute("role", "button");
    cont.setAttribute("tabindex", "0");
    cont.setAttribute("title", "Ir a la sección");
    const ir = () => {
      const s = document.getElementById("sec-" + sec);
      if (!s.classList.contains("abierta")) { abiertas[sec] = true; s.classList.add("abierta"); }
      const y = s.getBoundingClientRect().top + window.scrollY - 85;
      window.scrollTo({ top: y, behavior: "smooth" });
    };
    cont.addEventListener("click", ir);
    cont.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ir(); } });
  }

  document.getElementById("btn-informe").addEventListener("click", abrirInforme);
  document.getElementById("btn-generar").addEventListener("click", aceptarDatos);
  document.querySelectorAll(".modal").forEach(m => {
    m.addEventListener("click", e => { if (e.target === m || e.target.closest("[data-cerrar]")) m.hidden = true; });
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape") document.querySelectorAll(".modal").forEach(m => { m.hidden = true; }); });

  // ------------------------------------------------------------------ minibarra de navegación
  // Marcas pequeñas pegadas al borde izquierdo de las secciones, como en Notion o Substack:
  // una por sección. Al pasar el ratón sale el nombre; al pulsar, lleva a la sección y la
  // abre. Arriba, × pliega todas para ver solo los resúmenes. Marca la sección en pantalla.
  const SECCIONES_NAV = [["emplazamiento", "1. Emplazamiento"], ["aparatos", "2. Aparatos"],
    ["riego", "3. Riego"], ["piscina", "4. Piscina"], ["reutilizacion", "5. Reutilización"], ["resultados", "6. Resultados"]];
  function plegarTodas() {
    for (const [id] of SECCIONES_NAV) {
      abiertas[id] = false;
      const s = document.getElementById("sec-" + id);
      if (s) s.classList.remove("abierta");
    }
    const primera = document.getElementById("sec-emplazamiento");
    if (primera) window.scrollTo({ top: primera.getBoundingClientRect().top + window.scrollY - 85, behavior: "smooth" });
  }
  const nav = h("nav", { class: "minibarra", "aria-label": "Ir a una sección" },
    h("button", { type: "button", class: "minibarra-plegar", "aria-label": "Plegar todas las secciones", onclick: plegarTodas }),
    SECCIONES_NAV.map(([id, nombre]) => h("button", { type: "button", class: "minibarra-marca", "data-nav": id,
      "aria-label": nombre, onclick: () => irASeccion(id) })));
  document.body.append(nav);
  function colocarMinibarra() {
    // a la derecha de las cajas de sección, en el margen junto a la barra de desplazamiento
    const caja = document.querySelector(".section-border") || document.getElementById("secciones");
    nav.style.left = Math.min(document.documentElement.clientWidth - 30, caja.getBoundingClientRect().right + 4) + "px";
  }
  function marcarActual() {
    let actual = SECCIONES_NAV[0][0];
    for (const [id] of SECCIONES_NAV) {
      const s = document.getElementById("sec-" + id);
      if (s && s.getBoundingClientRect().top < window.innerHeight * 0.35) actual = id;
    }
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
      // al final de la página manda la última sección visible
      const vis = SECCIONES_NAV.filter(([id]) => { const s = document.getElementById("sec-" + id); return s && s.getBoundingClientRect().top < window.innerHeight; });
      if (vis.length) actual = vis[vis.length - 1][0];
    }
    nav.querySelectorAll(".minibarra-marca").forEach(b => {
      const id = b.dataset.nav;
      b.classList.toggle("actual", id === actual);
      const s = document.getElementById("sec-" + id);
      b.classList.toggle("abierta", !!(s && s.classList.contains("abierta")));
    });
  }
  window.addEventListener("resize", colocarMinibarra);
  window.addEventListener("scroll", marcarActual, { passive: true });
  document.addEventListener("click", () => requestAnimationFrame(marcarActual));

  // Arranque: primero se averigua si hay servidor. Con servidor, las tablas de datos se
  // piden a la API y el motor no se descarga. Sin servidor (o si la API falla al pedir los
  // datos), se cargan js/datos.js y js/calculo.js y se calcula aquí: modo demo.
  async function arrancar() {
    if (await API.detectar()) {
      try { D = (await API.datos()).datos; } catch (e) { API.desactivar(); }
    }
    if (!API.activa()) {
      await API.cargarMotorLocal();
      D = window.HA_DATOS;
    }
    await render();
    pintarBarra();
    colocarMinibarra();
    marcarActual();
  }
  arrancar();
})();
