require("dotenv").config();

const DB_NAME = process.env.DB_NAME;

if (!DB_NAME) {
  throw new Error("DB_NAME is not set in .env");
}

// Only allow safe identifier characters, since this goes into SQL strings
if (!/^[A-Za-z0-9_]+$/.test(DB_NAME)) {
  throw new Error("DB_NAME contains invalid characters");
}

// Qualified table names: `db`.`table`
const t = (table) => `\`${DB_NAME}\`.\`${table}\``;

module.exports = {
  DB_NAME,
  ITEMS: t("Items"),
  ITEM_GROUPS: t("item_groups"),
  ITEM_COMMON_NAMES: t("item_common_names"),
};