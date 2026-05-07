import { Injectable } from "@nestjs/common";
import type { ImportKind } from "@prisma/client";
import { parse } from "papaparse";
import { PrismaService } from "../../common/prisma.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { NotificationsService } from "../notifications/notifications.service";

@Injectable()
export class ImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly notifications: NotificationsService,
  ) {}

  dryRun(fileName: string, csv: string) {
    const parsed = parse<Record<string, string>>(csv.trim(), { header: true, skipEmptyLines: true });
    const rows = parsed.data ?? [];
    return {
      fileName,
      lineCount: rows.length,
      headers: parsed.meta.fields ?? [],
      sample: rows.slice(0, 5),
      errors: parsed.errors,
    };
  }

  async commit(input: { uploadedById: string; source: string; body: string; kind?: ImportKind; mapping?: Record<string, string> | null }) {
    const parsed = parse<Record<string, string>>(input.body.trim(), { header: true, skipEmptyLines: true });
    const rows = parsed.data ?? [];
    const job = await this.prisma.importJob.create({
      data: {
        kind: input.kind ?? "GENERIC",
        fileName: input.source,
        source: input.source,
        uploadedById: input.uploadedById,
        rowsTotal: rows.length,
        status: "PROCESSING",
        mapping: input.mapping ?? undefined,
      },
    });

    let accepted = 0;
    let rejected = 0;
    const errors: string[] = [];
    const mapping = input.mapping ?? {};

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      try {
        if (input.kind === "KPI_DAILY") {
          await this.applyKpiRow(row, mapping);
        } else if (input.kind === "SALES") {
          await this.applySalesRow(row, mapping);
        }
        await this.prisma.importRow.create({
          data: { jobId: job.id, rowIndex: i, payload: row, accepted: true },
        });
        accepted += 1;
      } catch (error) {
        rejected += 1;
        const message = (error as Error).message;
        errors.push(`Row ${i + 1}: ${message}`);
        await this.prisma.importRow.create({
          data: { jobId: job.id, rowIndex: i, payload: row, accepted: false, errors: message },
        });
      }
      if (i % 25 === 0) {
        this.realtime.emit({ type: "import.progress", jobId: job.id, rowsProcessed: i + 1, rowsTotal: rows.length }, [`user:${input.uploadedById}`]);
      }
    }

    const status = rejected === 0 ? "COMPLETED" : accepted === 0 ? "FAILED" : "COMPLETED";
    const finalJob = await this.prisma.importJob.update({
      where: { id: job.id },
      data: {
        status,
        rowsAccepted: accepted,
        rowsRejected: rejected,
        message: errors.slice(0, 5).join("\n"),
        finishedAt: new Date(),
      },
    });

    if (status === "COMPLETED") {
      this.realtime.emit({ type: "import.completed", jobId: job.id }, [`user:${input.uploadedById}`]);
      await this.notifications.notify({
        userId: input.uploadedById,
        kind: "IMPORT_COMPLETED",
        title: "Import abgeschlossen",
        body: `${accepted} Zeilen importiert, ${rejected} Fehler`,
        link: "/imports",
        payload: { jobId: job.id },
      });
    } else {
      this.realtime.emit({ type: "import.failed", jobId: job.id, message: finalJob.message ?? "Unknown error" }, [`user:${input.uploadedById}`]);
      await this.notifications.notify({
        userId: input.uploadedById,
        kind: "IMPORT_FAILED",
        title: "Import fehlgeschlagen",
        body: finalJob.message ?? "Bitte Datei prüfen",
        link: "/imports",
        payload: { jobId: job.id },
      });
    }

    return finalJob;
  }

  history(opts: { take?: number } = {}) {
    return this.prisma.importJob.findMany({
      orderBy: { createdAt: "desc" },
      take: opts.take ?? 50,
      include: { uploadedBy: { select: { id: true, fullName: true, email: true } } },
    });
  }

  job(id: string) {
    return this.prisma.importJob.findUnique({
      where: { id },
      include: { rows: { orderBy: { rowIndex: "asc" } } },
    });
  }

  private async applyKpiRow(row: Record<string, string>, mapping: Record<string, string>) {
    const get = (key: string) => row[mapping[key] ?? key];
    const email = get("email");
    const date = get("date");
    if (!email || !date) throw new Error("email and date required");
    const agent = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!agent) throw new Error(`agent not found: ${email}`);
    await this.prisma.kpiDailyValue.upsert({
      where: { agentId_date: { agentId: agent.id, date } },
      create: {
        agentId: agent.id,
        date,
        minuteIb: Number(get("minuteIb") ?? 0) || 0,
        minuteOb: Number(get("minuteOb") ?? 0) || 0,
        waitMinutes: Number(get("waitMinutes") ?? 0) || 0,
        salesEuro: Number(get("salesEuro") ?? 0) || 0,
        npsEuro: Number(get("npsEuro") ?? 0) || 0,
        source: "import",
      },
      update: {
        minuteIb: Number(get("minuteIb") ?? 0) || 0,
        minuteOb: Number(get("minuteOb") ?? 0) || 0,
        waitMinutes: Number(get("waitMinutes") ?? 0) || 0,
        salesEuro: Number(get("salesEuro") ?? 0) || 0,
        npsEuro: Number(get("npsEuro") ?? 0) || 0,
        source: "import",
      },
    });
  }

  private async applySalesRow(row: Record<string, string>, mapping: Record<string, string>) {
    const get = (key: string) => row[mapping[key] ?? key];
    const email = get("email");
    const projectName = get("project");
    const productName = get("product");
    const callDate = get("callDate") ?? get("date");
    const quantity = Number(get("quantity") ?? 1);
    if (!email || !projectName || !productName || !callDate) throw new Error("email/project/product/callDate required");
    const [agent, project, product] = await Promise.all([
      this.prisma.user.findUnique({ where: { email: email.toLowerCase() } }),
      this.prisma.project.findFirst({ where: { name: { equals: projectName, mode: "insensitive" } } }),
      this.prisma.product.findFirst({ where: { name: { equals: productName, mode: "insensitive" } } }),
    ]);
    if (!agent) throw new Error(`agent not found: ${email}`);
    if (!project) throw new Error(`project not found: ${projectName}`);
    if (!product) throw new Error(`product not found: ${productName}`);
    await this.prisma.salesEntry.create({
      data: {
        agentId: agent.id,
        projectId: project.id,
        productId: product.id,
        quantity: Math.max(1, quantity || 1),
        callDate,
        contractRef: get("contractRef"),
        orderRef: get("orderRef"),
        note: get("note") ?? "imported",
      },
    });
  }
}
