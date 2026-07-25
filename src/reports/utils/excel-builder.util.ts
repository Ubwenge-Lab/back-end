import * as ExcelJS from 'exceljs';

export class ExcelBuilderUtil {
  /**
   * Generates a stylized Excel buffer for the MOH Weekly Surveillance Report.
   */
  static async buildMohWeeklyReport(
    data: Array<{
      region: string;
      diseaseCategory: string;
      gender: string;
      ageGroup: string;
      cases: number;
    }>,
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Ubwenge-Lab System';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Weekly Surveillance');

    // 1. Define Columns exactly as MOH requires
    sheet.columns = [
      { header: 'Region/District', key: 'region', width: 25 },
      { header: 'Disease Category', key: 'diseaseCategory', width: 35 },
      { header: 'Gender', key: 'gender', width: 15 },
      { header: 'Age Group', key: 'ageGroup', width: 20 },
      { header: 'Total Cases', key: 'cases', width: 15 },
    ];

    // 2. Stylize the Header Row
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF00529B' }, // Professional Blue
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    // 3. Add the Data Rows
    data.forEach((row) => {
      sheet.addRow(row);
    });

    // 4. Center align the numbers in the 'cases' column
    sheet.getColumn('cases').alignment = { horizontal: 'center' };

    // 5. Generate and return the buffer
    const buffer = await workbook.xlsx.writeBuffer();
    return buffer as unknown as Buffer;
  }
}