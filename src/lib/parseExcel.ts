import * as XLSX from 'xlsx'

export type GeoMap = Record<string, number[]>

export interface ExcelData {
  sems: string[]
  // DOI (Suf. f d) — NENO TOTAL por SKU — do "Cenário Divulgado"
  div_doi_goose: number[]
  div_doi_malz: number[]
  div_doi_color: number[]
  div_doi_pat: number[]
  // DOI do "Cenário com Nova Demanda" (apenas Malzbier muda)
  nova_doi_malz: number[]
  // Demanda por GEO — Cenário Divulgado
  dem_div_goose: GeoMap
  dem_div_malz: GeoMap
  dem_div_color: GeoMap
  dem_div_pat: GeoMap
  // Demanda por GEO — Cenário Nova Demanda (apenas Malzbier muda)
  dem_nova_malz: GeoMap
  // Custos de transferência (cabotagem) — R$/HL
  cabo_goose_ba: number
  cabo_goose_pb: number
  cabo_malz_ba: number
  cabo_malz_pb: number
  // MACO produção local — R$/HL
  maco_goose: number
  maco_malz: number
  maco_color: number
  // PCP — AQ541 Aquiraz
  pcp_aq_capacity: number
  pcp_aq_malz: number[]
  pcp_aq_pat: number[]
  pcp_aq_color: number[]
  pcp_aq_total: number[]
  // PCP — NS541 Pernambuco
  pcp_ns_capacity: number
  pcp_ns_goose: number[]
  pcp_ns_malz: number[]
  pcp_ns_color: number[]
  pcp_ns_outros: number[]
  pcp_ns_total: number[]
  // Ocupação das linhas (%)
  ocup_aq: number[]
  ocup_ns: number[]
}

type Row = (string | number)[]

// Colunas fixas nas abas de cenário (layout do WSNP)
const DEM_COLS  = [3, 16, 27, 38]   // Demanda W0-W3
const DOI_COLS  = [14, 25, 36, 47]  // Suf. f (d) W0-W3
const GEO_COL   = 2
const GEOS_NENO = ['Mapapi', 'NE Norte', 'NE Sul', 'NO Centro']

// SKU codes no arquivo
const SKU_GOOSE = 65758
const SKU_MALZ  = 70792
const SKU_COLOR = 83179
const SKU_PAT   = 70934

function extractDoi(totalRow: Row): number[] {
  return DOI_COLS.map(c => {
    const v = Number(totalRow[c])
    return isFinite(v) ? Math.round(v * 10) / 10 : 0
  })
}

function extractGeoMap(rows: Row[]): GeoMap {
  const result: GeoMap = {}
  for (const row of rows) {
    const geo = String(row[GEO_COL] ?? '')
    if (!GEOS_NENO.includes(geo)) continue
    result[geo] = DEM_COLS.map(c => {
      const v = Number(row[c])
      return isFinite(v) ? Math.round(v) : 0
    })
  }
  return result
}

function parseCenario(ws: XLSX.WorkSheet): {
  doi_goose: number[]; doi_malz: number[]; doi_color: number[]; doi_pat: number[]
  dem_goose: GeoMap; dem_malz: GeoMap; dem_color: GeoMap; dem_pat: GeoMap
} {
  const data = XLSX.utils.sheet_to_json<Row>(ws, { header: 1, defval: '' })

  // Agrupa linhas por SKU
  const blocks: Record<number, Row[]> = { [SKU_GOOSE]: [], [SKU_MALZ]: [], [SKU_COLOR]: [], [SKU_PAT]: [] }
  let currentSku = 0

  for (const row of data) {
    const skuCell = Number(row[0])
    if (Object.keys(blocks).map(Number).includes(skuCell)) {
      currentSku = skuCell
    }
    if (currentSku && currentSku in blocks) {
      blocks[currentSku].push(row)
    }
  }

  function totalRow(sku: number): Row {
    const rows = blocks[sku]
    return rows.find(r => String(r[GEO_COL]) === 'TOTAL') ?? rows[rows.length - 1] ?? []
  }

  return {
    doi_goose: extractDoi(totalRow(SKU_GOOSE)),
    doi_malz:  extractDoi(totalRow(SKU_MALZ)),
    doi_color: extractDoi(totalRow(SKU_COLOR)),
    doi_pat:   extractDoi(totalRow(SKU_PAT)),
    dem_goose: extractGeoMap(blocks[SKU_GOOSE]),
    dem_malz:  extractGeoMap(blocks[SKU_MALZ]),
    dem_color: extractGeoMap(blocks[SKU_COLOR]),
    dem_pat:   extractGeoMap(blocks[SKU_PAT]),
  }
}

function parseCustos(ws: XLSX.WorkSheet): Pick<ExcelData,
  'cabo_goose_ba' | 'cabo_goose_pb' | 'cabo_malz_ba' | 'cabo_malz_pb' |
  'maco_goose' | 'maco_malz' | 'maco_color'
> {
  const data = XLSX.utils.sheet_to_json<Row>(ws, { header: 1, defval: '' })

  let cabo_goose_ba = 0, cabo_goose_pb = 0, cabo_malz_ba = 0, cabo_malz_pb = 0
  let maco_goose = 0, maco_malz = 0, maco_color = 0

  for (const row of data) {
    const sku  = String(row[0]).toUpperCase()
    const dest = String(row[2]).toUpperCase()
    const val  = Number(row[3])
    if (!isFinite(val) || val === 0) continue

    if (sku.includes('GOOSE') && dest.includes('CAMACARI')) cabo_goose_ba = val
    if (sku.includes('GOOSE') && dest.includes('FONTE MATA')) cabo_goose_pb = val
    if (sku.includes('MALZBIER') && dest.includes('CAMACARI')) cabo_malz_ba = val
    if (sku.includes('MALZBIER') && dest.includes('FONTE MATA')) cabo_malz_pb = val
    if (sku.includes('COLORADO') && val === 300) maco_color = val
    if (sku.includes('GOOSE') && val === 350) maco_goose = val
    if (sku.includes('MALZBIER') && val === 285) maco_malz = val
  }

  return { cabo_goose_ba, cabo_goose_pb, cabo_malz_ba, cabo_malz_pb, maco_goose, maco_malz, maco_color }
}

function parsePCP(ws: XLSX.WorkSheet): Pick<ExcelData,
  'pcp_aq_capacity' | 'pcp_aq_malz' | 'pcp_aq_pat' | 'pcp_aq_color' | 'pcp_aq_total' |
  'pcp_ns_capacity' | 'pcp_ns_goose' | 'pcp_ns_malz' | 'pcp_ns_color' | 'pcp_ns_outros' | 'pcp_ns_total' |
  'ocup_aq' | 'ocup_ns'
> {
  const data = XLSX.utils.sheet_to_json<Row>(ws, { header: 1, defval: '' })

  const WEEK_COLS = [6, 7, 8, 9]
  const weekVals = (row: Row) => WEEK_COLS.map(c => Number(row[c]) || 0)

  let pcp_aq_capacity = 12600
  let pcp_ns_capacity = 27000
  let pcp_aq_malz: number[] = [0,0,0,0]
  let pcp_aq_pat:  number[] = [0,0,0,0]
  let pcp_aq_color: number[] = [0,0,0,0]
  let pcp_aq_total: number[] = [0,0,0,0]
  let pcp_ns_goose: number[] = [0,0,0,0]
  let pcp_ns_malz:  number[] = [0,0,0,0]
  let pcp_ns_color: number[] = [0,0,0,0]
  let pcp_ns_total: number[] = [0,0,0,0]

  let inAQ = false, inNS = false

  for (const row of data) {
    const loc  = String(row[0]).toUpperCase()
    const item = String(row[4]).toUpperCase()
    const cap  = Number(row[3])

    if (loc.includes('AQUIRAZ')) {
      inAQ = true; inNS = false
      if (isFinite(cap) && cap > 0) pcp_aq_capacity = cap
    }
    if (loc.includes('PERNAMBUCO')) {
      inNS = true; inAQ = false
      if (isFinite(cap) && cap > 0) pcp_ns_capacity = cap
    }

    if (inAQ) {
      if (item.includes('MALZBIER'))  pcp_aq_malz  = weekVals(row)
      if (item.includes('PATAGONIA')) pcp_aq_pat   = weekVals(row)
      if (item.includes('COLORADO'))  pcp_aq_color = weekVals(row)
      // linha de total (item vazio, col 4 vazio)
      if (!item && weekVals(row).some(v => v > 0)) pcp_aq_total = weekVals(row)
    }

    if (inNS) {
      if (item.includes('GOOSE'))    pcp_ns_goose = weekVals(row)
      if (item.includes('MALZBIER')) pcp_ns_malz  = weekVals(row)
      if (item.includes('COLORADO')) pcp_ns_color = weekVals(row)
      if (!item && weekVals(row).some(v => v > 0)) pcp_ns_total = weekVals(row)
    }
  }

  const pcp_ns_outros = pcp_ns_total.map((t, i) =>
    Math.max(0, t - pcp_ns_goose[i] - pcp_ns_malz[i] - pcp_ns_color[i])
  )

  const ocup_aq = pcp_aq_total.map(v => pcp_aq_capacity > 0 ? Math.round(v / pcp_aq_capacity * 1000) / 10 : 0)
  const ocup_ns = pcp_ns_total.map(v => pcp_ns_capacity > 0 ? Math.round(v / pcp_ns_capacity * 1000) / 10 : 0)

  return {
    pcp_aq_capacity, pcp_aq_malz, pcp_aq_pat, pcp_aq_color, pcp_aq_total,
    pcp_ns_capacity, pcp_ns_goose, pcp_ns_malz, pcp_ns_color, pcp_ns_outros, pcp_ns_total,
    ocup_aq, ocup_ns,
  }
}

export async function parseExcel(): Promise<ExcelData> {
  const res = await fetch('/longneck_data.xlsb')
  if (!res.ok) throw new Error(`Erro ao carregar Excel: ${res.status}`)
  const buffer = await res.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array' })

  const wsDiv  = wb.Sheets['Cenário Divulgado']
  const wsNova = wb.Sheets['Cenário com Nova Demanda']
  const wsCust = wb.Sheets['Custos de transferência']
  const wsPCP  = wb.Sheets['Produção PCP']

  if (!wsDiv || !wsNova || !wsCust || !wsPCP) {
    throw new Error('Abas não encontradas no Excel. Verifique o arquivo.')
  }

  const div  = parseCenario(wsDiv)
  const nova = parseCenario(wsNova)
  const custos = parseCustos(wsCust)
  const pcp    = parsePCP(wsPCP)

  return {
    sems: ['W0 02/fev', 'W1 09/fev', 'W2 16/fev', 'W3 23/fev'],
    div_doi_goose: div.doi_goose,
    div_doi_malz:  div.doi_malz,
    div_doi_color: div.doi_color,
    div_doi_pat:   div.doi_pat,
    nova_doi_malz: nova.doi_malz,
    dem_div_goose: div.dem_goose,
    dem_div_malz:  div.dem_malz,
    dem_div_color: div.dem_color,
    dem_div_pat:   div.dem_pat,
    dem_nova_malz: nova.dem_malz,
    ...custos,
    ...pcp,
  }
}
