/*
 * Simulador: o MESMO cálculo de imoveis/financas.py, modalidades.py e viabilidade.py,
 * portado para o navegador. Se mudar a conta lá, mude aqui também e rode
 * "node tests/test_simulador.cjs" (compara os dois imóvel a imóvel).
 */
(function (g) {
  const taxaMensal = aa => Math.pow(1 + aa, 1 / 12) - 1;
  const taxaAnual = am => Math.pow(1 + am, 12) - 1;
  const pmt = (pv, i, n) => (i === 0 ? pv / n : (pv * i) / (1 - Math.pow(1 + i, -n)));

  function tabela(pv, i, n, sistema) {
    const linhas = [], fixa = (sistema || "SAC").toUpperCase() === "PRICE" ? pmt(pv, i, n) : null;
    let saldo = pv;
    for (let m = 1; m <= n; m++) {
      const juros = saldo * i;
      const amort = fixa !== null ? fixa - juros : pv / n;
      const parcela = fixa !== null ? fixa : amort + juros;
      saldo = Math.max(saldo - amort, 0);
      linhas.push({ parcela, juros, saldo });
    }
    return linhas;
  }

  const vpl = (taxa, f) => f.reduce((s, v, t) => s + v / Math.pow(1 + taxa, t), 0);

  function tir(f, lo = -0.5, hi = 1.0) {
    let fLo = vpl(lo, f);
    const fHi = vpl(hi, f);
    if (fLo * fHi > 0) return null;
    for (let k = 0; k < 200; k++) {
      const mid = (lo + hi) / 2, fMid = vpl(mid, f);
      if (Math.abs(fMid) < 1e-7) return mid;
      if (fLo * fMid < 0) hi = mid;
      else { lo = mid; fLo = fMid; }
    }
    return (lo + hi) / 2;
  }

  function fluxoDePremissas(p) {
    const extra = Math.trunc(p.meses_desocupacao), mRef = Math.max(Math.trunc(p.meses_reforma), 1);
    const H = extra + mRef + Math.trunc(p.meses_venda);
    const corretagem = p.venda_bruta * p.corretagem_pct;
    const baseIr = p.venda_bruta - corretagem - p.preco - p.itbi - p.cartorio - p.leiloeiro - p.reforma;
    const ir = Math.max(baseIr, 0) * p.aliquota_ir;
    const mensal = p.condominio_mensal + p.iptu_mensal;
    const f = new Array(H + 1).fill(0);
    f[0] = -(p.preco + p.itbi + p.cartorio + p.leiloeiro + p.desocupacao + p.debitos);
    for (let m = extra + 1; m < Math.min(extra + 1 + mRef, H + 1); m++) f[m] -= p.reforma / mRef;
    for (let m = 1; m <= H; m++) f[m] -= mensal;
    f[H] += p.venda_bruta - corretagem - ir;
    const custoBase = p.preco + p.itbi + p.cartorio + p.leiloeiro + p.desocupacao + p.debitos + p.reforma + mensal * H;
    return { f, H, custoBase, corretagem, ir };
  }

  function aVista(H) {
    return { tipo: "avista", nome: "À vista (capital próprio)", fluxo: new Array(H + 1).fill(0), custo_financeiro: 0 };
  }

  function financiamento(preco, H, o) {
    const i = taxaMensal(o.taxa_aa), n = Math.trunc(o.prazo_meses);
    const financiado = preco * (1 - o.entrada_pct);
    const seg = o.seguro_mensal_pct || 0, adm = o.taxa_adm_mensal || 0, tarifa = o.tarifa_avaliacao || 0;
    const tab = tabela(financiado, i, n, o.sistema);
    const fluxo = new Array(H + 1).fill(0);
    fluxo[0] = financiado - tarifa;
    let saldoAntes = financiado, pago = tarifa;
    const meses = Math.min(H, n);
    for (let m = 1; m <= meses; m++) {
      const lin = tab[m - 1], c = lin.parcela + saldoAntes * seg + adm;
      fluxo[m] -= c; pago += c; saldoAntes = lin.saldo;
    }
    const quitacao = H < n ? saldoAntes : 0;
    fluxo[H] -= quitacao; pago += quitacao;
    return { tipo: "financiamento", nome: o.nome, fluxo, custo_financeiro: pago - financiado,
             detalhes: { entrada: preco - financiado, primeira_parcela: tab[0].parcela + financiado * seg + adm } };
  }

  function consorcio(preco, H, o) {
    const carta = o.valor_carta === "auto" ? Math.ceil(preco / 10000) * 10000 : +o.valor_carta;
    const agio = carta * o.agio_pct, transf = carta * (o.transferencia_pct || 0);
    const n = Math.trunc(o.parcelas_restantes), prazoTotal = Math.trunc(o.prazo_total_meses);
    const reaj = o.reajuste_anual_pct || 0;
    let saldo = (o.valor_parcela || "auto") === "auto"
      ? (carta * (1 + (o.taxa_adm_total_pct || 0) + (o.fundo_reserva_pct || 0)) * n) / prazoTotal
      : +o.valor_parcela * n;
    const credito = Math.min(carta, preco), excesso = carta - credito;
    saldo = Math.max(saldo - excesso, 0);
    const parcela = n ? saldo / n : 0;
    const noMes = m => parcela * Math.pow(1 + reaj, Math.floor((m - 1) / 12));
    const fluxo = new Array(H + 1).fill(0);
    fluxo[0] = credito - agio - transf;
    let pago = agio + transf;
    const meses = Math.min(H, n);
    for (let m = 1; m <= meses; m++) { const p = noMes(m); fluxo[m] -= p; pago += p; }
    const restantes = n - meses, quitacao = restantes > 0 ? noMes(meses + 1) * restantes : 0;
    fluxo[H] -= quitacao; pago += quitacao;
    return { tipo: "consorcio", nome: o.nome, fluxo, custo_financeiro: pago - credito,
             detalhes: { agio, parcela_inicial: parcela, complemento: Math.max(preco - carta, 0) } };
  }

  function metricas(fTotal, custoTotal) {
    const lucro = fTotal.reduce((s, v) => s + v, 0);
    let acum = 0, pior = 0;
    for (const v of fTotal) { acum += v; pior = Math.min(pior, acum); }
    const capital = -pior, t = tir(fTotal);
    return { lucro, custo_total: custoTotal, margem: custoTotal ? lucro / custoTotal : 0,
             capital_proprio: capital, roi_capital: capital ? lucro / capital : null,
             tir_aa: t !== null ? taxaAnual(t) : null };
  }

  /* Premissas da operação com os valores mexidos no simulador.
     base = premissas do Python; aj = {preco, venda_m2, reforma_m2, meses_reforma, meses_venda}; S = D.simulador */
  function premissas(base, area, origem, aj, S) {
    const p = Object.assign({}, base), cc = S.custos_compra, r = S.referencia;
    if (aj.preco != null) {
      p.preco = aj.preco;
      p.itbi = aj.preco * cc.itbi_pct;
      p.cartorio = aj.preco * cc.cartorio_pct;
      p.leiloeiro = origem === "leilao" ? aj.preco * cc.leiloeiro_pct : 0;
    }
    if (aj.venda_m2 != null) p.venda_bruta = aj.venda_m2 * area * (1 - r.desconto_negociacao) * (1 + r.premio_reformado);
    if (aj.reforma_m2 != null) p.reforma = aj.reforma_m2 * area;
    if (aj.meses_reforma != null) p.meses_reforma = aj.meses_reforma;
    if (aj.meses_venda != null) p.meses_venda = aj.meses_venda;
    return p;
  }

  /* Resultado de uma forma de pagar. oferta = null (à vista) ou {tipo, ...parâmetros} */
  function resultado(p, oferta) {
    const im = fluxoDePremissas(p);
    const o = !oferta ? aVista(im.H)
      : oferta.tipo === "financiamento" ? financiamento(p.preco, im.H, oferta) : consorcio(p.preco, im.H, oferta);
    const fTotal = im.f.map((v, k) => v + o.fluxo[k]);
    return Object.assign({ tipo: o.tipo, nome: o.nome, detalhes: o.detalhes || {}, prazo_meses: im.H,
                           venda_bruta: p.venda_bruta, ir: im.ir, corretagem: im.corretagem },
                         metricas(fTotal, im.custoBase + o.custo_financeiro));
  }

  /* Maior preço de compra que ainda dá a margem alvo (bisseção). */
  function precoMaximo(base, area, origem, aj, S, oferta, alvo, campo = "margem") {
    const val = preco => resultado(premissas(base, area, origem, Object.assign({}, aj, { preco }), S), oferta)[campo] || 0;
    let lo = 1000, hi = (aj.preco ?? base.preco) * 3;
    if (val(lo) < alvo) return null;
    if (val(hi) >= alvo) return hi;
    for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (val(mid) >= alvo) lo = mid; else hi = mid; }
    return lo;
  }

  g.SIM = { premissas, resultado, precoMaximo, taxaMensal, tir };
  if (typeof module !== "undefined") module.exports = g.SIM;
})(typeof window !== "undefined" ? window : globalThis);
