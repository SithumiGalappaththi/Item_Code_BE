const express = require("express");
const router = express.Router();
const db = require("../db");

// const COMMON = "uat_2_0_5_release.item_common_names";
// const GROUPS = "uat_2_0_5_release.item_groups";
const {
  ITEM_COMMON_NAMES: COMMON,
  ITEM_GROUPS: GROUPS,
} = require("../config/tables");

// GET all common names with their group name
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        c.id,
        c.name,
        c.itemCount,
        c.group_id,
        g.name AS group_name
      FROM ${COMMON} c
      LEFT JOIN ${GROUPS} g ON g.id = c.group_id
      ORDER BY c.itemCount DESC, c.name ASC
    `);

    const items = rows.map((r) => ({
      id: r.id,
      name: r.name,
      count: Number(r.itemCount),
      group_id: r.group_id,
      group_name: r.group_name,
    }));

    res.json({ total: items.length, items });
  } catch (err) {
    console.error("DB Error:", err.message);
    res.status(500).json({ error: "Failed to fetch common names" });
  }
});

// ASSIGN (or clear) the item group of a common name
// body: { groupId: number | null }
router.put("/:id/group", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });

    const groupId = req.body?.groupId ?? null;
    if (groupId !== null && !Number.isInteger(Number(groupId))) {
      return res.status(400).json({ error: "Invalid groupId" });
    }

    let groupName = null;
    if (groupId !== null) {
      const [groups] = await db.query(`SELECT id, name FROM ${GROUPS} WHERE id = ?`, [groupId]);
      if (groups.length === 0) return res.status(404).json({ error: "Item group not found" });
      groupName = groups[0].name;
    }

    const [result] = await db.query(`UPDATE ${COMMON} SET group_id = ? WHERE id = ?`, [
      groupId,
      id,
    ]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Common name not found" });
    }

    res.json({ id, group_id: groupId, group_name: groupName });
  } catch (err) {
    console.error("DB Error:", err.message);
    res.status(500).json({ error: "Failed to assign item group" });
  }
});

module.exports = router;