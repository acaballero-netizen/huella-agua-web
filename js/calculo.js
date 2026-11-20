/* Motor de cálculo de la web.
 *
 * Es una función pura: calcular(proyecto, datos) → resultados. No toca el DOM ni guarda
 * nada, así que se puede probar sola (scripts/probar.js) y, si un día el cálculo pasa a
 * un servidor como en la herramienta de industrialización del IVE, se mueve entera.
 *
 * Es un PORTE del motor de la v2 (v2/ha2/proyecto.py y motor.py), no una versión
 * propia. Hoy está portado el bloque de aparatos: consumo, índice, clase y huella.
 * Riego, piscina y reutilización devuelven { pendiente: true } hasta portarlos, y la
 * página lo dice en vez de enseñar un número.
 */
(function (global) {
  "use strict";

  // El catálogo de aparatos, el proyecto de partida y los valores de partida están en
  // js/proyecto.js, que se carga antes: los comparte con la interfaz.
  const { APARATOS, CLASES, CAUDAL_DE_REFERENCIA, USOS_INODORO_UNICA, USOS_QUE_SIGUEN, valoresPartida,
          proyectoPorDefecto, proyectoVacio } = global.HA_PROYECTO;

  const COL_TRAMO = { "Sin escasez": "U_SIN_ESCASEZ", "Escasez": "U_ESCASEZ",
                      "Escasez severa": "U_SEVERA" };

  const num = v => (typeof v === "number" && isFinite(v) ? v : 0);

  function territorio(datos, provincia) {
    return datos.territorio.find(t => t.provincia === provincia) || null;
  }

  // Ciclos/día de lavadora y lavavajillas: tabla Lavado de D.Parametros, columna según
  // los ocupantes medios redondeados y acotados a 1..5, dividido entre 7 días.
  function ciclosDia(datos, catalogo, ocupMedios) {
    const fila = datos.lavado.find(l => l.APARATO === catalogo);
    if (!fila) return 0;
    const k = Math.min(5, Math.max(1, Math.round(ocupMedios)));
    const col = k === 5 ? "OCUP_5_O_MAS" : "OCUP_" + k;
    return num(fila[col]) / 7;
  }

  // Usos de partida del fregadero (v2/ha2/proyecto.py): 3,0 min/día con lavavajillas. Sin
  // él se friega a mano y se suman, por persona, los ciclos que habría hecho la máquina
  // en el hogar medio × los litros de fregar esa carga a mano (103 L, Stamminger et al.
  // 2007; tabla Lavado, L_A_MANO), en minutos al caudal de referencia de 6 L/min.
  const CAUDAL_FREGADERO_REF = 6;
  const HOGAR_MEDIO = 2.5;
  function usosFregaderoPartida(p, datos, ocupMedios) {
    const base = APARATOS.find(x => x.id === "fregadero").usos;
    const lvj = p.aparatos.find(a => a.id === "lavavajillas");
    if (!lvj || lvj.presente) return base;
    // sin ocupantes todavía, el hogar medio español (2,5 personas, INE)
    if (!(ocupMedios > 0)) ocupMedios = HOGAR_MEDIO;
    const fila = datos.lavado.find(l => l.APARATO === lvj.catalogo) || {};
    const extra = ciclosDia(datos, lvj.catalogo, ocupMedios) * num(fila.L_A_MANO) / CAUDAL_FREGADERO_REF / ocupMedios;
    return Math.round((base + extra) * 100) / 100;
  }

  // Clase del European Water Label con el caudal declarado.
  function claseEficiencia(datos, catalogo, caudal) {
    const c = datos.aparatos.find(a => a.APARATO === catalogo);
    if (!c || c["EULS_A+"] == null) return "sin escala";
    const escalones = ["A+", "A", "B", "C", "D", "E"];
    for (const k of escalones) {
      const u = c["EULS_" + k];
      // un umbral vacío en Excel compara como texto y deja pasar cualquier número
      if (u == null || caudal <= u) return k;
    }
    return "peor que E";
  }

  function claseDesdeIndice(datos, tramo, indice) {
    const col = COL_TRAMO[tramo] || "U_SIN_ESCASEZ";
    for (const u of datos.escala.umbrales) {
      if (indice <= u[col]) return u.CLASE;
    }
    return "G";
  }

  function calcular(p, datos) {
    const terr = territorio(datos, p.provincia);
    const dias = num(p.diasUso);
    const filas = p.uso === "Vivienda unifamiliar"
      ? [{ viviendas: 1, ocupantes: num(p.unifamiliar && p.unifamiliar.ocupantes) }]
      : p.tipologias;
    const totalViv = filas.reduce((s, t) => s + num(t.viviendas), 0);
    const totalOcu = filas.reduce((s, t) => s + num(t.viviendas) * num(t.ocupantes), 0);
    const ocupMedios = totalViv > 0 ? totalOcu / totalViv : 0;

    // ---------------------------------------------------------------- aparatos
    const unica = p.inodoroTipo === "unica";
    const aparatos = p.aparatos.map(a => {
      // Usos de partida; el del fregadero depende de si hay lavavajillas. Los que siguen
      // (USOS_QUE_SIGUEN) valen null mientras el proyectista no escriba uno suyo.
      const auto = a.usosDef === null;
      const partida = valoresPartida(a, p);
      if (a.id === "fregadero") partida.usos = usosFregaderoPartida(p, datos, ocupMedios);
      const sigue = USOS_QUE_SIGUEN.includes(a.id) && a.usos == null;
      const usos = auto ? ciclosDia(datos, a.catalogo, ocupMedios) : sigue ? partida.usos : num(a.usos);
      // La base (persona, vivienda o aparato instalado) es fija por aparato: sale de
      // cómo se mide su uso en las estadísticas. Ver v2/README, «Qué multiplica a
      // cada aparato».
      const base = APARATOS.find(x => x.id === a.id).base;
      const cantidad = base === "edificio" ? num(a.n)
        : base === "vivienda" ? totalViv : totalOcu;
      const presente = a.presente && !(unica && a.id === "inodoro_reducida");
      const unitario = presente ? num(a.caudal) * usos : 0;    // L/día por base
      const litrosDia = unitario * cantidad;
      const m3 = litrosDia * dias / 1000;
      const modificado = (CAUDAL_DE_REFERENCIA.includes(a.id) && a.caudal != null && Math.round(num(a.caudal) * 100) / 100 !== partida.caudal) ||
        (!auto && !sigue && a.usos != null && Math.round(num(a.usos) * 100) / 100 !== partida.usos);
      return { id: a.id, presente, base, usos, auto, sigue, usosPartida: partida.usos, cantidad, unitario, litrosDia, m3, modificado,
               claseEf: a.caudal == null ? null : claseEficiencia(datos, a.catalogo, num(a.caudal)) };
    });
    const apTotal = aparatos.reduce((s, a) => s + a.m3, 0);

    // ---------------------------------------------------------------- clima
    // motor.py §1: déficit hídrico del mes = min(0, P − ETo). Solo los meses con
    // balance negativo generan necesidad de riego.
    const P_m = terr ? terr.p : Array(12).fill(0);
    const ETo_m = terr ? terr.eto : Array(12).fill(0);
    const deficit_m = P_m.map((pm, i) => Math.min(0, pm - ETo_m[i]));
    const deficitAnual = suma(deficit_m);

    const riego = calcularRiego(p, datos, deficitAnual);
    const piscina = calcularPiscina(p, datos, terr, P_m, ETo_m);
    const np = calcularNoPotable(p, datos, aparatos, riego, piscina, P_m, deficit_m, deficitAnual);

    // ---------------------------------------------------------------- suministrada
    // motor.py §6: el agua no potable aprovechada se descuenta del uso que la recibe.
    const demandaBruta = apTotal + riego.total + piscina.total;
    const suministrada = Math.max(0, demandaBruta - np.usada);
    const sumAparatos = Math.max(0, apTotal - np.reparto.cisternas - np.reparto.baldeo);
    const sumRiego = Math.max(0, riego.total - np.reparto.riego);
    const sumPiscina = Math.max(0, piscina.total - np.reparto.piscina);
    const apPersona = totalOcu > 0 ? sumAparatos / totalOcu : 0;
    const apLitrosDia = dias > 0 ? apPersona / dias * 1000 : 0;

    // ---------------------------------------------------------------- índice y clase
    const esc = datos.escala;
    const refPersona = esc.refLitros * esc.diasAnoRef / 1000;
    const indice = refPersona > 0 ? apPersona / refPersona : 0;
    const falta = [];
    if (totalOcu <= 0) falta.push("ocupantes");
    if (totalViv <= 0) falta.push("viviendas");
    if (!(num(p.supUtil) > 0)) falta.push("superficie útil");
    if (apTotal <= 0) falta.push("aparatos con consumo");
    const minimos = falta.length === 0;
    const tramo = terr ? terr.tramo : "Sin escasez";
    const clase = minimos ? claseDesdeIndice(datos, tramo, indice) : null;
    const umbralD = esc.umbrales.find(u => u.CLASE === "D")[COL_TRAMO[tramo]];

    // Las otras tres letras: cada una contra su caso base, «—» si el proyecto no tiene
    // ese elemento (motor.py §8).
    const indiceRiego = riego.base > 0 ? riego.total / riego.base : null;
    const indicePiscina = piscina.base > 0 ? piscina.evitable / piscina.base : null;
    const coberturaReuso = np.potencial > 0 ? np.usada / np.potencial : 0;
    const claseRiego = minimos && indiceRiego != null ? claseDesdeIndice(datos, tramo, indiceRiego) : null;
    const clasePiscina = minimos && indicePiscina != null ? claseDesdeIndice(datos, tramo, indicePiscina) : null;
    const claseReuso = minimos && np.potencial > 0 ? claseDesdeCobertura(datos, tramo, coberturaReuso) : null;

    // ---------------------------------------------------------------- consumida y huella
    // ISO 14046: riego y evaporación se consumen íntegros; el resto, según el retorno.
    const ret = esc.retorno;
    const fracNPPiscina = piscina.total === 0 ? 0 : Math.min(1, np.reparto.piscina / piscina.total);
    const cons = {
      aparatos: sumAparatos * (1 - ret),
      riego: sumRiego,
      piscinaEvap: piscina.evap * (1 - fracNPPiscina),
      piscinaVaciado: (piscina.llenado + piscina.backwash) * (1 - fracNPPiscina) * (1 - ret),
    };
    const consumida = cons.aparatos + cons.riego + cons.piscinaEvap + cons.piscinaVaciado;

    // Predimensionado de los depósitos (v2/ha2/resultados.py, AQUA ESPAÑA y UNE-EN 16941):
    //   recepción de grises: media jornada de producción (no acumular brutas > 24 h, §5.3)
    //   aljibe de grises: un día de la demanda que pueden cubrir, en el mes de más
    //   demanda (§5.4)
    //   aljibe de pluviales: lo menor entre la lluvia captada y la demanda que dejan las
    //   grises, durante el periodo seco medio de la provincia, con un 20 % de margen.
    const predim = {
      recepcion: dias > 0 ? np.grisesBruta / dias * 1000 * 0.5 : 0,
      tratada: np.grisesDiaMax * 1.0,
      aljibe: Math.min(np.ofertaPluviales, np.demandaResidual) / 365 * (terr ? terr.diasSecos : 0) * 1.2 * 1000,
      diasSecos: terr ? terr.diasSecos : 0,
    };
    const aware = terr ? terr.aware : 0;
    const huella = consumida * aware;
    const huellaAparatos = cons.aparatos * aware;

    return {
      territorio: terr,
      totalViv, totalOcu, ocupMedios,
      aparatos, apTotal, apPersona, apLitrosDia,
      refLitros: esc.refLitros, refPersona, indice, tramo, umbralD,
      clase, falta, minimos,
      deficitAnual, riego, piscina, np, predim,
      demandaBruta, suministrada, sumAparatos, sumRiego, sumPiscina,
      consumida, cons, huella,
      huellaPersona: totalOcu > 0 ? huella / totalOcu : 0,
      huellaM2: num(p.supUtil) > 0 ? huella / num(p.supUtil) : 0,
      huellaAparatos,
      huellaAparatosPersona: totalOcu > 0 ? huellaAparatos / totalOcu : 0,
      indiceRiego, indicePiscina, coberturaReuso,
      claseRiego, clasePiscina, claseReuso,
      coste: suministrada * (terr ? terr.coste : 0),
    };
  }

  const suma = a => (a || []).reduce((s, v) => s + num(v), 0);
  const DIAS_MES = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  // Caso base del riego (v2/ha2/datos.py): césped de demanda alta (Ksp 0,8), microclima
  // de efecto alto (Km 1,2), densidad baja (Kd 1,0) y aspersores (70 %). Se escribe como
  // producto, igual que en Python, para que el redondeo sea el mismo que en el libro.
  const RIEGO_BASE_KVA = 0.8 * 1.2 * 1.0;
  const RIEGO_BASE_EFICIENCIA = 0.70;
  // Lavado de filtros de la piscina: 400 L por ciclo y 20 ciclos al año (motor.py).
  const BACKWASH_L = 400, BACKWASH_N = 20;

  // motor.py §3. Necesidad de cada zona = |déficit anual| × Ksp × Km × Kd ÷ eficiencia.
  function calcularRiego(p, datos, deficitAnual) {
    const r = p.riego || { existe: false, zonas: [] };
    const valor = (tabla, clave) => { const f = tabla.find(x => x.CLAVE === clave); return f ? f.VALOR : null; };
    const zonas = (r.zonas || []).map(z => {
      const area = num(z.area);
      const ks = valor(datos.riego.ks, `${z.especie}|${z.demanda}`);
      const km = valor(datos.riego.km, `${z.especie}|${z.efecto}`);
      const kd = valor(datos.riego.kd, `${z.especie}|${z.densidad}`);
      const sis = datos.riego.sistemas.find(s => s.SISTEMA === z.sistema);
      const kva = ks != null && km != null && kd != null ? ks * km * kd : null;
      const ef = sis ? sis.EFICIENCIA : null;
      const completa = area > 0 && kva != null && ef != null;
      const mm = completa ? Math.abs(deficitAnual) * kva : 0;
      const m3 = completa ? area * mm / 1000 / ef : 0;
      return { area, ks, km, kd, kva, ef, completa, mm, m3 };
    });
    const area = zonas.reduce((s, z) => s + z.area, 0);
    const total = r.existe ? zonas.reduce((s, z) => s + z.m3, 0) : 0;
    const base = r.existe ? area * Math.abs(deficitAnual) * RIEGO_BASE_KVA / 1000 / RIEGO_BASE_EFICIENCIA : 0;
    return { existe: !!r.existe, zonas, area, total, base,
             incompletas: zonas.filter(z => z.area > 0 && !z.completa).length };
  }

  // motor.py §4. Evaporación mes a mes dentro de la temporada; la lluvia solo entra en
  // el vaso si está descubierto.
  function calcularPiscina(p, datos, terr, P_m, ETo_m) {
    const s = p.piscina || {};
    const existe = !!s.existe;
    const ini = num(s.mesIni), fin = num(s.mesFin);
    const temp = DIAS_MES.map((_, i) => {
      const m = i + 1;
      return ini <= fin ? (m >= ini && m <= fin ? 1 : 0) : (m >= ini || m <= fin ? 1 : 0);
    });
    const etoTot = suma(ETo_m);
    const evapAnual = terr ? terr.evaporacion : 0;
    const evMm = ETo_m.map(e => (etoTot ? evapAnual * e / etoTot : 0));
    const cob = datos.coberturas.find(c => c.COBERTURA === s.cobertura);
    const factor = cob ? cob.FACTOR_EVAPORACION : 1;
    const sup = num(s.sup);
    const evM3 = evMm.map((ev, i) => (existe ? temp[i] * ev / 1000 * sup * factor : 0));
    const baseM = evMm.map((ev, i) => (existe ? temp[i] * sup * Math.max(0, ev - P_m[i]) / 1000 : 0));
    const lluvia = P_m.map((pm, i) => (existe && s.cobertura === "Sin cubierta" ? temp[i] * pm / 1000 * sup : 0));
    const repo = evM3.map((e, i) => Math.max(0, e - lluvia[i]));
    const evap = suma(repo);
    const llenado = existe ? sup * num(s.prof) * num(s.renov) : 0;
    const backwash = existe && s.backwash ? BACKWASH_L * BACKWASH_N / 1000 : 0;
    const total = evap + llenado + backwash;
    return { existe, temp, repo, evap, llenado, backwash, total,
             evitable: evap + backwash,
             base: existe ? suma(baseM) + BACKWASH_L * BACKWASH_N / 1000 : 0 };
  }

  // motor.py §5. Un aljibe por fuente. Las grises van primero, mes a mes, sin guardar
  // más de un día: se aprovecha lo menor entre lo tratado, su demanda y lo que cabe en
  // su aljibe día a día. Las pluviales cubren lo que queda, con un balance mensual en
  // dos pasadas acotado a su aljibe.
  function calcularNoPotable(p, datos, aparatos, riego, piscina, P_m, deficit_m, deficitAnual) {
    const g = p.grises || {}, pl = p.pluviales || {};
    const cat = id => datos.aparatos.find(c => c.APARATO === APARATOS.find(a => a.id === id).catalogo) || {};
    let grisesBruta = 0, demCist = 0, demBald = 0, potencialAp = 0;
    let gCist = 0, gBald = 0, pCist = 0, pBald = 0;
    for (const a of aparatos) {
      const c = cat(a.id);
      const grupo = c.GRUPO;
      if (c.PROVEE_GRISES === "SI") grisesBruta += a.m3;
      if (grupo !== "potable") potencialAp += a.m3;
      // un aparato recibe agua no potable si el catálogo la admite y el proyecto ha
      // activado ese destino, aparato a aparato
      const destino = f => (grupo === "cisterna" && f.cisternas) || (grupo === "baldeo" && f.baldeo);
      const aptaG = g.existe && c.ACEPTA_GRISES === "SI" && destino(g) ? a.m3 : 0;
      const aptaP = pl.existe && c.ACEPTA_PLUVIALES === "SI" && destino(pl) ? a.m3 : 0;
      if (grupo === "cisterna") { gCist += aptaG; pCist += aptaP; }
      if (grupo === "baldeo") { gBald += aptaG; pBald += aptaP; }
      if (aptaG + aptaP > 0) {
        if (grupo === "cisterna") demCist += a.m3;
        if (grupo === "baldeo") demBald += a.m3;
      }
    }
    const gRiego = g.existe && g.riego ? riego.total : 0;
    const pRiego = pl.existe && pl.riego ? riego.total : 0;
    const demRiego = (g.existe && g.riego) || (pl.existe && pl.riego) ? riego.total : 0;
    const demPiscina = pl.existe && pl.piscina ? piscina.total : 0;
    const demTotal = demCist + demBald + demRiego + demPiscina;
    const potencial = potencialAp + riego.total + piscina.total;
    const porRiego = tot => deficit_m.map(dm => (deficitAnual === 0 ? 0 : tot * dm / deficitAnual));
    const porDias = tot => DIAS_MES.map(d => tot * d / 365);

    // ---- aljibe de grises: un día como mucho
    const og = DIAS_MES.map(d => (g.existe ? grisesBruta * num(g.rend) * d / 365 : 0));
    const gc = porDias(gCist), gb = porDias(gBald), gr = porRiego(gRiego);
    const gd = gc.map((v, i) => v + gb[i] + gr[i]);
    const capG = num(p.depositoGrises) / 1000;
    const gu = og.map((o, i) => Math.min(o, gd[i], capG * DIAS_MES[i]));
    const gDia = og.map((o, i) => Math.min(o, gd[i]) / DIAS_MES[i] * 1000);
    const parteG = d => d.map((v, i) => (gd[i] === 0 ? 0 : gu[i] * v / gd[i]));
    const ugc = parteG(gc), ugb = parteG(gb), ugr = parteG(gr);

    // ---- aljibe de pluviales: balance mensual sobre lo que queda
    const capt = datos.captacion.find(c => c.SUPERFICIE === pl.tipo);
    const escorrentia = capt ? capt.ESCORRENTIA : 0;
    const nTemp = suma(piscina.temp);
    const op = P_m.map(pm => (pl.existe ? num(pl.sup) * pm / 1000 * escorrentia * num(pl.rend) : 0));
    const pc = porDias(pCist).map((v, i) => Math.max(0, v - ugc[i]));
    const pb = porDias(pBald).map((v, i) => Math.max(0, v - ugb[i]));
    const pr = porRiego(pRiego).map((v, i) => Math.max(0, v - ugr[i]));
    const pp = piscina.temp.map((t, i) => (demPiscina === 0 || nTemp === 0 ? 0
      : piscina.repo[i] + (piscina.llenado + piscina.backwash) * t / nTemp));
    const pd = pc.map((v, i) => v + pb[i] + pr[i] + pp[i]);
    const capP = num(p.depositoPluviales) / 1000;
    const s1 = [];
    for (let i = 0; i < 12; i++) s1.push(Math.min(capP, Math.max(0, (i ? s1[i - 1] : 0) + op[i] - pd[i])));
    const s2 = [], pu = [], ve = [];
    for (let i = 0; i < 12; i++) {
      const prev = i ? s2[i - 1] : s1[11];
      s2.push(Math.min(capP, Math.max(0, prev + op[i] - pd[i])));
      pu.push(Math.min(prev + op[i], pd[i]));
      ve.push(Math.max(0, prev + op[i] - pu[i] - s2[i]));
    }
    const parteP = d => suma(pu.map((u, i) => (pd[i] === 0 ? 0 : u * d[i] / pd[i])));

    const usadaG = suma(gu), usadaP = suma(pu), usada = usadaG + usadaP;
    const oferta = suma(og) + suma(op);
    return {
      grisesBruta, demanda: { cisternas: demCist, baldeo: demBald, riego: demRiego, piscina: demPiscina, total: demTotal },
      demandaGrises: suma(gd), demandaResidual: suma(pd),
      grisesPosible: suma(og.map((o, i) => Math.min(o, gd[i]))),
      potencial, ofertaGrises: suma(og), ofertaPluviales: suma(op), oferta,
      usada, usadaGrises: usadaG, usadaPluviales: usadaP,
      sobrante: oferta - usada, vertidoPluviales: suma(ve),
      grisesDiaMax: Math.max(...gDia), aljibe: s2, depositoUsado: Math.max(...s2) * 1000,
      disponibilidad: demTotal === 0 ? 0 : usada / demTotal,
      reparto: { cisternas: suma(ugc) + parteP(pc), baldeo: suma(ugb) + parteP(pb),
                 riego: suma(ugr) + parteP(pr), piscina: parteP(pp) },
      mensual: { grises: gu, pluviales: pu },
    };
  }

  // Letra de reutilización: aquí la escala va al revés, más cobertura es mejor.
  function claseDesdeCobertura(datos, tramo, cobertura) {
    const col = { "Sin escasez": "R_SIN_ESCASEZ", "Escasez": "R_ESCASEZ", "Escasez severa": "R_SEVERA" }[tramo] || "R_SIN_ESCASEZ";
    for (const u of datos.escala.cobertura) {
      if (cobertura >= u[col]) return u.CLASE;
    }
    return "G";
  }

  global.HA_CALCULO = { calcular, proyectoPorDefecto, proyectoVacio, CAUDAL_DE_REFERENCIA, claseEficiencia, valoresPartida,
                        USOS_INODORO_UNICA, CLASES, APARATOS };
})(typeof window !== "undefined" ? window : globalThis);
