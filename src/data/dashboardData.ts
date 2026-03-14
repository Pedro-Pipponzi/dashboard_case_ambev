// Constantes de simulação derivadas da análise (Jupyter), não presentes no Excel

// DOI do Goose Island em NENO se 0 HL rodo extra fosse transferido (ponto de âncora)
export const GOOSE_DOI_0HL = [13.3, 16.9, 15.1, 22.7]
// Slope: variação do DOI por HL de transferência rodo (W0-W3)
export const GOOSE_SLOPE   = [-8.5e-5, -0.000108, -0.000198, -0.000211]

// Solução para Malzbier: volume rodo e DOI resultante
export const MALZ_ANC_VOL = 15897  // HL via rodo
export const MALZ_ANC_DOI = [12.0, 19.7, 23.1, 17.1]  // DOI resultante

// Proporção do frete que vai para BA (Camaçari) vs PB (João Pessoa)
export const PROP_BA = 0.24

// DOI mínimo operacional
export const DOI_MIN = 12

// Formatação
export const fmt = (n: number) =>
  new Intl.NumberFormat('pt-BR').format(Math.round(n))

export const fmtM = (n: number) =>
  'R$ ' + (n / 1e6).toFixed(2).replace('.', ',') + ' M'

export const COLORS = {
  A1: '#0D2B55',
  A2: '#1B3A6B',
  A3: '#2D5282',
  A4: '#4A7FB5',
  A5: '#6A9FCC',
  A6: '#8FBCDE',
  A7: '#B3D4ED',
  REF: '#9CA3AF',
}
