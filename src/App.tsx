import { useState, useMemo, useEffect } from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import { Bar, Line } from 'react-chartjs-2'
import { parseExcel, type ExcelData, type GeoMap } from './lib/parseExcel'
import {
  GOOSE_DOI_0HL, GOOSE_SLOPE,
  MALZ_ANC_VOL, MALZ_ANC_DOI,
  PROP_BA, DOI_MIN,
  fmt, fmtM, COLORS,
} from './data/dashboardData'

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend, Filler)

const { A1, A2, A3, A4, A5, A6, A7, REF } = COLORS
const TT = { backgroundColor: '#fff', borderColor: '#D4D4D4', borderWidth: 1, titleColor: A2, bodyColor: '#2C2C2C', padding: 9 }
const GR = { color: 'rgba(0,0,0,.06)' }
const legendBot = { position: 'bottom' as const, labels: { boxWidth: 10, padding: 10 } }
const baseOpts = { responsive: true, maintainAspectRatio: false, plugins: { legend: legendBot, tooltip: TT }, animation: { duration: 200 } }

type Cen = 'div' | 'nova' | 'sol'
type Sku = 'total' | 'malz' | 'goose' | 'color' | 'pat'
type Modal = 'cabo' | 'rodo'

const SKU_LABELS: Record<Sku, string> = {
  total: 'Todas as LNs', malz: 'Malzbier', goose: 'Goose Island', color: 'Colorado', pat: 'Patagônia',
}

// ── helpers ─────────────────────────────────────────────────────────────────

function calcDOI_goose(vol: number, modal: Modal) {
  const d0 = GOOSE_DOI_0HL
  if (modal === 'cabo')
    return [d0[0], d0[1], d0[2], Math.max(0, Math.round((d0[3] + GOOSE_SLOPE[3] * vol) * 10) / 10)]
  return d0.map((v, i) => Math.max(0, Math.round((v + GOOSE_SLOPE[i] * vol) * 10) / 10))
}

function calcDOI_malz(vol: number, modal: Modal, malz_doi_0hl: number[]) {
  const slope = MALZ_ANC_DOI.map((d, i) => (d - malz_doi_0hl[i]) / MALZ_ANC_VOL)
  if (modal === 'cabo')
    return [malz_doi_0hl[0], malz_doi_0hl[1], malz_doi_0hl[2], Math.max(0, Math.round((malz_doi_0hl[3] + slope[3] * vol) * 10) / 10)]
  return malz_doi_0hl.map((v, i) => Math.max(0, Math.round((v + slope[i] * vol) * 10) / 10))
}

function getCustos(modal: Modal, data: ExcelData) {
  const m = modal === 'rodo' ? 1.6 : 1.0
  return {
    gooseBA: data.cabo_goose_ba * m,
    goosePB: data.cabo_goose_pb * m,
    malzBA: data.cabo_malz_ba * m,
    malzPB: data.cabo_malz_pb * m,
  }
}

function getMaco(modal: Modal, data: ExcelData) {
  const c = getCustos(modal, data)
  const fg = c.gooseBA * PROP_BA + c.goosePB * (1 - PROP_BA)
  const fm = c.malzBA  * PROP_BA + c.malzPB  * (1 - PROP_BA)
  return { gooseLocal: data.maco_goose, gooseFrete: data.maco_goose - fg, malzLocal: data.maco_malz, malzFrete: data.maco_malz - fm, colorLocal: data.maco_color }
}

function getDemGeo(sku: Sku, cen: Cen, data: ExcelData): GeoMap {
  const malzDem = cen === 'div' ? data.dem_div_malz : data.dem_nova_malz
  if (sku === 'malz')  return malzDem
  if (sku === 'goose') return data.dem_div_goose
  if (sku === 'color') return data.dem_div_color
  if (sku === 'pat')   return data.dem_div_pat
  const geos = Object.keys(data.dem_div_goose)
  return geos.reduce((acc, g) => {
    acc[g] = data.dem_div_goose[g].map((v, i) =>
      v + malzDem[g][i] + data.dem_div_color[g][i] + data.dem_div_pat[g][i]
    )
    return acc
  }, {} as GeoMap)
}

// ── small UI components ──────────────────────────────────────────────────────

function Card({ title, badge, children }: { title: string; badge?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg p-[13px_15px]">
      <div className="text-[10px] font-bold tracking-wide uppercase mb-2.5 flex items-center gap-1.5 flex-wrap" style={{ color: A3 }}>
        {title}
        {badge && <span className="text-[9px] font-bold px-2 py-0.5 rounded-lg" style={{ background: '#D6EAFA', color: A2 }}>{badge}</span>}
      </div>
      {children}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[14px] font-bold border-b-2 pb-1.5 mb-3" style={{ color: A2, borderColor: A6 }}>{children}</h2>
}

function doiClass(v: number) {
  if (v <= 0 || v < DOI_MIN) return 'text-red-700 font-bold'
  if (v < DOI_MIN + 2) return 'text-amber-700 font-bold'
  return 'font-bold' + ' ' + 'text-[#2D5282]'
}

// ── main ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [data, setData] = useState<ExcelData | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [cen, setCen]           = useState<Cen>('div')
  const [volGoose, setVolGoose] = useState(0)
  const [volMalz, setVolMalz]   = useState(0)
  const [modal, setModal]       = useState<Modal>('cabo')
  const [sku, setSku]           = useState<Sku>('total')

  useEffect(() => {
    parseExcel()
      .then(setData)
      .catch(e => setError(String(e)))
  }, [])

  function loadCen(c: Cen) {
    setCen(c)
    if (c === 'div') { setVolGoose(0); setVolMalz(0); setModal('cabo') }
    if (c === 'sol') { setVolGoose(15821); setVolMalz(MALZ_ANC_VOL); setModal('rodo') }
  }

  const doi = useMemo(() => {
    if (!data) return null
    if (cen === 'div') {
      return {
        goose: data.div_doi_goose,
        malz:  data.div_doi_malz,
        color: data.div_doi_color,
        pat:   data.div_doi_pat,
      }
    }
    // nova / sol — usa simulação sobre nova_doi_malz e goose_doi_0hl
    return {
      goose: calcDOI_goose(volGoose, modal),
      malz:  calcDOI_malz(volMalz, modal, data.nova_doi_malz),
      color: data.div_doi_color,
      pat:   data.div_doi_pat,
    }
  }, [data, cen, volGoose, volMalz, modal])

  const custos = useMemo(() => data ? getCustos(modal, data) : null, [data, modal])
  const maco   = useMemo(() => data ? getMaco(modal, data)   : null, [data, modal])
  const demGeo = useMemo(() => data ? getDemGeo(sku, cen, data) : null, [data, sku, cen])

  const custoTotal = useMemo(() => {
    if (!custos) return 0
    return volGoose * PROP_BA * custos.gooseBA + volGoose * (1 - PROP_BA) * custos.goosePB
         + volMalz  * PROP_BA * custos.malzBA  + volMalz  * (1 - PROP_BA) * custos.malzPB
  }, [volGoose, volMalz, custos])

  const ruptura = useMemo(() => {
    if (!doi || !data) return []
    const list: { label: string; sem: string; doi: number }[] = []
    const sems = data.sems
    const map: Record<string, number[]> = { 'Goose Island': doi.goose, 'Malzbier': doi.malz, 'Colorado': doi.color, 'Patagônia': doi.pat }
    for (const [label, vals] of Object.entries(map)) {
      vals.forEach((d, i) => { if (d > 0 && d < DOI_MIN) list.push({ label, sem: sems[i], doi: d }) })
    }
    return list
  }, [doi, data])

  // ── loading / error ──────────────────────────────────────────────────────

  if (error) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#F0F4F8' }}>
      <div className="bg-white rounded-lg p-8 shadow max-w-lg text-center">
        <div className="text-2xl mb-3" style={{ color: A1 }}>Erro ao carregar Excel</div>
        <div className="text-sm text-gray-600 font-mono whitespace-pre-wrap">{error}</div>
        <div className="mt-4 text-xs text-gray-500">Verifique se <code>public/longneck_data.xlsb</code> existe.</div>
      </div>
    </div>
  )

  if (!data || !doi || !custos || !maco || !demGeo) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#F0F4F8' }}>
      <div className="text-center">
        <div className="text-lg font-bold mb-2" style={{ color: A2 }}>Carregando dados do Excel…</div>
        <div className="w-12 h-12 border-4 rounded-full mx-auto animate-spin" style={{ borderColor: A4, borderTopColor: 'transparent' }} />
      </div>
    </div>
  )

  const sems = data.sems
  const macoVal = volGoose > 0 ? Math.round(maco.gooseFrete) : data.maco_goose
  const ruptMain = ruptura.filter(x => x.label !== 'Patagônia')

  // ── chart data ───────────────────────────────────────────────────────────

  const doiChartData = {
    labels: sems,
    datasets: [
      { label: 'Goose Island', data: doi.goose, borderColor: A1, backgroundColor: A1 + '18', fill: true,  tension: 0, pointRadius: 6, pointBackgroundColor: A1 },
      { label: 'Malzbier',     data: doi.malz,  borderColor: A3, fill: false, tension: 0, pointRadius: 6, pointBackgroundColor: A3 },
      { label: 'Colorado',     data: doi.color, borderColor: A5, fill: false, tension: 0, pointRadius: 5, pointBackgroundColor: A5 },
      { label: 'Patagônia',    data: doi.pat,   borderColor: A6, borderDash: [5, 3], fill: false, tension: 0, pointRadius: 5, pointBackgroundColor: A6 },
      { label: 'Mín 12d',      data: [12, 12, 12, 12], borderColor: REF, borderDash: [6, 4], pointRadius: 0, borderWidth: 1.5, tension: 0 },
    ],
  }

  const freteData = {
    labels: ['Goose BA', 'Goose PB', 'Malz BA', 'Malz PB'],
    datasets: [{ label: 'R$/HL', data: [131.8, 141.3, 135.4, 152.5], backgroundColor: [A1, A2, A4, A5], borderRadius: 5 }],
  }

  const macoData = {
    labels: ['Goose\nLocal', 'Goose\nRodo-BA', 'Goose\nRodo-PB', 'Malz\nLocal', 'Malz\nRodo-BA','Malz\nRodo-PB', 'Color.\nLocal'],
    datasets: [{ label: 'R$/HL', data: [maco.gooseLocal, 218.8, 209.2, maco.malzLocal, 149.0, 133.0, maco.colorLocal], backgroundColor: [A1, A3, A2, A4, A5], borderRadius: 5 }],
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nsData: any = {
    labels: sems,
    datasets: [
      { label: 'Goose Island', data: data.pcp_ns_goose, backgroundColor: A1, borderRadius: 3, stack: 's' },
      { label: 'Malzbier',     data: data.pcp_ns_malz,  backgroundColor: A3, borderRadius: 3, stack: 's' },
      { label: 'Colorado',     data: data.pcp_ns_color, backgroundColor: A5, borderRadius: 3, stack: 's' },
      { label: 'Outros LN',    data: data.pcp_ns_outros, backgroundColor: A7, borderRadius: 3, stack: 's' },
      { label: `Cap ${fmt(data.pcp_ns_capacity)}`, data: Array(4).fill(data.pcp_ns_capacity), type: 'line', borderColor: REF, borderDash: [4, 3], borderWidth: 1.5, pointRadius: 0, tension: 0 },
    ],
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ocupData: any = {
    labels: sems,
    datasets: [
      { label: 'AQ541 (CE)', data: data.ocup_aq, backgroundColor: A3, borderRadius: 4 },
      { label: 'NS541 (PE)', data: data.ocup_ns, backgroundColor: A6, borderRadius: 4 },
      { label: '100%', data: [100, 100, 100, 100], type: 'line', borderColor: REF, borderDash: [5, 3], borderWidth: 2, pointRadius: 0, tension: 0 },
    ],
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aqData: any = {
    labels: sems,
    datasets: [
      { label: 'Patagônia', data: data.pcp_aq_pat,   backgroundColor: A3, borderRadius: 3, stack: 's' },
      { label: 'Malzbier',  data: data.pcp_aq_malz,  backgroundColor: A5, borderRadius: 3, stack: 's' },
      { label: 'Colorado',  data: data.pcp_aq_color, backgroundColor: A7, borderRadius: 3, stack: 's' },
      { label: `Cap ${fmt(data.pcp_aq_capacity)}`, data: Array(4).fill(data.pcp_aq_capacity), type: 'line', borderColor: REF, borderDash: [4, 3], borderWidth: 1.5, pointRadius: 0, tension: 0 },
    ],
  }

  const geoCores = [A1, A3, A5, A7]
  const demData = {
    labels: sems,
    datasets: Object.entries(demGeo).map(([g, vals], i) => ({
      label: g, data: vals, backgroundColor: geoCores[i] ?? A7, borderRadius: 3,
    })),
  }

  // ── render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen" style={{ fontFamily: "'Inter', sans-serif", background: '#F0F4F8', color: '#2C2C2C', fontSize: 13 }}>

      {/* Topbar */}
      <div className="px-7 py-2.5 flex items-center justify-between sticky top-0 z-50" style={{ background: A2, borderBottom: `3px solid ${A4}` }}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-md flex items-center justify-center text-white font-bold text-xs" style={{ background: A4 }}>LN</div>
          <div>
            <div className="font-bold text-sm text-white">Long Neck NENO — Análise de Cenários</div>
            <div className="text-[10px] mt-px" style={{ color: '#B3D4ED' }}>Fevereiro 2026 · Case Ambev / Insper · Fonte: WSNP Analise_LongNeck</div>
          </div>
        </div>
        <span className="rounded-full px-3 py-0.5 text-[10px] font-semibold" style={{ background: A3, color: '#B3D4ED' }}>DATA-BASE 02/02/2026</span>
      </div>

      {/* Control Panel */}
      <div className="px-7 pt-3.5 pb-4" style={{ background: A2, borderBottom: `3px solid ${A4}` }}>
        <div className="flex gap-3.5 items-start flex-wrap">

          {/* Cenário buttons */}
          <div>
            <div className="text-[9px] font-bold tracking-widest uppercase mb-1.5" style={{ color: '#8FBCDE' }}>Cenário</div>
            <div className="flex gap-2 flex-wrap">
              {([
                { id: 'div', label: 'Cenário Divulgado',  sub: 'DOI oficial · WSNP Fev/26' },
                { id: 'nova', label: 'Nova Demanda',       sub: 'Demanda +30% · sem rodo extra' },
                { id: 'sol', label: 'Solução',             sub: `Goose ${fmt(15030)} + Malz ${fmt(MALZ_ANC_VOL)} HL · rodo` },
              ] as const).map(b => (
                <button key={b.id} onClick={() => loadCen(b.id)}
                  className="rounded-lg px-4 py-2 text-[11px] font-bold min-w-[148px] text-center transition-all border-[1.5px] cursor-pointer"
                  style={{
                    background: cen === b.id ? 'rgba(255,255,255,.22)' : 'rgba(255,255,255,.08)',
                    borderColor: cen === b.id ? '#fff' : 'rgba(255,255,255,.25)',
                    color: cen === b.id ? '#fff' : 'rgba(255,255,255,.65)',
                  }}>
                  {b.label}
                  <div className="text-[9px] font-normal mt-0.5 leading-snug" style={{ color: cen === b.id ? 'rgba(255,255,255,.7)' : 'rgba(255,255,255,.45)' }}>{b.sub}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Sliders (apenas em nova/sol) */}
          {(cen === 'nova' || cen === 'sol') && (<>
            <div className="rounded-lg px-3.5 py-2.5 min-w-[185px] flex-1 max-w-[255px]" style={{ background: 'rgba(255,255,255,.07)' }}>
              <div className="text-[9px] font-bold tracking-widest uppercase mb-0.5" style={{ color: '#8FBCDE' }}>Transfer. Goose Island</div>
              <div className="text-[17px] font-bold text-white leading-none mb-1">{fmt(volGoose)} HL</div>
              <input type="range" min={0} max={70000} step={500} value={volGoose}
                onChange={e => { setVolGoose(+e.target.value); setCen('nova') }}
                className="w-full cursor-pointer" style={{ accentColor: '#fff' }} />
              <div className="flex justify-between text-[8px] mt-0.5" style={{ color: '#B3D4ED' }}><span>0</span><span>35.000</span><span>70.000 HL</span></div>
            </div>

            <div className="rounded-lg px-3.5 py-2.5 min-w-[185px] flex-1 max-w-[255px]" style={{ background: 'rgba(255,255,255,.07)' }}>
              <div className="text-[9px] font-bold tracking-widest uppercase mb-0.5" style={{ color: '#8FBCDE' }}>Transfer. Malzbier</div>
              <div className="text-[17px] font-bold text-white leading-none mb-1">{fmt(volMalz)} HL</div>
              <input type="range" min={0} max={30000} step={500} value={volMalz}
                onChange={e => { setVolMalz(+e.target.value); setCen('nova') }}
                className="w-full cursor-pointer" style={{ accentColor: '#fff' }} />
              <div className="flex justify-between text-[8px] mt-0.5" style={{ color: '#B3D4ED' }}><span>0</span><span>15.000</span><span>30.000 HL</span></div>
            </div>

            <div className="rounded-lg px-3.5 py-2.5 min-w-[155px]" style={{ background: 'rgba(255,255,255,.07)' }}>
              <div className="text-[9px] font-bold tracking-widest uppercase mb-1" style={{ color: '#8FBCDE' }}>Modal</div>
              <div className="flex gap-1.5 mb-1.5">
                {(['cabo', 'rodo'] as const).map(m => (
                  <button key={m} onClick={() => setModal(m)}
                    className="flex-1 py-1 rounded-md border-[1.5px] text-[10px] font-bold text-center cursor-pointer transition-all"
                    style={{ background: modal === m ? '#fff' : 'transparent', borderColor: modal === m ? '#fff' : 'rgba(255,255,255,.3)', color: modal === m ? A2 : 'rgba(255,255,255,.5)' }}>
                    {m === 'cabo' ? 'CABO · 25d' : 'RODO · 6d'}
                  </button>
                ))}
              </div>
              <div className="text-[9px] leading-snug" style={{ color: '#B3D4ED' }}>
                {modal === 'cabo'
                  ? <><b style={{ color: '#fff' }}>Cabotagem:</b> lead 25d → chega só W3</>
                  : <><b style={{ color: '#fff' }}>Rodoviário:</b> lead 6d → chega W0/W2</>}
              </div>
            </div>
          </>)}
        </div>
      </div>

      {/* Main */}
      <main className="px-7 py-5 flex flex-col gap-5 pb-20">

        {/* KPIs */}
        <div className="grid grid-cols-5 gap-2.5">
          {[
            { label: 'Transfer. Goose', value: cen === 'div' ? '—' : fmt(volGoose) + ' HL', sub: cen === 'div' ? 'cenário divulgado' : modal === 'cabo' ? 'cabo · chega W3' : 'rodo · chega W0/W2', alert: false },
            { label: 'Transfer. Malzbier', value: cen === 'div' ? '—' : fmt(volMalz) + ' HL', sub: cen === 'div' ? 'cenário divulgado' : modal === 'cabo' ? 'cabo · chega W3' : 'rodo · chega W0/W2', alert: false },
            { label: 'Custo total frete', value: custoTotal === 0 ? 'R$ 0' : fmtM(custoTotal), sub: custoTotal === 0 ? '—' : modal === 'cabo' ? 'cabotagem' : 'rodoviário +60%', alert: false },
            { label: 'MACO líq. Goose', value: 'R$' + macoVal + '/HL', sub: ''},
            { label: 'SKUs abaixo 12d', value: ruptura.length === 0 ? 'Nenhum' : ruptura.length + ' sem.', sub: ruptura.length === 0 ? 'todos ≥ 12d' : ruptura.slice(0, 3).map(x => x.label.split(' ')[0] + ' ' + x.sem.slice(0, 2) + ' (' + x.doi.toFixed(1) + 'd)').join(' · '), alert: ruptura.length > 0 },
          ].map((kpi, i) => (
            <div key={i} className="rounded-lg p-[11px_13px] border-l-4 transition-all"
              style={{ background: kpi.alert ? '#FEF0EF' : '#fff', borderLeftColor: kpi.alert ? '#C0392B' : A5 }}>
              <div className="text-[9px] font-bold tracking-widest uppercase mb-0.5" style={{ color: '#6B6B6B' }}>{kpi.label}</div>
              <div className="text-[19px] font-bold leading-none" style={{ color: kpi.alert ? '#C0392B' : A4 }}>{kpi.value}</div>
              <div className="text-[10px] mt-0.5" style={{ color: '#6B6B6B' }}>{kpi.sub}</div>
            </div>
          ))}
        </div>

        {/* DOI */}
        <div>
          <SectionTitle>📈 DOI (Suf. f) por SKU — NENO</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <Card title="Suficiência final por semana" badge={
              cen === 'div' ? 'Cenário Divulgado' : cen === 'sol' ? 'Solução' : `Nova Demanda · ${modal === 'cabo' ? 'cabo' : 'rodo'}`
            }>
              <div style={{ position: 'relative', height: 270 }}>
                <Line data={doiChartData} options={{ ...baseOpts, scales: { x: { grid: GR }, y: { grid: GR, min: 0, max: 30, ticks: { callback: (v: unknown) => v + 'd' } } } }} />
              </div>
            </Card>
            <Card title="Tabela DOI" badge={cen === 'div' ? 'Cenário Divulgado' : cen === 'sol' ? 'Solução · rodo' : 'Nova Demanda'}>
              <table className="w-full border-collapse text-[11.5px]">
                <thead>
                  <tr>{['SKU', 'W0', 'W1', 'W2', 'W3'].map(h => (
                    <th key={h} className="py-1.5 px-2 text-[9px] font-bold tracking-widest uppercase border-b-2 border-[#D4D4D4]"
                      style={{ background: '#F0F4F8', color: '#6B6B6B', textAlign: h === 'SKU' ? 'left' : 'right' }}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {[
                    { name: 'Goose Island', data: doi.goose },
                    { name: 'Malzbier',     data: doi.malz },
                    { name: 'Colorado',     data: doi.color },
                    { name: 'Patagônia',    data: doi.pat, sub: 'sem rota SE→NENO' },
                  ].map(row => (
                    <tr key={row.name} className="hover:bg-[#D6EAFA]">
                      <td className="py-1.5 px-2 font-semibold border-b border-[#F0F4F8]" style={{ color: A2 }}>
                        {row.name}{row.sub && <span className="text-[9px] font-normal text-[#6B6B6B]"> ({row.sub})</span>}
                      </td>
                      {row.data.map((v, i) => (
                        <td key={i} className={`py-1.5 px-2 text-right border-b border-[#F0F4F8] ${doiClass(v)}`}>{v.toFixed(1)}d</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex flex-col gap-1.5 mt-2.5">
                {modal === 'cabo' && cen !== 'div' && (volGoose > 0 || volMalz > 0) && (
                  <div className="rounded-md p-1.5 text-[11px] flex gap-1.5 border" style={{ background: '#FEF0EF', borderColor: '#F5B7B1', color: '#922B21' }}>
                    <span className="font-bold">!</span> Cabotagem: lead 25d — só chega em W3.
                  </div>
                )}
                {ruptMain.length === 0 && cen !== 'div' && (
                  <div className="rounded-md p-1.5 text-[11px] flex gap-1.5 border" style={{ background: '#F5FAF7', borderColor: '#A9DFBF', color: '#1B5E20' }}>
                    <span className="font-bold">✓</span> Goose, Malzbier e Colorado com DOI ≥ 12d
                  </div>
                )}
                {ruptMain.map((x, i) => (
                  <div key={i} className="rounded-md p-1.5 text-[11px] flex gap-1.5 border" style={{ background: '#FEF0EF', borderColor: '#F5B7B1', color: '#922B21' }}>
                    <span className="font-bold">!</span> {x.label} {x.sem}: {x.doi.toFixed(1)}d — abaixo de 12d
                  </div>
                ))}
                {ruptura.filter(x => x.label === 'Patagônia').map((x, i) => (
                  <div key={i} className="rounded-md p-1.5 text-[11px] flex gap-1.5 border" style={{ background: '#FFF9E6', borderColor: '#FFD966', color: '#7A4F00' }}>
                    <span className="font-bold">▲</span> Patagônia {x.sem}: {x.doi.toFixed(1)}d (sem rota SE→NENO)
                  </div>
                ))}
                {cen === 'div' && (doi.goose.some(v => v < DOI_MIN) || doi.malz.some(v => v < DOI_MIN)) && (
                  <div className="rounded-md p-1.5 text-[11px] flex gap-1.5 border" style={{ background: '#FEF0EF', borderColor: '#F5B7B1', color: '#922B21' }}>
                    <span className="font-bold">!</span> Cenário Divulgado já apresenta DOI abaixo de 12d — selecione "Nova Demanda" para simular transferências.
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>

        {/* Demanda GEO */}
        <div>
          <SectionTitle>📦 Demanda por GEO</SectionTitle>
          <div className="flex gap-1.5 mb-2.5 flex-wrap">
            {(Object.keys(SKU_LABELS) as Sku[]).map(s => (
              <button key={s} onClick={() => setSku(s)}
                className="px-3 py-1 rounded-2xl text-[10px] font-bold border-[1.5px] cursor-pointer transition-all"
                style={{ background: sku === s ? A2 : '#F0F4F8', color: sku === s ? '#fff' : '#6B6B6B', borderColor: sku === s ? A2 : '#D4D4D4' }}>
                {SKU_LABELS[s]}
              </button>
            ))}
          </div>
          <Card title="Demanda por GEO (HL)" badge={`${SKU_LABELS[sku]} · ${cen === 'div' ? 'Cenário Divulgado' : cen === 'sol' ? 'Solução' : 'Nova Demanda'}`}>
            <div style={{ position: 'relative', height: 280 }}>
              <Bar key={`${sku}-${cen}`} data={demData} options={{ ...baseOpts, scales: { x: { grid: GR }, y: { grid: GR, ticks: { callback: (v: unknown) => fmt(v as number) + ' HL' } } } }} />
            </div>
          </Card>
        </div>

        {/* Frete & MACO */}
        <div>
          <SectionTitle>💰 Custo de Frete & MACO Líquido</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <Card title="Custo unitário por CDR" badge={modal === 'cabo' ? 'cabotagem' : 'rodoviário'}>
              <div style={{ position: 'relative', height: 240 }}>
                <Bar data={freteData} options={{ ...baseOpts, plugins: { ...baseOpts.plugins, legend: { display: false } }, scales: { x: { grid: GR }, y: { grid: GR, min: 0, max: 180, ticks: { callback: (v: unknown) => 'R$' + v } } } }} />
              </div>
            </Card>
            <Card title="MACO" badge="R$/HL">
              <div style={{ position: 'relative', height: 240 }}>
                <Bar data={macoData} options={{
                  ...baseOpts,
                  plugins: { ...baseOpts.plugins, legend: { display: false }, tooltip: { ...TT, callbacks: { label: (c: { parsed: { y: number | null } }) => 'R$' + (c.parsed.y ?? 0).toFixed(0) + '/HL' } } },
                  scales: { x: { grid: GR, ticks: { font: { size: 10 } } }, y: { grid: GR, min: 0, max: 420, ticks: { callback: (v: unknown) => 'R$' + v } } },
                }} />
              </div>
            </Card>
          </div>
        </div>

        {/* PCP */}
        <div>
          <SectionTitle>🏭 Programação de Produção</SectionTitle>
          <div className="grid grid-cols-3 gap-3">
            <Card title="PCP NS541 — Pernambuco" badge={`cap. ${fmt(data.pcp_ns_capacity)} HL/sem`}>
              <div style={{ position: 'relative', height: 220 }}>
                <Bar data={nsData} options={{ ...baseOpts, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, padding: 8, font: { size: 10 } } }, tooltip: TT }, scales: { x: { stacked: true, grid: GR }, y: { stacked: true, grid: GR, max: Math.round(data.pcp_ns_capacity * 1.2), ticks: { callback: (v: unknown) => fmt(v as number) } } } }} />
              </div>
            </Card>
            <Card title="Ocupação das linhas (%)">
              <div style={{ position: 'relative', height: 220 }}>
                <Bar data={ocupData} options={{ ...baseOpts, scales: { x: { grid: GR }, y: { grid: GR, min: 0, max: 115, ticks: { callback: (v: unknown) => v + '%' } } } }} />
              </div>
            </Card>
            <Card title="PCP AQ541 — Aquiraz" badge={`cap. ${fmt(data.pcp_aq_capacity)} HL/sem`}>
              <div style={{ position: 'relative', height: 220 }}>
                <Bar data={aqData} options={{ ...baseOpts, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, padding: 8, font: { size: 10 } } }, tooltip: TT }, scales: { x: { stacked: true, grid: GR }, y: { stacked: true, grid: GR, max: Math.round(data.pcp_aq_capacity * 1.2), ticks: { callback: (v: unknown) => fmt(v as number) } } } }} />
              </div>
            </Card>
          </div>
        </div>


      </main>
    </div>
  )
}
