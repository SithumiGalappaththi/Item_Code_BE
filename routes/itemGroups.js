const express = require("express");
const router = express.Router();
const db = require("../db");

// Change this if your table is named differently (e.g. ItemGroups)
// const TABLE = "uat_2_0_5_release.item_groups";
const { ITEM_GROUPS: TABLE } = require("../config/tables");

const MAX_NAME_LENGTH = 255;

// returns { error } or { name }
function parseName(raw) {
  const name = typeof raw === "string" ? raw.trim() : "";
  if (!name) return { error: "Name is required" };
  if (name.length > MAX_NAME_LENGTH) {
    return { error: `Name must be ${MAX_NAME_LENGTH} characters or less` };
  }
  return { name };
}

async function nameExists(name, excludeId = null) {
  const [rows] = await db.query(
    `SELECT id FROM ${TABLE} WHERE name = ? ${excludeId ? "AND id <> ?" : ""} LIMIT 1`,
    excludeId ? [name, excludeId] : [name]
  );
  return rows.length > 0;
}

// GET all
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.query(`SELECT id, name FROM ${TABLE} ORDER BY name ASC`);
    res.json({ total: rows.length, items: rows });
  } catch (err) {
    console.error("DB Error:", err.message);
    res.status(500).json({ error: "Failed to fetch item groups" });
  }
});

// CREATE
router.post("/", async (req, res) => {
  try {
    const { error, name } = parseName(req.body?.name);
    if (error) return res.status(400).json({ error });

    if (await nameExists(name)) {
      return res.status(409).json({ error: "An item group with this name already exists" });
    }

    const [result] = await db.query(`INSERT INTO ${TABLE} (name) VALUES (?)`, [name]);
    res.status(201).json({ id: result.insertId, name });
  } catch (err) {
    console.error("DB Error:", err.message);
    res.status(500).json({ error: "Failed to create item group" });
  }
});

// UPDATE
router.put("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });

    const { error, name } = parseName(req.body?.name);
    if (error) return res.status(400).json({ error });

    if (await nameExists(name, id)) {
      return res.status(409).json({ error: "An item group with this name already exists" });
    }

    const [result] = await db.query(`UPDATE ${TABLE} SET name = ? WHERE id = ?`, [name, id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Item group not found" });
    }
    res.json({ id, name });
  } catch (err) {
    console.error("DB Error:", err.message);
    res.status(500).json({ error: "Failed to update item group" });
  }
});

// DELETE
router.delete("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });

    const [result] = await db.query(`DELETE FROM ${TABLE} WHERE id = ?`, [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Item group not found" });
    }
    res.json({ id, deleted: true });
  } catch (err) {
    console.error("DB Error:", err.message);
    res.status(500).json({ error: "Failed to delete item group" });
  }
});

module.exports = router;