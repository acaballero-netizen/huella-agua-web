/* Proyecto y aparatos: lo que la interfaz necesita saber del modelo, sin el cálculo.
 *
 * Catálogo de aparatos con sus valores de partida, el proyecto de partida (vacío o el de
 * las pruebas) y las reglas de los valores de partida. Lo usan app.js (para pintar) y
 * calculo.js (para calcular). Este fichero sí se envía al navegador en los dos modos;
 * calculo.js, en modo servidor, no (ver js/api.js).
 */
(function (global) {
  "use strict";
  // Aparatos por defecto del proyecto residencial: v2/ha2/proyecto.py, APARATOS.
  // usos = null → ciclos/día de la tabla de lavado del IDAE según ocupantes medios.
  const APARATOS = [
    ["inodoro_completa", "Inodoro · descarga completa", "Inodoro con cisterna", true, 6.0, 1.0, "persona", null, "L/descarga", "descargas/día"],
    ["inodoro_reducida", "Inodoro · descarga reducida", "Inodoro con cisterna", true, 3.0, 4.0, "persona", null, "L/descarga", "descargas/día"],
    ["lavabo", "Lavabo", "Lavabo", true, 6.0, 2.5, "persona", null, "L/min", "min/día"],
    ["ducha", "Ducha", "Ducha", true, 8.0, 5.74, "persona", null, "L/min", "min/día"],
    ["banera", "Bañera", "Bañera de 1,40 m o más", false, 106.0, 0.10, "persona", null, "L/baño", "baños/día"],
    ["bide", "Bidé", "Bidé", false, 6.0, 0.5, "persona", null, "L/min", "min/día"],
    ["fregadero", "Fregadero de cocina", "Fregadero doméstico", true, 6.0, 3.0, "persona", null, "L/min", "min/día"],
    ["lavadero", "Lavadero", "Lavadero", false, 6.0, 2.0, "vivienda", null, "L/min", "min/día"],
    ["lavavajillas", "Lavavajillas", "Lavavajillas doméstico", true, 9.0, null, "vivienda", null, "L/ciclo", "ciclos/día"],
    ["lavadora", "Lavadora", "Lavadora doméstica", true, 50.0, null, "vivienda", null, "L/ciclo", "ciclos/día"],
    ["lavamanos", "Lavamanos", "Lavamanos", false, 3.0, 0.5, "persona", null, "L/min", "min/día"],
    ["grifo_exterior", "Grifo exterior o de riego manual", "Grifo aislado", false, 9.0, 5.0, "edificio", 1, "L/min", "min/día"],
    ["grifo_garaje", "Grifo de garaje", "Grifo garaje", false, 12.0, 5.0, "edificio", 1, "L/min", "min/día"],
    ["vertedero", "Vertedero", "Vertedero", false, 12.0, 3.0, "edificio", 1, "L/min", "min/día"],
    ["urinario", "Urinario con cisterna", "Urinarios con cisterna (c/u)", false, 2.4, 6.0, "edificio", 1, "L/descarga", "descargas/día"],
  ].map(([id, etiqueta, catalogo, presente, caudal, usos, base, n, uCaudal, uUsos]) =>
    ({ id, etiqueta, catalogo, presente, caudal, usos, base, n, uCaudal, uUsos,
       caudalDef: caudal, usosDef: usos }));

  const CLASES = ["A", "B", "C", "D", "E", "F", "G"];

  // Aparatos cuyos usos de partida dependen de otro: el fregadero suma el fregado a mano
  // cuando no hay lavavajillas. Mientras sus usos valgan null siguen ese valor de partida
  // (como la fórmula de la v2); en cuanto el proyectista escribe uno, manda el suyo.
  const USOS_QUE_SIGUEN = ["fregadero"];

  function proyectoPorDefecto() {
    return {
      identificacion: { nombre: "", ubicacion: "", promotor: "", proyectista: "" },
      provincia: "Ourense",
      uso: "Vivienda plurifamiliar",
      diasUso: 335,
      supUtil: 1800,
      // Plurifamiliar: una fila por tipología presente. Unifamiliar: una vivienda.
      // La tipología es descriptiva (cocina, baños, aseos); el cálculo solo usa
      // viviendas × ocupantes, como en la v2.
      tipologias: [["Tipo 1", 5, 2], ["Tipo 2", 10, 4], ["Tipo 3", 5, 3]]
        .map(([tipo, viviendas, ocupantes]) => ({ tipo, viviendas, ocupantes })),
      unifamiliar: { tipo: "Tipo 2", ocupantes: 4 },
      aparatos: APARATOS.map(a => ({ ...a, usos: USOS_QUE_SIGUEN.includes(a.id) ? null : a.usos })),
      // "doble": completa + reducida (las dos líneas de la v2). "unica": solo la línea
      // de descarga completa, con todas las descargas del día.
      inodoroTipo: "doble",
      riego: { existe: false, zonas: [] },
      piscina: { existe: false, sup: 20, prof: 1.5, cobertura: "Sin cubierta",
                 mesIni: 5, mesFin: 9, backwash: true, renov: 1 },
      grises: { existe: false, rend: 0.85, cisternas: true, riego: false, baldeo: false },
      pluviales: { existe: false, sup: 100, tipo: "Tejado duro inclinado", rend: 0.9,
                   cisternas: true, riego: false, baldeo: false, piscina: false },
      // Un aljibe por fuente (v2: Deposito_Grises y Deposito_Pluviales), en litros.
      depositoGrises: 2000,
      depositoPluviales: 5000,
    };
  }

  // Proyecto con el que arranca la web: sin datos del proyecto, para no generar un
  // informe con valores que nadie ha puesto. Solo quedan los valores de partida que son
  // método y no dato (aparatos del catálogo, días de uso, rendimientos y destinos). El
  // vacío es null (o "" en lo que se elige), y el motor lo cuenta como 0.
  // proyectoPorDefecto() sigue siendo el de las pruebas contra Excel.
  // Aparatos cuyo caudal o volumen de referencia vale como dato de proyecto. En el resto,
  // el caudal lo pone el proyectista con el producto elegido: no cuenta como «valor
  // cambiado» (ámbar), y vacío no tiene clase de etiqueta.
  const CAUDAL_DE_REFERENCIA = ["lavavajillas", "lavadora"];
  function proyectoVacio() {
    const p = proyectoPorDefecto();
    p.provincia = "";
    p.supUtil = null;
    p.tipologias = [{ tipo: "", viviendas: null, ocupantes: null }];
    p.unifamiliar = { tipo: "", ocupantes: null };
    p.piscina = { existe: false, sup: null, prof: null, cobertura: "", mesIni: null, mesFin: null, backwash: null, renov: null };
    p.pluviales = { ...p.pluviales, sup: null, tipo: "" };
    p.depositoGrises = null;
    p.depositoPluviales = null;
    // caudales y volúmenes: los del producto que se instale. Solo lavavajillas y lavadora
    // conservan el de referencia, que está muy estandarizado.
    p.aparatos.forEach(a => { if (!CAUDAL_DE_REFERENCIA.includes(a.id)) a.caudal = null; });
    return p;
  }


  // Inodoro de descarga única: las mismas 5 descargas al día que el de doble descarga
  // (1 completa + 4 reducidas), todas con el volumen completo.
  const USOS_INODORO_UNICA = 5;

  // Valores de partida de un aparato, teniendo en cuenta el tipo de inodoro. Sirven para
  // marcar en ámbar lo que se aparta de ellos y para el botón de restaurar.
  function valoresPartida(a, p) {
    const unica = p && p.inodoroTipo === "unica";
    return {
      caudal: a.caudalDef,
      usos: unica && a.id === "inodoro_completa" ? USOS_INODORO_UNICA : a.usosDef,
      n: APARATOS.find(x => x.id === a.id).n,
    };
  }

  global.HA_PROYECTO = { APARATOS, CLASES, CAUDAL_DE_REFERENCIA, USOS_INODORO_UNICA, USOS_QUE_SIGUEN,
                         proyectoPorDefecto, proyectoVacio, valoresPartida };
})(typeof window !== "undefined" ? window : globalThis);
