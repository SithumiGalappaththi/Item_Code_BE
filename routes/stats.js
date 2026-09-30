const express = require("express");
const ExcelJS = require("exceljs");
const router = express.Router();
const db = require("../db");
const itemNames = require("../data/itemNames");
const { ITEMS, ITEM_GROUPS, ITEM_COMMON_NAMES } = require("../config/tables");

// async function getSummary() {
//   const [[row]] = await db.query(`
//     SELECT 
//       COUNT(*) AS total_items,
//       COUNT(CASE WHEN isDeleted = 0 THEN 1 END) AS active_items,
//       COUNT(CASE WHEN isDeleted = 1 THEN 1 END) AS deleted_items
//     FROM uat_2_0_5_release.Items
//   `);
//   return row;
// }

async function getSummary() {
  const [[row]] = await db.query(`
    SELECT 
      COUNT(*) AS total_items,
      COUNT(CASE WHEN isDeleted = 0 THEN 1 END) AS active_items,
      COUNT(CASE WHEN isDeleted = 1 THEN 1 END) AS deleted_items
    FROM ${ITEMS}
  `);
  return row;
}

// Tables are schema-qualified (e.g. "schema.Items"), so read the name from there.
// Falls back to the connection's default database otherwise.
async function getDbName() {
  if (ITEMS.includes(".")) return ITEMS.split(".")[0].replace(/`/g, "");
  const [[row]] = await db.query("SELECT DATABASE() AS name");
  return row.name;
}

async function getNameMatchData() {
  // unique names, original order kept
  const names = [...new Set(itemNames.map((n) => n.trim()).filter(Boolean))];
  const order = new Map(names.map((n, i) => [n, i]));

  const derived = names.map(() => "SELECT ? AS list_name").join(" UNION ALL ");

  // const [rows] = await db.query(
  //   `
  //   SELECT list_name, COUNT(i.id) AS matching_count
  //   FROM (${derived}) AS item_list
  //   LEFT JOIN uat_2_0_5_release.Items i
  //     ON i.name LIKE CONCAT('%', item_list.list_name, '%')
  //    AND i.isDeleted = 0
  //   GROUP BY list_name
  //   `,
  //   names
  // );

  // const [[distinctRow]] = await db.query(
  //   `
  //   SELECT COUNT(DISTINCT i.id) AS total_items
  //   FROM (${derived}) AS item_list
  //   JOIN uat_2_0_5_release.Items i
  //     ON i.name LIKE CONCAT('%', item_list.list_name, '%')
  //    AND i.isDeleted = 0
  //   `,
  //   names
  // );

  // const [unmatchedRows] = await db.query(
  //   `
  //   SELECT i.name, COUNT(*) AS item_count
  //   FROM uat_2_0_5_release.Items i
  //   WHERE i.isDeleted = 0
  //     AND NOT EXISTS (
  //       SELECT 1
  //       FROM (${derived}) AS item_list
  //       WHERE i.name LIKE CONCAT('%', item_list.list_name, '%')
  //     )
  //   GROUP BY i.name
  //   ORDER BY item_count DESC
  //   `,
  //   names
  // );


  const [rows] = await db.query(
    `
    SELECT list_name, COUNT(i.id) AS matching_count
    FROM (${derived}) AS item_list
    LEFT JOIN ${ITEMS} i
      ON i.name LIKE CONCAT('%', item_list.list_name, '%')
    GROUP BY list_name
    `,
    names
  );

  const [[distinctRow]] = await db.query(
    `
    SELECT COUNT(DISTINCT i.id) AS total_items
    FROM (${derived}) AS item_list
    JOIN ${ITEMS} i
      ON i.name LIKE CONCAT('%', item_list.list_name, '%')
    `,
    names
  );

  const [unmatchedRows] = await db.query(
    `
    SELECT i.name, COUNT(*) AS item_count
    FROM ${ITEMS} i
    WHERE NOT EXISTS (
      SELECT 1
      FROM (${derived}) AS item_list
      WHERE i.name LIKE CONCAT('%', item_list.list_name, '%')
    )
    GROUP BY i.name
    ORDER BY item_count DESC
    `,
    names
  );

  const unmatchedDb = unmatchedRows.map((r) => ({
    name: r.name,
    count: Number(r.item_count),
  }));

  const all = rows
    .map((r) => ({ name: r.list_name, count: Number(r.matching_count) }))
    .sort((a, b) => order.get(a.name) - order.get(b.name));

  const matched = all.filter((r) => r.count > 0);
  const unmatched = all.filter((r) => r.count === 0);

  return {
    given: { total: all.length, items: all.map((r) => ({ name: r.name })) },
    matched: {
      total: matched.length,
      totalItems: Number(distinctRow.total_items),
      items: matched,
    },
    unmatched: { total: unmatched.length, items: unmatched },
    unmatchedDb: {
      total: unmatchedDb.length,
      totalItems: unmatchedDb.reduce((sum, r) => sum + r.count, 0), // all items
      items: unmatchedDb,
    },
  };
}

// Duplicate item names across the whole Items table
// (ignores isDeleted and the given item names list)
async function getDuplicateData() {
  // const [rows] = await db.query(`
  //   SELECT name, COUNT(*) AS item_count
  //   FROM uat_2_0_5_release.Items
  //   GROUP BY name
  //   ORDER BY item_count DESC, name ASC
  // `);

  const [rows] = await db.query(`
    SELECT name, COUNT(*) AS item_count
    FROM ${ITEMS}
    GROUP BY name
    ORDER BY item_count DESC, name ASC
  `);

  const items = rows.map((r) => ({ name: r.name, count: Number(r.item_count) }));

  return {
    total: items.length, // number of duplicated names
    totalItems: items.reduce((sum, r) => sum + r.count, 0), // rows involved in duplication
    items,
  };
}

router.get("/summary", async (req, res) => {
  try {
    // const row = await getSummary();
    const [row, database] = await Promise.all([getSummary(), getDbName()]);

    res.json({
      database,
      stats: [
        { label: "Total Items", value: row.total_items, color: "#4f46e5" },
        { label: "Active Items", value: row.active_items, color: "#16a34a" },
        { label: "Deleted Items", value: row.deleted_items, color: "#dc2626" },
      ],
    });
  } catch (err) {
    console.error("DB Error:", err.message);
    res.status(500).json({ error: "Failed to fetch stats", details: err.message });
  }
});

router.get("/name-match", async (req, res) => {
  try {
    res.json(await getNameMatchData());
  } catch (err) {
    console.error("DB Error:", err.message);
    res.status(500).json({ error: "Failed to fetch name match" });
  }
});

router.get("/duplicates", async (req, res) => {
  try {
    res.json(await getDuplicateData());
  } catch (err) {
    console.error("DB Error:", err.message);
    res.status(500).json({ error: "Failed to fetch duplicates" });
  }
});

// router.get("/export", async (req, res) => {
//   try {
//     const row = await getSummary();
//     const d = await getNameMatchData();

//     const wb = new ExcelJS.Workbook();

//     // Sheet 1: summary
//     const summarySheet = wb.addWorksheet("Summary");
//     summarySheet.columns = [
//       { header: "Total Items", key: "total", width: 15 },
//       { header: "Active Items", key: "active", width: 15 },
//       { header: "Deleted Items", key: "deleted", width: 15 },
//     ];
//     summarySheet.addRow({
//       total: row.total_items,
//       active: row.active_items,
//       deleted: row.deleted_items,
//     });
//     summarySheet.getRow(1).font = { bold: true };

//     // Sheets 2-5
//     const addSheet = (title, data, totalItemsLabel, countHeader) => {
//       const ws = wb.addWorksheet(title);
//       ws.columns = [
//         { key: "no", width: 8 },
//         { key: "name", width: 50 },
//         { key: "count", width: 22 },
//       ];

//       // totals (same as the UI cards)
//       ws.addRow(["", "Total names", data.total]).font = { bold: true };
//       if (totalItemsLabel) {
//         ws.addRow(["", totalItemsLabel, data.totalItems]).font = { bold: true };
//       }
//       ws.addRow([]);

//       // table
//       ws.addRow(["No", "Item Name", ...(countHeader ? [countHeader] : [])]).font = { bold: true };
//       data.items.forEach((it, i) => {
//         ws.addRow(countHeader ? [i + 1, it.name, it.count] : [i + 1, it.name]);
//       });
//     };

//     addSheet("Given Items", d.given);
//     addSheet("Matching", d.matched, "Total matching items", "Matching Items");
//     addSheet("Names Not Matching", d.unmatched);
//     addSheet("DB Items Not Matching", d.unmatchedDb, "Total unmatched items", "Item Count");

//     const buffer = await wb.xlsx.writeBuffer();
//     res.setHeader(
//       "Content-Type",
//       "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
//     );
//     res.setHeader("Content-Disposition", "attachment; filename=items-report.xlsx");
//     res.send(Buffer.from(buffer));
//   } catch (err) {
//     console.error("Export Error:", err.message);
//     res.status(500).json({ error: "Failed to export" });
//   }
// });

// ---------- export helpers ----------
const bold = (ws, values) => {
  const row = ws.addRow(values);
  row.font = { bold: true };
  return row;
};

// generic sheet: optional totals block, header row, data rows
function addTable(wb, title, { totals = [], headers, rows, widths }) {
  const ws = wb.addWorksheet(title);
  ws.columns = widths.map((width) => ({ width }));
  totals.forEach(([label, value]) => bold(ws, ["", label, value]));
  if (totals.length) ws.addRow([]);
  bold(ws, headers);
  rows.forEach((r) => ws.addRow(r));
  return ws;
}

// sheet for { total, totalItems?, items: [{name, count?}] } data
function addListSheet(wb, title, data, { totalLabel = "Total names", totalItemsLabel, countHeader } = {}) {
  const totals = [[totalLabel, data.total]];
  if (totalItemsLabel) totals.push([totalItemsLabel, data.totalItems]);

  addTable(wb, title, {
    totals,
    headers: ["No", "Item Name", ...(countHeader ? [countHeader] : [])],
    rows: data.items.map((it, i) =>
      countHeader ? [i + 1, it.name, it.count] : [i + 1, it.name]
    ),
    widths: [8, 50, 22],
  });
}

// ---------- one builder per tab ----------
const exporters = {
  async overview(wb) {
    const row = await getSummary();
    const d = await getNameMatchData();

    const summary = wb.addWorksheet("Summary");
    summary.columns = [
      { header: "Total Items", key: "total", width: 15 },
      { header: "Active Items", key: "active", width: 15 },
      { header: "Deleted Items", key: "deleted", width: 15 },
    ];
    summary.addRow({
      total: row.total_items,
      active: row.active_items,
      deleted: row.deleted_items,
    });
    summary.getRow(1).font = { bold: true };

    addListSheet(wb, "Given Items", d.given);
    addListSheet(wb, "Matching", d.matched, {
      totalItemsLabel: "Total matching items",
      countHeader: "Matching Items",
    });
    addListSheet(wb, "Names Not Matching", d.unmatched);
    addListSheet(wb, "DB Items Not Matching", d.unmatchedDb, {
      totalItemsLabel: "Total unmatched items",
      countHeader: "Item Count",
    });
  },

  async duplicates(wb) {
    const d = await getDuplicateData();
    addListSheet(wb, "Duplicate Items", d, {
      totalLabel: "Duplicate names",
      totalItemsLabel: "Items involved",
      countHeader: "Count",
    });
  },

  async itemGroups(wb) {
    const [rows] = await db.query(
      `SELECT id, name FROM ${ITEM_GROUPS} ORDER BY name ASC`
    );
    addTable(wb, "Item Groups", {
      totals: [["Total item groups", rows.length]],
      headers: ["ID", "Name"],
      rows: rows.map((r) => [r.id, r.name]),
      widths: [8, 50],
    });
  },

  async commonNames(wb) {
    const [rows] = await db.query(`
      SELECT c.id, c.name, c.itemCount, c.group_id, g.name AS group_name
      FROM ${ITEM_COMMON_NAMES} c
      LEFT JOIN ${ITEM_GROUPS} g ON g.id = c.group_id
      ORDER BY c.itemCount DESC, c.name ASC
    `);

    const assigned = rows.filter((r) => r.group_id !== null).length;
    const totalItems = rows.reduce((sum, r) => sum + Number(r.itemCount || 0), 0);

    addTable(wb, "Common Names", {
      totals: [
        ["Common names", rows.length],
        ["Assigned", assigned],
        ["Unassigned", rows.length - assigned],
        ["Total items", totalItems],
      ],
      headers: ["No", "Item Name", "Group Name", "Item Count"],
      rows: rows.map((r, i) => [i + 1, r.name, r.group_name || "Unassigned", Number(r.itemCount)]),
      widths: [8, 50, 35, 15],
    });
  },
};

const EXPORT_FILENAMES = {
  overview: "overview-report.xlsx",
  duplicates: "duplicate-items-report.xlsx",
  itemGroups: "item-groups-report.xlsx",
  commonNames: "common-names-report.xlsx",
};

router.get("/export", async (req, res) => {
  const tab = req.query.tab || "overview";
  const build = exporters[tab];
  if (!build) return res.status(400).json({ error: `Unknown tab "${tab}"` });

  try {
    const wb = new ExcelJS.Workbook();
    await build(wb);

    const buffer = await wb.xlsx.writeBuffer();
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename=${EXPORT_FILENAMES[tab]}`);
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error("Export Error:", err.message);
    res.status(500).json({ error: "Failed to export" });
  }
});

module.exports = router;