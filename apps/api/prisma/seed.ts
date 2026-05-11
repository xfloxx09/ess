import { Prisma, PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding ESS demo data…");
  const passwordHash = await argon2.hash("ChangeMe123!", { type: argon2.argon2id });

  // ---------- Identity ----------
  const admin = await prisma.user.upsert({
    where: { email: "admin@ess.local" },
    create: {
      email: "admin@ess.local",
      fullName: "ESS Admin",
      role: "ADMIN",
      passwordHash,
      hourlyRateEuro: 0,
      locale: "de",
    },
    update: {},
  });
  const controller = await prisma.user.upsert({
    where: { email: "controlling@ess.local" },
    create: {
      email: "controlling@ess.local",
      fullName: "Sample Controller",
      role: "CONTROLLING",
      passwordHash,
      hourlyRateEuro: 0,
      locale: "de",
    },
    update: {},
  });

  await prisma.controllingPolicy.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", liveBlockMinutes: 30 },
    update: {},
  });

  // ---------- Org hierarchy ----------
  const dl = await prisma.dienstleister.upsert({
    where: { id: "dl-demo" },
    create: { id: "dl-demo", name: "Demo Dienstleister GmbH" },
    update: {},
  });
  const abteilung = await prisma.abteilung.upsert({
    where: { id: "abt-customer-service" },
    create: { id: "abt-customer-service", name: "Kundenservice", dienstleisterId: dl.id },
    update: {},
  });
  const projectGk = await prisma.project.upsert({
    where: { id: "prj-gk-cm" },
    create: { id: "prj-gk-cm", name: "GK CM KMU", abteilungId: abteilung.id },
    update: {},
  });
  const projectTel = await prisma.project.upsert({
    where: { id: "prj-tel-retention" },
    create: { id: "prj-tel-retention", name: "Telekom Retention", abteilungId: abteilung.id },
    update: {},
  });

  const teamNord = await prisma.team.upsert({
    where: { id: "team-nord" },
    create: { id: "team-nord", name: "Team Nord", projectId: projectGk.id },
    update: {},
  });
  const teamSued = await prisma.team.upsert({
    where: { id: "team-sued" },
    create: { id: "team-sued", name: "Team Süd", projectId: projectGk.id },
    update: {},
  });
  const teamRetention = await prisma.team.upsert({
    where: { id: "team-retention" },
    create: { id: "team-retention", name: "Team Retention", projectId: projectTel.id },
    update: {},
  });

  const schichtPlanUser = await prisma.user.upsert({
    where: { email: "schichtplanung@ess.local" },
    create: {
      email: "schichtplanung@ess.local",
      fullName: "Demo Schichtplanung",
      role: "SCHICHTPLANUNG",
      passwordHash,
      hourlyRateEuro: 0,
      locale: "de",
    },
    update: { role: "SCHICHTPLANUNG" },
  });

  // ---------- Agents ----------
  const agent = await prisma.user.upsert({
    where: { email: "agent@ess.local" },
    create: {
      email: "agent@ess.local",
      fullName: "Sample Agent",
      role: "AGENT",
      passwordHash,
      hourlyRateEuro: 12.5,
      locale: "de",
      teamId: teamNord.id,
    },
    update: { teamId: teamNord.id },
  });
  const agent2 = await prisma.user.upsert({
    where: { email: "agent2@ess.local" },
    create: {
      email: "agent2@ess.local",
      fullName: "Sample Agent (Team Süd)",
      role: "AGENT",
      passwordHash,
      hourlyRateEuro: 12,
      locale: "de",
      teamId: teamSued.id,
    },
    update: { teamId: teamSued.id },
  });

  // ~28 weitere Agenten auf GK CM KMU (Nord/Süd) + 2 Demo = 30 im Projekt GK; Retention = Telekom separat
  const bulkNord = 14;
  const bulkSued = 14;
  const bulkRet = 8;
  for (let i = 1; i <= bulkNord; i++) {
    const n = String(i).padStart(3, "0");
    await prisma.user.upsert({
      where: { email: `bulk.nord.${n}@ess.local` },
      create: {
        email: `bulk.nord.${n}@ess.local`,
        fullName: `Demo Nord ${n}`,
        role: "AGENT",
        passwordHash,
        hourlyRateEuro: 11 + (i % 5) * 0.25,
        locale: "de",
        teamId: teamNord.id,
        fte: [0.75, 1, 1][i % 3],
      },
      update: { teamId: teamNord.id, role: "AGENT", active: true, deletedAt: null },
    });
  }
  for (let i = 1; i <= bulkSued; i++) {
    const n = String(i).padStart(3, "0");
    await prisma.user.upsert({
      where: { email: `bulk.sued.${n}@ess.local` },
      create: {
        email: `bulk.sued.${n}@ess.local`,
        fullName: `Demo Süd ${n}`,
        role: "AGENT",
        passwordHash,
        hourlyRateEuro: 11.5,
        locale: "de",
        teamId: teamSued.id,
        fte: [1, 0.8, 1][i % 3],
      },
      update: { teamId: teamSued.id, role: "AGENT", active: true, deletedAt: null },
    });
  }
  for (let i = 1; i <= bulkRet; i++) {
    const n = String(i).padStart(3, "0");
    await prisma.user.upsert({
      where: { email: `bulk.ret.${n}@ess.local` },
      create: {
        email: `bulk.ret.${n}@ess.local`,
        fullName: `Demo Retention ${n}`,
        role: "AGENT",
        passwordHash,
        hourlyRateEuro: 12,
        locale: "de",
        teamId: teamRetention.id,
        fte: 1,
      },
      update: { teamId: teamRetention.id, role: "AGENT", active: true, deletedAt: null },
    });
  }

  // ---------- Access roles ----------
  const roleSchichtplan = await prisma.accessRole.upsert({
    where: { slug: "schichtplanung-fk" },
    create: {
      slug: "schichtplanung-fk",
      name: "Schichtplanung (FK)",
      description: "Schichtplan-Bearbeitung für Fachkräfte mit Projekt-Scope",
      views: {
        createMany: {
          data: [{ viewKey: "controlling_roster_day" }, { viewKey: "controlling_roster_month" }],
        },
      },
      scopes: { create: { resourceType: "PROJECT", resourceId: projectGk.id } },
    },
    update: {},
  });
  await prisma.accessRole.upsert({
    where: { slug: "antraege-genehmigen" },
    create: {
      slug: "antraege-genehmigen",
      name: "Anträge genehmigen",
      description: "Berechtigt Anträge zu genehmigen oder abzulehnen",
      views: { create: { viewKey: "controlling_antraege" } },
    },
    update: {},
  });

  await prisma.userAccessRole.upsert({
    where: { userId_accessRoleId: { userId: agent2.id, accessRoleId: roleSchichtplan.id } },
    create: { userId: agent2.id, accessRoleId: roleSchichtplan.id },
    update: {},
  });

  const slugSpDemo = `schichtplaner-scope-${schichtPlanUser.id}`;
  const roleSpDemo = await prisma.accessRole.upsert({
    where: { slug: slugSpDemo },
    create: {
      slug: slugSpDemo,
      name: `Schichtplanung · ${schichtPlanUser.fullName}`,
      description: "Demo: Schichtplaner-Zugang (Admin-UI) — Projekt GK CM KMU",
      views: {
        createMany: {
          data: [{ viewKey: "controlling_roster_day" }, { viewKey: "controlling_roster_month" }],
        },
      },
      scopes: { create: { resourceType: "PROJECT", resourceId: projectGk.id } },
    },
    update: {
      name: `Schichtplanung · ${schichtPlanUser.fullName}`,
    },
  });
  await prisma.userAccessRole.upsert({
    where: { userId_accessRoleId: { userId: schichtPlanUser.id, accessRoleId: roleSpDemo.id } },
    create: { userId: schichtPlanUser.id, accessRoleId: roleSpDemo.id },
    update: {},
  });

  const roleFkLeadership = await prisma.accessRole.upsert({
    where: { slug: "fuehrungskraefte-dashboard" },
    create: {
      slug: "fuehrungskraefte-dashboard",
      name: "Führungskräfte Dashboard",
      description: "KPI-Übersicht für zugewiesene Projekte (Demo: GK CM KMU)",
      scopes: { create: { resourceType: "PROJECT", resourceId: projectGk.id } },
    },
    update: {
      name: "Führungskräfte Dashboard",
      description: "KPI-Übersicht für zugewiesene Projekte (Demo: GK CM KMU)",
    },
  });
  await prisma.accessRoleView.upsert({
    where: { accessRoleId_viewKey: { accessRoleId: roleFkLeadership.id, viewKey: "leadership_dashboard" } },
    create: { accessRoleId: roleFkLeadership.id, viewKey: "leadership_dashboard" },
    update: {},
  });
  await prisma.accessRoleScope.upsert({
    where: {
      accessRoleId_resourceType_resourceId: {
        accessRoleId: roleFkLeadership.id,
        resourceType: "PROJECT",
        resourceId: projectGk.id,
      },
    },
    create: { accessRoleId: roleFkLeadership.id, resourceType: "PROJECT", resourceId: projectGk.id },
    update: {},
  });
  await prisma.userAccessRole.upsert({
    where: { userId_accessRoleId: { userId: controller.id, accessRoleId: roleFkLeadership.id } },
    create: { userId: controller.id, accessRoleId: roleFkLeadership.id },
    update: {},
  });

  // ---------- Catalog ----------
  const products = [
    { name: "Fiber Upgrade", category: "Internet", premium: 12.5 },
    { name: "5G Mobile S", category: "Mobile", premium: 8.5 },
    { name: "TV Paket Plus", category: "TV", premium: 6.25 },
    { name: "Smart Home Security", category: "Add-On", premium: 6.25 },
  ];
  for (const p of products) {
    const product = await prisma.product.upsert({
      where: { id: `prod-${slugify(p.name)}` },
      create: { id: `prod-${slugify(p.name)}`, name: p.name, category: p.category },
      update: { category: p.category },
    });
    for (const project of [projectGk, projectTel]) {
      await prisma.productPremium.upsert({
        where: { projectId_productId: { projectId: project.id, productId: product.id } },
        create: { projectId: project.id, productId: product.id, amountEuro: p.premium },
        update: { amountEuro: p.premium },
      });
    }
  }

  // ---------- Booking types ----------
  const bookingTypes: Array<{
    code: string;
    label: string;
    category: "SHIFT" | "VACATION" | "SICK";
    color: string;
    emoji: string;
    allowsSplitShift: boolean;
  }> = [
    { code: "FR", label: "Früh", category: "SHIFT", color: "#3498db", emoji: "🌅", allowsSplitShift: false },
    { code: "SN", label: "Spät", category: "SHIFT", color: "#e67e22", emoji: "🌙", allowsSplitShift: false },
    { code: "SPLIT", label: "Splitschicht", category: "SHIFT", color: "#16a085", emoji: "🧩", allowsSplitShift: true },
    { code: "SOS", label: "SOS Frei", category: "SHIFT", color: "#27ae60", emoji: "🆘", allowsSplitShift: false },
    { code: "F", label: "Frei", category: "SHIFT", color: "#6c5ce7", emoji: "🟣", allowsSplitShift: false },
    { code: "U", label: "Urlaub buchen", category: "VACATION", color: "#8e44ad", emoji: "🏖️", allowsSplitShift: false },
    { code: "SU", label: "Sonderurlaub buchen", category: "VACATION", color: "#9b59b6", emoji: "🧾", allowsSplitShift: false },
    { code: "UK", label: "Urlaub kurzfristig buchen", category: "VACATION", color: "#8e44ad", emoji: "⚡", allowsSplitShift: false },
    { code: "K", label: "Krank melden", category: "SICK", color: "#c0392b", emoji: "🤒", allowsSplitShift: false },
  ];
  for (const t of bookingTypes) {
    await prisma.bookingType.upsert({
      where: { code: t.code },
      create: t,
      update: t,
    });
  }

  // ---------- Calendar policy & shift rule ----------
  await prisma.calendarPolicy.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      normalVacationLeadDays: 21,
      allowNormalVacationCurrentMonth: false,
      allowMultiDayBooking: true,
    },
    update: {},
  });
  await prisma.shiftRule.deleteMany({});
  await prisma.shiftRule.create({
    data: {
      active: true,
      minFirstHours: 4,
      maxFirstHours: 5,
      minPauseHours: 3.5,
      maxPauseHours: 5,
      minSecondHours: 4,
      maxSecondHours: 5,
    },
  });

  // ---------- Rate tables ----------
  for (const rate of [
    { shiftType: "FRUEH", euroPerHour: 12.5 },
    { shiftType: "SPAET", euroPerHour: 14 },
    { shiftType: "NACHT", euroPerHour: 16 },
  ]) {
    await prisma.rateTable.upsert({
      where: { shiftType: rate.shiftType },
      create: rate,
      update: rate,
    });
  }

  // ---------- Quarter-hour codes ----------
  for (const code of [
    { code: "A", label: "Anwesend", color: "#3498db", valueMultiplier: 1 },
    { code: "P", label: "Pause", color: "#e67e22", valueMultiplier: 0 },
    { code: "F", label: "Frei", color: "#8e44ad", valueMultiplier: 0 },
    { code: "U", label: "Urlaub", color: "#8e44ad", valueMultiplier: 0 },
    { code: "K", label: "Krank", color: "#c0392b", valueMultiplier: 0 },
  ]) {
    await prisma.quarterHourCode.upsert({
      where: { code: code.code },
      create: code,
      update: code,
    });
  }

  // ---------- Booking window for current month ----------
  const month = currentMonthKey();
  await prisma.bookingWindow.upsert({
    where: { month },
    create: { month, opensAtIso: `${month}-01T00:00:00.000Z`, closesAtIso: `${month}-28T23:59:59.000Z` },
    update: {},
  });

  // ---------- Some demo bookings + cells for the agents ----------
  const bookingByCode = Object.fromEntries((await prisma.bookingType.findMany()).map((t) => [t.code, t]));
  const productList = await prisma.product.findMany();
  const projectList = [projectGk, projectTel];
  const daysInMonth = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();

  for (const target of [agent, agent2]) {
    for (let day = 1; day <= Math.min(daysInMonth, 22); day += 1) {
      const date = `${month}-${String(day).padStart(2, "0")}`;
      const weekday = new Date(`${date}T00:00:00`).getDay();
      if (weekday === 0) continue;
      const code = weekday === 6 ? "F" : day % 7 === 0 ? "U" : day % 5 === 0 ? "SN" : "FR";
      const bt = bookingByCode[code];
      if (!bt) continue;
      const blocks =
        bt.code === "SN"
          ? [{ start: "14:00", end: "19:00" }, { start: "22:30", end: "02:30" }]
          : bt.code === "FR"
            ? [{ start: "09:00", end: "17:00" }]
            : [];
      await prisma.calendarBooking.upsert({
        where: { agentId_date: { agentId: target.id, date } },
        create: {
          agentId: target.id,
          date,
          bookingTypeId: bt.id,
          blocks: blocks as Prisma.InputJsonValue,
          version: 1,
        },
        update: {},
      });

      if (bt.code === "FR" || bt.code === "SN") {
        const work = bt.code === "FR" ? range(36, 68) : range(56, 88);
        const pauses = bt.code === "FR" ? range(52, 55) : range(72, 74);
        for (const slot of [...work, ...pauses]) {
          const controllerCode = pauses.includes(slot) ? "P" : "A";
          const rawCode = day % 9 === 0 && slot % 12 === 0 ? "P" : controllerCode;
          await prisma.shiftplanCell.upsert({
            where: { agentId_date_slotIndex: { agentId: target.id, date, slotIndex: slot } },
            create: { agentId: target.id, date, slotIndex: slot, controllerCode, rawCode, version: 1 },
            update: {},
          });
        }
        const project = projectList[day % projectList.length];
        const product = productList[day % productList.length];
        await prisma.salesEntry
          .findFirst({
            where: { agentId: target.id, callDate: date, projectId: project.id, productId: product.id },
          })
          .then(async (existing) => {
            if (existing) return;
            await prisma.salesEntry.create({
              data: {
                agentId: target.id,
                projectId: project.id,
                productId: product.id,
                quantity: (day % 3) + 1,
                callDate: date,
                contractRef: `V-${month.replace("-", "")}-${day}`,
                orderRef: `O-${day}${day + 11}`,
                note: "Seeded demo entry",
              },
            });
          });
      }
    }
  }

  const bulkAgentRows = await prisma.user.findMany({
    where: { email: { startsWith: "bulk." } },
    select: { id: true },
  });
  const rot = ["FR", "SN", "FR", "U", "K", "F", "SOS", "UK", "SU"];
  for (const target of bulkAgentRows) {
    for (let day = 1; day <= 16; day++) {
      const date = `${month}-${String(day).padStart(2, "0")}`;
      const weekday = new Date(`${date}T12:00:00`).getDay();
      if (weekday === 0 || weekday === 6) continue;
      const code = rot[(day + target.id.length) % rot.length];
      const bt = bookingByCode[code];
      if (!bt) continue;
      const blocks =
        bt.code === "SN"
          ? [{ start: "14:00", end: "19:00" }, { start: "22:30", end: "02:30" }]
          : bt.code === "FR"
            ? [{ start: "09:00", end: "17:00" }]
            : [];
      await prisma.calendarBooking.upsert({
        where: { agentId_date: { agentId: target.id, date } },
        create: {
          agentId: target.id,
          date,
          bookingTypeId: bt.id,
          blocks: blocks as Prisma.InputJsonValue,
          version: 1,
        },
        update: {},
      });
    }
  }

  const monthKey = currentMonthKey();
  for (const row of [
    { category: "Internet", calls: 120 },
    { category: "Mobile", calls: 80 },
    { category: "TV", calls: 40 },
  ] as const) {
    await prisma.kpiCategoryDaily.upsert({
      where: { agentId_date_category: { agentId: agent.id, date: `${monthKey}-10`, category: row.category } },
      create: {
        agentId: agent.id,
        date: `${monthKey}-10`,
        category: row.category,
        calls: row.calls,
        conversions: null,
        source: "import",
      },
      update: { calls: row.calls, source: "import" },
    });
  }

  await prisma.agentAnnouncement.upsert({
    where: { id: "ann-demo-welcome" },
    create: {
      id: "ann-demo-welcome",
      title: "Willkommen im Agenten-Bereich",
      body: "Hier erfassen Sie Verkäufe, buchen Schichten und Urlaub im Kalender, prüfen Ihre Monatsabrechnung und sehen das 15-Minuten-Schichtraster. Bei Fragen wenden Sie sich an Ihre Führungskraft.",
      pinned: true,
      publishedAt: new Date(),
    },
    update: {},
  });
  await prisma.agentAnnouncement.upsert({
    where: { id: "ann-demo-urlaub" },
    create: {
      id: "ann-demo-urlaub",
      title: "Hinweis Urlaubsbuchung",
      body: "Kurzfrist-Urlaub ist im Kalender nur für den laufenden Monat möglich. Regulärer Urlaub bitte mit der vereinbarten Vorlaufzeit.",
      pinned: false,
      publishedAt: new Date(Date.now() - 2 * 86400000),
    },
    update: {},
  });

  console.log("Seed complete.");
  console.log("Demo accounts:");
  console.log("  admin@ess.local / ChangeMe123!");
  console.log("  controlling@ess.local / ChangeMe123!");
  console.log("  agent@ess.local / ChangeMe123!");
  console.log("  agent2@ess.local / ChangeMe123!");
  console.log("  bulk.*@ess.local / ChangeMe123! — GK KMU ca. 30 Agenten (bulk.nord.001–014, bulk.sued.001–014) + Telekom-Retention-Demos.");
  console.log("  DB mit Demo-Daten füllen: im Ordner apps/api → pnpm exec prisma db seed");
  void admin;
  void controller;
}

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function range(start: number, end: number) {
  return Array.from({ length: end - start + 1 }, (_, idx) => start + idx);
}

function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^\w]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
