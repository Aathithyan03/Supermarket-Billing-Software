const fs = require("fs");
const path = require("path");
const db = require("./db");

async function migrate() {
    try {
        const schemaPath = path.join(__dirname, "schema.sql");

        const sql = fs.readFileSync(schemaPath, "utf8");

        // Split multiple SQL statements
        const queries = sql
            .split(";")
            .map(q => q.trim())
            .filter(q => q.length);

        for (const query of queries) {
            await db.query(query);
        }

        console.log("✅ MySQL database initialized successfully.");
        process.exit(0);

    } catch (err) {
        console.error("Migration failed");
        console.error(err);
        process.exit(1);
    }
}

async function migrate() {
    console.log("Database ready.");
}

module.exports = { migrate };