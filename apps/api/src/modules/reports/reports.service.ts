import { Injectable } from "@nestjs/common";
import { unparse } from "papaparse";
import PDFDocument from "pdfkit";
import { PrismaService } from "../../common/prisma.service";
import { KpiService } from "../kpi/kpi.service";
import { ShiftplanService } from "../shiftplan/shiftplan.service";

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kpi: KpiService,
    private readonly shiftplan: ShiftplanService,
  ) {}

  async kpiCsv(month: string) {
    const data = await this.kpi.listOrgMonth(month);
    return unparse(
      data.leaderboard.map((row) => ({
        agent: row.fullName,
        email: row.email,
        baseEuro: row.baseEuro.toFixed(2),
        salesEuro: row.salesEuro.toFixed(2),
        npsEuro: row.npsEuro.toFixed(2),
        totalEuro: row.totalEuro.toFixed(2),
        agreedSlots: row.agreedSlots,
        disagreedSlots: row.disagreedSlots,
      })),
    );
  }

  async kpiPdf(month: string): Promise<Buffer> {
    const data = await this.kpi.listOrgMonth(month);
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: "A4", margin: 40 });
      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
      doc.fontSize(20).text(`KPI Report - ${month}`, { align: "left" });
      doc.moveDown();
      doc.fontSize(11);
      doc.text(`Total payout: €${data.totals.payoutEuro.toFixed(2)}`);
      doc.text(`Agreed slots: ${data.totals.agreedSlots}    Disagreed slots: ${data.totals.disagreedSlots}`);
      doc.moveDown();
      doc.fontSize(13).text("Leaderboard", { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(10);
      data.leaderboard.forEach((row, i) => {
        doc.text(`${i + 1}. ${row.fullName} (${row.email}) — €${row.totalEuro.toFixed(2)} (Sales €${row.salesEuro.toFixed(2)})`);
      });
      doc.end();
    });
  }

  async rosterMonthCsv(projectId: string, month: string) {
    const data = await this.shiftplan.rosterProjectMonth(projectId, month);
    const rows: Array<Record<string, string | number>> = [];
    for (const team of data.teams) {
      for (const agent of team.agents) {
        for (const day of agent.days) {
          rows.push({
            team: team.teamName,
            agent: agent.fullName,
            email: agent.email,
            date: day.date,
            present: day.present ? 1 : 0,
            worked: day.worked ? 1 : 0,
            cellCount: day.cellCount,
            aAgreedSlots: day.aAgreedSlots,
            disagreedSlots: day.disagreedSlots,
          });
        }
      }
    }
    return unparse(rows);
  }
}
