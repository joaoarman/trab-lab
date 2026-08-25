import { Workbook } from 'exceljs'
import { saveAs } from 'file-saver'

export interface XlsxColumn {
  header: string
  key: string
  width?: number
}

// Exporta linhas (array de objetos) para um .xlsx e baixa no navegador.
// Ex.: exportToXlsx(aprs, [{ header: 'Título', key: 'title' }], 'aprs.xlsx')
export async function exportToXlsx<T extends Record<string, unknown>>(
  rows: T[],
  columns: XlsxColumn[],
  filename = 'export.xlsx',
  sheetName = 'Dados',
): Promise<void> {
  const wb = new Workbook()
  const ws = wb.addWorksheet(sheetName)
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 20 }))
  rows.forEach((r) => ws.addRow(r))
  ws.getRow(1).font = { bold: true }
  const buffer = await wb.xlsx.writeBuffer()
  saveAs(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    filename,
  )
}
