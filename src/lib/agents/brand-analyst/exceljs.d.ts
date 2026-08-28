declare module "@excel.js/exceljs" {
  export interface Cell {
    text: string;
    value: unknown;
  }

  export interface Row {
    actualCellCount: number;
    cellCount: number;
    getCell(column: number): Cell;
  }

  export interface Worksheet {
    name: string;
    actualRowCount: number;
    getRow(row: number): Row;
    addRow(values: unknown[]): Row;
  }

  export class Workbook {
    worksheets: Worksheet[];
    xlsx: {
      load(data: Uint8Array): Promise<Workbook>;
      writeBuffer(): Promise<ArrayBuffer>;
    };
    addWorksheet(name: string): Worksheet;
  }

  const ExcelJS: { Workbook: typeof Workbook };
  export default ExcelJS;
}
