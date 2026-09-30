require("dotenv").config();
const express = require("express");
const cors = require("cors");
const statsRoutes = require("./routes/stats");
const itemGroups = require("./routes/itemGroups");
const itemCommonNames = require("./routes/itemCommonNames");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.use("/api/stats", statsRoutes);
app.use("/api/item-groups", itemGroups);
app.use("/api/item-common-names", itemCommonNames);

app.get("/", (req, res) => {
  res.json({ message: "Comparison API is running" });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});