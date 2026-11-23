/* Cliente de la API: la única parte de la web que habla con el servidor.
 *
 * La página funciona en dos modos y lo decide sola al arrancar (detectar()):
 *   servidor  hay una API en la misma dirección que la página (node servidor/api/servidor.js,
 *             y en Azure): la página le pide las tablas de datos y el cálculo. El motor
 *             (calculo.js) y los datos (datos.js) no se descargan, y el servidor se niega a
 *             servirlos.
 *   demo      no la hay (doble clic en index.html, el servidor de Python, la página
 *             publicada en Claude): se cargan calculo.js y datos.js (cargarMotorLocal()) y
 *             se calcula en el navegador.
 *
 * No hay usuarios ni proyectos guardados: la API solo calcula.
 */
(function (global) {
  "use strict";

  const BASE = "/api";   // si la API vive en otra dirección (p. ej. otro dominio en Azure), va aquí
  const VERSION = "2026112308";   // la misma que los ?v= de index.html
  let activa = false;

  async function pedir(metodo, ruta, cuerpo) {
    const r = await fetch(BASE + ruta, {
      method: metodo,
      headers: { "Content-Type": "application/json" },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    const json = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(json.error || `Error ${r.status}`), { estado: r.status });
    return json;
  }

  // ¿Hay API? Una pregunta corta a /api/salud; si no contesta bien en 1,5 s, modo demo.
  async function detectar() {
    if (global.location.protocol === "file:") return (activa = false);
    try {
      const control = new AbortController();
      const reloj = setTimeout(() => control.abort(), 1500);
      const r = await fetch(BASE + "/salud", { signal: control.signal });
      clearTimeout(reloj);
      activa = r.ok && (await r.json()).ok === true;
    } catch (e) {
      activa = false;
    }
    return activa;
  }

  // Modo demo: añade a la página los scripts del motor y los datos, y espera a que carguen.
  function cargarMotorLocal() {
    const uno = f => new Promise((resolver, rechazar) => {
      const s = document.createElement("script");
      s.src = `js/${f}?v=${VERSION}`;
      s.onload = resolver;
      s.onerror = () => rechazar(new Error(`No se pudo cargar js/${f}`));
      document.head.append(s);
    });
    return uno("datos.js").then(() => uno("calculo.js"));
  }

  global.HA_API = {
    detectar,
    activa: () => activa,
    desactivar: () => { activa = false; },
    cargarMotorLocal,
    datos: () => pedir("GET", "/datos"),
    calcular: proyecto => pedir("POST", "/calcular", { proyecto }).then(r => r.resultados),
  };
})(window);
