/*
 * O MESMO cálculo de imoveis/financas.py, modalidades.py, viabilidade.py e analisar.py,
 * portado para o navegador (simulador e imóveis cadastrados no painel).
 * Se mudar a conta lá, mude aqui também e rode "node tests/test_simulador.cjs"
 * (compara os dois imóvel a imóvel).
 */
(function (g) {
  const taxaMensal = aa => Math.pow(1 + aa, 1 / 12) - 1;
  const taxaAnual = am => Math.pow(1 + am, 12) - 1;
  const pmt = (pv, i, n) => (i === 0 ? pv / n : (pv * i) / (1 - Math.pow(1 + i, -n)));
  const soma = a => a.reduce((s, v) => s + v, 0);

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

  // ---------- viabilidade.py ----------
  function premissasDoImovel(im, refM2, C) {
    const cc = C.custos_compra, ven = C.venda, r = C.referencia, preco = im.preco, area = im.area;
    const extra = im.ocupado ? cc.desocupacao_meses : 0;
    const reformaM2 = im.reforma_m2 || C.reforma.custo_m2;
    return {
      preco, itbi: preco * cc.itbi_pct, cartorio: preco * cc.cartorio_pct,
      leiloeiro: im.origem === "leilao" ? preco * cc.leiloeiro_pct : 0,
      desocupacao: im.ocupado ? cc.desocupacao_custo : 0, debitos: im.debitos || 0,
      reforma: area * reformaM2,
      condominio_mensal: im.condominio || area * C.manutencao.condominio_m2,
      iptu_mensal: im.iptu || area * C.manutencao.iptu_m2_mensal,
      meses_desocupacao: extra, meses_reforma: C.prazo.meses_reforma, meses_venda: C.prazo.meses_venda,
      venda_bruta: refM2 * area * (1 - r.desconto_negociacao) * (1 + r.premio_reformado),
      corretagem_pct: ven.corretagem_pct, aliquota_ir: ven.aliquota_ir,
    };
  }

  function fluxoDePremissas(p, Hfixo) {
    const extra = Math.trunc(p.meses_desocupacao), mRef = Math.max(Math.trunc(p.meses_reforma), 1);
    const H = Hfixo || extra + mRef + Math.trunc(p.meses_venda);
    const corretagem = p.venda_bruta * p.corretagem_pct;
    const baseIr = p.venda_bruta - corretagem - p.preco - p.itbi - p.cartorio - p.leiloeiro - p.reforma;
    const ir = Math.max(baseIr, 0) * p.aliquota_ir;
    const mensal = p.condominio_mensal + p.iptu_mensal;
    const f = new Array(H + 1).fill(0);
    f[0] = -(p.preco + p.itbi + p.cartorio + p.leiloeiro + p.desocupacao + p.debitos);
    for (let m = extra + 1; m < Math.min(extra + 1 + mRef, H + 1); m++) f[m] -= p.reforma / mRef;
    for (let m = 1; m <= H; m++) f[m] -= mensal;
    f[H] += p.venda_bruta - corretagem - ir;
    const custos = { preco: p.preco, itbi: p.itbi, cartorio: p.cartorio, leiloeiro: p.leiloeiro,
      desocupacao: p.desocupacao, debitos: p.debitos, reforma: p.reforma, manutencao: mensal * H,
      venda_bruta: p.venda_bruta, corretagem, ir };
    const custoBase = custos.preco + custos.itbi + custos.cartorio + custos.leiloeiro + custos.desocupacao
      + custos.debitos + custos.reforma + custos.manutencao;
    return { f, H, custos, custoBase, corretagem, ir };
  }

  // ---------- modalidades.py ----------
  function aVista(H) {
    return { tipo: "avista", nome: "À vista (capital próprio)", fluxo: new Array(H + 1).fill(0),
             custo_financeiro: 0, credito: 0, cet_aa: null, detalhes: {} };
  }

  function financiamento(preco, H, o) {
    const i = taxaMensal(o.taxa_aa), n = Math.trunc(o.prazo_meses);
    const financiado = preco * (1 - o.entrada_pct);
    const seg = o.seguro_mensal_pct || 0, adm = o.taxa_adm_mensal || 0, tarifa = o.tarifa_avaliacao || 0;
    const tab = tabela(financiado, i, n, o.sistema);
    const custoMes = (lin, s) => lin.parcela + s * seg + adm;
    const fluxo = new Array(H + 1).fill(0);
    fluxo[0] = financiado - tarifa;
    let saldoAntes = financiado, juros = 0, pago = tarifa;
    const meses = Math.min(H, n);
    for (let m = 1; m <= meses; m++) {
      const lin = tab[m - 1], c = custoMes(lin, saldoAntes);
      fluxo[m] -= c; pago += c; juros += lin.juros; saldoAntes = lin.saldo;
    }
    const quitacao = H < n ? saldoAntes : 0;
    fluxo[H] -= quitacao; pago += quitacao;
    const cetFluxo = [financiado - tarifa];
    let s = financiado;
    for (const lin of tab) { cetFluxo.push(-custoMes(lin, s)); s = lin.saldo; }
    const cetM = tir(cetFluxo);
    return { tipo: "financiamento", nome: o.nome, fluxo, credito: financiado, custo_financeiro: pago - financiado,
      cet_aa: cetM !== null ? taxaAnual(cetM) : null,
      detalhes: { entrada: preco - financiado, valor_financiado: financiado, primeira_parcela: custoMes(tab[0], financiado),
        parcelas_pagas: meses, juros_pagos: juros, saldo_quitacao: quitacao, sistema: o.sistema || "SAC" } };
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
    let ateFim = 0;
    for (let m = meses + 1; m <= n; m++) ateFim += noMes(m);
    const cetFluxo = [carta - excesso - agio - transf];
    for (let m = 1; m <= n; m++) cetFluxo.push(-noMes(m));
    const cetM = tir(cetFluxo);
    return { tipo: "consorcio", nome: o.nome, fluxo, credito, custo_financeiro: pago - credito,
      cet_aa: cetM !== null ? taxaAnual(cetM) : null,
      detalhes: { valor_carta: carta, agio, transferencia: transf, parcela_inicial: parcela, parcelas_pagas: meses,
        parcelas_restantes_na_venda: restantes, saldo_quitacao: quitacao, economia_por_antecipar: ateFim - quitacao,
        capital_proprio_complementar: Math.max(preco - carta, 0),
        aviso: agio + saldo + excesso < carta ? "Ágio + saldo menor que a carta: confira os dados da oferta" : "" } };
  }

  function metricas(fTotal, custoTotal) {
    const lucro = soma(fTotal);
    let acum = 0, pior = 0;
    for (const v of fTotal) { acum += v; pior = Math.min(pior, acum); }
    const capital = -pior, t = tir(fTotal);
    return { lucro, custo_total: custoTotal, margem: custoTotal ? lucro / custoTotal : 0,
             capital_proprio: capital, roi_capital: capital ? lucro / capital : null,
             tir_aa: t !== null ? taxaAnual(t) : null };
  }

  function modalidade(p, oferta, Hfixo) {
    const im = fluxoDePremissas(p, Hfixo);
    const o = !oferta ? aVista(im.H)
      : oferta.tipo === "financiamento" ? financiamento(p.preco, im.H, oferta) : consorcio(p.preco, im.H, oferta);
    const fTotal = im.f.map((v, k) => v + o.fluxo[k]);
    const { fluxo, ...semFluxo } = o;
    return { ...semFluxo, ...metricas(fTotal, im.custoBase + o.custo_financeiro), _im: im };
  }

  const ofertasDe = C => [null,
    ...(C.financiamentos || []).map(o => ({ ...o, tipo: "financiamento" })),
    ...(C.consorcios || []).map(o => ({ ...o, tipo: "consorcio" }))];

  function analisarModalidades(im, refM2, C, Hfixo) {
    const p = premissasDoImovel(im, refM2, C);
    const ops = ofertasDe(C).map(of => {
      const r = modalidade(p, of, Hfixo);
      if (of && im.aceita_financiamento === false)
        r.indisponivel = of.tipo === "financiamento" ? "Imóvel não aceita financiamento" : "Imóvel não aceita carta de crédito";
      return r;
    });
    const { custos, H } = ops[0]._im;
    ops.forEach(o => delete o._im);
    return { ops, custos, H };
  }

  const pBR = v => (v * 100).toFixed(1).replace(".", ",") + "%";
  function recomendacaoQuitacao(op, C) {
    const alt = C.rendimento_alternativo_aa;
    if (op.tipo === "financiamento" && op.cet_aa) {
      if (op.cet_aa > alt) return `Custo efetivo ${pBR(op.cet_aa)} a.a. > rendimento do seu dinheiro ${pBR(alt)}: vale amortizar/quitar assim que houver caixa sobrando.`;
      return `Custo efetivo ${pBR(op.cet_aa)} a.a. < rendimento ${pBR(alt)}: melhor manter o dinheiro aplicado.`;
    }
    if (op.tipo === "consorcio") {
      const reaj = ((C.consorcios || []).find(c => c.nome === op.nome) || {}).reajuste_anual_pct || 0;
      if (reaj > alt) return `Reajuste ${pBR(reaj)} > rendimento ${pBR(alt)}: antecipar parcelas compensa.`;
      return `Antecipar só evita o reajuste (${pBR(reaj)} a.a.), que é menor que o rendimento ${pBR(alt)}: pague as parcelas normais e quite apenas na venda.`;
    }
    return "";
  }

  function semaforo(v, C) {
    return v >= C.meta.margem_minima ? "verde" : v >= C.meta.margem_alerta ? "amarelo" : "vermelho";
  }

  function analisar(im, refM2, C) {
    const { ops, custos, H } = analisarModalidades(im, refM2, C);
    const disp = ops.filter(o => !o.indisponivel);
    const base = C.meta.base || "margem", meta = C.meta.margem_minima;
    const val = o => o[base] || 0;
    const naMeta = disp.filter(o => val(o) >= meta && o.roi_capital);
    const maxPor = (a, f) => a.reduce((x, y) => (f(y) > f(x) ? y : x));
    const melhor = naMeta.length ? maxPor(naMeta, o => o.roi_capital) : maxPor(disp, val);
    ops.forEach(o => { o.quitacao = recomendacaoQuitacao(o, C); });
    const extra = im.ocupado ? C.custos_compra.desocupacao_meses : 0;
    const sens = [];
    for (const h of C.prazo.sensibilidade_meses) {
      if (h <= extra + C.prazo.meses_reforma) continue;
      const res = analisarModalidades(im, refM2, C, h).ops;
      sens.push({ meses: h, margens: Object.fromEntries(res.map(r => [r.nome, r[base] || 0])) });
    }
    const ok = sens.filter(s => s.margens[melhor.nome] >= meta).map(s => s.meses);
    return { prazo_meses: H, custos, modalidades: ops, melhor: melhor.nome, margem_melhor: val(melhor), base,
             semaforo: semaforo(val(melhor), C), sensibilidade: sens, prazo_max_na_meta: ok.length ? Math.max(...ok) : null };
  }

  // ---------- analisar.py ----------
  function cenarios(im, rb, C) {
    const r = C.referencia, base = rb.ref_m2;
    const m2 = { pessimista: rb.p25 || base * 0.9, esperado: base, otimista: rb.p75 || base * 1.1 };
    const out = { valor_atual_mercado: base * im.area * (1 - r.desconto_negociacao),
                  desconto_negociacao: r.desconto_negociacao, premio_reformado: r.premio_reformado, ref_m2: base };
    for (const [nome, v] of Object.entries(m2)) {
      const { ops, custos } = analisarModalidades(im, v, C);
      out[nome] = { ref_m2: v, venda: custos.venda_bruta, venda_m2: custos.venda_bruta / im.area,
        resultado: Object.fromEntries(ops.map(o => [o.nome, { lucro: o.lucro, margem: o.margem, roi_capital: o.roi_capital }])) };
    }
    return out;
  }

  function precoMaximoMeta(im, ref, C) {
    const meta = C.meta.margem_minima, base = C.meta.base || "margem";
    const melhorValor = preco => Math.max(...analisarModalidades({ ...im, preco }, ref, C).ops
      .filter(o => !o.indisponivel).map(o => o[base] || 0));
    let lo = im.preco * 0.2, hi = im.preco * 2.0;
    if (melhorValor(lo) < meta) return null;
    for (let k = 0; k < 30; k++) { const mid = (lo + hi) / 2; if (melhorValor(mid) >= meta) lo = mid; else hi = mid; }
    return Math.round(lo / 1000) * 1000;
  }

  function alertas(im, ref) {
    const a = [];
    if (im.origem === "leilao") {
      if (im.ocupado) a.push("Imóvel ocupado: prever desocupação (prazo e custo extras)");
      else if (im.ocupado == null) a.push("Ocupação não informada: confira no edital");
      if (im.aceita_financiamento === false) a.push("Não aceita financiamento/carta: só à vista");
      a.push("Ler edital e matrícula antes do lance (dívidas, ações, penhoras)");
    }
    if (im.preco_m2 / ref - 1 < -0.55) a.push("Desconto muito alto: pode ser erro de área/preço ou problema grave");
    return a;
  }

  // ---------- aluguel.py (reformar e alugar no Airbnb) ----------
  const DIAS_MES = 365 / 12;
  const investimentoAluguel = (p, A) => p.preco + p.itbi + p.cartorio + p.leiloeiro + p.desocupacao + p.debitos + p.reforma + A.mobilia;

  function mesAluguel(p, A, diaria, ocupacao) {
    const receita = diaria * DIAS_MES * ocupacao, taxa = receita * A.taxa_plataforma;
    const gestao = (receita - taxa) * A.gestao_pct, condIptu = p.condominio_mensal + p.iptu_mensal;
    const ir = Math.max(receita - taxa - gestao - condIptu, 0) * A.aliquota_ir;
    return { diaria, ocupacao, noites: DIAS_MES * ocupacao, receita, taxa, gestao, condominio_iptu: condIptu,
             contas: A.contas_mensais, ir, liquido: receita - taxa - gestao - condIptu - A.contas_mensais - ir };
  }

  function ocupacaoPara(p, A, diaria, alvo) {
    if (mesAluguel(p, A, diaria, 1).liquido < alvo) return null;
    let lo = 0, hi = 1;
    for (let k = 0; k < 50; k++) { const mid = (lo + hi) / 2; if (mesAluguel(p, A, diaria, mid).liquido >= alvo) hi = mid; else lo = mid; }
    return hi;
  }

  function aluguelComCredito(p, inv, liquido, C, aceita) {
    if (aceita === false) return [];
    return ofertasDe(C).slice(1).map(of => {
      let bolso, parcela;
      if (of.tipo === "financiamento") {
        const o = financiamento(p.preco, 12, of);
        bolso = inv - o.credito + (of.tarifa_avaliacao || 0); parcela = o.detalhes.primeira_parcela;
      } else {
        const o = consorcio(p.preco, 12, of);
        bolso = inv - o.credito + o.detalhes.agio + o.detalhes.transferencia; parcela = o.detalhes.parcela_inicial;
      }
      const sobra = liquido - parcela;
      return { nome: of.nome, tipo: of.tipo, bolso, parcela, sobra, retorno_bolso_aa: bolso > 0 ? sobra * 12 / bolso : null };
    });
  }

  const semaforoAluguel = (r, A) => r >= A.retorno_minimo_aa ? "verde" : r >= A.retorno_alerta_aa ? "amarelo" : "vermelho";

  /* p = premissas; mercado = D.airbnb.bairros[bairro]; A = D.airbnb.parametros; C = D.simulador */
  function aluguel(p, mercado, A, C, aceita) {
    if (!mercado || !mercado.diaria || !mercado.ocupacao_30d) return null;
    const inv = investimentoAluguel(p, A), aj = A.ocupacao_ajuste ?? 1, cen = {};
    for (const [nome, k] of [["pessimista", "p25"], ["esperado", "mediana"], ["otimista", "p75"]]) {
      const m = mesAluguel(p, A, mercado.diaria[k], Math.min(mercado.ocupacao_30d[k] * aj, 1));
      m.retorno_aa = m.liquido * 12 / inv;
      cen[nome] = m;
    }
    const e = cen.esperado, semRenda = p.meses_desocupacao + p.meses_reforma;
    return { investimento: inv, mobilia: A.mobilia, meses_sem_renda: semRenda, anuncios: mercado.anuncios ?? null, cenarios: cen,
      retorno_aa: e.retorno_aa, semaforo: semaforoAluguel(e.retorno_aa, A),
      anos_para_recuperar: e.liquido > 0 ? inv / (e.liquido * 12) + semRenda / 12 : null,
      ocupacao_empate: ocupacaoPara(p, A, e.diaria, 0),
      ocupacao_meta: ocupacaoPara(p, A, e.diaria, A.retorno_minimo_aa * inv / 12),
      credito: aluguelComCredito(p, inv, e.liquido, C, aceita) };
  }

  /* Análise completa de um imóvel (o mesmo que analisar.py faz para cada coletado).
     rb = referência {ref_m2, p25, p75, fonte}; C = D.simulador (parâmetros do config.yaml);
     AB = D.airbnb (mercado do Airbnb por bairro + custos), opcional. */
  function analiseCompleta(im, rb, C, AB) {
    const ref = rb.ref_m2;
    im.preco_m2 = im.preco / im.area;
    im.desconto_mercado = im.preco_m2 / ref - 1;
    im.referencia_usada = rb.fonte || "";
    im.analise = analisar(im, ref, C);
    im.analise.cenarios = cenarios(im, rb, C);
    im.analise.preco_maximo = precoMaximoMeta(im, ref, C);
    im.analise.premissas = premissasDoImovel(im, ref, C);
    im.analise.aluguel = AB ? aluguel(im.analise.premissas, AB.bairros[im.bairro], AB.parametros, C, im.aceita_financiamento) : null;
    im.alertas = alertas(im, ref);
    return im;
  }

  // ---------- simulador (mexe nas premissas já calculadas) ----------
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

  function resultado(p, oferta) {
    const r = modalidade(p, oferta);
    const im = r._im;
    delete r._im;
    return Object.assign(r, { prazo_meses: im.H, venda_bruta: p.venda_bruta, ir: im.ir, corretagem: im.corretagem });
  }

  function precoMaximo(base, area, origem, aj, S, oferta, alvo, campo = "margem") {
    const val = preco => resultado(premissas(base, area, origem, Object.assign({}, aj, { preco }), S), oferta)[campo] || 0;
    let lo = 1000, hi = (aj.preco ?? base.preco) * 3;
    if (val(lo) < alvo) return null;
    if (val(hi) >= alvo) return hi;
    for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (val(mid) >= alvo) lo = mid; else hi = mid; }
    return lo;
  }

  g.SIM = { premissas, resultado, precoMaximo, analiseCompleta, aluguel, taxaMensal, tir };
  if (typeof module !== "undefined") module.exports = g.SIM;
})(typeof window !== "undefined" ? window : globalThis);
